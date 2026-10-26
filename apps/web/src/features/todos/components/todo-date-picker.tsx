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
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const date = value ? new Date(`${value}T12:00:00`) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            className="group/pick-date w-full justify-between"
            id={id}
            variant="outline"
            size="sm"
            aria-label="截止日期"
          />
        }
      >
        <span className={cn("truncate", !date && "text-muted-foreground")}>
          {date ? format(date, "PPP", { locale: zhCN }) : "选择日期"}
        </span>
        <CalendarIcon aria-hidden="true" className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        aria-label="选择截止日期"
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
      </PopoverContent>
    </Popover>
  )
}
