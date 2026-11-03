import { useEffect, useId, useState, type FormEvent } from "react"
import { FingerprintIcon } from "lucide-react"
import { supportsPlatformPasskey } from "../passkeys"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/format-date-time"
import { noteApi, type NoteApi } from "../api"
import type { Draft, Note, NoteContent, Notebook, Revision } from "../model"
import { MarkdownPreview } from "./markdown-preview"

/** 只验证访问；凭据管理在账号安全设置，密码不会离开弹窗内存。 */
export function UnlockDialog({
  api,
  onPasskey,
  onCancel,
  onClose,
  onUnlock,
  protect = false,
}: {
  protect?: boolean
  onClose: () => void
  onCancel: () => void
  onUnlock: (password: string) => Promise<void>
  onPasskey: () => Promise<void>
  api: NoteApi
}) {
  const id = useId()
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null)
  const [passkey, setPasskey] = useState<
    "loading" | "enabled" | "password" | "error"
  >("loading")
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const available = await supportsPlatformPasskey()
      const state = available
        ? await api.passkeyStatus(controller.signal)
        : null
      if (!controller.signal.aborted)
        setPasskey(state?.enabled ? "enabled" : "password")
    })().catch(() => {
      if (!controller.signal.aborted) setPasskey("error")
    })
    return () => controller.abort()
  }, [api, retry])
  const verify = async (method: "password" | "passkey") => {
    if (busy) return
    setBusy(method)
    setError("")
    try {
      if (method === "passkey") await onPasskey()
      else await onUnlock(password)
      setPassword("")
      onClose()
    } catch (failure) {
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "验证已取消，可以重试或使用登录密码"
          : failure instanceof Error
            ? failure.message
            : "解锁失败，请重试"
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogContent aria-describedby={undefined} showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{protect ? "为笔记加锁" : "解锁笔记"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void verify("password")
          }}
          className="flex flex-col gap-4"
          aria-busy={!!busy}
        >
          <Field>
            <FieldLabel htmlFor={id}>登录密码</FieldLabel>
            <Input
              id={id}
              type="password"
              disabled={!!busy}
              autoComplete="current-password"
              autoFocus
              value={password}
              placeholder="输入当前登录密码"
              maxLength={24}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {error && (
            <p
              id={`${id}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {passkey === "error" && (
            <p role="status" className="text-sm text-muted-foreground">
              通行密钥暂不可用，可使用登录密码
            </p>
          )}
          <DialogFooter>
            <div className="flex w-full items-center justify-end gap-2">
              {passkey !== "password" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto"
                  disabled={!!busy || passkey === "loading"}
                  aria-label={
                    passkey === "loading" ? "正在读取验证方式" : undefined
                  }
                  onClick={() => {
                    if (passkey === "error") {
                      setPasskey("loading")
                      setRetry((value) => value + 1)
                    } else void verify("passkey")
                  }}
                >
                  {passkey === "loading" ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <>
                      <FingerprintIcon aria-hidden />
                      {busy === "passkey"
                        ? "验证中"
                        : passkey === "error"
                          ? "重试通行密钥"
                          : "通行密钥"}
                    </>
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={onCancel}
              >
                取消
              </Button>
              <Button type="submit" disabled={!!busy || !password}>
                {busy === "password" ? "正在验证" : protect ? "加锁" : "解锁"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 创建即落库；取消不产生记录，失败保留标题以便重试。 */
export function CreateLockedNoteDialog({
  draft,
  onClose,
  onCreate,
}: {
  draft: Draft
  onClose: () => void
  onCreate: (title: string) => Promise<void>
}) {
  const id = useId()
  const [title, setTitle] = useState(draft.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined} showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>新建加锁笔记</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setError("")
            try {
              await onCreate(title)
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "创建失败，请重试"
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>标题</FieldLabel>
            <Input
              id={id}
              autoFocus
              maxLength={200}
              value={title}
              disabled={busy}
              placeholder="未命名笔记"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "正在创建" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 笔记本沿用简单名称和版本号，保存失败保留输入。 */
export function NotebookDialog({
  source,
  onClose,
  onSaved,
}: {
  source: Notebook | null
  onClose: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [name, setName] = useState(source?.name ?? "")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      await noteApi.saveNotebook(name, source ?? undefined)
      onSaved()
      onClose()
      toast.success("已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
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
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{source ? "重命名笔记本" : "新建笔记本"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor={id}>名称</FieldLabel>
            <Input
              id={id}
              autoFocus
              value={name}
              placeholder="输入笔记本名称"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 版本列表按需加载，选中后才解密快照；恢复前由调用方保护当前草稿。 */
export function RevisionsDialog({
  api,
  note,
  onClose,
  onRestore,
  onLocked,
}: {
  api: NoteApi
  note: Note
  onClose: () => void
  onRestore: (revision: string) => Promise<void>
  onLocked: () => void
}) {
  const [records, setRecords] = useState<Revision[]>([])
  const [selected, setSelected] = useState<Revision | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "error"
  >("idle")
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void api.revisions(note.id, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setRecords(result)
          setStatus("ready")
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setStatus("error")
          toast.error(error instanceof Error ? error.message : "读取历史失败")
          if (
            error instanceof Error &&
            "status" in error &&
            error.status === 423
          )
            onLocked()
        }
      }
    )
    return () => controller.abort()
  }, [note.id, revision, onLocked, api])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    void api.revision(note.id, selectedId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setSelected(result)
          setPreviewStatus("idle")
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setPreviewStatus("error")
          toast.error(error instanceof Error ? error.message : "读取版本失败")
          if (
            error instanceof Error &&
            "status" in error &&
            error.status === 423
          )
            onLocked()
        }
      }
    )
    return () => controller.abort()
  }, [note.id, selectedId, previewRevision, onLocked, api])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>历史版本</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto sm:flex-row">
          <div className="flex max-h-56 shrink-0 flex-col gap-1 overflow-auto sm:max-h-96 sm:w-52">
            {status === "loading" ? (
              <Skeleton className="h-24 w-full" />
            ) : status === "error" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStatus("loading")
                  setRevision((value) => value + 1)
                }}
              >
                重试
              </Button>
            ) : records.length === 0 ? (
              <p role="status">暂无历史版本</p>
            ) : (
              records.map((record) => (
                <Button
                  type="button"
                  key={record.id}
                  variant={selectedId === record.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    if (selectedId === record.id) return
                    setSelected(null)
                    setPreviewStatus("loading")
                    setSelectedId(record.id)
                  }}
                >
                  {formatDateTime(record.createdAt)}
                </Button>
              ))
            )}
          </div>
          <div className="flex min-h-64 min-w-0 flex-1 flex-col">
            {previewStatus === "loading" ? (
              <Skeleton className="min-h-64 flex-1" />
            ) : previewStatus === "error" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreviewStatus("loading")
                  setPreviewRevision((value) => value + 1)
                }}
              >
                重试
              </Button>
            ) : selected ? (
              <MarkdownPreview
                markdown={selected.markdown ?? ""}
                title="历史版本预览"
              />
            ) : (
              <p className="text-sm text-muted-foreground">选择版本</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </Button>
          <Button
            type="button"
            disabled={!selected || busy}
            onClick={async () => {
              if (!selected || busy) return
              setBusy(true)
              try {
                await onRestore(selected.id)
                onClose()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "恢复失败")
              } finally {
                setBusy(false)
              }
            }}
          >
            恢复此版本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 并列比较冲突内容；用户选择服务器版本或另存副本，禁止静默覆盖。 */
const comparisonText = (note: NoteContent | Note, notebooks: Notebook[]) =>
  [
    `标题：${note.title}`,
    `笔记本：${notebooks.find((book) => book.id === note.notebookId)?.name ?? (note.notebookId ? "笔记本已删除" : "未分类")}`,
    `标签：${note.tags.join("、") || "—"}`,
    `收藏：${note.favorite ? "是" : "否"}；加锁：${note.requiresUnlock ? "是" : "否"}`,
    `日记日期：${note.diaryDate ?? "—"}`,
    "",
    note.markdown ?? "",
  ].join("\n")

/** 只在用户明确选择后替换草稿；正文和元数据一起展示，避免误判冲突。 */
export function ConflictDialog({
  draft,
  remote,
  notebooks,
  onClose,
  onRemote,
  onCopy,
}: {
  draft: Draft
  remote: Note
  notebooks: Notebook[]
  onClose: () => void
  onRemote: () => void
  onCopy: () => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>比较修改</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="notes-local-conflict">当前草稿</FieldLabel>
            <Textarea
              id="notes-local-conflict"
              readOnly
              value={comparisonText(draft, notebooks)}
              placeholder="当前草稿"
              rows={12}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="notes-remote-conflict">服务器版本</FieldLabel>
            <Textarea
              id="notes-remote-conflict"
              readOnly
              value={comparisonText(remote, notebooks)}
              placeholder="服务器版本"
              rows={12}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              onRemote()
              onClose()
            }}
          >
            使用服务器版本
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                if (await onCopy()) onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            另存为副本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
