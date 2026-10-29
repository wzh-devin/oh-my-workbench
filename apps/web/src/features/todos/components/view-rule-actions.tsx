import { EraserIcon, FolderPlusIcon, PlusIcon } from "lucide-react"
import type { FiltersAdvancedFooterContext } from "@/components/reui/filters/filters-advanced"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** 操作与条件行分区，新增后的焦点仍交由 Filters 管理。 */
export function ViewRuleActions({
  labels,
  addFilter,
  addGroup,
  clear,
  canClear,
  disabled,
  addFilterRef,
}: FiltersAdvancedFooterContext) {
  const items = [
    {
      label: labels.addCondition,
      icon: PlusIcon,
      action: addFilter,
      ref: addFilterRef,
    },
    { label: labels.addConditionGroup, icon: FolderPlusIcon, action: addGroup },
    {
      label: labels.clearAll,
      icon: EraserIcon,
      action: clear,
      disabled: !canClear,
    },
  ]
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="规则操作"
        className="flex w-full items-center justify-end gap-1 border-t pt-3"
      >
        {items.map(
          ({ label, icon: Icon, action, ref, disabled: unavailable }) => (
            <Tooltip key={label}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    ref={ref}
                    aria-label={label}
                    disabled={disabled || unavailable}
                    onClick={action}
                  />
                }
              >
                <Icon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
        )}
      </div>
    </TooltipProvider>
  )
}
