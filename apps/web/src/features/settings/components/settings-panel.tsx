import { useId, useState, type FormEvent } from "react"
import { SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Choice, WorkbenchScreen } from "@/features/workbench/components"
import { personalProfileSchema } from "@/features/workbench/model"
import { updateWorkbench, useWorkbench } from "@/features/workbench/store"
import type { SettingsItem } from "./data"
import { AccountSecuritySettings } from "./account-security-settings"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"

function GeneralSettings() {
  const { data } = useWorkbench()
  return (
    <SettingsSection title="通用设置">
      <SettingGroup legend="通用设置">
        <SettingRow title="主题">
          <ThemeToggle />
        </SettingRow>
        <SettingRow title="资产默认视图" last>
          <Choice
            label="资产默认视图"
            value={data.preferences.assetLayout}
            options={[
              { value: "list", label: "列表" },
              { value: "grid", label: "网格" },
            ]}
            onChange={(value) => {
              if (value !== "list" && value !== "grid") return
              updateWorkbench((current) => ({
                ...current,
                preferences: { ...current.preferences, assetLayout: value },
              }))
            }}
          />
        </SettingRow>
      </SettingGroup>
    </SettingsSection>
  )
}

function ProfileSettings() {
  const { data } = useWorkbench()
  const [name, setName] = useState(data.profile.name)
  const [email, setEmail] = useState(data.profile.email)
  const [error, setError] = useState("")
  const id = useId()
  function save(event: FormEvent) {
    event.preventDefault()
    const result = personalProfileSchema.safeParse({
      name,
      email: email.trim(),
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "请检查个人资料")
      return
    }
    if (updateWorkbench((current) => ({ ...current, profile: result.data }))) {
      setName(result.data.name)
      setEmail(result.data.email)
      setError("")
      toast.success("个人资料已保存")
    } else setError("保存失败，请重试")
  }
  return (
    <>
      <HeaderActions>
        <Button type="submit" form={id} size="sm">
          <SaveIcon aria-hidden="true" />
          保存资料
        </Button>
      </HeaderActions>
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
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function NotificationSettings() {
  const { data } = useWorkbench()
  const id = useId()
  const options = [
    { key: "todos", label: "待办到期" },
    { key: "mail", label: "未读邮件" },
    { key: "connections", label: "连接异常" },
  ] as const
  return (
    <SettingsSection title="通知设置">
      <SettingGroup legend="通知设置">
        {options.map(({ key, label }, index) => (
          <SettingRow
            key={key}
            title={label}
            labelFor={`${id}-${key}`}
            last={index === options.length - 1}
          >
            <Switch
              id={`${id}-${key}`}
              checked={data.preferences.notifications[key]}
              onCheckedChange={(checked) => {
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
      </SettingGroup>
    </SettingsSection>
  )
}

export function SettingsPanel({ item }: { item: SettingsItem }) {
  if (item.value === "security") return <AccountSecuritySettings />
  return (
    <WorkbenchScreen title={item.label}>
      {item.value === "general" && <GeneralSettings />}
      {item.value === "profile" && <ProfileSettings />}
      {item.value === "notifications" && <NotificationSettings />}
    </WorkbenchScreen>
  )
}
