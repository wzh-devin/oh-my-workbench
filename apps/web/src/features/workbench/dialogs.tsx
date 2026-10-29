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
import { Choice } from "./components"
import {
  accountInputSchema,
  storageInputSchema,
  type MailAccount,
  type StorageConnection,
} from "./model"
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

/** 只保存演示来源的公开配置，不收集或持久化真实凭证。 */
export function ConnectionDialog({
  kind,
  source,
  onClose,
}: {
  kind: "mail" | "storage"
  source?: MailAccount | StorageConnection
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(source?.name ?? "")
  const [provider, setProvider] = useState(
    source && "provider" in source ? source.provider : "QQ"
  )
  const [email, setEmail] = useState(
    source && "email" in source ? source.email : ""
  )
  const [endpoint, setEndpoint] = useState(
    source && "endpoint" in source ? source.endpoint : ""
  )
  const [bucket, setBucket] = useState(
    source && "bucket" in source ? source.bucket : ""
  )
  const { data } = useWorkbench()
  /** 配置校验与重复来源检查通过后，一次性更新来源及其首封示例邮件。 */
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result =
      kind === "mail"
        ? accountInputSchema.safeParse({
            name: name.trim(),
            provider,
            email: email.trim(),
          })
        : storageInputSchema.safeParse({
            name: name.trim(),
            endpoint: endpoint.trim(),
            bucket: bucket.trim(),
          })
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "请检查配置内容。")
      return
    }
    const duplicate =
      kind === "mail"
        ? data.accounts.some(
            (record) =>
              record.id !== source?.id &&
              record.email.toLowerCase() === email.trim().toLowerCase()
          )
        : data.connections.some(
            (record) =>
              record.id !== source?.id &&
              record.endpoint.replace(/\/$/, "") ===
                endpoint.trim().replace(/\/$/, "") &&
              record.bucket === bucket.trim()
          )
    if (duplicate) {
      toast.error("这个来源已经存在，请直接使用已有连接。")
      return
    }
    const sourceId = source?.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const saved = updateWorkbench((current) => {
      if (source)
        return kind === "mail"
          ? {
              ...current,
              accounts: current.accounts.map((record) =>
                record.id === source.id
                  ? { ...record, name: name.trim() }
                  : record
              ),
            }
          : {
              ...current,
              connections: current.connections.map((record) =>
                record.id === source.id
                  ? { ...record, name: name.trim() }
                  : record
              ),
            }
      if (kind === "storage")
        return {
          ...current,
          connections: [
            ...current.connections,
            {
              id: sourceId,
              name: name.trim(),
              endpoint: endpoint.trim(),
              bucket: bucket.trim(),
              status: "connected",
              lastSync: now,
              error: null,
            },
          ],
        }
      return {
        ...current,
        accounts: [
          ...current.accounts,
          {
            id: sourceId,
            name: name.trim(),
            provider,
            email: email.trim(),
            status: "connected",
            lastSync: now,
            error: null,
          },
        ],
        messages: [
          {
            id: crypto.randomUUID(),
            accountId: sourceId,
            sender: "工作台",
            address: "hello@example.com",
            subject: "本周项目安排",
            preview: "请在周五前整理本周进展与待办。",
            body: "你好，\n\n请在周五前整理本周项目进展、待处理事项以及需要归档的资料。\n\n项目协作组",
            receivedAt: now,
            read: false,
            starred: false,
            attachments: [],
          },
          ...current.messages,
        ],
      }
    })
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
          <DialogTitle>
            {source ? "管理" : "添加"}
            {kind === "mail" ? "邮箱" : "存储连接"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>显示名称</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "mail" ? "工作邮箱" : "MinIO 工作资料"}
              required
              maxLength={100}
            />
          </Field>
          {kind === "mail" ? (
            <>
              <Field>
                <FieldLabel>邮箱服务</FieldLabel>
                <Choice
                  value={provider}
                  onChange={(value) => {
                    if (value === "QQ" || value === "Gmail") setProvider(value)
                  }}
                  options={[
                    { value: "QQ", label: "QQ 邮箱" },
                    { value: "Gmail", label: "Gmail" },
                  ]}
                  label="邮箱服务"
                  disabled={!!source}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-email`}>邮箱地址</FieldLabel>
                <Input
                  id={`${id}-email`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="demo@example.com"
                  required
                  readOnly={!!source}
                />
              </Field>
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-endpoint`}>S3 Endpoint</FieldLabel>
                <Input
                  id={`${id}-endpoint`}
                  type="url"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder="http://localhost:9000"
                  required
                  readOnly={!!source}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-bucket`}>Bucket</FieldLabel>
                <Input
                  id={`${id}-bucket`}
                  value={bucket}
                  onChange={(event) => setBucket(event.target.value)}
                  placeholder="workbench"
                  required
                  readOnly={!!source}
                />
              </Field>
            </>
          )}
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
