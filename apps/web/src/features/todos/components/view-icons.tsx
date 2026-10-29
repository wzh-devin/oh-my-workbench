import {
  ListTodoIcon,
  SunIcon,
  CalendarIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  FlagIcon,
  StarIcon,
  HeartIcon,
  BriefcaseIcon,
  HouseIcon,
  BookOpenIcon,
  CoffeeIcon,
  CodeIcon,
  TargetIcon,
  InboxIcon,
  FolderIcon,
  TagIcon,
  ZapIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TodoView } from "../configuration"

export const VIEW_ICONS = {
  "list-todo": { icon: ListTodoIcon, label: "待办清单" },
  sun: { icon: SunIcon, label: "太阳" },
  calendar: { icon: CalendarIcon, label: "日历" },
  "calendar-clock": { icon: CalendarClockIcon, label: "日程" },
  "check-check": { icon: CheckCheckIcon, label: "完成" },
  flag: { icon: FlagIcon, label: "旗帜" },
  star: { icon: StarIcon, label: "星标" },
  heart: { icon: HeartIcon, label: "喜欢" },
  briefcase: { icon: BriefcaseIcon, label: "工作" },
  house: { icon: HouseIcon, label: "家庭" },
  "book-open": { icon: BookOpenIcon, label: "阅读" },
  coffee: { icon: CoffeeIcon, label: "休息" },
  code: { icon: CodeIcon, label: "代码" },
  target: { icon: TargetIcon, label: "目标" },
  inbox: { icon: InboxIcon, label: "收件箱" },
  folder: { icon: FolderIcon, label: "文件夹" },
  tag: { icon: TagIcon, label: "标签" },
  zap: { icon: ZapIcon, label: "闪电" },
}

export function ViewIcon({ name }: { name: TodoView["icon"] }) {
  const Icon = VIEW_ICONS[name].icon
  return <Icon aria-hidden="true" />
}

/** 固定图标直接选择，只保存允许的 Lucide 标识。 */
export function ViewIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: TodoView["icon"]
  onChange: (value: TodoView["icon"]) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="视图图标">
      {Object.entries(VIEW_ICONS).map(([key, { icon: Icon, label }]) => (
        <Button
          key={key}
          type="button"
          variant={key === value ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          aria-pressed={key === value}
          title={label}
          disabled={disabled}
          onClick={() => onChange(key as TodoView["icon"])}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  )
}
