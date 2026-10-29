import { useState } from "react"
import { format } from "date-fns"
import { zhCN } from "react-day-picker/locale"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { todayDate } from "../task-rules"

/** 复用 ReUI c-calendar-24；按本地日历日读写，保留任务原有日期契约。 */
export function TodoDatePicker({
  id,
  value,
  onChange,
  label = "截止日期",
  compact = false,
  disabled = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  label?: string
  compact?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const date = value ? new Date(`${value}T12:00:00`) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            className={
              compact ? undefined : "group/pick-date w-full justify-between"
            }
            id={id}
            variant={compact ? "ghost" : "outline"}
            size={compact ? "icon-sm" : "sm"}
            aria-label={label}
            title={value ? `${label}：${value}` : label}
            disabled={disabled}
          />
        }
      >
        {!compact && (
          <span className={cn("truncate", !date && "text-muted-foreground")}>
            {date ? format(date, "PPP", { locale: zhCN }) : "选择日期"}
          </span>
        )}
        <CalendarIcon aria-hidden="true" className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        aria-label={`选择${label}`}
      >
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          locale={zhCN}
          autoFocus
          onSelect={(selected) => {
            onChange(selected ? todayDate(selected) : "")
            setOpen(false)
          }}
        />
        <div className="flex justify-end border-t p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!value}
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            清除日期
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
