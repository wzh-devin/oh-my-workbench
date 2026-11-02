import { z } from "zod"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTodos, refreshTodoSession } from "@/features/todos/store"
import {
  onResourceChange,
  onListRefresh,
  type ResourceModule,
} from "@/lib/requests/invalidation"
import { onPageResume } from "@/lib/requests/page-resume"

const days = z.record(z.string(), z.number())
export const dashboardStatisticsSchema = z.object({
  todos: z.object({
    total: z.number(),
    pending: z.number(),
    listCount: z.number(),
    daily: days,
  }),
  mail: z.object({
    total: z.number(),
    unread: z.number(),
    accountCount: z.number(),
    daily: days,
  }),
  assets: z.object({
    total: z.number(),
    size: z.number(),
    images: z.number(),
    documents: z.number(),
    daily: days,
    storage: z.array(
      z.object({ id: z.string(), total: z.number(), size: z.number() })
    ),
  }),
  storageCount: z.number(),
  healthy: z.number(),
  connectionTotal: z.number(),
})
export const dashboardRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["todo", "mail", "asset"]),
  source: z.string(),
  status: z.string(),
  timestamp: z.string(),
  href: z.string(),
  todoId: z.string().optional(),
  version: z.number(),
})
export const dashboardPageSchema = z.object({
  records: z.array(dashboardRecordSchema),
  total: z.number(),
})
export const dashboardIssuesSchema = z.object({
  connections: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: z.string(),
      href: z.string(),
      kind: z.enum(["mail", "storage"]),
    })
  ),
  pending: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      title: z.string(),
      listId: z.string().nullable(),
      dueDate: z.string().nullable(),
      listName: z.string(),
    })
  ),
})
export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["todos", "mail", "connections"]),
  title: z.string(),
  body: z.string(),
  href: z.string(),
  unread: z.boolean(),
})
export const notificationPageSchema = z.object({
  records: z.array(notificationSchema),
  total: z.number(),
})
/** 专用工作台读取边界保持信封、鉴权与响应校验，不读取业务全量快照。 */
export const workbenchRequest = async <T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`/api/workbench${path}`, {
    method: body === undefined ? "GET" : "POST",
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
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) void refreshTodoSession()
    const parsed = z.object({ message: z.string() }).safeParse(payload)
    throw new Error(parsed.success ? parsed.data.message : "读取工作台数据失败")
  }
  return z.object({ code: z.literal(0), data: schema }).parse(payload).data
}
/** 独立资源按请求键和身份隔离，写入事件只刷新已挂载的消费者。 */
export const useWorkbenchQuery = <T>(
  path: string,
  schema: z.ZodType<T>,
  initial: T,
  body?: unknown,
  module = "dashboard"
) => {
  const { userId } = useTodos(),
    bodyKey = JSON.stringify(body),
    [attempt, setAttempt] = useState(0),
    key = JSON.stringify([path, bodyKey])
  const [result, setResult] = useState({
    key: "",
    userId: null as string | null,
    data: initial,
    status: "loading" as "loading" | "ready" | "error",
  })
  const reload = () => setAttempt((n) => n + 1)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController(),
      timer = setTimeout(() => {
        void workbenchRequest(
          path,
          schema,
          controller.signal,
          bodyKey === undefined ? undefined : JSON.parse(bodyKey)
        )
          .then((data) => {
            if (!controller.signal.aborted)
              setResult({ key, userId, data, status: "ready" })
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted) {
              setResult({ key, userId, data: initial, status: "error" })
              toast.error(
                error instanceof Error ? error.message : "读取数据失败",
                {
                  action: {
                    label: "重试",
                    onClick: () => setAttempt((n) => n + 1),
                  },
                }
              )
            }
          })
      }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [path, schema, key, userId, bodyKey, attempt, initial])
  useEffect(
    () =>
      onResourceChange(["todos", "mail", "assets"] as ResourceModule[], () =>
        setAttempt((n) => n + 1)
      ),
    []
  )
  useEffect(() => onPageResume(() => setAttempt((n) => n + 1)), [])
  useEffect(
    () => onListRefresh(module, () => setAttempt((n) => n + 1)),
    [module]
  )
  return {
    ...(result.key === key && result.userId === userId
      ? result
      : { data: initial, status: "loading" as const }),
    reload,
  }
}
export const emptyStatistics: z.infer<typeof dashboardStatisticsSchema> = {
  todos: { total: 0, pending: 0, listCount: 1, daily: {} },
  mail: { total: 0, unread: 0, accountCount: 0, daily: {} },
  assets: {
    total: 0,
    size: 0,
    images: 0,
    documents: 0,
    daily: {},
    storage: [],
  },
  storageCount: 0,
  healthy: 0,
  connectionTotal: 0,
}
export const emptyDashboardPage: z.infer<typeof dashboardPageSchema> = {
  records: [],
  total: 0,
}
export const emptyIssues: z.infer<typeof dashboardIssuesSchema> = {
  connections: [],
  pending: [],
}
export const emptyNotifications: z.infer<typeof notificationPageSchema> = {
  records: [],
  total: 0,
}
