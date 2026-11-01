import { useEffect, useRef, useState } from "react"
import { FolderPlusIcon, FilesIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { useFileUpload } from "@/hooks/use-file-upload"
import { Choice } from "@/features/workbench/components"
import { formatSize } from "@/features/workbench/model"
import { useWorkbench } from "@/features/workbench/store"
import { droppedFiles } from "../file-drop"
import { assetName, folderTrail, trashedEntryIds } from "../asset-rules"
import { createFolder, getAssets } from "../store"
import { enqueueUploads } from "../upload-queue"
import { FolderPicker } from "./folder-picker"

/** 文件选择与持久化队列分开，关闭弹窗保留传输和恢复入口。 */
export function UploadDialog({
  connectionId,
  parentId = null,
  initialFiles,
  onClose,
  onQueued,
}: {
  connectionId: string
  parentId?: string | null
  initialFiles?: File[]
  onClose: () => void
  onQueued?: () => void
}) {
  const { data } = useWorkbench()
  const connections = data.connections.filter(
    (record) => record.status === "connected"
  )
  const [targetId, setTargetId] = useState(
    connections.find((record) => record.id === connectionId)?.id ??
      connections[0]?.id ??
      ""
  )
  const [destinationId, setDestinationId] = useState(parentId ?? "root"),
    [busy, setBusy] = useState(false)
  const directoryInput = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)
  const [upload, actions] = useFileUpload({
    multiple: true,
    maxFiles: 200,
    maxSize: 10 * 1024 ** 3,
    onError: () => toast.error("每批最多 200 个文件，单文件最大 10 GiB"),
  })
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (initialFiles?.length) actions.addFiles(initialFiles)
  }, [initialFiles, actions])
  const trashIds = trashedEntryIds(data),
    folders = data.assetFolders.filter(
      (entry) => entry.connectionId === targetId && !trashIds.has(entry.id)
    )
  const perform = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传操作失败")
    }
  }
  const submit = async () => {
    if (busy || !upload.files.length) return
    setBusy(true)
    try {
      const directoryMap = new Map<string, string>()
      // 先校验整批路径，再逐级建立逻辑目录，避免非法路径导致部分上传。
      const selected = upload.files.flatMap((record) =>
        record.file instanceof File ? [record.file] : []
      )
      for (const file of selected) {
        const segments = (file.webkitRelativePath || file.name).split("/")
        if (
          segments.length +
            folderTrail(data, destinationId === "root" ? null : destinationId)
              .length >
          64
        )
          throw new Error("目录最多 64 层")
        segments.forEach(assetName)
      }
      for (const file of selected) {
        let parent = destinationId === "root" ? null : destinationId,
          path = ""
        for (const name of (file.webkitRelativePath || file.name)
          .split("/")
          .slice(0, -1)) {
          path += `/${name}`
          let id = directoryMap.get(path)
          if (!id) {
            id =
              getAssets().overview.folders.find(
                (folder) =>
                  folder.connectionId === targetId &&
                  folder.parentId === parent &&
                  folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()
              )?.id ?? (await createFolder(targetId, parent, name))
            directoryMap.set(path, id)
          }
          parent = id
        }
        await enqueueUploads(targetId, parent, [file])
      }
      actions.clearFiles()
      onClose()
      onQueued?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入上传队列失败")
    } finally {
      setBusy(false)
    }
  }
  const selectedSize = upload.files.reduce(
    (sum, record) => sum + record.file.size,
    0
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>上传</DialogTitle>
        </DialogHeader>
        {/* Card 使用外描边，滚动区域内留出 1px，防止两侧被裁掉。 */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-px">
          <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>目标存储</FieldLabel>
              <Choice
                value={targetId}
                onChange={(id) => {
                  setTargetId(id)
                  setDestinationId("root")
                }}
                options={connections.map((record) => ({
                  value: record.id,
                  label: record.name,
                }))}
                label="目标存储"
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel>目标目录</FieldLabel>
              <FolderPicker
                value={destinationId}
                onChange={setDestinationId}
                disabled={busy}
                folders={folders}
              />
            </Field>
          </div>
          <Card
            size="sm"
            className={upload.isDragging ? "shrink-0 bg-muted" : "shrink-0"}
            onDragEnter={actions.handleDragEnter}
            onDragLeave={actions.handleDragLeave}
            onDragOver={actions.handleDragOver}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              actions.handleDragLeave(event)
              if (busy) return
              const transfer = event.dataTransfer
              void perform(async () =>
                actions.addFiles(await droppedFiles(transfer))
              )
            }}
          >
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <FilesIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  待上传{upload.files.length ? ` · ${upload.files.length}` : ""}
                </span>
                {!!upload.files.length && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatSize(selectedSize)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={actions.openFileDialog}
                >
                  <PlusIcon aria-hidden="true" />
                  选择文件
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => directoryInput.current?.click()}
                >
                  <FolderPlusIcon aria-hidden="true" />
                  选择文件夹
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upload.files.length ? (
                <ul
                  className="grid min-w-0 grid-cols-1 divide-y"
                  aria-label="待上传文件"
                >
                  {upload.files.map((record) => (
                    <li
                      key={record.id}
                      className="flex min-w-0 items-center gap-3 py-3"
                    >
                      {record.preview ? (
                        <img
                          src={record.preview}
                          alt=""
                          className="size-10 shrink-0 object-cover"
                        />
                      ) : (
                        <FileTypeIcon file={record.file} size="sm" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span
                          className="truncate text-sm"
                          title={
                            record.file instanceof File
                              ? record.file.webkitRelativePath ||
                                record.file.name
                              : record.file.name
                          }
                        >
                          {record.file instanceof File
                            ? record.file.webkitRelativePath || record.file.name
                            : record.file.name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatSize(record.file.size)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`移除：${record.file.name}`}
                        disabled={busy}
                        onClick={() => actions.removeFile(record.id)}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                  <FilesIcon
                    className="size-10 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm">
                      {upload.isDragging
                        ? "松开以添加文件"
                        : "拖入文件或文件夹"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      每批最多 200 个文件 · 单文件 10 GiB
                    </span>
                  </div>
                </div>
              )}
              <input
                {...actions.getInputProps({ disabled: busy })}
                aria-label="选择上传文件"
                className="sr-only"
              />
              <input
                type="file"
                multiple
                disabled={busy}
                aria-label="选择上传文件夹"
                className="sr-only"
                ref={(node) => {
                  directoryInput.current = node
                  node?.setAttribute("webkitdirectory", "")
                }}
                onChange={(event) => {
                  if (event.target.files) actions.addFiles(event.target.files)
                  event.target.value = ""
                }}
              />
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !upload.files.length || !targetId}
            onClick={() => void submit()}
          >
            {busy
              ? "加入队列中…"
              : upload.files.length
                ? `上传 ${upload.files.length} 个文件`
                : "开始上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
