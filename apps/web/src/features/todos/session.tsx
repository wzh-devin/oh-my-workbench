import { useLayoutEffect } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { loadTodos, setTodoUser } from "./store"

/** 认证身份变更时，在绘制页面前清除前一个用户的待办快照。 */
export function TodoSession() {
  const { user, refresh } = useAuth()
  const userId = user?.id ?? null
  useLayoutEffect(() => {
    setTodoUser(userId, refresh)
    const reload = () => {
      void loadTodos()
    }
    window.addEventListener("focus", reload)
    return () => {
      window.removeEventListener("focus", reload)
      setTodoUser(null)
    }
  }, [userId, refresh])
  return null
}
