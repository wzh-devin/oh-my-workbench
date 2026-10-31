import type { UploadTask } from "./upload-queue"

/** IndexedDB 只保存任务定位与进度，File 内容始终由用户重新选择。 */
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("workbench.asset-uploads", 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore("tasks", { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error("保存上传任务失败"))
  })
/** 事务提交后才确认任务保存，失败时保留原记录。 */
export const persistUpload = async (
  userId: string,
  task: UploadTask,
  remove = false
) => {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("tasks", "readwrite"),
        store = transaction.objectStore("tasks")
      if (remove) store.delete(`${userId}:${task.id}`)
      else
        store.put({
          ...task,
          id: `${userId}:${task.id}`,
          taskId: task.id,
          userId,
        })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error("保存上传任务失败"))
      transaction.onabort = () => reject(new Error("保存上传任务已中断"))
    })
  } finally {
    db.close()
  }
}
export const restoredUploads = async (
  userId: string
): Promise<UploadTask[]> => {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("tasks", "readonly")
        .objectStore("tasks")
        .getAll()
      request.onsuccess = () =>
        resolve(
          request.result
            .filter((record: { userId: string }) => record.userId === userId)
            .map((record: UploadTask & { taskId: string }) => ({
              ...record,
              id: record.taskId,
            }))
        )
      request.onerror = () => reject(new Error("恢复上传任务失败"))
    })
  } finally {
    db.close()
  }
}
