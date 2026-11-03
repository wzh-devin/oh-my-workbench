import { useState } from "react"
import {
  BookOpenIcon,
  CodeIcon,
  FileTextIcon,
  LockIcon,
  StarIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ViewFormDialog } from "@/components/shared/view-form-dialog"
import { RuleFilters } from "@/components/shared/rule-filters"
import { Choice } from "@/features/workbench/components"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { noteApi, NoteApiError } from "../api"
import { noteFields, noteRule, noteRuleToQuery } from "../filters"
import type { NoteView, Notebook } from "../model"

const icons = {
  "file-text": { icon: FileTextIcon, label: "笔记" },
  star: { icon: StarIcon, label: "收藏" },
  lock: { icon: LockIcon, label: "加锁" },
  trash: { icon: Trash2Icon, label: "回收站" },
  book: { icon: BookOpenIcon, label: "笔记本" },
  code: { icon: CodeIcon, label: "代码" },
  tag: { icon: TagIcon, label: "标签" },
}
export function NoteViewIcon({ name }: { name: string }) {
  const Icon = icons[name as keyof typeof icons]?.icon ?? FileTextIcon
  return <Icon aria-hidden />
}
/** 复用项目视图表单，保存完整规则；冲突时保留草稿并允许显式重载。 */
export function NoteViewDialog({
  view,
  notebooks,
  onClose,
  onSaved,
}: {
  view?: NoteView
  notebooks: Notebook[]
  onClose: () => void
  onSaved: (view: NoteView) => void
}) {
  const [name, setName] = useState(view?.name ?? "")
  const [icon, setIcon] = useState(view?.icon ?? "file-text")
  const [query, setQuery] = useState(() =>
    view ? noteRuleToQuery(view.filterQuery) : createFilterQuery()
  )
  const [sort, setSort] = useState(view?.sort ?? "updated")
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [version, setVersion] = useState(view)
  return (
    <ViewFormDialog
      editing={!!view}
      pending={busy}
      name={name}
      onNameChange={setName}
      namePlaceholder="例如：工作笔记"
      onClose={onClose}
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          if (!name.trim()) throw new Error("请输入视图名称")
          const saved = await noteApi.saveView(
            {
              name: name.trim(),
              icon,
              scope: "all",
              filterQuery: noteRule(query, true),
              sort,
            },
            version
          )
          onSaved(saved)
          onClose()
        } catch (error) {
          setConflict(error instanceof NoteApiError && error.status === 409)
          toast.error(error instanceof Error ? error.message : "保存视图失败")
        } finally {
          setBusy(false)
        }
      }}
      icons={
        <div
          role="group"
          aria-label="视图图标"
          className="flex flex-wrap gap-1"
        >
          {Object.entries(icons).map(([key, { icon: Icon, label }]) => (
            <Button
              key={key}
              type="button"
              size="icon-sm"
              variant={icon === key ? "secondary" : "ghost"}
              title={label}
              aria-label={label}
              aria-pressed={icon === key}
              disabled={busy}
              onClick={() => setIcon(key)}
            >
              <Icon aria-hidden />
            </Button>
          ))}
        </div>
      }
      rules={
        <RuleFilters
          fields={noteFields(notebooks)}
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
          onChange={(value) => setSort(value as NoteView["sort"])}
          disabled={busy}
          options={[
            { value: "updated", label: "最近更新" },
            { value: "created", label: "最近创建" },
            { value: "title", label: "标题" },
          ]}
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
              setBusy(true)
              try {
                const latest = (await noteApi.views()).find(
                  (record) => record.id === view.id
                )
                if (!latest) throw new Error("视图已被删除")
                setVersion(latest)
                setName(latest.name)
                setIcon(latest.icon)
                setQuery(noteRuleToQuery(latest.filterQuery))
                setSort(latest.sort)
                setConflict(false)
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "重新加载失败"
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            重新加载
          </Button>
        )
      }
    />
  )
}
