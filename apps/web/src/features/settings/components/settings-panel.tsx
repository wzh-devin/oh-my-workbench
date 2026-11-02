import { useEffect } from "react"
import { loadMailPreferences } from "@/features/mail/store"
import { useId, useState, type FormEvent } from "react"
import { SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { WorkbenchScreen } from "@/features/workbench/components"
import { personalProfileSchema } from "@/features/workbench/model"
import { updateWorkbench, useWorkbench } from "@/features/workbench/store"
import type { SettingsItem } from "./data"
import { AccountSecuritySettings } from "./account-security-settings"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"
import { MailPushSettings } from "@/features/mail/components/push-settings"
import { setMailNotifications, useMail } from "@/features/mail/store"
import { ProxySettings } from "./proxy-settings"
import { GeneralSettings } from "./general-settings"
import { SystemSettings } from "./system-settings"

/** 编辑个人资料；失败保留草稿，成功后同步用户菜单。 */
function ProfileSettings() {
  const { data } = useWorkbench()
  const [name, setName] = useState(data.profile.name)
  const [email, setEmail] = useState(data.profile.email)
  const id = useId()
  /** 校验和持久化均成功后才更新已保存的表单值。 */
  function save(event: FormEvent) {
    event.preventDefault()
    const result = personalProfileSchema.safeParse({
      name,
      email: email.trim(),
    })
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "请检查个人资料")
      return
    }
    if (updateWorkbench((current) => ({ ...current, profile: result.data }))) {
      setName(result.data.name)
      setEmail(result.data.email)
      toast.success("个人资料已保存")
    }
  }
  return (
    <form id={id} onSubmit={save} className="flex flex-col gap-4">
      <SettingsSection title="个人资料">
        <SettingGroup legend="个人资料">
          <SettingRow title="显示名称" labelFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              placeholder="请输入显示名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              autoComplete="nickname"
            />
          </SettingRow>
          <SettingRow title="联系邮箱（选填）" labelFor={`${id}-email`} last>
            <Input
              id={`${id}-email`}
              placeholder="name@example.com"
              value={email}
              type="email"
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      <div className="flex justify-end">
        <Button type="submit" size="sm">
          <SaveIcon aria-hidden="true" />
          保存资料
        </Button>
      </div>
    </form>
  )
}

function NotificationSettings() {
  const { data } = useWorkbench()
  const mail = useMail()
  useEffect(() => {
    if (mail.userId) void loadMailPreferences()
  }, [mail.userId])
  const id = useId()
  const options = [
    { key: "todos", label: "待办到期" },
    { key: "mail", label: "未读邮件" },
    { key: "connections", label: "连接异常" },
  ] as const
  return (
    <SettingsSection title="通知设置">
      <SettingGroup legend="通知设置">
        {options.map(({ key, label }) => (
          <SettingRow key={key} title={label} labelFor={`${id}-${key}`}>
            <Switch
              id={`${id}-${key}`}
              checked={data.preferences.notifications[key]}
              disabled={
                key === "mail" &&
                (!mail.userId || mail.busyIds.includes("preferences"))
              }
              onCheckedChange={(checked) => {
                if (key === "mail") {
                  void setMailNotifications(checked)
                  return
                }
                updateWorkbench((current) => ({
                  ...current,
                  preferences: {
                    ...current.preferences,
                    notifications: {
                      ...current.preferences.notifications,
                      [key]: checked,
                    },
                  },
                }))
              }}
            />
          </SettingRow>
        ))}
        <MailPushSettings />
      </SettingGroup>
    </SettingsSection>
  )
}

export function SettingsPanel({ item }: { item: SettingsItem }) {
  const content = (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
      {item.value === "general" && (
        <>
          <GeneralSettings />
          <SystemSettings />
        </>
      )}
      {item.value === "profile" && <ProfileSettings />}
      {item.value === "notifications" && <NotificationSettings />}
      {item.value === "proxy" && <ProxySettings />}
      {item.value === "security" && <AccountSecuritySettings />}
    </div>
  )
  return item.value === "security" ? (
    content
  ) : (
    <WorkbenchScreen title={item.label}>{content}</WorkbenchScreen>
  )
}
