"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import {
  useTable,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "cn"
import {
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FilterIcon,
  LayoutDashboardIcon,
  ListIcon,
  MessagesSquareIcon,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react"

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
  applyAgentFilters,
  filterAgentsByTab,
  getActiveFilters,
} from "./agents-lib"
import {
  AgentActions,
  AgentModelBadge,
  AgentStatusBadge,
  createAgentColumns,
  formatAgentCount,
  formatAgentDate,
  type AgentRowAction,
} from "./columns"
import {
  AGENT_DISPLAY_PROPERTIES,
  AGENT_MODEL_OPTIONS,
  AGENT_STATUS_OPTIONS,
  AGENT_TABS,
  type AgentDisplayProperty,
  type AgentModel,
  type AgentOwner,
  type AgentRecord,
  type AgentStatus,
  type AgentTabId,
} from "./data"
import { AgentsEmptyState } from "./empty-state"

type TableDensity = "compact" | "comfortable"
type AgentViewMode = "table" | "card"

const TABLE_DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
]

// The badge option lists already say the value inside the icon, so the menu
// panel hides the row's own label column and lets the badge carry it. The label
// stays in the accessible name because `sr-only` only hides it visually.
const RICH_FILTER_MENU_CLASS_NAME =
  "[&_[data-slot=filter-menu-icon]+span]:sr-only"
const AGENT_PAGE_SIZES = [5, 10, 20]
const AGENT_PAGE_GROUP_LIMIT = 5

const TAB_EMPTY_STATE: Record<
  AgentTabId,
  { title: string; description: string; actionLabel: string }
> = {
  all: {
    title: "No Agents",
    description: "No agents match the current filters.",
    actionLabel: "Clear filters",
  },
  live: {
    title: "No Live Agents",
    description:
      "Agents show here once they are published and taking sessions.",
    actionLabel: "Show all agents",
  },
  drafts: {
    title: "No Drafts",
    description: "Agents you are still building show here before they go live.",
    actionLabel: "Show all agents",
  },
  paused: {
    title: "No Paused Agents",
    description: "Agents you pause stop taking sessions and wait here.",
    actionLabel: "Show all agents",
  },
  attention: {
    title: "Nothing Needs Attention",
    description: "Agents with failing runs or tool errors show here.",
    actionLabel: "Show all agents",
  },
}

function createDefaultAgentFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({
      id: "status-1",
      path: ["status"],
      operator: "is",
      value: undefined,
    }),
  ])
}

function renderSelectedFilterState(values: string[]) {
  if (values.length === 0) return "Select"
  if (values.length > 1) return `${values.length} selected`
  return null
}

function AgentOwnerFilterAvatar({ owner }: { owner: AgentOwner }) {
  return (
    <Avatar className="size-5 shrink-0">
      <AvatarImage src={owner.avatarSrc} alt={owner.name} />
      <AvatarFallback className="text-[10px] leading-none">
        {owner.initials}
      </AvatarFallback>
    </Avatar>
  )
}

function AgentOwnerFilterOption({ owner }: { owner: AgentOwner }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <AgentOwnerFilterAvatar owner={owner} />
      <span className="min-w-0 truncate text-sm font-medium">{owner.name}</span>
    </div>
  )
}

function createBadgeFilterOptions<T extends string>(
  options: { value: T; label: string }[],
  renderBadge: (value: T) => ReactNode
): FilterOption[] {
  return options.map((option) => ({
    ...option,
    icon: renderBadge(option.value),
  }))
}

function getBudgetUsage(agent: AgentRecord) {
  if (agent.monthlyBudget <= 0) return agent.spend > 0 ? 100 : 0

  return Math.min(100, Math.round((agent.spend / agent.monthlyBudget) * 100))
}

