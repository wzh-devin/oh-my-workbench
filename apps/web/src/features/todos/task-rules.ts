import type { Todo, Workbench } from "@/features/workbench/model"
import { todoSchema } from "@/features/workbench/model"

export const INBOX_ID = "list-inbox"
export const PRIORITIES = [
  { value: "1", label: "P1 紧急" },
  { value: "2", label: "P2 高" },
  { value: "3", label: "P3 普通" },
  { value: "4", label: "无优先级" },
]
export const TASK_VIEWS = [
  { id: "all", label: "全部待办" },
  { id: "myday", label: "我的一天" },
  { id: "today", label: "今天到期" },
  { id: "overdue", label: "已逾期" },
  { id: "upcoming", label: "未来计划" },
  { id: "important", label: "重要" },
  { id: "completed", label: "已完成" },
]

/** 日期仅按浏览器本地日历日比较，避免 UTC 转换造成跨日偏差。 */
export const todayDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** 按日历日偏移，跨月与夏令时不依赖固定毫秒数。 */
export const offsetDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return todayDate(date)
}

export const inTaskView = (todo: Todo, view: string, today: string) => {
  if (view === "completed") return todo.done
  if (view === "all") return true
  if (todo.done) return false
  if (view === "myday") return todo.plannedFor === today
  if (view === "today") return todo.dueDate === today
  if (view === "overdue") return !!todo.dueDate && todo.dueDate < today
  if (view === "upcoming") return !!todo.dueDate && todo.dueDate > today
  if (view === "important") return todo.priority <= 2
  return true
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

export const sortTasks = (todos: Todo[], sort: string) =>
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
    const priority = a.priority - b.priority
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
