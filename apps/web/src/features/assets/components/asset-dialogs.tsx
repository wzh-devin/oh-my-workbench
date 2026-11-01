import { useEffect, useId, useRef, useState } from "react"
import { DownloadIcon, FolderIcon, FolderInputIcon } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { assetApi } from "../api"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet"
import { Choice } from "@/features/workbench/components"
import { FolderPicker } from "./folder-picker"
import {
  formatSize,
  formatTime,
  type Asset,
  type Workbench,
} from "@/features/workbench/model"
import {
  assetEntries,
  folderTrail,
  selectionRoots,
  subtreeIds,
  trashedEntryIds,
  type AssetEntry,
} from "../asset-rules"
import {
  copyEntries,
  createFolder,
  moveEntries,
  permanentlyDeleteEntries,
} from "../store"

export type AssetAction = {
  mode: "new" | "move" | "copy"
  ids: string[]
}

/** 新建与目录整理共享原生项目弹窗，失败时保留输入与选择。 */
export function AssetActionDialog({
  action,
  data,
  connectionId,
  parentId,
  onClose,
}: {
  action: AssetAction
  data: Workbench
  connectionId: string
  parentId: string | null
  onClose: () => void
}) {
  const inputId = useId()
  const entries = assetEntries(data).filter((entry) =>
    action.ids.includes(entry.id)
  )
  const [name, setName] = useState("")
  const [targetConnectionId, setTargetConnectionId] = useState(
    entries[0]?.connectionId ??
      data.connections.find((source) => source.id === connectionId)?.id ??
      data.connections[0]?.id ??
      ""
  )
  const [targetParentId, setTargetParentId] = useState(parentId ?? "root")
  const [busy, setBusy] = useState(false)
  const title = {
    new: "新建文件夹",
    move: "移动到",
    copy: "复制到",
  }[action.mode]
  const excludedIds =
    action.mode === "new"
      ? new Set<string>()
      : subtreeIds(data, selectionRoots(data, action.ids))
  const trashIds = trashedEntryIds(data)
  const folders = data.assetFolders.filter(
    (folder) =>
      folder.connectionId === targetConnectionId &&
      !trashIds.has(folder.id) &&
      !excludedIds.has(folder.id)
  )
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const destination = targetParentId === "root" ? null : targetParentId
      if (action.mode === "new")
        await createFolder(targetConnectionId, destination, name)
      else if (action.mode === "move")
        await moveEntries(action.ids, targetConnectionId, destination)
      else await copyEntries(action.ids, targetConnectionId, destination)
      toast.success(
        {
          new: "文件夹已创建",
          move: "已移动",
          copy: "已复制",
        }[action.mode]
      )
      onClose()
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "操作失败，请重试。"
      )
    } finally {
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
      <DialogContent showCloseButton={!busy} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
          className="flex flex-col gap-4"
        >
          {action.mode === "new" && (
            <Field>
              <FieldLabel htmlFor={inputId}>名称</FieldLabel>
              <Input
                id={inputId}
                placeholder="请输入名称"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                autoFocus
                disabled={busy}
              />
            </Field>
          )}
          <Field>
            <FieldLabel>目标存储</FieldLabel>
            <Choice
              value={targetConnectionId}
              onChange={(id) => {
                setTargetConnectionId(id)
                setTargetParentId("root")
              }}
              label="目标存储"
              disabled={busy || action.mode !== "new"}
              options={data.connections.map((source) => ({
                value: source.id,
                label: source.name,
              }))}
            />
          </Field>
          <Field>
            <FieldLabel>目标目录</FieldLabel>
            <FolderPicker
              value={targetParentId}
              onChange={setTargetParentId}
              disabled={busy}
              folders={folders}
            />
          </Field>

          {action.mode !== "new" && (
            <p className="text-xs text-muted-foreground">{entries.length} 项</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !targetConnectionId}
            >
              {busy ? "保存中…" : "确认"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 永久删除必须确认；处理中不允许关闭，清理失败保留重试入口。 */
export function AssetDeleteDialog({
  ids,
  onClose,
}: {
  ids: string[]
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await permanentlyDeleteEntries(ids)
      toast.success("删除已提交")
      onClose()
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "删除失败，请重试。"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>彻底删除 {ids.length} 项？</AlertDialogTitle>
          <AlertDialogDescription>
            文件及文件夹内的内容将永久删除，无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onClose}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void remove()
            }}
          >
            {busy ? "删除中…" : "确认彻底删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AssetDetails({
  entry: initialEntry,
  data,
  onClose,
  onLocate,
  onDownload,
}: {
  entry: AssetEntry
  data: Workbench
  onClose: () => void
  onLocate: (entry: AssetEntry) => void
  onDownload: (asset: Asset) => void
}) {
  // 先挂载关闭态，关闭后等待 Sheet 过渡完成再通知父级卸载。
  const [open, setOpen] = useState(false)
  const locateAfterClose = useRef(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${initialEntry.id}:${initialEntry.version}:${attempt}`
  const [loaded, setLoaded] = useState<{
    key: string
    status: "ready" | "error"
    entry?: AssetEntry
  } | null>(null)
  const entry =
    loaded?.key === requestKey && loaded.entry ? loaded.entry : initialEntry
  const loading = loaded?.key !== requestKey,
    failed = loaded?.key === requestKey && loaded.status === "error"
  useEffect(() => {
    const controller = new AbortController()
    void assetApi
      .entry(initialEntry.id, controller.signal)
      .then((entry) => {
        if (!controller.signal.aborted)
          setLoaded({ key: requestKey, status: "ready", entry })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: requestKey, status: "error" })
          toast.error(error instanceof Error ? error.message : "详情读取失败")
        }
      })
    return () => controller.abort()
  }, [initialEntry.id, requestKey])
  const source = data.connections.find(
    (connection) => connection.id === entry.connectionId
  )
  const extension = entry.name.match(/\.([^.]+)$/)?.[1].toUpperCase()
  const typeLabel =
    entry.kind === "folder"
      ? "文件夹"
      : extension
        ? `${extension} 文件`
        : "文件"
  const positionFacts = [
    ["所属存储", source?.name ?? "—"],
    [
      "路径",
      `/${[...folderTrail(data, entry.parentId).map((folder) => folder.name), entry.name].join("/")}`,
    ],
  ]
  const timeFacts = [
    ["创建时间", formatTime(entry.createdAt)],
    ["修改时间", formatTime(entry.updatedAt ?? entry.createdAt)],
    ["最近访问", formatTime(entry.lastOpenedAt)],
    ...(entry.trashedAt ? [["删除时间", formatTime(entry.trashedAt)]] : []),
  ]
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) {
          if (locateAfterClose.current) onLocate(entry)
          onClose()
          // 父级清理详情会重新渲染行，等提交后再恢复到当前操作按钮。
          requestAnimationFrame(() => {
            const target =
              Array.from(
                document.querySelectorAll<HTMLButtonElement>(
                  "[data-asset-action-id]"
                )
              ).find((button) => button.dataset.assetActionId === entry.id) ??
              document.querySelector<HTMLInputElement>(
                'input[aria-label="搜索文件"]'
              )
            target?.focus()
          })
        }
      }}
    >
      <SheetContent
        aria-describedby={undefined}
        finalFocus={false}
        className="data-[side=right]:w-full motion-reduce:translate-x-0! data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle>
            {entry.kind === "folder" ? "文件夹详情" : "文件详情"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 pb-4">
          {loading ? (
            <div
              className="flex flex-col gap-6"
              role="status"
              aria-label="正在加载文件详情"
            >
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-start gap-3">
                {entry.kind === "file" ? (
                  <FileTypeIcon file={entry} size="default" />
                ) : (
                  <FolderIcon
                    aria-hidden="true"
                    className="size-10 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium break-words">
                    {entry.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel} · {formatSize(entry.size ?? 0)}
                    {entry.kind === "folder" &&
                      ` · ${entry.fileCount ?? 0} 个文件`}
                  </p>
                </div>
              </div>
              {[positionFacts, timeFacts].map((facts, index) => (
                <dl
                  key={facts[0][0]}
                  className={index ? "grid gap-3 border-t pt-4" : "grid gap-3"}
                >
                  {facts.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-4"
                    >
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 text-sm break-words tabular-nums">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ))}
              <details className="border-t pt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  技术信息
                </summary>
                <dl className="grid gap-3 pt-4">
                  {[
                    ["Bucket", source?.bucket ?? "—"],
                    ...(entry.kind === "file"
                      ? [["媒体类型", entry.type || "—"]]
                      : []),
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-4"
                    >
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 text-sm break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
          {failed && (
            <div role="alert" className="flex items-center gap-2">
              <span className="text-sm text-destructive">详情读取失败</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                重试详情
              </Button>
            </div>
          )}
        </div>
        <SheetFooter className="shrink-0 border-t">
          <div className="flex flex-wrap items-center gap-2">
            {entry.kind === "file" && (
              <Button type="button" size="sm" onClick={() => onDownload(entry)}>
                <DownloadIcon aria-hidden="true" />
                下载
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                locateAfterClose.current = true
                setOpen(false)
              }}
            >
              <FolderInputIcon aria-hidden="true" />
              打开所在位置
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
