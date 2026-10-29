import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"

import { Alert, AlertDescription } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "../auth-context"

/** 未认证时禁止挂载业务页面；临时验证失败保留已挂载的编辑状态供重试恢复。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === "anonymous")
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    )
  if (auth.status === "loading")
    return (
      <main
        className="flex min-h-svh flex-col gap-4 p-6"
        role="status"
        aria-label="正在验证登录状态"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  return (
    <>
      {auth.status === "error" && (
        <main className="flex min-h-svh items-center justify-center p-4">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <Alert variant="destructive">
              <AlertDescription>{auth.error}</AlertDescription>
            </Alert>
            <Button
              type="button"
              onClick={() => {
                void auth.refresh()
              }}
            >
              重试
            </Button>
          </div>
        </main>
      )}
      {auth.user && (
        <div
          key={auth.user.id}
          hidden={auth.status === "error"}
          className={auth.status === "error" ? "hidden" : "contents"}
        >
          {children}
        </div>
      )}
    </>
  )
}
