import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { loadTodos, useTodos } from "../store"

/** 错误由store通知，加载失败仍保留恢复入口，不显示伪造的空数据。 */
export function TodoState({ children }: { children: ReactNode }) {
  const { status } = useTodos()
  if (status === "loading")
    return (
      <div
        role="status"
        aria-label="正在读取待办"
        className="flex flex-col gap-4"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (status === "error")
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void loadTodos()}
      >
        重新加载待办
      </Button>
    )
  return children
}
