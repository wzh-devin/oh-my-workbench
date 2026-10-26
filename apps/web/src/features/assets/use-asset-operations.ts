import { useRef, useState } from "react"
import { toast } from "sonner"
import type { Asset } from "@/features/workbench/model"
import { downloadAsset } from "@/features/workbench/store"
import { restoreEntries, trashEntries } from "./asset-store"

/** 页面操作互斥执行，失败后保留原操作供重试。 */
export const useAssetOperations = (clearSelection: () => void) => {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{
    title: string
    message: string
    retry: () => void
  } | null>(null)
  const run = async (
    operation: () => void | Promise<void>,
    success?: string,
    errorTitle = "操作失败"
  ) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await operation()
      if (success) toast.success(success)
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "操作失败，请重试。"
      setError({
        title: errorTitle,
        message,
        retry: () => {
          void run(operation, success, errorTitle)
        },
      })
      toast.error(message)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  const download = (asset: Asset) => {
    void run(() => downloadAsset(asset), undefined, "下载失败")
  }
  const remove = (ids: string[]) => {
    void run(() => {
      trashEntries(ids)
      clearSelection()
    }, "已移入回收站")
  }
  const restore = (ids: string[]) => {
    void run(() => {
      restoreEntries(ids)
      clearSelection()
    }, "已恢复")
  }
  return {
    run,
    download,
    remove,
    restore,
    busy,
    error,
    clearError: () => setError(null),
  }
}
