import { useCallback, useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router"

import { Alert, AlertDescription } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { authApi, loginDestination } from "../auth-api"
import { useAuth } from "../auth-context"
import { InitializeAdminDialog } from "./initialize-admin-dialog"
import { SignInForm } from "./sign-in-form"

/** 初始化状态读取失败时禁止提交，只有服务端确认后才显示管理员配置。 */
export function Auth() {
  const auth = useAuth()
  const location = useLocation()
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState("")
  const loadStatus = useCallback(
    (signal?: AbortSignal) =>
      authApi.status(signal).then(
        (result) => {
          if (!signal?.aborted) setInitialized(result.initialized)
        },
        (error: unknown) => {
          if (!signal?.aborted)
            setError(
              error instanceof Error
                ? error.message
                : "读取初始化状态失败，请重试"
            )
        }
      ),
    []
  )
  useEffect(() => {
    const controller = new AbortController()
    void loadStatus(controller.signal)
    return () => controller.abort()
  }, [loadStatus])

  if (auth.status === "authenticated")
    return <Navigate to={loginDestination(location.state?.from)} replace />
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-4">
      {initialized === null ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1>登录</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex flex-col gap-4">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button
                  type="button"
                  onClick={() => {
                    setError(null)
                    void loadStatus()
                  }}
                >
                  重试
                </Button>
              </div>
            ) : (
              <div
                className="flex flex-col gap-4"
                role="status"
                aria-label="正在读取初始化状态"
              >
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <SignInForm
          username={username}
          disabled={!initialized || auth.status === "loading"}
        />
      )}
      {initialized === false && (
        <InitializeAdminDialog
          onInitialized={(name) => {
            setUsername(name)
            setInitialized(true)
          }}
        />
      )}
    </main>
  )
}
