import { useEffect, useId, useState, type FormEvent } from "react"
import { RefreshCwIcon, ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { accountSecurityApi, type AccountSecurity } from "../account-security"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"

const passwordFields = [
  {
    name: "currentPassword",
    label: "当前密码",
    autoComplete: "current-password",
  },
  { name: "newPassword", label: "新密码", autoComplete: "new-password" },
  {
    name: "confirmPassword",
    label: "确认新密码",
    autoComplete: "new-password",
  },
]

function ChangePasswordDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await accountSecurityApi.changePassword(values)
      toast.success("密码已修改")
      onSaved()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "修改密码失败，请重试"
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
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>修改登录密码</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={submit}
          className="flex flex-col gap-4"
          aria-busy={busy}
        >
          {passwordFields.map((field) => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`${id}-${field.name}`}>
                {field.label}
              </FieldLabel>
              <Input
                id={`${id}-${field.name}`}
                type="password"
                placeholder={
                  field.name === "newPassword"
                    ? "请输入 6–24 个字符的新密码"
                    : `请输入${field.label}`
                }
                autoComplete={field.autoComplete}
                minLength={6}
                maxLength={24}
                value={values[field.name] ?? ""}
                disabled={busy}
                required
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
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
              {busy && <Spinner aria-hidden="true" />}保存密码
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AccountSecuritySettings() {
  const [account, setAccount] = useState<AccountSecurity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const refresh = () => {
    setLoading(true)
    setError("")
    setRevision((current) => current + 1)
  }
  useEffect(() => {
    const controller = new AbortController()
    accountSecurityApi
      .get(controller.signal)
      .then(
        (value) => {
          if (!controller.signal.aborted) setAccount(value)
        },
        (failure: unknown) => {
          if (!controller.signal.aborted) {
            setAccount(null)
            setError(
              failure instanceof Error
                ? failure.message
                : "安全信息读取失败，请重试"
            )
          }
        }
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision])
  return (
    <section aria-label="账号安全" className="flex min-w-0 flex-col gap-4">
      <h1 className="sr-only">账号安全</h1>
      {loading && (
        <span role="status" aria-label="正在读取账号安全" className="sr-only">
          正在读取账号安全
        </span>
      )}
      <SettingsSection title="账号安全设置">
        <SettingGroup legend="账号安全设置">
          <SettingRow title="登录密码" last>
            <div className="flex w-full flex-wrap items-center gap-2">
              {loading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Badge
                  variant={account?.passwordSet ? "success-light" : "outline"}
                >
                  {account
                    ? account.passwordSet
                      ? "已设置"
                      : "未设置"
                    : "暂不可用"}
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={loading || !account?.passwordSet}
                onClick={() => setEditing(true)}
              >
                修改密码
              </Button>
            </div>
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      {error && (
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>账号安全暂时不可用</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="outline" onClick={refresh}>
              <RefreshCwIcon aria-hidden="true" />
              重试
            </Button>
          </AlertAction>
        </Alert>
      )}
      {editing && (
        <ChangePasswordDialog
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            refresh()
          }}
        />
      )}
    </section>
  )
}
