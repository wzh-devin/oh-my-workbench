import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import {
  notifyResourceChange,
  resourceIsActive,
} from "@/lib/requests/invalidation"
import { coalesceRead } from "@/lib/requests/coalesce-read"
import { todoApi, TodoApiError } from "./api"
import { INBOX_ID, type Todo, type TodoChanges } from "./model"
import type { TodoView, TodoPriority, ViewChanges } from "./configuration"

type Snapshot = {
  userId: string | null
  data: {
    todoLists: { id: string; name: string }[]
    todos: Todo[]
    todoViews: TodoView[]
    todoPriorities: TodoPriority[]
  }
  status: "loading" | "ready" | "error"
  error: string | null
  busyIds: string[]
  counts: Record<string, number>
  pageRevision: number
}
const emptyData = () => ({
  todoLists: [{ id: INBOX_ID, name: "收集箱" }],
  todos: [] as Todo[],
  todoViews: [] as TodoView[],
  todoPriorities: [] as TodoPriority[],
})
let snapshot: Snapshot = {
  userId: null,
  data: emptyData(),
  status: "loading",
  error: null,
  busyIds: [],
  counts: {},
  pageRevision: 0,
}
let generation = 0
let revision = 0
let reloadAfterWrites = false
let readController: AbortController | null = null
let onUnauthorized: (() => Promise<void>) | undefined
const controllers = new Set<AbortController>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const publish = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

/** 账号切换先清空快照并取消请求，旧账号的迟到响应不能重新写入。 */
export const setTodoUser = (
  userId: string | null,
  unauthorized?: () => Promise<void>
) => {
  onUnauthorized = unauthorized
  if (snapshot.userId === userId) return
  toast.dismiss("todos-load")
  generation++
  revision++
  reloadAfterWrites = false
  readController?.abort()
  controllers.forEach((controller) => controller.abort())
  controllers.clear()
  publish({
    userId,
    data: emptyData(),
    status: "loading",
    error: null,
    busyIds: [],
    counts: {},
    pageRevision: snapshot.pageRevision + 1,
  })
}

/** 只加载导航配置与计数，任务记录由页面分页查询。 */
export const loadTodos = coalesceRead(
  () => generation,
  async () => {
    if (!snapshot.userId) return
    if (snapshot.busyIds.length) {
      reloadAfterWrites = true
      return
    }
    reloadAfterWrites = false
    readController?.abort()
    const controller = new AbortController()
    readController = controller
    const owner = generation
    const started = revision
    try {
      const [todoLists, todoViews, todoPriorities] = await Promise.all([
        todoApi.lists(controller.signal),
        todoApi.views(controller.signal),
        todoApi.priorities(controller.signal),
      ])
      const counts = await todoApi.counts(controller.signal)
      const data = { todoLists, todoViews, todoPriorities }
      if (
        owner !== generation ||
        controller.signal.aborted ||
        started !== revision
      )
        return
      toast.dismiss("todos-load")
      publish({
        data: {
          ...snapshot.data,
          ...data,
          todoLists: [{ id: INBOX_ID, name: "收集箱" }, ...data.todoLists],
        },
        counts,
        status: "ready",
        error: null,
      })
    } catch (error) {
      if (
        owner !== generation ||
        controller.signal.aborted ||
        started !== revision
      )
        return
      publish({
        status: snapshot.status === "ready" ? "ready" : "error",
        error: error instanceof Error ? error.message : "读取待办失败，请重试",
      })
      toast.error(snapshot.error, {
        id: "todos-load",
        action: { label: "重试", onClick: () => void loadTodos() },
      })
      if (error instanceof TodoApiError && error.status === 401)
        void onUnauthorized?.()
    }
  },
  () => readController?.abort()
)

/** 操作成功后才发布记录；版本冲突保留草稿并补读最新状态。 */
const mutate = async <T>(
  key: string,
  request: (signal: AbortSignal) => Promise<T>,
  commit: (result: T) => void
): Promise<T | null> => {
  if (
    !snapshot.userId ||
    snapshot.busyIds.includes(key) ||
    snapshot.busyIds.includes("import") ||
    (key === "import" && snapshot.busyIds.length > 0)
  )
    return null
  const owner = generation
  const controller = new AbortController()
  controllers.add(controller)
  revision++
  publish({ busyIds: [...snapshot.busyIds, key], error: null })
  try {
    const result = await request(controller.signal)
    if (owner !== generation || controller.signal.aborted) return null
    revision++
    commit(result)
    publish({ pageRevision: snapshot.pageRevision + 1 })
    void refreshTodoCounts()
    notifyResourceChange("todos")
    return result
  } catch (error) {
    if (owner !== generation || controller.signal.aborted) return null
    const message = error instanceof Error ? error.message : "保存失败，请重试"
    publish({ error: message })
    toast.error(message)
    if (error instanceof TodoApiError && error.status === 401)
      void onUnauthorized?.()
    if (
      error instanceof TodoApiError &&
      (error.status === 409 || error.status === 404)
    ) {
      publish({ pageRevision: snapshot.pageRevision + 1 })
      if (/^[1-9]\d*$/.test(key)) {
        try {
          const task = await todoApi.detail(key, controller.signal)
          if (owner === generation && !controller.signal.aborted) upsert([task])
        } catch {
          /* The page refresh resolves a deleted task; keep the edit draft. */
        }
      } else reloadAfterWrites = true
    }
    return null
  } finally {
    controllers.delete(controller)
    if (owner === generation) {
      revision++
      publish({ busyIds: snapshot.busyIds.filter((id) => id !== key) })
      if (reloadAfterWrites && !snapshot.busyIds.length) void loadTodos(true)
    }
  }
}

