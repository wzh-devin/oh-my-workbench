import { useId } from "react"
import { LayoutGridIcon, ListIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Card, CardContent } from "@/components/ui/card"
import { FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { updateWorkbench, useWorkbench } from "@/features/workbench/store"
import { useMounted } from "@/hooks/use-mounted"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
] as const

/** 缩略图固定展示主题配色；系统选项同时呈现浅色与深色。 */
function ThemePreview({ theme }: { theme: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[16/10] overflow-hidden border"
    >
      <div
        className={cn(
          "flex w-1/4 flex-col gap-2 border-r border-current/10 p-2 sm:p-3",
          theme === "dark"
            ? "bg-neutral-950 text-neutral-200 dark:bg-neutral-950 dark:text-neutral-200"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-100 dark:text-neutral-600"
        )}
      >
        <span className="size-3 shrink-0 rounded-full bg-current opacity-60" />
        <span className="h-1 w-full rounded-full bg-current opacity-20" />
        <span className="h-1 w-3/4 rounded-full bg-current opacity-20" />
        <span className="h-1 w-full rounded-full bg-current opacity-20" />
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col gap-3 p-2 sm:p-3",
          theme === "light"
            ? "bg-white text-neutral-900 dark:bg-white dark:text-neutral-900"
            : "bg-neutral-900 text-neutral-100 dark:bg-neutral-900 dark:text-neutral-100"
        )}
      >
        <span className="h-2 w-1/2 rounded-full bg-current opacity-60" />
        <div className="flex flex-1 flex-col gap-2 border-t border-current/10 pt-2">
          <span className="h-1 w-full rounded-full bg-current opacity-15" />
          <span className="h-1 w-3/4 rounded-full bg-current opacity-15" />
          <span className="h-1 w-full rounded-full bg-current opacity-15" />
        </div>
      </div>
    </div>
  )
}

/** 将外观选项直接展开比较，继续使用原主题与资产偏好持久化。 */
export function GeneralSettings() {
  const { data } = useWorkbench()
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const id = useId()

  return (
    <section aria-label="通用设置" className="flex min-w-0 flex-col gap-8">
      <FieldSet>
        <FieldLegend variant="label">主题</FieldLegend>
        <RadioGroup
          aria-label="主题"
          value={mounted ? (theme ?? "system") : "system"}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system")
              setTheme(value)
          }}
          className="grid-cols-3 gap-3 sm:gap-4"
        >
          {THEME_OPTIONS.map(({ value, label }) => (
            <FieldLabel
              key={value}
              htmlFor={`${id}-${value}`}
              className="w-full"
            >
              <Card
                size="sm"
                className="w-full has-data-checked:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
              >
                <CardContent className="flex flex-col gap-3">
                  <ThemePreview theme={value} />
                  <div className="flex items-center justify-between gap-2">
                    <span>{label}</span>
                    <RadioGroupItem id={`${id}-${value}`} value={value} />
                  </div>
                </CardContent>
              </Card>
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">资产默认视图</FieldLegend>
        <ToggleGroup
          aria-label="资产默认视图"
          multiple={false}
          variant="outline"
          spacing={0}
          value={[data.preferences.assetLayout]}
          onValueChange={(values: string[]) => {
            const value = values[0]
            if (value !== "list" && value !== "grid") return
            updateWorkbench((current) => ({
              ...current,
              preferences: { ...current.preferences, assetLayout: value },
            }))
          }}
        >
          <ToggleGroupItem value="list" className="w-28">
            <ListIcon aria-hidden="true" />
            列表
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" className="w-28">
            <LayoutGridIcon aria-hidden="true" />
            网格
          </ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>
    </section>
  )
}
