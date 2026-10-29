import { useEffect, useId, useState, type FormEvent } from "react"
import {
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react"
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { saveBlob } from "@/features/workbench/local-files"
import {
  accountSecurityApi,
  securityFormSchemas,
  type AccountSecurity,
  type MfaSetup,
  type SecurityAction,
} from "../account-security"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"

const FORMS: Record<
  SecurityAction,
  {
    title: string
    submit: string
    fields: {
      name: string
      label: string
      type: "email" | "password" | "text"
      autoComplete: string
    }[]
  }
> = {
  email: {
    title: "修改账号邮箱",
    submit: "发送验证码",
    fields: [
      { name: "email", label: "新邮箱", type: "email", autoComplete: "email" },
      {
        name: "password",
        label: "当前密码",
        type: "password",
        autoComplete: "current-password",
      },
    ],
  },
  "verify-email": {
    title: "验证邮箱",
    submit: "验证邮箱",
    fields: [
      {
        name: "code",
        label: "邮箱验证码",
        type: "text",
        autoComplete: "one-time-code",
      },
    ],
  },
  password: {
    title: "修改登录密码",
    submit: "保存密码",
    fields: [
      {
        name: "currentPassword",
        label: "当前密码",
        type: "password",
        autoComplete: "current-password",
      },
      {
        name: "newPassword",
        label: "新密码",
        type: "password",
        autoComplete: "new-password",
      },
      {
        name: "confirmPassword",
        label: "确认新密码",
        type: "password",
        autoComplete: "new-password",
      },
    ],
  },
  "disable-mfa": {
    title: "关闭双重验证",
    submit: "确认关闭",
    fields: [
      {
        name: "password",
        label: "当前密码",
        type: "password",
        autoComplete: "current-password",
      },
      {
        name: "code",
        label: "动态验证码",
        type: "text",
        autoComplete: "one-time-code",
      },
    ],
  },
}

function SecurityFormDialog({
  action,
  account,
  onClose,
  onSaved,
}: {
  action: SecurityAction
  account: AccountSecurity | null
  onClose: () => void
  onSaved: (action: SecurityAction) => void
}) {
  const id = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const form = FORMS[action]
  const removing = action === "disable-mfa"
  const Root = removing ? AlertDialog : Dialog
  const Content = removing ? AlertDialogContent : DialogContent
  const Header = removing ? AlertDialogHeader : DialogHeader
  const Title = removing ? AlertDialogTitle : DialogTitle
  const Footer = removing ? AlertDialogFooter : DialogFooter
  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = securityFormSchemas[action].safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请检查输入内容")
      return
    }
    setBusy(true)
    setError("")
    try {
      await accountSecurityApi.submit(action, values)
      onSaved(action)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败，请重试")
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
      <Content aria-describedby={undefined}>
        <Header>
          <Title>
            {action === "password" && account?.passwordSet === false
              ? "设置登录密码"
              : action === "email" && account?.email === null
                ? "绑定账号邮箱"
                : form.title}
          </Title>
        </Header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {form.fields
            .filter(
              (field) =>
                account?.passwordSet !== false ||
                !["password", "currentPassword"].includes(field.name)
            )
            .map((field) => (
              <Field key={field.name}>
                <FieldLabel htmlFor={`${id}-${field.name}`}>
                  {field.label}
                </FieldLabel>
                <Input
                  id={`${id}-${field.name}`}
                  type={field.type}
                  placeholder={
                    field.name === "email"
                      ? "name@example.com"
                      : field.name === "code"
                        ? "请输入 6 位验证码"
                        : `请输入${field.label}`
                  }
                  autoComplete={field.autoComplete}
                  inputMode={field.name === "code" ? "numeric" : undefined}
                  maxLength={field.name === "code" ? 6 : 256}
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
          {action === "verify-email" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError("")
                try {
                  await accountSecurityApi.sendEmailCode()
                  toast.success("验证码已发送")
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "验证码发送失败，请重试"
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              发送验证码
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
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
              variant={action === "disable-mfa" ? "destructive" : "default"}
              disabled={busy}
            >
              {busy && <Spinner aria-hidden="true" />}
              {form.submit}
            </Button>
          </Footer>
        </form>
      </Content>
    </Root>
  )
}

function MfaSetupDialog({
  onClose,
  onEnabled,
}: {
  onClose: () => void
  onEnabled: () => void
}) {
  const id = useId()
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [revision, setRevision] = useState(0)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  useEffect(() => {
    const controller = new AbortController()
    accountSecurityApi.setupMfa(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setSetup(value)
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "绑定信息读取失败，请重试"
          )
      }
    )
    return () => controller.abort()
  }, [revision])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!setup) return
    if (!/^\d{6}$/.test(code)) {
      setError("请输入 6 位验证码")
      return
    }
    setBusy(true)
    setError("")
    try {
      const result = await accountSecurityApi.enableMfa(code)
      setRecoveryCodes(result.recoveryCodes)
      setCode("")
      setSetup(null)
      onEnabled()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "验证失败，请重试")
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
          <DialogTitle>
            {recoveryCodes.length ? "保存恢复码" : "设置双重验证"}
          </DialogTitle>
        </DialogHeader>
        {recoveryCodes.length ? (
          <>
            <ul className="grid grid-cols-2 gap-2 text-sm tabular-nums">
              {recoveryCodes.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  saveBlob(
                    new Blob([recoveryCodes.join("\n")], {
                      type: "text/plain",
                    }),
                    "workbench-recovery-codes.txt"
                  )
                }
              >
                <DownloadIcon aria-hidden="true" />
                下载恢复码
              </Button>
              <Button type="button" onClick={onClose}>
                完成
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {setup ? (
              <>
                <div className="flex justify-center">
                  <img
                    src={setup.qrCode}
                    width={192}
                    height={192}
                    alt="身份验证器设置二维码"
                  />
                </div>
                <Field>
                  <FieldLabel htmlFor={`${id}-secret`}>设置密钥</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${id}-secret`}
                      placeholder="双重验证密钥"
                      readOnly
                      value={setup.secret}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label="复制设置密钥"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(setup.secret)
                          toast.success("设置密钥已复制")
                        } catch {
                          setError("复制失败，请手动复制设置密钥")
                        }
                      }}
                    >
                      <CopyIcon aria-hidden="true" />
                    </Button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-code`}>动态验证码</FieldLabel>
                  <Input
                    id={`${id}-code`}
                    placeholder="请输入 6 位验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    required
                    disabled={busy}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </Field>
              </>
            ) : (
              !error && (
                <div
                  role="status"
                  aria-label="正在读取绑定信息"
                  className="flex flex-col items-center gap-4"
                >
                  <Skeleton className="size-48" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>双重验证尚未启用</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                {!setup && (
                  <AlertAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError("")
                        setRevision((current) => current + 1)
                      }}
                    >
                      重试
                    </Button>
                  </AlertAction>
                )}
              </Alert>
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
              <Button type="submit" disabled={!setup || busy}>
                {busy && <Spinner aria-hidden="true" />}验证并启用
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AccountSecuritySettings() {
  const [account, setAccount] = useState<AccountSecurity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [action, setAction] = useState<SecurityAction | "setup-mfa" | null>(
    null
  )
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
  const status = (active: boolean | undefined, yes: string, no: string) =>
    loading ? (
      <Skeleton className="h-5 w-16" />
    ) : (
      <Badge variant={active ? "success-light" : "secondary"}>
        {account ? (active ? yes : no) : "暂不可用"}
      </Badge>
    )
  return (
    <section aria-label="账号安全" className="flex min-w-0 flex-col gap-4">
      <h1 className="sr-only">账号安全</h1>
      {loading && (
        <span role="status" aria-label="正在读取账号安全" className="sr-only">
          正在读取账号安全
        </span>
      )}
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
      <SettingsSection title="账号安全设置">
        <SettingGroup legend="账号安全设置">
          <SettingRow title="账号邮箱">
            {loading ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <span className="text-sm break-all">
                {account ? (account.email ?? "未绑定") : "—"}
              </span>
            )}
          </SettingRow>
          <SettingRow title="邮箱验证">
            <div className="flex w-full flex-wrap items-center gap-2">
              {status(account?.emailVerified, "已验证", "未验证")}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAction("email")}
                >
                  修改邮箱
                </Button>
                {account?.email && !account.emailVerified && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAction("verify-email")}
                  >
                    验证邮箱
                  </Button>
                )}
              </div>
            </div>
          </SettingRow>
          <SettingRow title="登录密码">
            <div className="flex w-full flex-wrap items-center gap-2">
              {status(account?.passwordSet, "已设置", "未设置")}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setAction("password")}
              >
                {account?.passwordSet === false ? "设置密码" : "修改密码"}
              </Button>
            </div>
          </SettingRow>
          <SettingRow title="身份验证器（MFA）" last>
            <div className="flex w-full flex-wrap items-center gap-2">
              {status(account?.mfaEnabled, "已启用", "未启用")}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() =>
                  setAction(account?.mfaEnabled ? "disable-mfa" : "setup-mfa")
                }
              >
                {account?.mfaEnabled ? "关闭双重验证" : "设置双重验证"}
              </Button>
            </div>
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      {action === "setup-mfa" ? (
        <MfaSetupDialog onClose={() => setAction(null)} onEnabled={refresh} />
      ) : (
        action && (
          <SecurityFormDialog
            key={action}
            action={action}
            account={account}
            onClose={() => setAction(null)}
            onSaved={(saved) => {
              if (saved === "email") {
                setAction("verify-email")
                return
              }
              setAction(null)
              refresh()
            }}
          />
        )
      )}
    </section>
  )
}
