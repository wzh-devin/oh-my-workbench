import { useId, useMemo, useState, type FormEvent } from "react"
import {
  CalendarIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  FlagIcon,
  ListTodoIcon,
  TagsIcon,
  TextSearchIcon,
} from "lucide-react"
import { toast } from "sonner"
import { RuleFilters } from "@/components/shared/rule-filters"
import type {
  FilterEditorProps,
  FilterField,
  FilterOperator,
} from "@/components/reui/filters/filters-types"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { Button } from "@/components/ui/button"
import { ViewFormDialog } from "@/components/shared/view-form-dialog"
import { Choice } from "@/features/workbench/components"
import { useTodos, saveTodoView } from "../store"
import type { TodoView, TodoPriority } from "../configuration"
import { DATE_PRESETS, queryToRule, ruleToQuery } from "../view-rules"
import { TODO_FILTER_LABELS } from "../filter-labels"
import { TodoDatePicker } from "./todo-date-picker"
import { ViewIconPicker } from "./view-icons"

const equality: FilterOperator[] = [
  { value: "eq", label: "是", inverse: "ne" },
  { value: "ne", label: "不是", inverse: "eq" },
]

/** 日期条件保存绝对日历日或上下文名称，跨天时无需改写规则。 */
function RuleDateEditor({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
}: FilterEditorProps) {
  const id = useId(),
    text = typeof value === "string" ? value : "",
    preset = DATE_PRESETS.some((p) => p.value === text)
  return (
    <div className="flex flex-col gap-3 p-3">
      <Choice
        value={preset ? text : "date"}
        onChange={(v) => onValueChange(v === "date" ? "" : v)}
        options={[...DATE_PRESETS, { value: "date", label: "指定日期" }]}
        label="日期范围"
      />
      {!preset && (
        <TodoDatePicker
          id={id}
          value={text}
          onChange={onValueChange}
          label="条件日期"
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!text}
          onClick={() => commit(text)}
          {...autoFocusProps}
        >
          应用
        </Button>
      </div>
    </div>
  )
}

/** 所有视图编辑器共用同一份字段和稳定选项，优先级改名不改变引用。 */
export const todoRuleFields = (
  lists: { id: string; name: string }[],
  priorities: TodoPriority[]
): FilterField[] => [
  {
    id: "done",
    label: "完成状态",
    icon: <CheckCheckIcon aria-hidden="true" />,
    type: "select",
    searchable: false,
    operators: equality,
    options: [
      { value: "false", label: "未完成" },
      { value: "true", label: "已完成" },
    ],
    placeholder: "选择完成状态",
  },
  {
    id: "listId",
    label: "所属清单",
    icon: <ListTodoIcon aria-hidden="true" />,
    type: "select",
    operators: equality,
    options: lists.map((l) => ({ value: l.id, label: l.name })),
    placeholder: "选择清单",
  },
  {
    id: "priority",
    label: "优先级",
    icon: <FlagIcon aria-hidden="true" />,
    type: "select",
    searchable: false,
    operators: equality,
    options: priorities.map((p) => ({
      value: String(p.value),
      label: p.name,
      icon: (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full border border-foreground/20"
          style={{ backgroundColor: p.color }}
        />
      ),
    })),
    placeholder: "选择优先级",
  },
  {
    id: "tags",
    label: "标签",
    icon: <TagsIcon aria-hidden="true" />,
    type: "text",
    operators: [
      { value: "has_any", label: "包含任意标签" },
      { value: "has_all", label: "包含全部标签" },
      {
        value: "empty",
        label: "没有标签",
        arity: "none",
        inverse: "not_empty",
      },
      { value: "not_empty", label: "有标签", arity: "none", inverse: "empty" },
    ],
    placeholder: "例如：工作，学习",
  },
  {
    id: "text",
    label: "文本内容",
    icon: <TextSearchIcon aria-hidden="true" />,
    type: "text",
    operators: [
      { value: "contains", label: "包含", inverse: "not_contains" },
      { value: "not_contains", label: "不包含", inverse: "contains" },
    ],
    placeholder: "输入匹配文本",
  },
  ...["plannedFor", "dueDate"].map((field): FilterField => ({
    id: field,
    label: field === "plannedFor" ? "计划日期" : "截止日期",
    icon:
      field === "plannedFor" ? (
        <CalendarClockIcon aria-hidden="true" />
      ) : (
        <CalendarIcon aria-hidden="true" />
      ),
    type: "text",
    editor: RuleDateEditor,
    placeholder: "选择日期",
    valueText: ({ value }) =>
      DATE_PRESETS.find((p) => p.value === value)?.label ??
      String(value || "选择日期"),
    renderValue: ({ value }) =>
      DATE_PRESETS.find((p) => p.value === value)?.label ??
      String(value || "选择日期"),
    operators: [
      { value: "eq", label: "是" },
      { value: "ne", label: "不是" },
      { value: "lt", label: "早于" },
      { value: "lte", label: "不晚于" },
      { value: "gt", label: "晚于" },
      { value: "gte", label: "不早于" },
      { value: "empty", label: "未设置", arity: "none", inverse: "not_empty" },
      { value: "not_empty", label: "已设置", arity: "none", inverse: "empty" },
    ],
  })),
]

/** 规则、图标与排序一次保存，临时搜索不会写回视图。 */
export function ViewDialog({
  source,
  onClose,
  onSaved,
}: {
  source?: TodoView
  onClose: () => void
  onSaved: (view: TodoView) => void
}) {
  const { data, busyIds } = useTodos()
  const [name, setName] = useState(source?.name ?? "")
  const [icon, setIcon] = useState<TodoView["icon"]>(
    source?.icon ?? "list-todo"
  )
  const [query, setQuery] = useState(() =>
    source ? ruleToQuery(source.filterQuery) : createFilterQuery()
  )
  const [sort, setSort] = useState(source?.sort ?? "due")
  const [editing, setEditing] = useState(source)
  const latest = data.todoViews.find((view) => view.id === editing?.id)
  const conflict = latest && latest.version !== editing?.version
  /** 用户明确重载后才替换冲突草稿，避免后台更新覆盖正在编辑的内容。 */
  const reload = () => {
    if (!latest) return
    setName(latest.name)
    setIcon(latest.icon)
    setQuery(ruleToQuery(latest.filterQuery))
    setSort(latest.sort)
    setEditing(latest)
  }
  const fields = useMemo(
    () => todoRuleFields(data.todoLists, data.todoPriorities),
    [data.todoLists, data.todoPriorities]
  )
  const pending =
    busyIds.includes("import") ||
    busyIds.includes(source ? `view:${source.id}` : "view:create")
  /** 转换完整规则后再提交，服务端错误保留当前草稿。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      if (!name.trim()) throw new Error("请输入视图名称")
      const saved = await saveTodoView(
        {
          name: name.trim(),
          icon,
          filterQuery: queryToRule(query),
          sort,
        },
        editing
      )
      if (saved) {
        toast.success(source ? "视图已更新" : "视图已创建")
        onSaved(saved)
        onClose()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "规则格式不正确")
    }
  }
  return (
    <ViewFormDialog
      editing={!!source}
      pending={pending}
      name={name}
      onNameChange={setName}
      namePlaceholder="例如：本周工作"
      onSubmit={submit}
      onClose={onClose}
      icons={
        <ViewIconPicker value={icon} onChange={setIcon} disabled={pending} />
      }
      rules={
        <RuleFilters
          mode="inline"
          fields={fields}
          query={query}
          onQueryChange={setQuery}
          disabled={pending}
          labels={TODO_FILTER_LABELS}
        />
      }
      sort={
        <Choice
          value={sort}
          onChange={(v) => setSort(v as TodoView["sort"])}
          options={[
            { value: "due", label: "按截止日期" },
            { value: "priority", label: "按优先级" },
            { value: "newest", label: "按创建时间" },
          ]}
          label="视图排序"
          disabled={pending}
        />
      }
      recoveryAction={
        conflict && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={reload}
          >
            重新加载
          </Button>
        )
      }
    />
  )
}
