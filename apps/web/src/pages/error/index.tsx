import { useEffect } from "react"
import { useRouteError } from "react-router"

import { Button } from "@/components/ui/button"

/** 展示路由渲染错误，通过重新载入恢复可用页面。 */
export default function ErrorPage() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <title>Something went wrong · Flowly</title>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Error
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Something went wrong
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          The page failed to render. Try again, and if it keeps happening the
          details are in the console.
        </p>
      </div>
      <Button type="button" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  )
}
