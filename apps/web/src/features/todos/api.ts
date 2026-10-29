import { z } from "zod"
import {
  todoPrioritySchema,
  todoViewSchema,
  type TodoView,
  type TodoPriority,
  type ViewChanges,
} from "./configuration"
import {
  INBOX_ID,
  listSchema,
  remoteTodoSchema,
  snapshotSchema,
  type TodoChanges,
} from "./model"

export class TodoApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = "TodoApiError"
  }
}

/** 统一校验服务端信封；只在边界转换虚拟收集箱与草稿步骤ID。 */
const request = async <T>(
  path: string,
  method: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: unknown
): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`/api/todos${path}`, {
      method,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error("连接待办服务失败，请重试", { cause: error })
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new TodoApiError(
      parsed.success ? parsed.data.message : "待办服务暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("待办响应格式错误，请重试")
  return parsed.data.data
}

/** 步骤草稿的临时UUID不进入数据库，由服务端生成业务ID。 */
const taskBody = (changes: TodoChanges, version?: number) => ({
  ...changes,
  ...(version === undefined ? {} : { version }),
  ...(changes.listId === undefined
    ? {}
    : { listId: changes.listId === INBOX_ID ? null : changes.listId }),
  ...(changes.steps === undefined
    ? {}
    : {
        steps: changes.steps.map(({ id, ...step }) => ({
          ...step,
          ...(/^[1-9]\d*$/.test(id) ? { id } : {}),
        })),
      }),
})

export const todoApi = {
  snapshot: (signal: AbortSignal) => request("", "GET", snapshotSchema, signal),
  create: (changes: TodoChanges, signal: AbortSignal) =>
    request("/tasks", "POST", remoteTodoSchema, signal, taskBody(changes)),
  update: (
    id: string,
    version: number,
    changes: TodoChanges,
    signal: AbortSignal
  ) =>
    request(
      `/tasks/${id}`,
      "PATCH",
      remoteTodoSchema,
      signal,
      taskBody(changes, version)
    ),
  remove: (id: string, version: number, signal: AbortSignal) =>
    request(
      `/tasks/${id}`,
      "DELETE",
      z.null().transform(() => true),
      signal,
      { version }
    ),
  saveList: (name: string, id: string | undefined, signal: AbortSignal) =>
    request(
      id ? `/lists/${id}` : "/lists",
      id ? "PATCH" : "POST",
      listSchema,
      signal,
      { name }
    ),
  removeList: (id: string, signal: AbortSignal) =>
    request(
      `/lists/${id}`,
      "DELETE",
      z.object({ id: z.string(), todos: z.array(remoteTodoSchema) }),
      signal
    ),
  import: (body: unknown, signal: AbortSignal) =>
    request("/import", "POST", snapshotSchema, signal, body),
  saveView: (
    changes: ViewChanges,
    view: TodoView | undefined,
    signal: AbortSignal
  ) =>
    request(
      view ? `/views/${view.id}` : "/views",
      view ? "PATCH" : "POST",
      todoViewSchema,
      signal,
      { ...changes, ...(view ? { version: view.version } : {}) }
    ),
  removeView: (view: TodoView, signal: AbortSignal) =>
    request(
      `/views/${view.id}`,
      "DELETE",
      z.null().transform(() => true),
      signal,
      { version: view.version }
    ),
  savePriorities: (priorities: TodoPriority[], signal: AbortSignal) =>
    request(
      "/priorities",
      "PUT",
      z.array(todoPrioritySchema).length(4),
      signal,
      {
        priorities: priorities.map(({ value, name, color, version }) => ({
          value,
          name,
          color,
          version,
        })),
      }
    ),
}
