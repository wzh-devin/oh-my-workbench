import { useEffect, useId, useState, type FormEvent } from "react"
import { FingerprintIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingRow } from "@/features/settings/components/sections/setting-row"
import { createNoteApi, noteApi } from "../api"
import { registerPasskey, supportsPlatformPasskey } from "../passkeys"

function PasskeyDialog({
  enabled,
  onClose,
  onSaved,
}: {
  enabled: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [api] = useState(() => createNoteApi(crypto.randomUUID()))
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // 同一密码表单复用布局；撤销凭据使用项目的破坏性确认组件。
  const Root = enabled ? AlertDialog : Dialog
  const Content = enabled ? AlertDialogContent : DialogContent
  const Header = enabled ? AlertDialogHeader : DialogHeader
  const Title = enabled ? AlertDialogTitle : DialogTitle
  const Footer = enabled ? AlertDialogFooter : DialogFooter
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      if (enabled) await api.deletePasskey(password)
      else await registerPasskey(api, password)
      setPassword("")
      toast.success(enabled ? "通行密钥已移除" : "通行密钥已设置")
      onSaved()
    } catch (failure) {
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "设置已取消，可以重试"
          : failure instanceof Error
            ? failure.message
            : "操作失败，请重试"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Content
        aria-describedby={undefined}
        {...(!enabled ? { showCloseButton: !busy } : {})}
      >
        <Header>
          <Title>{enabled ? "移除笔记通行密钥" : "设置笔记通行密钥"}</Title>
        </Header>
        <form
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
          aria-busy={busy}
        >
          <Field>
            <FieldLabel htmlFor={id}>登录密码</FieldLabel>
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              autoFocus
              maxLength={24}
              placeholder="输入当前登录密码"
              value={password}
              disabled={busy}
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
          <Footer>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant={enabled ? "destructive" : "default"}
              disabled={busy || !password}
            >
              {!enabled && <FingerprintIcon aria-hidden />}
              {busy ? "正在验证" : enabled ? "移除" : "创建通行密钥"}
            </Button>
          </Footer>
        </form>
      </Content>
    </Root>
  )
}

export function NotePasskeySettings() {
  const [status, setStatus] = useState<
    "loading" | "enabled" | "empty" | "unsupported" | "error"
  >("loading")
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      noteApi.passkeyStatus(controller.signal),
      supportsPlatformPasskey(),
    ])
      .then(([state, available]) => {
        if (!controller.signal.aborted)
          setStatus(
            state.enabled ? "enabled" : available ? "empty" : "unsupported"
          )
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setStatus("error")
          setError(
            failure instanceof Error ? failure.message : "通行密钥读取失败"
          )
        }
      })
    return () => controller.abort()
  }, [revision])
  const refresh = () => {
    setStatus("loading")
    setError("")
    setRevision((value) => value + 1)
  }
  return (
    <>
      <SettingRow title="笔记通行密钥" last>
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full flex-wrap items-center gap-2">
            {status === "loading" ? (
              <Skeleton className="h-5 w-16" aria-label="正在读取通行密钥" />
            ) : (
              <Badge
                variant={status === "enabled" ? "success-light" : "outline"}
              >
                {status === "enabled"
                  ? "已设置"
                  : status === "empty"
                    ? "未设置"
                    : status === "unsupported"
                      ? "设备不支持"
                      : "暂不可用"}
              </Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={status === "loading" || status === "unsupported"}
              onClick={() =>
                status === "error" ? refresh() : setEditing(true)
              }
            >
              {status === "error"
                ? "重试"
                : status === "enabled"
                  ? "移除通行密钥"
                  : "设置通行密钥"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </SettingRow>
      {editing && (
        <PasskeyDialog
          enabled={status === "enabled"}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            refresh()
          }}
        />
      )}
    </>
  )
}
