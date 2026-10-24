import { useParams } from "react-router"

import { getSettingsItem } from "@/features/settings/components/data"
import { SettingsPanel } from "@/features/settings/components/settings-panel"
import NotFound from "@/pages/not-found"

/** 校验 URL 中的设置分区，未知分区显示 404。 */
export default function SettingsPage() {
  const { section } = useParams()
  const item = getSettingsItem(section ?? "")

  if (!item) return <NotFound />

  return (
    <>
      <title>{`${item.label} Settings · Flowly`}</title>
      <SettingsPanel item={item} />
    </>
  )
}
