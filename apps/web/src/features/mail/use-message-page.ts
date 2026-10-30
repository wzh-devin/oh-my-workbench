import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { mailApi, type MessageQuery } from "./api"
import type { Message } from "./model"

/** 前台切换条件显示骨架；后台失效刷新保留结果，取消旧请求以防覆盖新页。 */
export function useMessagePage(
  scope: MessageQuery,
  revision: number,
  enabled: boolean,
  onPageEmpty?: () => void,
  identity: string | null = null
) {
  const [result, setResult] = useState({
    messages: [] as Message[],
    total: 0,
    identity,
  })
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify(scope)
  const loadedKey = useRef<string | null>(null)
  const anchors = useRef({ scope: "", pages: new Map<number, string>() })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (loadedKey.current !== `${identity}:${key}`) setStatus("loading")
      const input = JSON.parse(key) as MessageQuery
      const scopeKey = JSON.stringify({ identity, ...input, page: 0 })
      if (anchors.current.scope !== scopeKey)
        anchors.current = { scope: scopeKey, pages: new Map() }
      const afterId = anchors.current.pages.get(input.page)
      void mailApi.query({ ...input, afterId }, controller.signal).then(
        (data) => {
          if (controller.signal.aborted) return
          loadedKey.current = `${identity}:${key}`
          if (data.nextAfter)
            anchors.current.pages.set(input.page + 1, data.nextAfter)
          setResult({ ...data, identity })
          setStatus("ready")
          if (!data.messages.length && data.total > 0 && input.page > 1)
            onPageEmpty?.()
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          setStatus("error")
          toast.error(error instanceof Error ? error.message : "读取邮件失败", {
            id: "mail-query",
            action: {
              label: "重试",
              onClick: () => setRetry((n) => n + 1),
            },
          })
        }
      )
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [key, revision, enabled, retry, onPageEmpty, identity])
  // 身份切换时立刻隐藏上一位用户的结果与游标，早于下一次请求。
  return {
    result: result.identity === identity ? result : { messages: [], total: 0 },
    status: result.identity === identity ? status : ("loading" as const),
    retry: () => setRetry((n) => n + 1),
  }
}
