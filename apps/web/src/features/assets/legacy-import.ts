import { assetApi } from "./api"
import { enqueueUploads, getUploadTasks } from "./upload-queue"
import { assetOperation } from "./store"
import { folderTrail } from "./asset-rules"
import { getWorkbench, readAsset } from "@/features/workbench/store"

/** 仅由用户触发；旧 ID 由服务端去重，旧元数据与 IndexedDB 原件始终保留。 */
export const importLegacyConnection = (
  sourceId: string,
  targetId: string,
  progress: (completed: number, total: number) => void
) =>
  assetOperation("assets:import", async (signal) => {
    const data = getWorkbench(),
      folders = data.assetFolders
        .filter((folder) => folder.connectionId === sourceId)
        .sort(
          (a, b) =>
            folderTrail(data, a.id).length - folderTrail(data, b.id).length
        )
    const files = data.assets.filter(
      (asset) => asset.connectionId === sourceId && asset.origin === "upload"
    )
    const folderMap = new Map<string, string>(),
      taskIds: string[] = []
    const wait = () =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new DOMException("导入已取消", "AbortError"))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort)
          resolve()
        }, 500)
        signal.addEventListener("abort", abort, { once: true })
      })
    for (const folder of folders) {
      const saved = await assetApi.folder(
        {
          connectionId: targetId,
          parentId: folder.parentId
            ? (folderMap.get(folder.parentId) ?? null)
            : null,
          name: folder.name,
          legacyId: folder.id,
        },
        signal
      )
      folderMap.set(folder.id, saved.id)
    }
    for (const file of files) {
      if (signal.aborted) throw new DOMException("导入已取消", "AbortError")
      while (
        getUploadTasks().filter(
          (task) =>
            !task.needsFile &&
            ["queued", "hashing", "uploading", "verifying"].includes(
              task.status
            )
        ).length >= 6
      )
        await wait()
      const blob = await readAsset(file)
      taskIds.push(
        ...(await enqueueUploads(
          targetId,
          file.parentId ? (folderMap.get(file.parentId) ?? null) : null,
          [new File([blob], file.name, { type: file.type })],
          file.id
        ))
      )
    }
    while (taskIds.length) {
      const selected = getUploadTasks().filter((task) =>
        taskIds.includes(task.id)
      )
      if (selected.some((task) => ["error", "cancelled"].includes(task.status)))
        throw new Error("部分文件导入失败，请在上传队列重试后重新导入")
      const completed = selected.filter(
        (task) => task.status === "completed"
      ).length
      progress(completed, taskIds.length)
      if (completed === taskIds.length) break
      await wait()
    }
    const entries = [...files, ...folders].map((entry) => ({
      legacyId: entry.id,
      starred: entry.starred,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      lastOpenedAt: entry.lastOpenedAt,
      trashedAt: entry.trashedAt,
    }))
    for (let offset = 0; offset < entries.length; offset += 200)
      await assetApi.importMetadata(entries.slice(offset, offset + 200), signal)
  })
