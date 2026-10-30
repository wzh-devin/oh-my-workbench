import { useEffect, useRef, useState } from "react"
import { CheckIcon, FolderPlusIcon, UploadCloudIcon, XIcon } from "lucide-react"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Alert, AlertDescription } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { useFileUpload } from "@/hooks/use-file-upload"
import { Choice } from "@/features/workbench/components"
import { formatSize } from "@/features/workbench/model"
import { uploadFiles, useWorkbench } from "@/features/workbench/store"
import { droppedFiles } from "../file-drop"
import { folderTrail, trashedEntryIds } from "../asset-rules"

type UploadResult = { state: "saving" | "saved" | "error"; message?: string }

/** 逐文件提交并保留成功结果，重试只处理失败项且保留上传目录。 */
export function UploadDialog({
  connectionId,
  parentId = null,
  initialFiles,
  onClose,
}: {
  connectionId: string
  parentId?: string | null
  initialFiles?: File[]
  onClose: () => void
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
  const [destinationId, setDestinationId] = useState(parentId ?? "root")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<Record<string, UploadResult>>({})
  const running = useRef(false)
  const initialized = useRef(false)
  const directoryInput = useRef<HTMLInputElement>(null)
  const directoryIds = useRef(new Map<string, string>())
  const [upload, actions] = useFileUpload({
    multiple: true,
    maxFiles: 200,
    maxSize: 20 * 1024 * 1024,
  })
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (initialFiles?.length) actions.addFiles(initialFiles)
  }, [initialFiles, actions])
  const trashIds = trashedEntryIds(data)
  const folders = data.assetFolders.filter(
    (entry) => entry.connectionId === targetId && !trashIds.has(entry.id)
  )
  const savedCount = upload.files.filter(
    (record) => results[record.id]?.state === "saved"
  ).length
  const allSaved = upload.files.length > 0 && savedCount === upload.files.length
  const locked = busy || Object.keys(results).length > 0
  const pendingFiles = upload.files.filter(
    (record) => results[record.id]?.state !== "saved"
  )
  const totalBytes = upload.files.reduce(
    (size, record) => size + record.file.size,
    0
  )
  const submit = async () => {
    if (running.current || !pendingFiles.length) return
    if (totalBytes > 200 * 1024 * 1024) {
      setError("每批文件总大小不能超过 200 MB。")
      return
    }
    running.current = true
    setBusy(true)
    setError("")
    try {
      for (const record of pendingFiles) {
        if (!(record.file instanceof File)) continue
        setResults((current) => ({
          ...current,
          [record.id]: { state: "saving" },
        }))
        try {
          await uploadFiles(
            targetId,
            [record.file],
            destinationId === "root" ? null : destinationId,
            directoryIds.current
          )
          setResults((current) => ({
            ...current,
            [record.id]: { state: "saved" },
          }))
        } catch (caught) {
          setResults((current) => ({
            ...current,
            [record.id]: {
              state: "error",
              message: caught instanceof Error ? caught.message : "上传失败。",
            },
          }))
        }
      }
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>上传</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
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
              disabled={locked}
            />
          </Field>
          <Field>
            <FieldLabel>目标目录</FieldLabel>
            <Choice
              value={destinationId}
              onChange={setDestinationId}
              label="目标目录"
              disabled={locked}
              options={[
                { value: "root", label: "根目录" },
                ...folders.map((entry) => ({
                  value: entry.id,
                  label: folderTrail(data, entry.id)
                    .map((ancestor) => ancestor.name)
                    .join(" / "),
                })),
              ]}
            />
          </Field>
          {!locked && (
            <Card
              size="sm"
              className={upload.isDragging ? "bg-muted" : "bg-muted/30"}
              onDragEnter={actions.handleDragEnter}
              onDragLeave={actions.handleDragLeave}
              onDragOver={actions.handleDragOver}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                actions.handleDragLeave(event)
                const transfer = event.dataTransfer
                void droppedFiles(transfer)
                  .then(actions.addFiles)
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "文件夹读取失败。"
                    )
                  )
              }}
            >
              <CardContent className="flex flex-col items-center gap-3 text-center">
                <UploadCloudIcon
                  className="size-7 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-xs text-muted-foreground">
                  每个文件 ≤20 MB · 每批 ≤200 个文件 / 200 MB
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={actions.openFileDialog}
                  >
                    选择文件
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => directoryInput.current?.click()}
                  >
                    <FolderPlusIcon aria-hidden="true" />
                    选择文件夹
                  </Button>
                </div>
                <input
                  {...actions.getInputProps()}
                  aria-label="选择上传文件"
                  className="sr-only"
                />
                <input
                  type="file"
                  multiple
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
          )}
          {!!upload.errors.length && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                文件超过数量、大小或类型限制，请重新选择。
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-3">
            {upload.files.map((record) => (
              <div key={record.id} className="flex min-w-0 items-start gap-2">
                <FileTypeIcon file={record.file} size="xs" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className="truncate text-sm"
                    title={
                      record.file instanceof File
                        ? record.file.webkitRelativePath || record.file.name
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
                  {results[record.id]?.state === "error" && (
                    <p role="alert" className="text-xs text-destructive">
                      {results[record.id].message}
                    </p>
                  )}
                </div>
                {results[record.id]?.state === "saved" ? (
                  <Badge variant="success-light">
                    <CheckIcon aria-hidden="true" />
                    已完成
                  </Badge>
                ) : results[record.id]?.state === "saving" ? (
                  <Badge variant="secondary">上传中</Badge>
                ) : results[record.id]?.state === "error" ? (
                  <Badge variant="destructive-light">失败</Badge>
                ) : (
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
                )}
              </div>
            ))}
          </div>
          {locked && (
            <Progress
              value={
                upload.files.length
                  ? (savedCount / upload.files.length) * 100
                  : 0
              }
            >
              <ProgressLabel>
                <span role="status" aria-live="polite">
                  {savedCount} / {upload.files.length} 已完成
                </span>
              </ProgressLabel>
            </Progress>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            {allSaved ? "完成" : "关闭"}
          </Button>
          {!allSaved && (
            <Button
              type="button"
              size="sm"
              disabled={busy || !pendingFiles.length || !targetId}
              onClick={() => {
                void submit()
              }}
            >
              {busy
                ? "上传中…"
                : Object.keys(results).length
                  ? "重试失败项"
                  : "开始上传"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