/** 同一记录只接收更新的服务端版本，防止跨入口请求乱序覆盖。 */
const upsert = (todos: Todo[]) => {
  const todoMap = new Map(snapshot.data.todos.map((todo) => [todo.id, todo]))
  todos.forEach((todo) => {
    const previous = todoMap.get(todo.id)
    if (!previous || todo.version >= previous.version)
      todoMap.set(todo.id, todo)
  })
  publish({ data: { ...snapshot.data, todos: [...todoMap.values()] } })
}
export const createTodo = (changes: TodoChanges) =>
  mutate(
    "task:create",
    (signal) => todoApi.create(changes, signal),
    (todo) => upsert([todo])
  )
/** 所有任务修改入口共用成功反馈，避免行内操作静默或表单重复提示。 */
export const updateTodo = (
  todo: Pick<Todo, "id" | "version">,
  changes: TodoChanges
) =>
  mutate(
    todo.id,
    (signal) => todoApi.update(todo.id, todo.version, changes, signal),
    (saved) => upsert([saved])
  ).then((saved) => {
    if (saved) toast.success("待办已更新")
    return saved
  })
export const deleteTodo = (todo: Todo) =>
  mutate(
    todo.id,
    (signal) => todoApi.remove(todo.id, todo.version, signal),
    () =>
      publish({
        data: {
          ...snapshot.data,
          todos: snapshot.data.todos.filter((record) => record.id !== todo.id),
        },
      })
  ).then((result) => result !== null)
export const saveTodoList = (name: string, id?: string) =>
  mutate(
    id ?? "list:create",
    (signal) => todoApi.saveList(name, id, signal),
    (list) =>
      publish({
        data: {
          ...snapshot.data,
          todoLists: id
            ? snapshot.data.todoLists.map((record) =>
                record.id === id ? list : record
              )
            : [...snapshot.data.todoLists, list],
        },
      })
  )
export const deleteTodoList = (id: string) =>
  mutate(
    id,
    (signal) => todoApi.removeList(id, signal),
    () => {
      publish({
        data: {
          ...snapshot.data,
          todoLists: snapshot.data.todoLists.filter((list) => list.id !== id),
          todos: snapshot.data.todos.map((task) =>
            task.listId === id
              ? { ...task, listId: INBOX_ID, version: task.version + 1 }
              : task
          ),
        },
      })
    }
  ).then((result) => result !== null)
export const importTodos = (body: unknown) =>
  mutate(
    "import",
    (signal) => todoApi.import(body, signal),
    (data) =>
      publish({
        data: {
          ...data,
          todoLists: [{ id: INBOX_ID, name: "收集箱" }, ...data.todoLists],
        },
      })
  )

/** 视图只修改配置，任务记录和计划日期保持独立。 */
export const saveTodoView = (changes: ViewChanges, view?: TodoView) =>
  mutate(
    view ? `view:${view.id}` : "view:create",
    (signal) => todoApi.saveView(changes, view, signal),
    (saved) => {
      const views = snapshot.data.todoViews
      const previous = views.find((v) => v.id === saved.id)
      if (previous && previous.version > saved.version) return
      publish({
        data: {
          ...snapshot.data,
          todoViews: previous
            ? views.map((v) => (v.id === saved.id ? saved : v))
            : [...views, saved],
        },
      })
    }
  )

/** 前端提前阻止最后一个视图删除，后端仍在同一用户锁内保证并发安全。 */
export const deleteTodoView = (view: TodoView) => {
  if (snapshot.data.todoViews.length <= 1) {
    toast.error("至少保留一个视图")
    return Promise.resolve(false)
  }
  return mutate(
    `view:${view.id}`,
    (signal) => todoApi.removeView(view, signal),
    () =>
      publish({
        data: {
          ...snapshot.data,
          todoViews: snapshot.data.todoViews.filter((v) => v.id !== view.id),
        },
      })
  ).then((result) => result !== null)
}

/** 四档优先级按完整版本列表原子保存，稳定 value 不随排序变化。 */
export const saveTodoPriorities = (priorities: TodoPriority[]) =>
  mutate(
    "priorities",
    (signal) => todoApi.savePriorities(priorities, signal),
    (saved) => publish({ data: { ...snapshot.data, todoPriorities: saved } })
  )
/** 所有消费入口共享同一个只含当前用户数据的快照。 */
export const useTodos = () => useSyncExternalStore(subscribe, () => snapshot)

/** 当前页合并进有界详情缓存，不使查询自身再次失效。 */
export const rememberTodos = (todos: Todo[], userId: string) => {
  if (snapshot.userId !== userId) return
  upsert(todos)
  if (snapshot.data.todos.length > 600)
    publish({
      data: { ...snapshot.data, todos: snapshot.data.todos.slice(-600) },
    })
}
/** 写入后只重读侧栏计数，不拉取任务全集。 */
export const refreshTodoCounts = coalesceRead(
  () => generation,
  async () => {
    if (
      !snapshot.userId ||
      snapshot.status !== "ready" ||
      !resourceIsActive("todos")
    )
      return
    const userId = snapshot.userId,
      controller = new AbortController()
    controllers.add(controller)
    try {
      const counts = await todoApi.counts(controller.signal)
      if (snapshot.userId === userId && !controller.signal.aborted)
        publish({ counts })
    } catch (error) {
      if (
        !controller.signal.aborted &&
        error instanceof TodoApiError &&
        error.status === 401
      )
        void onUnauthorized?.()
    } finally {
      controllers.delete(controller)
    }
  }
)

/** 页面读取遇到401时复用全局会话校验。 */
export const refreshTodoSession = () => onUnauthorized?.()
