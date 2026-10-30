import { useId, useState, type FormEvent } from "react"
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
import { storageInputSchema, type StorageConnection } from "./model"
import { updateWorkbench, useWorkbench } from "./store"

/** false表示调用方已反馈失败；异常兜底通知，删除成功后才关闭。 */
export function DeleteConfirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => boolean | Promise<boolean>
}) {
  const [pending, setPending] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault()
              if (pending) return
              setPending(true)
              try {
                if (await onConfirm()) {
                  toast.success("已删除")
                  onOpenChange(false)
                }
              } catch {
                toast.error("删除失败，请重试。")
              } finally {
                setPending(false)
              }
            }}
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Storage configuration remains local; mail uses its authenticated account dialog. */
export function ConnectionDialog({
  source,
  onClose,
}: {
  source?: StorageConnection
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(source?.name ?? "")
  const [endpoint, setEndpoint] = useState(source?.endpoint ?? "")
  const [bucket, setBucket] = useState(source?.bucket ?? "")
  const { data } = useWorkbench()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = storageInputSchema.safeParse({
      name: name.trim(),
      endpoint: endpoint.trim(),
      bucket: bucket.trim(),
    })
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "请检查配置内容。")
      return
    }
    if (
      data.connections.some(
        (record) =>
          record.id !== source?.id &&
          record.endpoint.replace(/\/$/, "") ===
            endpoint.trim().replace(/\/$/, "") &&
          record.bucket === bucket.trim()
      )
    ) {
      toast.error("这个来源已经存在，请直接使用已有连接。")
      return
    }
    const saved = updateWorkbench((current) => ({
      ...current,
      connections: source
        ? current.connections.map((record) =>
            record.id === source.id ? { ...record, name: name.trim() } : record
          )
        : [
            ...current.connections,
            {
              id: crypto.randomUUID(),
              name: name.trim(),
              endpoint: endpoint.trim(),
              bucket: bucket.trim(),
              status: "connected",
              lastSync: new Date().toISOString(),
              error: null,
            },
          ],
    }))
    if (saved) {
      toast.success(source ? "名称已保存" : "连接已添加")
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{source ? "管理" : "添加"}存储连接</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={id + "-name"}>显示名称</FieldLabel>
            <Input
              id={id + "-name"}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="MinIO 工作资料"
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={id + "-endpoint"}>S3 Endpoint</FieldLabel>
            <Input
              id={id + "-endpoint"}
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="http://localhost:9000"
              required
              readOnly={!!source}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={id + "-bucket"}>Bucket</FieldLabel>
            <Input
              id={id + "-bucket"}
              value={bucket}
              onChange={(event) => setBucket(event.target.value)}
              placeholder="workbench"
              required
              readOnly={!!source}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">{source ? "保存名称" : "添加连接"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