function AgentCardMeta({
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

function AgentBudgetProgress({ agent }: { agent: AgentRecord }) {
  const value = getBudgetUsage(agent)
  const indicatorClassName =
    value >= 100
      ? "**:data-[slot=progress-indicator]:bg-rose-500"
      : value >= 75
        ? "**:data-[slot=progress-indicator]:bg-amber-500"
        : "**:data-[slot=progress-indicator]:bg-emerald-500"

  return (
    <div className="mt-auto flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Budget used</span>
        <span className="truncate font-medium text-foreground tabular-nums">
          ${Math.round(agent.spend)} of ${agent.monthlyBudget} - {value}%
        </span>
      </div>
      <Progress
        value={value}
        className={cn(
          "gap-0 **:data-[slot=progress-indicator]:rounded-full **:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-track]:rounded-full",
          indicatorClassName
        )}
      >
        <ProgressLabel className="sr-only">Monthly budget used</ProgressLabel>
      </Progress>
    </div>
  )
}

function AgentCard({
  agent,
  visibleProperties,
  onAction,
}: {
  agent: AgentRecord
  visibleProperties: Record<AgentDisplayProperty, boolean>
  onAction: (action: AgentRowAction, agent: AgentRecord) => void
}) {
  const showFooter =
    visibleProperties.sessions || visibleProperties.lastActiveAt
  const showContent =
    visibleProperties.status ||
    visibleProperties.owner ||
    visibleProperties.spend
  const footerColumnCount =
    Number(visibleProperties.sessions) + Number(visibleProperties.lastActiveAt)

  return (
    <Card
      className="h-full min-w-0 cursor-pointer gap-0 overflow-hidden p-0 shadow-none! transition-colors hover:bg-muted/20"
      onClick={() => onAction("view", agent)}
    >
      {/* Header */}
      <CardHeader className="grid-cols-1 gap-2 border-b px-4 py-3.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground tabular-nums">
            {agent.id}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {visibleProperties.model ? (
              <AgentModelBadge model={agent.model} className="max-w-36" />
            ) : null}
            {/* The menu portals out, but React still bubbles its clicks
                through here, so they stop before reaching the card. */}
            <div onClick={(event) => event.stopPropagation()}>
              <AgentActions
                agent={agent}
                onAction={onAction}
                className="focus-within:opacity-100 sm:opacity-70 sm:transition-opacity sm:group-hover/card:opacity-100"
              />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <CardTitle className="line-clamp-2 text-sm leading-5 font-semibold">
            {agent.name}
          </CardTitle>
          <CardDescription className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            <WrenchIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {agent.tools === 1 ? "1 tool" : `${agent.tools} tools`}
            </span>
          </CardDescription>
        </div>
      </CardHeader>

      {showContent ? (
        <CardContent className="flex min-h-36 min-w-0 flex-1 flex-col gap-3 px-4 py-3.5">
          {visibleProperties.status ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <AgentStatusBadge status={agent.status} className="max-w-32" />
            </div>
          ) : null}

          {visibleProperties.owner ? (
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar className="size-8 shrink-0">
                  <AvatarImage
                    src={agent.owner.avatarSrc}
                    alt={agent.owner.name}
                  />
                  <AvatarFallback>{agent.owner.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {agent.owner.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {agent.owner.role}
                  </div>
                </div>
              </div>

              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                Updated {formatAgentDate(agent.updatedAt)}
              </span>
            </div>
          ) : null}

          {visibleProperties.spend ? (
            <AgentBudgetProgress agent={agent} />
          ) : null}
        </CardContent>
      ) : null}

      {showFooter ? (
        <CardFooter
          className={cn(
            "grid gap-0 border-t p-0",
            footerColumnCount > 1 &&
              "divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0"
          )}
        >
          {visibleProperties.sessions ? (
            <AgentCardMeta
              label="Sessions (28d)"
              value={formatAgentCount(agent.sessions)}
              icon={
                <MessagesSquareIcon className="size-4" aria-hidden="true" />
              }
            />
          ) : null}
          {visibleProperties.lastActiveAt ? (
            <AgentCardMeta
              label="Last active"
              value={
                agent.lastActiveAt
                  ? formatAgentDate(agent.lastActiveAt)
                  : "Never run"
              }
              muted
              icon={<ClockIcon className="size-4" aria-hidden="true" />}
            />
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}

function AgentCardGrid({
  agents,
  visibleProperties,
  onAction,
}: {
  agents: AgentRecord[]
  visibleProperties: Record<AgentDisplayProperty, boolean>
  onAction: (action: AgentRowAction, agent: AgentRecord) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:px-6 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          visibleProperties={visibleProperties}
          onAction={onAction}
        />
      ))}
    </div>
  )
}

function AgentsBottomToolbar({
  table,
  recordCount,
}: {
  table: DataGridTableInstance<AgentRecord>
  recordCount: number
}) {
  const pageIndex = table.state.pagination.pageIndex
  const pageSize = table.state.pagination.pageSize
  const pageCount = table.getPageCount()
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, recordCount)
  const currentGroupStart =
    Math.floor(pageIndex / AGENT_PAGE_GROUP_LIMIT) * AGENT_PAGE_GROUP_LIMIT
  const currentGroupEnd = Math.min(
    currentGroupStart + AGENT_PAGE_GROUP_LIMIT,
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
          items={AGENT_PAGE_SIZES.map((size) => ({
            value: `${size}`,
            label: `${size}`,
          }))}
          value={`${pageSize}`}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger className="w-16" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" className="min-w-18">
            <SelectGroup>
              {AGENT_PAGE_SIZES.map((size) => (
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
          {from} - {to} of {recordCount} agents
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

/**
 * The queue grid, listing the workspace's agents. Rows live in the page; this
 * view owns only how they are sliced and shown.
 */
export function AgentsDataGridView({
  agents,
  onAction,
}: {
  agents: AgentRecord[]
  onAction: (action: AgentRowAction, agent: AgentRecord) => void
}) {
  const [activeTab, setActiveTab] = useState<AgentTabId>("all")
  const [filtersBarOpen, setFiltersBarOpen] = useState(true)
  const [filterQuery, setFilterQuery] = useState<FilterQuery>(
    createDefaultAgentFilters
  )
  const filters = useMemo(
    () => flattenFilterConditions(filterQuery),
    [filterQuery]
  )
  const [viewMode, setViewMode] = useState<AgentViewMode>("table")
  const [tableDensity, setTableDensity] = useState<TableDensity>("compact")
  const [stickyHeader, setStickyHeader] = useState(false)
  const [columnsResizable, setColumnsResizable] = useState(false)
  const [columnsMovable, setColumnsMovable] = useState(false)
  const [visibleProperties, setVisibleProperties] = useState<
    Record<AgentDisplayProperty, boolean>
  >({
    owner: true,
    model: true,
    status: true,
    sessions: true,
    spend: true,
    lastActiveAt: true,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastActiveAt", desc: true },
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
    () => filterAgentsByTab(agents, activeTab),
    [activeTab, agents]
  )

  const filteredRecords = useMemo(
    () => applyAgentFilters(tabRecords, filterQuery),
    [filterQuery, tabRecords]
  )

  // The page holds through a drawer edit. A new agent (a create or a copy)
  // goes back to the first page, where the default sort puts it, and a
  // list that shrinks under the page steps back to its last page.
  const [seenCount, setSeenCount] = useState(agents.length)
  const lastPageIndex = Math.max(
    0,
    Math.ceil(filteredRecords.length / pagination.pageSize) - 1
  )
  if (agents.length !== seenCount) {
    setSeenCount(agents.length)
    if (agents.length > seenCount && pagination.pageIndex !== 0) {
      setPagination({ ...pagination, pageIndex: 0 })
    }
  } else if (pagination.pageIndex > lastPageIndex) {
    setPagination({ ...pagination, pageIndex: lastPageIndex })
  }

  const ownerByName = useMemo(() => {
    return new Map<string, AgentOwner>(
      agents.map((agent) => [agent.owner.name, agent.owner])
    )
  }, [agents])

  const ownerFilterOptions = useMemo<FilterOption[]>(() => {
    return [...ownerByName.values()].map((owner) => ({
      value: owner.name,
      label: owner.name,
      icon: <AgentOwnerFilterOption owner={owner} />,
    }))
  }, [ownerByName])

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        searchable: false,
        className: RICH_FILTER_MENU_CLASS_NAME,
        defaultOperator: "is",
        options: createBadgeFilterOptions(
          AGENT_STATUS_OPTIONS,
          (status: AgentStatus) => <AgentStatusBadge status={status} />
        ),
        renderValue: ({ values }) => {
          const state = renderSelectedFilterState(values as string[])
          if (state) return state

          return <AgentStatusBadge status={values[0] as AgentStatus} />
        },
      },
      {
        id: "model",
        label: "Model",
        type: "select",
        searchable: false,
        className: RICH_FILTER_MENU_CLASS_NAME,
        defaultOperator: "is",
        options: createBadgeFilterOptions(
          AGENT_MODEL_OPTIONS,
          (model: AgentModel) => <AgentModelBadge model={model} />
        ),
        renderValue: ({ values }) => {
          const state = renderSelectedFilterState(values as string[])
          if (state) return state

          return <AgentModelBadge model={values[0] as AgentModel} />
        },
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

          const owner = ownerByName.get(String(values[0]))
          if (!owner) return String(values[0])

          return (
            <div className="flex min-w-0 items-center gap-2">
              <AgentOwnerFilterAvatar owner={owner} />
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
        placeholder: "Search agents...",
      },
    ],
    [ownerFilterOptions, ownerByName]
  )

  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => ({ ...visibleProperties }),
    [visibleProperties]
  )

  const columns = useMemo(() => createAgentColumns({ onAction }), [onAction])

  const table = useTable({
    features: dataGridFeatures,
    data: filteredRecords,
    columns,
    state: {
      sorting,
      pagination,
      columnVisibility,
    },
    onSortingChange: (updater) => {
      setSorting(updater)
      resetPagination()
    },
    onPaginationChange: setPagination,
    // Pages move on purpose only: filters, tabs and sorting reset them above,
    // so a status change from the drawer leaves the reader where they were.
    autoResetPageIndex: false,
    getRowId: (row) => row.id,
  })

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value as AgentTabId)
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
    setFilterQuery(createDefaultAgentFilters())
    resetPagination()
  }, [resetPagination])

  const handleViewModeChange = useCallback((value: string[]) => {
    const nextValue = value[0] as AgentViewMode | undefined
    if (!nextValue) return

    setViewMode(nextValue)
  }, [])

  const toggleProperty = useCallback((property: AgentDisplayProperty) => {
    setVisibleProperties((current) => ({
      ...current,
      [property]: !current[property],
    }))
  }, [])

  const handleRowClick = useCallback(
    (agent: AgentRecord) => onAction("view", agent),
    [onAction]
  )

  const emptyState = TAB_EMPTY_STATE[activeTab]
  const hasVisibleFilters = filtersBarOpen || activeFilters.length > 0
  const showEmptyState = filteredRecords.length === 0
  const pageRecords = table.getRowModel().rows.map((row) => row.original)
  // A tab that is empty under no filters is cleared by leaving it; otherwise
  // the filters are what hide the rows.
  const emptyStateAction =
    activeTab !== "all" && activeFilters.length === 0
      ? () => handleTabChange("all")
      : handleClearFilters
  const emptyStateCopy =
    activeTab !== "all" && activeFilters.length > 0
      ? {
          ...emptyState,
          description: "No agents in this tab match the current filters.",
          actionLabel: "Clear filters",
        }
      : emptyState

  return (
    <DataGrid
      table={table}
      recordCount={filteredRecords.length}
      emptyMessage="No agents match this view."
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
        bodyRow: "group/agent-row",
        // Inside the Card the outer columns line up with the toolbar's px-4.
        edgeCell: "first:ps-4 last:pe-4",
      }}
    >
      <Card className="w-full gap-0 py-0">
        <div className="flex flex-col gap-3 px-4 py-3 lg:min-h-12 lg:flex-row lg:items-center lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <BotIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-medium text-foreground">
              Agents
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
              aria-label="Agents view"
              className="shrink-0"
            >
              {(["card", "table"] as AgentViewMode[]).map((mode) => (
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
                      {AGENT_DISPLAY_PROPERTIES.map((property) => {
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
              {AGENT_TABS.map((tab) => (
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
            <div className="flex flex-col gap-2 bg-muted/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between lg:px-4">
              <RuleFilters
                query={filterQuery}
                fields={filterFields}
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
          <AgentsEmptyState
            title={emptyStateCopy.title}
            description={emptyStateCopy.description}
            actionLabel={emptyStateCopy.actionLabel}
            onAction={emptyStateAction}
          />
        ) : (
          <>
            {viewMode === "card" ? (
              <AgentCardGrid
                agents={pageRecords}
                visibleProperties={visibleProperties}
                onAction={onAction}
              />
            ) : (
              <DataGridScrollArea>
                <DataGridTable />
              </DataGridScrollArea>
            )}

            <Separator />

            <div className="px-4 py-3">
              <AgentsBottomToolbar
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
