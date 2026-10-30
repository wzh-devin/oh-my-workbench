import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { ArrowUpRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveMailAccount, useMail } from "../store"
import type { MailAccount } from "../model"
import { MailProviderIcon } from "./mail-provider-icon"

/** Keep the original edit version and draft until the authenticated save succeeds. */
export function MailAccountDialog({
  source,
  onClose,
}: {
  source?: MailAccount
  onClose: () => void
}) {
  const id = useId()
  const { busyIds } = useMail()
  const [name, setName] = useState(source?.name ?? "")
  const [version] = useState(source?.version)
  const [suffix, setSuffix] = useState(
    source?.email.slice(source.email.lastIndexOf("@")) ?? "@qq.com"
  )
  const [username, setUsername] = useState(
    source?.email.slice(0, source.email.lastIndexOf("@")) ?? ""
  )
  const provider =
    source?.provider ?? (suffix === "@gmail.com" ? "Gmail" : "QQ")
  const email = `${username.trim()}${suffix}`
  const [credential, setCredential] = useState("")
  const [enabled, setEnabled] = useState(source?.enabled ?? true)
  const [notifyEnabled, setNotifyEnabled] = useState(
    source?.notifyEnabled ?? true
  )
  const pending = busyIds.includes(source?.id ?? "account:create")
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!name.trim() || !username.trim() || (!source && !credential.trim())) {
      toast.error("请填写名称、邮箱地址和授权凭证")
      return
    }
    if (username.includes("@") || /\s/.test(username.trim())) {
      toast.error("请输入邮箱用户名，后缀从右侧选择")
      return
    }
    const saved = await saveMailAccount(
      {
        name,
        provider,
        email,
        credential,
        enabled,
        notifyEnabled,
        version,
      },
      source?.id
    )
    if (saved) {
      setCredential("")
      toast.success(source ? "邮箱已保存" : "邮箱已添加")
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{source ? "管理邮箱" : "添加邮箱"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>显示名称</FieldLabel>
            <Input
              id={`${id}-name`}
              placeholder="工作邮箱"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-email`}>邮箱地址</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${id}-email`}
                autoComplete="off"
                placeholder="邮箱用户名"
                value={username}
                onChange={(event) => {
                  const value = event.target.value.trim()
                  const matched = value.match(/^(.*)(@qq\.com|@gmail\.com)$/i)
                  if (matched) {
                    setUsername(matched[1])
                    setSuffix(matched[2].toLowerCase())
                  } else setUsername(value)
                }}
                required
                maxLength={300}
                disabled={!!source || pending}
              />
              <InputGroupAddon align="inline-end" className="py-0">
                <Select
                  value={suffix}
                  onValueChange={(value) => {
                    if (value) setSuffix(value)
                  }}
                  disabled={!!source || pending}
                >
                  <SelectTrigger
                    aria-label="邮箱后缀"
                    size="sm"
                    className="border-0"
                  >
                    <MailProviderIcon provider={provider} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[...new Set(["@qq.com", "@gmail.com", suffix])].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            <MailProviderIcon
                              provider={value === "@gmail.com" ? "Gmail" : "QQ"}
                            />
                            {value}
                          </SelectItem>
                        )
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={`${id}-credential`}>
                {provider === "QQ" ? "授权码" : "应用专用密码"}
              </FieldLabel>
              <Button
                nativeButton={false}
                role="link"
                variant="ghost"
                size="icon-xs"
                aria-label={
                  provider === "QQ"
                    ? "获取 QQ 邮箱授权码（官网）"
                    : "获取 Google 应用专用密码（官网）"
                }
                render={
                  <a
                    href={
                      provider === "QQ"
                        ? "https://mail.qq.com/"
                        : "https://myaccount.google.com/apppasswords"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ArrowUpRightIcon aria-hidden="true" />
              </Button>
            </div>
            <Input
              id={`${id}-credential`}
              aria-describedby={`${id}-credential-help`}
              type="password"
              autoComplete="new-password"
              placeholder={
                source
                  ? "留空保留原凭证"
                  : provider === "QQ"
                    ? "填写 QQ 邮箱授权码"
                    : "填写 Google 应用专用密码"
              }
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              maxLength={512}
              required={!source}
              disabled={pending}
            />
            <FieldDescription id={`${id}-credential-help`}>
              {provider === "QQ"
                ? "登录 QQ 邮箱，在设置 → 账号与安全 → 安全设置中开启 IMAP 服务并生成授权码。"
                : "登录 Google 账号后创建应用专用密码，需先开启两步验证。"}
            </FieldDescription>
          </Field>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">IMAP 服务器</dt>
            <dd>{provider === "QQ" ? "imap.qq.com" : "imap.gmail.com"}</dd>
            <dt className="text-muted-foreground">端口 / 加密</dt>
            <dd>993 / SSL/TLS</dd>
          </dl>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`${id}-enabled`}>自动同步</FieldLabel>
            <Switch
              id={`${id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={pending}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`${id}-notify`}>来信通知</FieldLabel>
            <Switch
              id={`${id}-notify`}
              checked={notifyEnabled}
              onCheckedChange={setNotifyEnabled}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "验证中" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
