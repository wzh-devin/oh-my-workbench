import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type OnChangeFn,
} from "@tanstack/react-table"
import { useId, useRef, useState, type ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"
import { cn } from "cn"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { DataGridPagination } from "@/features/dashboard/components/data-grid-pagination"

import { useGridPageSize, resizeGridPage } from "./use-grid-page-size"

export function RecordHint({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="shrink-0 text-muted-foreground"
            aria-label={label}
            aria-describedby={id}
          />
        }
      >
        <CircleHelpIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent
        id={id}
        role="tooltip"
        align="start"
        className="max-h-(--available-height) overflow-y-auto"
      >
        <p className="min-w-0 break-words whitespace-pre-wrap">{children}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/** 主列填充剩余空间，其余列保持定义宽度；所有业务列表共用同一表头与密度。 */
export function RecordsGrid<T extends object>({
  records,
  columns,
  toolbar,
  empty,
  title = "记录",
  icon,
  leadingContent,
  server,
  loading = false,
}: {
  records: T[]
  columns: ColumnDef<DataGridFeatures, T>[]
  toolbar: ReactNode
  empty: ReactNode
  title?: string
  icon?: ReactNode
  leadingContent?: ReactNode
  loading?: boolean
  server?: {
    total: number
    pagination: PaginationState
    onPaginationChange: OnChangeFn<PaginationState>
    sorting: SortingState
    onSortingChange: OnChangeFn<SortingState>
  }
}) {
  const container = useRef<HTMLDivElement>(null)
  const [localPage, setLocalPage] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const pagination = server?.pagination ?? localPage
  const setPagination = server?.onPaginationChange ?? setLocalPage
  const markManualPageSize = useGridPageSize(
    container,
    (size) => setPagination((current) => resizeGridPage(current, size)),
    loading
  )
  const table = useTable({
    features: dataGridFeatures,
    data: records,
    defaultColumn: { enableResizing: false, enableSorting: false },
    columns: columns.map<ColumnDef<DataGridFeatures, T>>((definition) => {
      const centered = definition.meta?.align === "center"
      const meta = {
        ...definition.meta,
        headerClassName: cn(
          centered ? "text-center" : "text-left",
          definition.meta?.headerClassName
        ),
        cellClassName: cn(
          centered ? "text-center" : "text-left",
          definition.meta?.cellClassName
        ),
      }
      if (typeof definition.header !== "string") return { ...definition, meta }
      const title = definition.header
      return {
        ...definition,
        meta,
        id:
          definition.id ??
          ("accessorKey" in definition
            ? String(definition.accessorKey)
            : title),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={title}
            className={cn(
              "w-full text-sm font-medium text-foreground",
              centered
                ? "justify-center text-center"
                : "justify-start text-left"
            )}
          />
        ),
      }
    }),
    state: { pagination, ...(server ? { sorting: server.sorting } : {}) },
    onPaginationChange: (next) => {
      const value = typeof next === "function" ? next(pagination) : next
      if (value.pageSize !== pagination.pageSize) markManualPageSize()
      setPagination(value)
    },
    ...(server
      ? {
          manualPagination: true,
          manualSorting: true,
          rowCount: server.total,
          onSortingChange: server.onSortingChange,
        }
      : {}),
    getRowId: (row, index) => ("id" in row ? String(row.id) : String(index)),
  })
  return (
    <TooltipProvider>
      <DataGrid
        table={table}
        recordCount={server?.total ?? records.length}
        isLoading={loading}
        emptyMessage={empty}
        tableLayout={{
          dense: true,
          rowBorder: true,
          width: "fixed",
          columnsResizable: true,
        }}
        tableClassNames={{
          base: "min-w-[720px] text-sm font-normal",
          edgeCell: "first:ps-4 last:pe-4",
        }}
        i18n={{
          labels: {
            sortAscending: "升序",
            sortDescending: "降序",
            empty: "暂无记录",
            loading: "加载中",
            rowsPerPage: "每页",
            paginationInfo: ({ from, to, count }) =>
              `${from}–${to}，共 ${count}`,
            previousPage: "上一页",
            nextPage: "下一页",
            goToPage: (page) => `第 ${page} 页`,
            paginationEllipsis: "更多页码",
          },
        }}
      >
        <Card ref={container} size="sm" className="w-full min-w-0">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {icon}
              <h2 className="shrink-0 text-sm font-medium text-foreground">
                {title}
              </h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto">
              {toolbar}
            </div>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            {leadingContent}
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
          </CardContent>
          <CardFooter>
            <DataGridPagination
              table={table}
              recordCount={server?.total ?? records.length}
              recordLabel="条记录"
            />
          </CardFooter>
        </Card>
      </DataGrid>
    </TooltipProvider>
  )
}
