import type { ReactNode } from "react"
import {
  BellIcon,
  NetworkIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react"

export type SettingsPanelValue =
  "general" | "profile" | "notifications" | "security" | "proxy"
export type SettingsItem = {
  value: SettingsPanelValue
  label: string
  icon: ReactNode
}
export type SettingsSection = {
  id: string
  label: string
  items: SettingsItem[]
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "personal",
    label: "个人设置",
    items: [
      {
        value: "general",
        label: "通用",
        icon: <SettingsIcon aria-hidden="true" />,
      },
      {
        value: "profile",
        label: "个人资料",
        icon: <UserRoundIcon aria-hidden="true" />,
      },
      {
        value: "notifications",
        label: "通知",
        icon: <BellIcon aria-hidden="true" />,
      },
      {
        value: "security",
        label: "账号安全",
        icon: <ShieldCheckIcon aria-hidden="true" />,
      },
      {
        value: "proxy",
        label: "网络代理",
        icon: <NetworkIcon aria-hidden="true" />,
      },
    ],
  },
]
export const SETTINGS_ITEMS = SETTINGS_SECTIONS.flatMap(
  (section) => section.items
)
export const getSettingsItem = (value: string) =>
  SETTINGS_ITEMS.find((item) => item.value === value)
