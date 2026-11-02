import { useLayoutEffect } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { loadMail, setMailUser } from "./store"
import { restoreMailPush } from "./push"
import {
  notifyResourceChange,
  resourceIsActive,
} from "@/lib/requests/invalidation"
import { onPageResume } from "@/lib/requests/page-resume"

/** One authenticated SSE connection refreshes every mail consumer, regardless of route. */
export function MailSession() {
  const { user, refresh } = useAuth()
  const userId = user?.id ?? null
  useLayoutEffect(() => {
    setMailUser(userId, refresh)
    if (!userId) return
    const controller = new AbortController()
    const events = new EventSource("/api/mail/events")
    let debounce: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        notifyResourceChange("mail")
        if (resourceIsActive("mail")) void loadMail(true)
      }, 200)
    }
    events.addEventListener("changed", reload)
    // Polling is only a browser fallback; background collection and Web Push stay server-owned.
    const fallback = window.setInterval(() => {
      if (
        events.readyState !== EventSource.OPEN &&
        document.visibilityState === "visible"
      )
        reload()
    }, 30000)
    // 健康的事件流已负责变化通知；仅断线恢复时额外补读。
    const stop = onPageResume(() => {
      if (events.readyState !== EventSource.OPEN) reload()
    })
    void restoreMailPush(controller.signal).catch(() => {
      /* The explicit enable action owns permission/configuration errors. */
    })
    return () => {
      controller.abort()
      events.close()
      clearTimeout(debounce)
      window.clearInterval(fallback)
      stop()
      setMailUser(null)
    }
  }, [userId, refresh])
  return null
}
