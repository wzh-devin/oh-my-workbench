import type { Todo, Workbench } from "@/features/workbench/model"
import { todoSchema } from "@/features/workbench/model"
import type { TodoPriority } from "./configuration"

export const INBOX_ID = "list-inbox"
/** 日期仅按浏览器本地日历日比较，避免 UTC 转换造成跨日偏差。 */
export const todayDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** 按日历日偏移，跨月与夏令时不依赖固定毫秒数。 */
export const offsetDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return todayDate(date)
}

/** 完成父任务时一并完成步骤；重新打开保留已完成的步骤。 */
export const completeTask = (todo: Todo, done: boolean, at: string): Todo => ({
  ...todo,
  done,
  completedAt: done ? (todo.completedAt ?? at) : null,
  steps: done
    ? todo.steps.map((step) => ({ ...step, done: true }))
    : todo.steps,
})

export const sortTasks = (
  todos: Todo[],
  sort: string,
  priorities?: TodoPriority[]
) =>
  [...todos].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done)
    if (a.done && b.done)
      return (
        Date.parse(b.completedAt ?? b.createdAt) -
        Date.parse(a.completedAt ?? a.createdAt)
      )
    const due = (a.dueDate ?? "9999-12-31").localeCompare(
      b.dueDate ?? "9999-12-31"
    )
    const order = (value: number) =>
      priorities?.find((p) => p.value === value)?.position ?? value - 1
    const priority = order(a.priority) - order(b.priority)
    const created = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    return sort === "newest"
      ? created
      : sort === "priority"
        ? priority || due || created
        : due || priority || created
  })

/** 新建任务也经过同一读取边界，旧记录缺省字段由 schema 自动填充。 */
export const newTask = (
  title: string,
  listId = INBOX_ID,
  fields: Partial<Todo> = {}
): Todo =>
  todoSchema.parse({
    id: crypto.randomUUID(),
    title,
    listId,
    note: "",
    done: false,
    createdAt: new Date().toISOString(),
    ...fields,
  })

/** 清单删除只转移任务，不移除任务或其步骤与来源。 */
export const removeList = (data: Workbench, listId: string): Workbench => {
  if (listId === INBOX_ID || !data.todoLists.some((list) => list.id === listId))
    return data
  return {
    ...data,
    todoLists: data.todoLists.filter((list) => list.id !== listId),
    todos: data.todos.map((todo) =>
      todo.listId === listId ? { ...todo, listId: INBOX_ID } : todo
    ),
  }
}
