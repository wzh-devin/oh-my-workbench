/** 在一个事务中读写本地演示文件，事务成功后关闭数据库连接。 */
const fileTransaction = <T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore, result: (value: T) => void) => void
): Promise<T> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("workbench-demo-files", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("files")
    request.onerror = () =>
      reject(new Error("无法打开本地文件存储，请检查浏览器存储权限。"))
    request.onblocked = () =>
      reject(
        new Error("本地文件存储被其他页面占用，请关闭其他工作台页面后重试。")
      )
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction("files", mode)
      let value: T
      transaction.oncomplete = () => {
        database.close()
        resolve(value)
      }
      transaction.onabort = transaction.onerror = () => {
        database.close()
        reject(new Error("本地文件操作失败，可能是浏览器存储空间不足。"))
      }
      try {
        execute(transaction.objectStore("files"), (next) => {
          value = next
        })
      } catch (error) {
        database.close()
        reject(error)
      }
    }
  })

export const putFiles = (files: { id: string; file: File }[]) =>
  fileTransaction<void>("readwrite", (store, result) => {
    files.forEach(({ id, file }) => store.put(file, id))
    result(undefined)
  })
export const deleteFiles = (ids: string[]) =>
  fileTransaction<void>("readwrite", (store, result) => {
    ids.forEach((id) => store.delete(id))
    result(undefined)
  })
export const getFile = (id: string) =>
  fileTransaction<Blob | undefined>("readonly", (store, result) => {
    const request = store.get(id)
    request.onsuccess = () => result(request.result as Blob | undefined)
  })

/** 下载本地内容后释放临时 URL；不访问外部邮箱或存储。 */
export const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
