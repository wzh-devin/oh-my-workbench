"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridTableInstance,
} from "@/components/reui/data-grid/data-grid"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { RuleFilters } from "@/components/shared/rule-filters"
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterConditions,
} from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterOption,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import {
  useTable,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "cn"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Item, ItemMedia } from "@/components/ui/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  createWorkflowColumns,
  formatWorkflowDate,
  formatWorkflowRuns,
  formatWorkflowRunTime,
  WorkflowActions,
  WorkflowEnabledBadge,
  WorkflowEnabledSwitch,
  WorkflowLastRunBadge,
  WorkflowTags,
  type WorkflowRowAction,
} from "./columns"
import {
  isInWorkflowTab,
  WORKFLOW_DISPLAY_PROPERTIES,
  WORKFLOW_ENABLED_OPTIONS,
  WORKFLOW_LAST_RUN_OPTIONS,
  WORKFLOW_OWNERS,
  WORKFLOW_TABS,
  WORKFLOW_TAG_OPTIONS,
  WORKFLOW_TRIGGER_OPTIONS,
  type WorkflowDisplayProperty,
  type WorkflowFilterValue,
  type WorkflowItem,
  type WorkflowLastRun,
  type WorkflowOwner,
  type WorkflowTabId,
} from "./data"
import { WorkflowsEmptyState } from "./empty-state"
import { applyWorkflowFilters, getActiveFilters } from "./filter-workflows"
import {
  CalendarClockIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FilterIcon,
  LayoutDashboardIcon,
  ListIcon,
  Settings2Icon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react"

type TableDensity = "compact" | "comfortable"
type WorkflowViewMode = "table" | "card"

const TABLE_DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
]

// The badge option lists already say the value inside the icon, so the menu
// panel hides the row's own label column and lets the badge carry it. The label
// stays in the accessible name because `sr-only` only hides it visually.
const RICH_FILTER_MENU_CLASS_NAME =
  "[&_[data-slot=filter-menu-icon]+span]:sr-only"
const WORKFLOW_PAGE_SIZES = [5, 10, 20]
const WORKFLOW_PAGE_GROUP_LIMIT = 5

const TAB_EMPTY_STATE: Record<
  WorkflowTabId,
  { title: string; description: string; actionLabel: string }
> = {
  all: {
    title: "No matching workflows",
    description:
      "Nothing matches the current filters. Clear the filter row to bring every workflow back.",
    actionLabel: "Clear filters",
  },
  active: {
    title: "No active workflows",
    description:
      "Switch a workflow on to run it on its trigger, or clear the filters to see the ones that are on.",
    actionLabel: "Clear filters",
  },
  paused: {
    title: "Nothing is paused",
    description:
      "Every workflow is switched on. Paused workflows ignore their trigger until you switch them back on.",
    actionLabel: "Show all workflows",
  },
  failing: {
    title: "No failing workflows",
    description:
      "Every workflow's last run succeeded. Failed runs land here so you can fix them first.",
    actionLabel: "Show all workflows",
  },
}

function createDefaultWorkflowFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({
      id: "last-run-1",
      path: ["lastRun"],
      operator: "is",
      value: undefined,
    }),
  ])
}

function renderSelectedFilterState(values: WorkflowFilterValue[]) {
  if (values.length === 0) return "Select"
  if (values.length > 1) return `${values.length} selected`
  return null
}

function WorkflowOwnerFilterAvatar({ owner }: { owner: WorkflowOwner }) {
  return (
    <Avatar className="size-5 shrink-0">
      <AvatarImage src={owner.avatarSrc} alt={owner.name} />
      <AvatarFallback className="text-[10px] leading-none">
        {owner.initials}
      </AvatarFallback>
    </Avatar>
  )
}

function WorkflowOwnerFilterOption({ owner }: { owner: WorkflowOwner }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <WorkflowOwnerFilterAvatar owner={owner} />
      <span className="min-w-0 truncate text-sm font-medium">{owner.name}</span>
    </div>
  )
}

function createBadgeFilterOptions<T extends WorkflowFilterValue>(
  options: { value: T; label: string }[],
  renderBadge: (value: T) => ReactNode
): FilterOption<WorkflowFilterValue>[] {
  return options.map((option) => ({
    ...option,
    icon: renderBadge(option.value),
  }))
}

