import { useState, type FormEvent } from "react"
import {
  FilesIcon,
  ClockIcon,
  StarIcon,
  FolderIcon,
  ImageIcon,
  FileTextIcon,
  HardDriveIcon,
  BriefcaseIcon,
  HeartIcon,
  CodeIcon,
  TagIcon,
} from "lucide-react"
import { toast } from "sonner"
import { RuleFilters } from "@/components/shared/rule-filters"
import { Button } from "@/components/ui/button"
import { AssetApiError } from "../api"
import { ViewFormDialog } from "@/components/shared/view-form-dialog"
import { Choice } from "@/features/workbench/components"
import type { AssetView } from "../model"
import {
  assetQueryToRule,
  assetRuleToQuery,
  assetRuleFields,
} from "../view-rules"
import { saveAssetView, useAssets, getAssets, loadAssets } from "../store"

export const ASSET_VIEW_ICONS = {
  files: FilesIcon,
  clock: ClockIcon,
  star: StarIcon,
  folder: FolderIcon,
  image: ImageIcon,
  "file-text": FileTextIcon,
  "hard-drive": HardDriveIcon,
  briefcase: BriefcaseIcon,
  heart: HeartIcon,
  code: CodeIcon,
  tag: TagIcon,
}
const iconLabels: Record<keyof typeof ASSET_VIEW_ICONS, string> = {
  files: "全部文件",
  clock: "时钟",
  star: "星标",
  folder: "文件夹",
  image: "图片",
  "file-text": "文档",
  "hard-drive": "存储",
  briefcase: "工作",
  heart: "喜欢",
  code: "代码",
  tag: "标签",
}
export const AssetViewIcon = ({ name }: { name: string }) => {
  const Icon =
    ASSET_VIEW_ICONS[name as keyof typeof ASSET_VIEW_ICONS] ?? FilesIcon
  return <Icon aria-hidden="true" />
}
/** 保存名称、图标、完整规则与排序；冲突保留草稿，并允许重载当前版本。 */
export function AssetViewDialog({
  view,
  onClose,
}: {
  view?: AssetView
  onClose: () => void
}) {
  const { overview } = useAssets()
  const [name, setName] = useState(view?.name ?? ""),
    [icon, setIcon] = useState(view?.icon ?? "folder"),
    [sort, setSort] = useState(view?.sort ?? "name")
  const [query, setQuery] = useState(() =>
    assetRuleToQuery(
      view?.filterQuery ?? {
        schemaVersion: 1,
        root: { kind: "constant", value: true },
      }
    )
  )
  const [busy, setBusy] = useState(false),
    [version, setVersion] = useState(view),
    [conflict, setConflict] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (!name.trim()) throw new Error("请输入视图名称")
      await saveAssetView(
        { name: name.trim(), icon, sort, filterQuery: assetQueryToRule(query) },
        version
      )
      toast.success("视图已保存")
      onClose()
    } catch (error) {
      setConflict(error instanceof AssetApiError && error.status === 409)
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <ViewFormDialog
      editing={!!view}
      pending={busy}
      name={name}
      onNameChange={setName}
      namePlaceholder="例如：工作文档"
      onSubmit={submit}
      onClose={onClose}
      icons={
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="视图图标"
        >
          {Object.entries(ASSET_VIEW_ICONS).map(([key, Icon]) => (
            <Button
              key={key}
              type="button"
              size="icon-sm"
              variant={icon === key ? "secondary" : "ghost"}
              aria-label={iconLabels[key as keyof typeof ASSET_VIEW_ICONS]}
              aria-pressed={icon === key}
              disabled={busy}
              onClick={() => setIcon(key)}
            >
              <Icon aria-hidden="true" />
            </Button>
          ))}
        </div>
      }
      rules={
        <RuleFilters
          fields={assetRuleFields(overview.connections)}
          query={query}
          onQueryChange={setQuery}
          mode="inline"
          disabled={busy}
        />
      }
      sort={
        <Choice
          label="视图排序"
          value={sort}
          onChange={setSort}
          options={[
            { value: "name", label: "名称" },
            { value: "date", label: "最近修改" },
            { value: "size", label: "文件大小" },
            { value: "opened", label: "最近访问" },
          ]}
          disabled={busy}
        />
      }
      recoveryAction={
        conflict &&
        view && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await loadAssets()
              const latest = getAssets().overview.views.find(
                (record) => record.id === view.id
              )
              if (latest) setVersion(latest)
              setConflict(false)
            }}
          >
            重新加载
          </Button>
        )
      }
    />
  )
}
