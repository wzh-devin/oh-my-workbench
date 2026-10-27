import { Navigate, useParams } from "react-router"

import { getSettingsItem } from "@/features/settings/components/data"
import { SettingsPanel } from "@/features/settings/components/settings-panel"
import NotFound from "@/pages/not-found"

/** 校验 URL 中的设置分区，未知分区显示 404。 */
export default function SettingsPage() {
  const { section } = useParams()
  if (section === "mail") return <Navigate to="/mail?view=accounts" replace />
  if (section === "storage")
    return <Navigate to="/assets?view=connections" replace />
  const item = getSettingsItem(section ?? "")

  if (!item) return <NotFound />

  return (
    <>
      <title>{`${item.label} · Flowly`}</title>
      <SettingsPanel item={item} />
    </>
  )
}
