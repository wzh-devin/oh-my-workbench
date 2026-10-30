import { ListFilterIcon } from "lucide-react"
import { Filters, type FiltersProps } from "@/components/reui/filters/filters"
import { FiltersAdvancedPanel } from "@/components/reui/filters/filters-advanced"
import {
  useFilterActions,
  useFilterState,
} from "@/components/reui/filters/filters-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  RuleFilterActions,
  renderRuleFilterGroupActions,
} from "./rule-filter-actions"
import { RULE_FILTER_LABELS } from "./rule-filter-labels"
import { cn } from "@/lib/utils"

type RuleFiltersProps<V, O> = Pick<
  FiltersProps<V, O>,
  "fields" | "query" | "onQueryChange" | "labels" | "disabled" | "readOnly"
> & { mode?: "inline" | "popover" }

/** 规则区独立横向滚动，底部操作与焦点交接在两种容器中保持一致。 */
function RuleFilterPanel() {
  const { query } = useFilterState()
  return (
    <FiltersAdvancedPanel
      mode="inline"
      reorderable
      renderEmpty={() => null}
      renderBody={(body) => (
        <div data-slot="rule-filter-scroll" className="min-w-0 overflow-x-auto">
          <div className={query.rules.length ? "min-w-2xl" : undefined}>
            {body}
          </div>
        </div>
      )}
      footer={RuleFilterActions}
      renderGroupFooter={renderRuleFilterGroupActions}
    />
  )
}

/** 触发器读取 Filters 自身状态，避免重复维护条件数量与禁用状态。 */
function RuleFilterPopover() {
  const { labels, disabled } = useFilterActions()
  const { ruleCount, query } = useFilterState()
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={
              ruleCount
                ? `${labels.advancedFilter}，${labels.countAnnouncement(ruleCount)}`
                : labels.advancedFilter
            }
          >
            <ListFilterIcon aria-hidden="true" />
            {labels.advancedFilter}
            {ruleCount > 0 && (
              <span
                aria-hidden="true"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {ruleCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        aria-label={labels.advancedFilter}
        className={cn(
          "max-w-[calc(100vw-2rem)]",
          query.rules.length ? "w-3xl" : "w-80"
        )}
      >
        <RuleFilterPanel />
      </PopoverContent>
    </Popover>
  )
}

/** 全项目统一的规则筛选入口；页面只传字段、查询和业务文案。 */
export function RuleFilters<V = unknown, O = unknown>({
  mode = "popover",
  labels,
  ...props
}: RuleFiltersProps<V, O>) {
  return (
    <Filters {...props} size="sm" labels={{ ...RULE_FILTER_LABELS, ...labels }}>
      {mode === "inline" ? (
        <div className="min-w-0 p-px">
          <Card size="sm" className="w-full">
            <CardContent className="min-w-0">
              <RuleFilterPanel />
            </CardContent>
          </Card>
        </div>
      ) : (
        <RuleFilterPopover />
      )}
    </Filters>
  )
}
