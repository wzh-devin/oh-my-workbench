"use client"

import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { Badge } from "@/components/reui/badge"
import {
  DataGrid,
  dataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableHeader,
} from "@/components/reui/data-grid/data-grid-table"
import {
  useTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  FilterIcon,
  FlagIcon,
  SearchIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { recordEditorHref } from "@/components/app-shell/record-link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

import { DataGridPagination, PAGE_SIZES } from "./data-grid-pagination"
import { createWorkflowGridColumns, type WorkflowRowAction } from "./columns"
import {
  WORKFLOW_STATUS_OPTIONS,
  type WorkflowRecord,
  type WorkflowStatus,
} from "./data"

type WorkflowSort = "name" | "lastRunAt" | "successRate" | "status"

const sortLabels: Record<WorkflowSort, string> = {
  name: "Name",
  lastRunAt: "Last run",
  successRate: "Success",
  status: "Status",
}

const EMPTY_MESSAGE = "No workflows match the selected filters."

const SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

function buildSorting(sortBy: WorkflowSort): SortingState {
  return [{ id: sortBy, desc: false }]
}

function getWorkflowSearchBlob(workflow: WorkflowRecord) {
  return [
    workflow.name,
    workflow.id,
    workflow.trigger,
    workflow.slug,
    workflow.owner.name,
    workflow.status,
    workflow.cadence,
  ]
    .join(" ")
    .toLowerCase()
}

/** Filters a list the way the grid's search and status filter do. */
export function filterWorkflows(
  workflows: WorkflowRecord[],
  searchQuery: string,
  statuses: WorkflowStatus[]
) {
  const query = searchQuery.trim().toLowerCase()

  return workflows.filter(
    (workflow) =>
      (query.length === 0 || getWorkflowSearchBlob(workflow).includes(query)) &&
      (statuses.length === 0 || statuses.includes(workflow.status))
  )
}

export function WorkflowsDataGridView({
  workflows,
  onWorkflowsChange,
}: {
  /** The workflows to list */
  workflows: WorkflowRecord[]
  /** Replaces the whole list: star, duplicate and archive edit it */
  onWorkflowsChange: (
    update: (current: WorkflowRecord[]) => WorkflowRecord[]
  ) => void
}) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatuses, setSelectedStatuses] = useState<WorkflowStatus[]>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZES[0],
  })
  const [sortBy, setSortBy] = useState<WorkflowSort>("name")
  const [sorting, setSorting] = useState<SortingState>(() =>
    buildSorting("name")
  )

  const filteredWorkflows = useMemo(
    () => filterWorkflows(workflows, searchQuery, selectedStatuses),
    [workflows, searchQuery, selectedStatuses]
  )

  const activeFilterCount = selectedStatuses.length

  const resetPagination = useCallback(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }))
  }, [])

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      resetPagination()
    },
    [resetPagination]
  )

  const handleStatusToggle = useCallback(
    (status: WorkflowStatus, checked: boolean) => {
      setSelectedStatuses((current) => {
        if (checked) {
          return current.includes(status) ? current : [...current, status]
        }

        return current.filter((item) => item !== status)
      })
      resetPagination()
    },
    [resetPagination]
  )

  const handleSortChange = useCallback(
    (value: WorkflowSort) => {
      setSortBy(value)
      setSorting(buildSorting(value))
      resetPagination()
    },
    [resetPagination]
  )

  const handleWorkflowAction = useCallback(
    (action: WorkflowRowAction, workflow: WorkflowRecord) => {
      if (action === "open") {
        navigate(recordEditorHref("workflow", workflow))
        return
      }

      if (action === "favorite") {
        onWorkflowsChange((current) =>
          current.map((item) =>
            item.id === workflow.id
              ? { ...item, favorite: !item.favorite }
              : item
          )
        )
        toast.success(workflow.favorite ? "Removed from starred" : "Starred", {
          description: workflow.name,
          icon: SUCCESS_ICON,
          closeButton: true,
        })
        return
      }

      if (action === "duplicate") {
        const copy: WorkflowRecord = {
          ...workflow,
          // The ID timestamp is created only by the duplicate action, never during render.
          id: `${workflow.id}_${Date.now().toString(36)}`,
          name: `${workflow.name} copy`,
          slug: `${workflow.slug}-copy`,
          successRate: 0,
          runsSucceeded: 0,
          runsTotal: 0,
          lastRunAt: "1970-01-01T00:00:00Z",
          lastRun: "Not run yet",
          status: "Paused",
          favorite: false,
        }

        onWorkflowsChange((current) => {
          const index = current.findIndex((item) => item.id === workflow.id)
          const next = [...current]
          next.splice(index + 1, 0, copy)
          return next
        })
        toast.success("Workflow duplicated", {
          description: `${copy.name} is paused until you publish it.`,
          icon: SUCCESS_ICON,
          closeButton: true,
        })
        return
      }

      let index = -1
      onWorkflowsChange((current) => {
        index = current.findIndex((item) => item.id === workflow.id)
        return current.filter((item) => item.id !== workflow.id)
      })
      toast.success("Workflow archived", {
        description: `${workflow.name} no longer runs.`,
        icon: SUCCESS_ICON,
        closeButton: true,
        action: {
          label: "Undo",
          onClick: () =>
            onWorkflowsChange((current) => {
              const next = [...current]
              next.splice(Math.max(0, index), 0, workflow)
              return next
            }),
        },
      })
    },
    [onWorkflowsChange, navigate]
  )

  const columns = useMemo(
    () => createWorkflowGridColumns({ onAction: handleWorkflowAction }),
    [handleWorkflowAction]
  )

  const table = useTable({
    features: dataGridFeatures,
    data: filteredWorkflows,
    columns,
    pageCount: Math.ceil(filteredWorkflows.length / pagination.pageSize),
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
  })

  return (
    <DataGrid
      table={table}
      recordCount={filteredWorkflows.length}
      emptyMessage={EMPTY_MESSAGE}
      tableLayout={{
        dense: true,
        rowBorder: true,
        headerSticky: false,
        columnsVisibility: false,
        columnsResizable: false,
        columnsMovable: false,
        width: "fixed",
      }}
      tableClassNames={{
        bodyRow: "group/workflow-row [&>td]:h-16",
        // Inside the Card the outer columns line up with the toolbar's px-4.
        edgeCell: "first:ps-4 last:pe-4",
      }}
    >
      <Card className="w-full gap-0 py-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:min-h-14 lg:flex-row lg:items-center lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <FlagIcon
              className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="truncate text-sm text-muted-foreground">
              Production
            </span>
            <ChevronRightIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <WorkflowIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-medium text-foreground">
              Workflows
            </h2>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:flex-nowrap">
            <InputGroup className="w-full min-w-40 sm:w-48">
              <InputGroupAddon align="inline-start">
                <SearchIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </InputGroupAddon>
              <InputGroupInput
                value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search..."
                aria-label="Search workflows"
              />
              {searchQuery.length > 0 ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => handleSearchChange("")}
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline">
                    <ArrowUpDownIcon
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                    {sortLabels[sortBy]}
                    <ChevronDownIcon
                      data-icon="inline-end"
                      aria-hidden="true"
                    />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuGroup>
                  {(
                    ["name", "lastRunAt", "successRate", "status"] as const
                  ).map((value) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => handleSortChange(value)}
                    >
                      {sortLabels[value]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline">
                    <FilterIcon data-icon="inline-start" aria-hidden="true" />
                    Filters
                    {activeFilterCount > 0 ? (
                      <Badge variant="outline" radius="full">
                        {activeFilterCount}
                      </Badge>
                    ) : null}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {WORKFLOW_STATUS_OPTIONS.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={selectedStatuses.includes(status)}
                      closeOnClick={false}
                      onCheckedChange={(checked) =>
                        handleStatusToggle(status, checked === true)
                      }
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
                {activeFilterCount > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      closeOnClick={false}
                      onClick={() => {
                        setSelectedStatuses([])
                        resetPagination()
                      }}
                    >
                      Reset filters
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {filteredWorkflows.length > 0 ? (
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        ) : (
          <>
            <DataGridScrollArea>
              <DataGridTableHeader />
            </DataGridScrollArea>
            <div className="flex min-h-48 w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {EMPTY_MESSAGE}
            </div>
          </>
        )}

        <div className="border-t px-4 py-3">
          {filteredWorkflows.length > 0 ? (
            <DataGridPagination
              table={table}
              recordCount={filteredWorkflows.length}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              0 workflows
            </p>
          )}
        </div>
      </Card>
    </DataGrid>
  )
}
