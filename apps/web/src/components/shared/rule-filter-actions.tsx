import type { ComponentProps } from "react"
import {
  EraserIcon,
  FolderPlusIcon,
  PlusIcon,
  type LucideIcon,
} from "lucide-react"
import type {
  FiltersAdvancedFooterContext,
  FiltersAdvancedGroupFooterContext,
} from "@/components/reui/filters/filters-advanced"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function RuleFilterAction({
  label,
  icon: Icon,
  ...props
}: ComponentProps<"button"> & { label: string; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-foreground"
            aria-label={label}
            {...props}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function RuleFilterAddActions({
  labels,
  addFilter,
  addGroup,
  disabled,
  addFilterProps,
  addGroupProps,
}: Pick<
  FiltersAdvancedGroupFooterContext,
  "labels" | "addFilter" | "addGroup" | "disabled"
> & {
  addFilterProps?: ComponentProps<"button">
  addGroupProps?: ComponentProps<"button">
}) {
  return (
    <>
      <RuleFilterAction
        label={addFilterProps?.["aria-label"] ?? labels.addCondition}
        icon={PlusIcon}
        disabled={disabled}
        onClick={addFilter}
        {...addFilterProps}
      />
      <RuleFilterAction
        label={labels.addConditionGroup}
        icon={FolderPlusIcon}
        disabled={disabled}
        onClick={addGroup}
        {...addGroupProps}
      />
    </>
  )
}

/** 根规则和分组共用新增入口，焦点仍交由 Filters 管理。 */
export function RuleFilterActions({
  labels,
  addFilter,
  addGroup,
  clear,
  canClear,
  disabled,
  addFilterRef,
}: FiltersAdvancedFooterContext) {
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="规则操作"
        className={cn(
          "flex w-full items-center justify-end gap-1",
          canClear && "border-t pt-3"
        )}
      >
        {!canClear && (
          <span className="me-auto text-sm text-muted-foreground">
            {labels.builderEmpty}
          </span>
        )}
        <RuleFilterAddActions
          labels={labels}
          addFilter={addFilter}
          addGroup={addGroup}
          disabled={disabled}
          addFilterProps={{ ref: addFilterRef }}
        />
        <RuleFilterAction
          label={labels.clearAll}
          icon={EraserIcon}
          disabled={disabled || !canClear}
          onClick={clear}
        />
      </div>
    </TooltipProvider>
  )
}

export function renderRuleFilterGroupActions({
  management,
  ...props
}: FiltersAdvancedGroupFooterContext) {
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="分组操作"
        className="flex w-full items-center justify-end gap-1"
      >
        <RuleFilterAddActions {...props} />
        {management}
      </div>
    </TooltipProvider>
  )
}
