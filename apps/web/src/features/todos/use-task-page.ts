import { useEffect, useState } from "react"
import { toast } from "sonner"
import { onListRefresh } from "@/lib/requests/invalidation"
import { onPageResume } from "@/lib/requests/page-resume"
import { todoApi, TodoApiError } from "./api"
import { rememberTodos, useTodos, refreshTodoSession } from "./store"
import type { Todo, TaskQuery } from "./model"
/** 导航、视图、分页与筛选触发当前页读取，取消旧请求并拒收旧身份响应。 */
export const useTaskPage = (input: TaskQuery, enabled: boolean) => {
  const { userId, pageRevision } = useTodos()
  const key = JSON.stringify(input),
    [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({
    key: "",
    userId: null as string | null,
    records: [] as Todo[],
    total: 0,
    status: "loading" as "loading" | "ready" | "error",
  })
  useEffect(() => {
    if (!userId || !enabled) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void todoApi
        .page(JSON.parse(key) as TaskQuery, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return
          rememberTodos(page.records, userId)
          setResult({ ...page, key, userId, status: "ready" })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setResult({ key, userId, records: [], total: 0, status: "error" })
          toast.error(error instanceof Error ? error.message : "读取待办失败", {
            id: "todo-page",
            action: { label: "重试", onClick: () => setAttempt((n) => n + 1) },
          })
          if (error instanceof TodoApiError && error.status === 401)
            void refreshTodoSession()
        })
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, userId, pageRevision, attempt, enabled])
  useEffect(() => onPageResume(() => setAttempt((n) => n + 1)), [])
  useEffect(() => onListRefresh("todos", () => setAttempt((n) => n + 1)), [])
  return {
    ...(result.key === key && result.userId === userId
      ? result
      : { records: [], total: 0, status: "loading" as const }),
    retry: () => setAttempt((n) => n + 1),
  }
}
