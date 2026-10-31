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
import {
  saveAssetConnection,
  testAssetConnection,
} from "@/features/assets/store"
import { Checkbox } from "@/components/ui/checkbox"
import { AssetApiError } from "@/features/assets/api"
import { getAssets, loadAssets } from "@/features/assets/store"

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

/** 凭证仅用于保存，不从接口回填；失败保留草稿供重试。 */
export function ConnectionDialog({
  source,
  onClose,
}: {
  source?: StorageConnection
  onClose: () => void
}) {
  const id = useId()
  const [form, setForm] = useState({
    name: source?.name ?? "",
    endpoint: source?.endpoint ?? "",
    bucket: source?.bucket ?? "",
    region: source?.region ?? "us-east-1",
    prefix: source?.prefix ?? "workbench",
    accessKey: "",
    secretKey: "",
    enabled: source?.enabled ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(source?.version)
  const [conflict, setConflict] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const result = storageInputSchema.safeParse(form)
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "请检查配置内容")
      return
    }
    setBusy(true)
    try {
      const saved = await saveAssetConnection(
        {
          ...form,
          ...result.data,
          ...(source ? { version } : {}),
        },
        source?.id
      )
      toast.success("存储连接已保存")
      onClose()
      if (saved.enabled)
        void testAssetConnection(saved.id).catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : "连接检查失败")
        )
    } catch (error) {
      setConflict(error instanceof AssetApiError && error.status === 409)
      toast.error(error instanceof Error ? error.message : "保存连接失败")
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
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-auto"
      >
        <DialogHeader>
          <DialogTitle>{source ? "管理" : "添加"}存储连接</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {(
            [
              ["name", "显示名称", "MinIO 工作资料"],
              ["endpoint", "S3 Endpoint", "http://localhost:9000"],
              ["bucket", "Bucket", "workbench"],
              ["region", "Region", "us-east-1"],
              ["prefix", "管理前缀", "workbench"],
              [
                "accessKey",
                "Access Key",
                source ? "留空保留现有凭证" : "输入 Access Key",
              ],
              [
                "secretKey",
                "Secret Key",
                source ? "留空保留现有凭证" : "输入 Secret Key",
              ],
            ] as const
          ).map(([key, label, placeholder]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
              <Input
                id={`${id}-${key}`}
                type={
                  key === "secretKey"
                    ? "password"
                    : key === "endpoint"
                      ? "url"
                      : "text"
                }
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder={placeholder}
                autoComplete={
                  key === "accessKey" || key === "secretKey" ? "off" : undefined
                }
                disabled={busy}
                readOnly={
                  !!source &&
                  ["endpoint", "bucket", "prefix", "region"].includes(key)
                }
              />
            </Field>
          ))}
          <Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-enabled`}
                checked={form.enabled}
                disabled={busy}
                onCheckedChange={(enabled) =>
                  setForm((current) => ({ ...current, enabled: !!enabled }))
                }
              />
              <FieldLabel htmlFor={`${id}-enabled`}>启用连接</FieldLabel>
            </div>
          </Field>
          <DialogFooter>
            {conflict && source && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  await loadAssets()
                  setVersion(
                    getAssets().overview.connections.find(
                      (connection) => connection.id === source.id
                    )?.version
                  )
                  setConflict(false)
                }}
              >
                重载版本
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
