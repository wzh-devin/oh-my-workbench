import { useEffect, useId, useState } from "react"
import { DownloadIcon, FolderInputIcon } from "lucide-react"
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
  SheetTitle,
} from "@/components/ui/sheet"
import { Choice } from "@/features/workbench/components"
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
  renameEntry,
} from "../store"

export type AssetAction = {
  mode: "new" | "rename" | "move" | "copy"
  ids: string[]
}

/** 重命名和目录整理共享原生项目弹窗，失败时保留输入与选择。 */
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
  const [name, setName] = useState(
    action.mode === "rename" ? (entries[0]?.name ?? "") : ""
  )
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
    rename: "重命名",
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
      else if (action.mode === "rename") await renameEntry(action.ids[0], name)
      else if (action.mode === "move")
        await moveEntries(action.ids, targetConnectionId, destination)
      else await copyEntries(action.ids, targetConnectionId, destination)
      toast.success(
        {
          new: "文件夹已创建",
          rename: "名称已更新",
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
          {(action.mode === "new" || action.mode === "rename") && (
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
          {action.mode !== "rename" && (
            <>
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
                <Choice
                  value={targetParentId}
                  onChange={setTargetParentId}
                  label="目标目录"
                  disabled={busy}
                  options={[
                    { value: "root", label: "根目录" },
                    ...folders.map((folder) => ({
                      value: folder.id,
                      label: folderTrail(data, folder.id)
                        .map((record) => record.name)
                        .join(" / "),
                    })),
                  ]}
                />
              </Field>
            </>
          )}
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
  const facts = [
    ["名称", entry.name],
    ["类型", entry.kind === "folder" ? "文件夹" : entry.type],
    [
      "大小",
      formatSize(entry.kind === "file" ? entry.size : (entry.size ?? 0)),
    ],
    [
      "所属存储",
      data.connections.find((source) => source.id === entry.connectionId)
        ?.name ?? "—",
    ],
    [
      "Bucket",
      data.connections.find((source) => source.id === entry.connectionId)
        ?.bucket ?? "—",
    ],
    [
      "路径",
      `/${[...folderTrail(data, entry.parentId).map((folder) => folder.name), entry.name].join("/")}`,
    ],
    ["创建时间", formatTime(entry.createdAt)],
    ["修改时间", formatTime(entry.updatedAt ?? entry.createdAt)],
    ["最近访问", entry.lastOpenedAt ? formatTime(entry.lastOpenedAt) : "—"],
    ...(entry.kind === "folder"
      ? [["文件数量", String(entry.fileCount ?? 0)]]
      : []),
    ...(entry.trashedAt ? [["删除时间", formatTime(entry.trashedAt)]] : []),
  ]
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>文件详情</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <dl className="flex flex-col gap-4">
              {facts.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm break-all">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {failed && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试详情
            </Button>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onLocate(entry)}
            >
              <FolderInputIcon aria-hidden="true" />
              打开所在位置
            </Button>
            {entry.kind === "file" && (
              <Button type="button" size="sm" onClick={() => onDownload(entry)}>
                <DownloadIcon aria-hidden="true" />
                下载
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
