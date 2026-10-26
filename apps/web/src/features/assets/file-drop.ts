/** 浏览器按批次读取拖入的文件夹，限制目录深度和条目数后保留相对路径。 */
export const droppedFiles = async (transfer: DataTransfer) => {
  const entries = Array.from(transfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry)
  if (!entries.some((entry) => entry.isDirectory))
    return Array.from(transfer.files)
  const files: File[] = []
  let visited = 0
  const visit = async (
    entry: FileSystemEntry,
    path: string,
    depth: number
  ): Promise<void> => {
    if (depth > 64 || ++visited > 2000)
      throw new Error("目录过深或条目过多，请分批上传。")
    const relativePath = path ? `${path}/${entry.name}` : entry.name
    if (entry.isFile) {
      if (files.length >= 200) throw new Error("每批最多上传 200 个文件。")
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      )
      Object.defineProperty(file, "webkitRelativePath", { value: relativePath })
      files.push(file)
    } else {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      let children: FileSystemEntry[]
      do {
        children = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject)
        )
        for (const child of children)
          await visit(child, relativePath, depth + 1)
      } while (children.length)
    }
  }
  for (const entry of entries) await visit(entry, "", 0)
  return files
}