function WorkflowCardMeta({
  label,
  value,
  icon,
  muted = false,
}: {
  label: string
  value: string
  icon: ReactNode
  muted?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 px-4 py-3">
      <Item
        render={<span />}
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center border-0 p-0 text-muted-foreground"
      >
        <ItemMedia variant="icon" className="size-auto">
          {icon}
        </ItemMedia>
      </Item>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "truncate text-sm font-medium tabular-nums",
            muted ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

function WorkflowSuccessProgress({ item }: { item: WorkflowItem }) {
  const value = item.runs === 0 ? 0 : item.successRate
  const indicatorClassName =
    item.runs === 0
      ? "**:data-[slot=progress-indicator]:bg-muted-foreground"
      : value >= 90
        ? "**:data-[slot=progress-indicator]:bg-emerald-500"
        : value >= 75
          ? "**:data-[slot=progress-indicator]:bg-amber-500"
          : "**:data-[slot=progress-indicator]:bg-rose-500"

  return (
    <div className="mt-auto flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Success rate</span>
        <span className="truncate font-medium text-foreground tabular-nums">
          {item.runs === 0 ? "No runs yet" : `${value}%`}
        </span>
      </div>
      <Progress
        value={value}
        className={cn(
          "gap-0 **:data-[slot=progress-indicator]:rounded-full **:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-track]:rounded-full",
          indicatorClassName
        )}
      >
        <ProgressLabel className="sr-only">Success rate</ProgressLabel>
      </Progress>
    </div>
  )
}

function WorkflowItemCard({
  item,
  visibleProperties,
  onAction,
  onToggle,
}: {
  item: WorkflowItem
  visibleProperties: Record<WorkflowDisplayProperty, boolean>
  onAction: (action: WorkflowRowAction, item: WorkflowItem) => void
  onToggle: (item: WorkflowItem, enabled: boolean) => void
}) {
  const showBadges = visibleProperties.tags
  const showDates = visibleProperties.lastRun || visibleProperties.updatedAt
  const showContent =
    showBadges ||
    visibleProperties.owner ||
    visibleProperties.enabled ||
    visibleProperties.runs
  const dateColumnCount =
    Number(visibleProperties.lastRun) + Number(visibleProperties.updatedAt)

  return (
    <Card
      className="h-full min-w-0 cursor-pointer gap-0 overflow-hidden p-0 shadow-none! transition-colors hover:bg-muted/20"
      onClick={() => onAction("view", item)}
    >
      {/* Header */}
      <CardHeader className="grid-cols-1 gap-2 border-b px-4 py-3.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground tabular-nums">
            {item.id}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {visibleProperties.lastRun ? (
              <WorkflowLastRunBadge
                lastRun={item.lastRun}
                className="max-w-28"
              />
            ) : null}
            <WorkflowActions
              item={item}
              onAction={onAction}
              className="focus-within:opacity-100 sm:opacity-70 sm:transition-opacity sm:group-hover/card:opacity-100"
            />
          </div>
        </div>

        <div className="min-w-0">
          <CardTitle className="line-clamp-2 text-sm leading-5 font-semibold">
            {item.name}
          </CardTitle>
          <CardDescription className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            <ZapIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {item.trigger}: {item.cadence}
            </span>
          </CardDescription>
        </div>
      </CardHeader>

      {showContent ? (
        <CardContent className="flex min-h-36 min-w-0 flex-1 flex-col gap-3 px-4 py-3.5">
          {visibleProperties.enabled || showBadges ? (
            <div className="flex min-w-0 items-center justify-between gap-3">
              {showBadges ? (
                <WorkflowTags tags={item.tags} max={3} />
              ) : (
                <span />
              )}
              {visibleProperties.enabled ? (
                <WorkflowEnabledSwitch item={item} onToggle={onToggle} />
              ) : null}
            </div>
          ) : null}

          {visibleProperties.owner ? (
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar className="size-8 shrink-0">
                  <AvatarImage
                    src={item.owner.avatarSrc}
                    alt={item.owner.name}
                  />
                  <AvatarFallback>{item.owner.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.owner.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.owner.role}
                  </div>
                </div>
              </div>

              {visibleProperties.runs ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatWorkflowRuns(item.runs)} runs
                </span>
              ) : null}
            </div>
          ) : null}

          <WorkflowSuccessProgress item={item} />
        </CardContent>
      ) : null}

      {showDates ? (
        <CardFooter
          className={cn(
            "grid gap-0 border-t p-0",
            dateColumnCount > 1 &&
              "divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0"
          )}
        >
          {visibleProperties.lastRun ? (
            <WorkflowCardMeta
              label="Last run"
              value={formatWorkflowRunTime(item.lastRunAt)}
              icon={<CalendarClockIcon className="size-4" aria-hidden="true" />}
            />
          ) : null}
          {visibleProperties.updatedAt ? (
            <WorkflowCardMeta
              label="Updated"
              value={formatWorkflowDate(item.updatedAt)}
              muted
              icon={<ClockIcon className="size-4" aria-hidden="true" />}
            />
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}

function WorkflowCardGrid({
  items,
  visibleProperties,
  onAction,
  onToggle,
}: {
  items: WorkflowItem[]
  visibleProperties: Record<WorkflowDisplayProperty, boolean>
  onAction: (action: WorkflowRowAction, item: WorkflowItem) => void
  onToggle: (item: WorkflowItem, enabled: boolean) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <WorkflowItemCard
          key={item.id}
          item={item}
          visibleProperties={visibleProperties}
          onAction={onAction}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function WorkflowBottomToolbar({
  table,
  recordCount,
}: {
  table: DataGridTableInstance<WorkflowItem>
  recordCount: number
}) {
  const pageIndex = table.state.pagination.pageIndex
  const pageSize = table.state.pagination.pageSize
  const pageCount = table.getPageCount()
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, recordCount)
  const currentGroupStart =
    Math.floor(pageIndex / WORKFLOW_PAGE_GROUP_LIMIT) *
    WORKFLOW_PAGE_GROUP_LIMIT
  const currentGroupEnd = Math.min(
    currentGroupStart + WORKFLOW_PAGE_GROUP_LIMIT,
    pageCount
  )
  const pageButtonClassName = "p-0 text-sm"
  const arrowButtonClassName = `${pageButtonClassName} rtl:rotate-180`

  return (
    <div
      data-slot="data-grid-pagination"
      className="flex grow flex-col flex-wrap items-center justify-between gap-2.5 py-0 sm:flex-row"
    >
      <div className="order-2 flex flex-wrap items-center gap-2.5 pb-2.5 sm:order-1 sm:pb-0">
        <div className="text-sm text-muted-foreground">Rows per page</div>
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger className="w-16" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" className="min-w-18">
            <SelectGroup>
              {WORKFLOW_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="order-1 flex flex-col items-center justify-center gap-2.5 pt-2.5 sm:order-2 sm:flex-row sm:justify-end sm:pt-0">
        <div className="order-2 text-sm text-nowrap text-muted-foreground sm:order-1">
          {from} - {to} of {recordCount} workflows
        </div>

        {pageCount > 1 ? (
          <div className="order-1 flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              className={arrowButtonClassName}
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeftIcon className="size-4" />
            </Button>

            {currentGroupStart > 0 ? (
              <Button
                size="icon-sm"
                variant="ghost"
                className={pageButtonClassName}
                onClick={() => table.setPageIndex(currentGroupStart - 1)}
              >
                ...
              </Button>
            ) : null}

            {Array.from(
              { length: currentGroupEnd - currentGroupStart },
              (_, index) => {
                const page = currentGroupStart + index

                return (
                  <Button
                    key={page}
                    size="icon-sm"
                    variant="ghost"
                    className={cn(
                      pageButtonClassName,
                      "text-muted-foreground",
                      pageIndex === page && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => table.setPageIndex(page)}
                  >
                    {page + 1}
                  </Button>
                )
              }
            )}

            {currentGroupEnd < pageCount ? (
              <Button
                size="icon-sm"
                variant="ghost"
                className={pageButtonClassName}
                onClick={() => table.setPageIndex(currentGroupEnd)}
              >
                ...
              </Button>
            ) : null}

            <Button
              size="icon-sm"
              variant="ghost"
              className={arrowButtonClassName}
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function WorkflowsDataGridView({
  workflows,
  onAction,
  onToggle,
}: {
  workflows: WorkflowItem[]
  onAction: (action: WorkflowRowAction, item: WorkflowItem) => void
  onToggle: (item: WorkflowItem, enabled: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<WorkflowTabId>("all")
  const [filtersBarOpen, setFiltersBarOpen] = useState(true)
  const [filterQuery, setFilterQuery] = useState<FilterQuery>(
    createDefaultWorkflowFilters
  )
  const filters = useMemo(
    () => flattenFilterConditions(filterQuery),
    [filterQuery]
  )
  const [viewMode, setViewMode] = useState<WorkflowViewMode>("table")
  const [tableDensity, setTableDensity] = useState<TableDensity>("compact")
  const [stickyHeader, setStickyHeader] = useState(false)
  const [columnsResizable, setColumnsResizable] = useState(false)
  const [columnsMovable, setColumnsMovable] = useState(false)
  const [visibleProperties, setVisibleProperties] = useState<
    Record<WorkflowDisplayProperty, boolean>
  >({
    owner: true,
    enabled: true,
    tags: true,
    lastRun: true,
    runs: true,
    updatedAt: false,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastRun", desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const resetPagination = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [])

  const activeFilters = useMemo(() => getActiveFilters(filters), [filters])

  const tabRecords = useMemo(
    () => workflows.filter((item) => isInWorkflowTab(item, activeTab)),
    [activeTab, workflows]
  )

  const filteredRecords = useMemo(
    () => applyWorkflowFilters(tabRecords, filterQuery),
    [filterQuery, tabRecords]
  )

  const ownerFilterOptions = useMemo<FilterOption<WorkflowFilterValue>[]>(
    () =>
      WORKFLOW_OWNERS.map((owner) => ({
        value: owner.name,
        label: owner.name,
        icon: <WorkflowOwnerFilterOption owner={owner} />,
      })),
    []
  )

  const workflowFilterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "lastRun",
        label: "Last run",
        type: "select",
        searchable: false,
        className: RICH_FILTER_MENU_CLASS_NAME,
        defaultOperator: "is",
        options: createBadgeFilterOptions(
          WORKFLOW_LAST_RUN_OPTIONS,
          (lastRun: WorkflowLastRun) => (
            <WorkflowLastRunBadge lastRun={lastRun} />
          )
        ),
        renderValue: ({ values }) => {
          const state = renderSelectedFilterState(values as string[])
          if (state) return state

          return <WorkflowLastRunBadge lastRun={values[0] as WorkflowLastRun} />
        },
      },
      {
        id: "enabled",
        label: "Status",
        type: "select",
        searchable: false,
        className: RICH_FILTER_MENU_CLASS_NAME,
        defaultOperator: "is",
        options: createBadgeFilterOptions(
          WORKFLOW_ENABLED_OPTIONS,
          (value: string) => <WorkflowEnabledBadge enabled={value === "On"} />
        ),
        renderValue: ({ values }) => {
          const state = renderSelectedFilterState(values as string[])
          if (state) return state

          return <WorkflowEnabledBadge enabled={values[0] === "On"} />
        },
      },
      {
        id: "trigger",
        label: "Trigger",
        type: "select",
        searchable: false,
        defaultOperator: "is",
        options: WORKFLOW_TRIGGER_OPTIONS,
      },
      {
        id: "tag",
        label: "Tag",
        type: "select",
        searchable: true,
        defaultOperator: "is",
        options: WORKFLOW_TAG_OPTIONS.map((tag) => ({
          value: tag,
          label: tag,
        })),
      },
      {
        id: "owner",
        label: "Owner",
        type: "select",
        searchable: true,
        className: RICH_FILTER_MENU_CLASS_NAME,
        defaultOperator: "is",
        options: ownerFilterOptions,
        renderValue: ({ values }) => {
          const state = renderSelectedFilterState(values as string[])
          if (state) return state

          const owner = WORKFLOW_OWNERS.find(
            (candidate) => candidate.name === String(values[0])
          )
          if (!owner) return String(values[0])

          return (
            <div className="flex min-w-0 items-center gap-2">
              <WorkflowOwnerFilterAvatar owner={owner} />
              <span className="truncate">{owner.name}</span>
            </div>
          )
        },
      },
      {
        id: "keyword",
        label: "Keyword",
        type: "text",
        defaultOperator: "contains",
        placeholder: "Search workflows...",
      },
    ],
    [ownerFilterOptions]
  )

  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => ({
      owner: visibleProperties.owner,
      enabled: visibleProperties.enabled,
      tags: visibleProperties.tags,
      lastRun: visibleProperties.lastRun,
      runs: visibleProperties.runs,
      updatedAt: visibleProperties.updatedAt,
    }),
    [visibleProperties]
  )

  const columns = useMemo(
    () => createWorkflowColumns({ onAction, onToggle }),
    [onAction, onToggle]
  )

  const table = useTable({
    features: dataGridFeatures,
    data: filteredRecords,
    columns,
    state: {
      sorting,
      pagination,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
  })

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value as WorkflowTabId)
      resetPagination()
    },
    [resetPagination]
  )

  const handleFiltersChange = useCallback(
    (nextQuery: FilterQuery) => {
      setFilterQuery(nextQuery)
      resetPagination()
    },
    [resetPagination]
  )

  const handleClearFilters = useCallback(() => {
    setFilterQuery(createDefaultWorkflowFilters())
    resetPagination()
  }, [resetPagination])

  const handleViewModeChange = useCallback((value: string[]) => {
    const nextValue = value[0] as WorkflowViewMode | undefined
    if (!nextValue) return

    setViewMode(nextValue)
  }, [])

  const toggleProperty = useCallback((property: WorkflowDisplayProperty) => {
    setVisibleProperties((current) => ({
      ...current,
      [property]: !current[property],
    }))
  }, [])

  const handleRowClick = useCallback(
    (item: WorkflowItem) => onAction("view", item),
    [onAction]
  )

  const emptyState = TAB_EMPTY_STATE[activeTab]
  const hasVisibleFilters = filtersBarOpen || activeFilters.length > 0
  const showEmptyState = filteredRecords.length === 0
  const pageRecords = table.getRowModel().rows.map((row) => row.original)
  // A tab that is empty before any filter applies has nothing to clear.
  const emptyStateAction =
    tabRecords.length === 0 ? () => handleTabChange("all") : handleClearFilters

  return (
    <DataGrid
      table={table}
      recordCount={filteredRecords.length}
      emptyMessage="No workflows match this view."
      onRowClick={handleRowClick}
      tableLayout={{
        dense: tableDensity === "compact",
        rowBorder: true,
        headerSticky: stickyHeader,
        columnsVisibility: false,
        columnsResizable,
        columnsMovable,
        width: "fixed",
      }}
      tableClassNames={{
        bodyRow: "group/work-row cursor-pointer",
        // Inside the Card the outer columns line up with the toolbar's px-4.
        edgeCell: "first:ps-4 last:pe-4",
      }}
    >
      <Card className="w-full gap-0 py-0">
        <div className="flex flex-col gap-3 px-4 py-3 lg:min-h-12 lg:flex-row lg:items-center lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <WorkflowIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-medium text-foreground">
              Workflows
            </h2>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:flex-nowrap">
            <ToggleGroup
              multiple={false}
              value={[viewMode]}
              onValueChange={handleViewModeChange}
              variant="outline"
              size="default"
              spacing={0}
              aria-label="Workflows view"
              className="shrink-0"
            >
              {(["card", "table"] as WorkflowViewMode[]).map((mode) => (
                <ToggleGroupItem
                  key={mode}
                  value={mode}
                  className="px-2"
                  aria-label={mode === "card" ? "Card view" : "List view"}
                >
                  {mode === "card" ? (
                    <LayoutDashboardIcon
                      className="size-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <ListIcon className="size-4" aria-hidden="true" />
                  )}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Button
              type="button"
              size="icon"
              variant={hasVisibleFilters ? "secondary" : "outline"}
              aria-label={
                hasVisibleFilters ? "Hide filter row" : "Show filter row"
              }
              aria-pressed={hasVisibleFilters}
              onClick={() => setFiltersBarOpen((open) => !open)}
            >
              <FilterIcon aria-hidden="true" />
            </Button>

            <Popover>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline">
                    <Settings2Icon className="size-4" aria-hidden="true" />
                    Display
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-[300px] p-0">
                <FieldGroup className="gap-3 px-3.5 py-3">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Table
                    </div>
                    <div className="flex flex-col">
                      <Field
                        orientation="horizontal"
                        className="min-h-9 items-center justify-between gap-3"
                      >
                        <FieldLabel className="text-sm font-normal">
                          Density
                        </FieldLabel>
                        <Select
                          items={TABLE_DENSITY_OPTIONS}
                          value={tableDensity}
                          onValueChange={(value) =>
                            setTableDensity(value as TableDensity)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-[132px] shrink-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end">
                            <SelectGroup>
                              {TABLE_DENSITY_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field
                        orientation="horizontal"
                        className="min-h-9 items-center justify-between gap-3"
                      >
                        <FieldLabel className="text-sm font-normal">
                          Sticky header
                        </FieldLabel>
                        <Switch
                          size="sm"
                          checked={stickyHeader}
                          onCheckedChange={setStickyHeader}
                        />
                      </Field>

                      <Field
                        orientation="horizontal"
                        className="min-h-9 items-center justify-between gap-3"
                      >
                        <FieldLabel className="text-sm font-normal">
                          Resizable columns
                        </FieldLabel>
                        <Switch
                          size="sm"
                          checked={columnsResizable}
                          onCheckedChange={setColumnsResizable}
                        />
                      </Field>

                      <Field
                        orientation="horizontal"
                        className="min-h-9 items-center justify-between gap-3"
                      >
                        <FieldLabel className="text-sm font-normal">
                          Movable columns
                        </FieldLabel>
                        <Switch
                          size="sm"
                          checked={columnsMovable}
                          onCheckedChange={setColumnsMovable}
                        />
                      </Field>
                    </div>
                  </div>

                  <FieldSeparator className="-mx-3.5" />

                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Display properties
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {WORKFLOW_DISPLAY_PROPERTIES.map((property) => {
                        const active = visibleProperties[property.key]

                        return (
                          <Button
                            key={property.key}
                            type="button"
                            size="sm"
                            variant={active ? "secondary" : "outline"}
                            className={cn(
                              "rounded-full",
                              active && "border-foreground/10"
                            )}
                            aria-pressed={active}
                            onClick={() => toggleProperty(property.key)}
                          >
                            {active ? (
                              <CheckIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                            ) : null}
                            {property.label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </FieldGroup>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Separator />

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="[scrollbar-width:none] overflow-x-auto overflow-y-visible px-4 [&::-webkit-scrollbar]:hidden">
            <TabsList variant="line" className="w-max gap-6">
              {WORKFLOW_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="px-0 pt-3 pb-3 text-sm after:bottom-[-1px]"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <Separator />

        {hasVisibleFilters ? (
          <>
            <div className="flex flex-col gap-2 bg-muted/40 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <RuleFilters
                query={filterQuery}
                fields={workflowFilterFields}
                onQueryChange={handleFiltersChange}
              />

              <Button
                type="button"
                size="default"
                variant="outline"
                className="self-start sm:self-auto"
                onClick={handleClearFilters}
              >
                Clear all
              </Button>
            </div>
            <Separator />
          </>
        ) : null}

        {showEmptyState ? (
          <WorkflowsEmptyState
            title={emptyState.title}
            description={emptyState.description}
            actionLabel={
              tabRecords.length === 0
                ? "Show all workflows"
                : emptyState.actionLabel
            }
            onAction={emptyStateAction}
          />
        ) : (
          <>
            {viewMode === "card" ? (
              <WorkflowCardGrid
                items={pageRecords}
                visibleProperties={visibleProperties}
                onAction={onAction}
                onToggle={onToggle}
              />
            ) : (
              <DataGridScrollArea>
                <DataGridTable />
              </DataGridScrollArea>
            )}

            <Separator />

            <div className="px-4 py-3">
              <WorkflowBottomToolbar
                table={table}
                recordCount={filteredRecords.length}
              />
            </div>
          </>
        )}
      </Card>
    </DataGrid>
  )
}
