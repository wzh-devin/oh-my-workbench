import { useLayoutEffect } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { loadMail, setMailUser } from "./store"
import { restoreMailPush } from "./push"

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
      debounce = setTimeout(() => void loadMail(true), 200)
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
    window.addEventListener("focus", reload)
    void restoreMailPush(controller.signal).catch(() => {
      /* The explicit enable action owns permission/configuration errors. */
    })
    return () => {
      controller.abort()
      events.close()
      clearTimeout(debounce)
      window.clearInterval(fallback)
      window.removeEventListener("focus", reload)
      setMailUser(null)
    }
  }, [userId, refresh])
  return null
}
