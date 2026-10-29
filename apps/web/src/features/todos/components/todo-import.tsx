import { useState } from "react"
import { z } from "zod"
import { toast } from "sonner"
import { DownloadIcon } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { WORKBENCH_STORAGE_KEY } from "@/features/workbench/store"
import { todoSchema } from "../model"
import { importTodos, useTodos } from "../store"

const legacySchema = z.object({
  todoLists: z.array(
    z.object({ id: z.string().min(1), name: z.string().min(1).max(100) })
  ),
  todos: z.array(todoSchema.omit({ version: true, updatedAt: true })),
})

/** 只在用户点击后读取并导入真实存档，成功与失败都保留原始备份。 */
export function TodoImport() {
  const [available] = useState(() => {
    try {
      return localStorage.getItem(WORKBENCH_STORAGE_KEY) !== null
    } catch {
      return true
    }
  })
  const { busyIds, status } = useTodos()
  const submit = async () => {
    try {
      const saved = localStorage.getItem(WORKBENCH_STORAGE_KEY)
      if (!saved) {
        toast.error("未找到本地待办存档。")
        return
      }
      const parsed = legacySchema.safeParse(JSON.parse(saved))
      if (!parsed.success) {
        toast.error("本地待办存档格式不正确，原始数据已保留。")
        return
      }
      if (await importTodos(parsed.data)) {
        toast.success("本地待办已导入")
      }
    } catch {
      toast.error("读取本地待办失败，请检查浏览器权限。")
    }
  }
  if (!available) return null
  return (
    <DropdownMenuItem
      disabled={status !== "ready" || busyIds.length > 0}
      onClick={submit}
    >
      <DownloadIcon aria-hidden="true" />
      导入本地待办
    </DropdownMenuItem>
  )
}
