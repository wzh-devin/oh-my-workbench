import { ColorPickerSwatch } from "@/components/reui/color-picker"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select"
import type { TodoPriority } from "../configuration"

/** 选中值与下拉项使用同一配置，颜色或名称修改后同步显示。 */
export function PrioritySelect({
  value,
  onChange,
  priorities,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  priorities: TodoPriority[]
  disabled?: boolean
}) {
  const selected = priorities.find(
    (priority) => String(priority.value) === value
  )
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      disabled={disabled}
      items={priorities.map((p) => ({ value: String(p.value), label: p.name }))}
    >
      <SelectTrigger size="sm" className="w-full" aria-label="优先级">
        <SelectValue placeholder="选择优先级">
          {selected && (
            <span className="flex min-w-0 items-center gap-2">
              <ColorPickerSwatch color={selected.color} shape="circle" />
              <span className="truncate">{selected.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {priorities.map((priority) => (
            <SelectItem key={priority.value} value={String(priority.value)}>
              <ColorPickerSwatch color={priority.color} shape="circle" />
              {priority.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
