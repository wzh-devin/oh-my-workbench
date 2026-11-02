import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { authApi, AuthError, type AuthUser, type Credentials } from "./auth-api"
import { onPageResume } from "@/lib/requests/page-resume"

type AuthState = {
  status: "loading" | "anonymous" | "authenticated" | "error"
  user: AuthUser | null
  error: string | null
  expiresAt: number | null
}

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>
  login: (values: Credentials) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const anonymous: AuthState = {
  status: "anonymous",
  user: null,
  error: null,
  expiresAt: null,
}

/** 会话只以服务端为准；请求序号阻止旧响应覆盖登录或退出结果。 */
export function AuthProvider({
  children,
  onBeforeLogout,
}: {
  children: ReactNode
  onBeforeLogout?: () => Promise<void>
}) {
  const [state, setState] = useState<AuthState>({
    ...anonymous,
    status: "loading",
  })
  const revision = useRef(0)
  const pending = useRef<AbortController | null>(null)
  const reading = useRef<Promise<void> | null>(null)
  const refresh = useCallback(() => {
    if (reading.current) return reading.current
    const current = ++revision.current
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    const request = authApi
      .me(controller.signal)
      .then(
        (session) => {
          if (current === revision.current)
            setState({ ...session, status: "authenticated", error: null })
        },
        (error: unknown) => {
          if (controller.signal.aborted || current !== revision.current) return
          setState((previous) =>
            error instanceof AuthError && error.status === 401
              ? anonymous
              : {
                  ...previous,
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "读取登录状态失败，请重试",
                }
          )
        }
      )
      .finally(() => {
        if (reading.current === request) reading.current = null
      })
    reading.current = request
    return request
  }, [])

  useEffect(() => {
    void refresh()
    const stop = onPageResume(() => {
      void refresh()
    })
    return () => {
      pending.current?.abort()
      reading.current = null
      stop()
    }
  }, [refresh])

  useEffect(() => {
    if (!state.expiresAt) return
    // 服务端签发时刻确定到期时间，浏览器恢复焦点时也会重新校验。
    const timeout = window.setTimeout(
      () => {
        void refresh()
      },
      Math.max(1000, state.expiresAt * 1000 - new Date().getTime() + 100)
    )
    return () => window.clearTimeout(timeout)
  }, [state.expiresAt, refresh])

  /** 登录成功后重新读取 Cookie 会话，确认浏览器确实接受了会话。 */
  const login = async (values: Credentials) => {
    reading.current = null
    ++revision.current
    pending.current?.abort()
    await authApi.login(values)
    const session = await authApi.me()
    reading.current = null
    ++revision.current
    pending.current?.abort()
    setState({ ...session, status: "authenticated", error: null })
  }

  /** 服务端撤销成功才清除当前身份，失败保留页面供重试。 */
  const logout = async () => {
    reading.current = null
    ++revision.current
    pending.current?.abort()
    await onBeforeLogout?.()
    await authApi.logout()
    reading.current = null
    ++revision.current
    pending.current?.abort()
    setState(anonymous)
  }

  return (
    <AuthContext.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/** 获取共享认证状态，业务组件不自行持久化身份。 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth requires AuthProvider")
  return context
}
