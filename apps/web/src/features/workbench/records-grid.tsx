import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type OnChangeFn,
} from "@tanstack/react-table"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"
import { cn } from "cn"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableHeader,
} from "@/components/reui/data-grid/data-grid-table"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { DataGridPagination } from "@/features/dashboard/components/data-grid-pagination"

import { useGridPageSize, resizeGridPage } from "./use-grid-page-size"
import { VirtualRecordsTable } from "./virtual-records-table"
import { formatDateTime } from "@/lib/format-date-time"

export type RecordColumn<T extends object> = ColumnDef<DataGridFeatures, T> & {
  dataType?: "datetime"
}

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
        className="max-h-(--available-height) flex-col items-stretch"
      >
        <p className="min-h-0 min-w-0 overflow-y-auto break-words whitespace-pre-wrap">
          {children}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

/** 共用标题、工具栏和分页；children 仅替换内容，fillHeight 由页面分配滚动空间。 */
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
  children,
  fillHeight = false,
  autoPageSize = true,
  continuous,
}: {
  records: T[]
  columns: RecordColumn<T>[]
  toolbar: ReactNode
  empty: ReactNode
  title?: string
  icon?: ReactNode
  leadingContent?: ReactNode
  loading?: boolean
  children?: ReactNode | ((scrollRef: HTMLDivElement | null) => ReactNode)
  fillHeight?: boolean
  autoPageSize?: boolean
  continuous?: {
    hasMore: boolean
    loading: boolean
    error: boolean
    onLoadMore: () => void
  }
  server?: {
    total?: number
    pagination?: PaginationState
    onPaginationChange?: OnChangeFn<PaginationState>
    sorting: SortingState
    onSortingChange: OnChangeFn<SortingState>
  }
}) {
  const container = useRef<HTMLDivElement>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null
  )
  const sentinel = useRef<HTMLDivElement>(null)
  const {
    hasMore,
    loading: loadingMore,
    error: moreError,
    onLoadMore,
  } = continuous ?? {}
  useEffect(() => {
    if (
      !hasMore ||
      loadingMore ||
      moreError ||
      loading ||
      !sentinel.current ||
      !scrollElement
    )
      return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore?.()
      },
      { root: scrollElement, rootMargin: "160px" }
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, moreError, onLoadMore, scrollElement, loading])
  const [localPage, setLocalPage] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const pagination = server?.pagination ?? localPage
  const showEmpty = fillHeight && !loading && records.length === 0
  const setPagination = server?.onPaginationChange ?? setLocalPage
  const markManualPageSize = useGridPageSize(
    container,
    (size) => setPagination((current) => resizeGridPage(current, size)),
    loading || !autoPageSize || !!continuous,
    fillHeight
  )
  const table = useTable({
    features: dataGridFeatures,
    data: records,
    defaultColumn: { enableResizing: false, enableSorting: false },
    columns: columns.map<ColumnDef<DataGridFeatures, T>>((source) => {
      const definition: RecordColumn<T> =
        source.dataType === "datetime"
          ? {
              ...source,
              size: source.size ?? 192,
              cell: ({ getValue }) => (
                <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatDateTime(getValue())}
                </span>
              ),
            }
          : source
      const centered = definition.meta?.align === "center"
      const meta = {
        ...definition.meta,
        // DataGrid 不自动生成占位内容；留空会把加载态渲染成一排细线。
        skeleton: definition.meta?.skeleton ?? (
          <div
            className={cn(
              "flex min-h-7 items-center",
              centered && "justify-center"
            )}
          >
            <Skeleton
              className={
                definition.size && definition.size <= 64
                  ? "size-4"
                  : "h-4 w-3/4"
              }
            />
          </div>
        ),
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
              "w-full text-sm font-medium text-foreground hover:bg-transparent data-[state=open]:bg-transparent dark:hover:bg-transparent",
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
    ...(server || continuous
      ? {
          manualPagination: true,
          manualSorting: true,
          rowCount: server?.total ?? records.length,
          onSortingChange: server?.onSortingChange,
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
          rowBorder: !loading,
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
        <Card
          ref={container}
          aria-busy={loading}
          size="sm"
          className={cn("w-full min-w-0", fillHeight && "min-h-0 flex-1")}
        >
          <CardHeader className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {icon}
              <h2
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={title}
              >
                {title}
              </h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto">
              {toolbar}
            </div>
          </CardHeader>
          <CardContent
            ref={setScrollElement}
            className={cn(
              "flex min-w-0 flex-col gap-3",
              fillHeight && "min-h-0 flex-1 overflow-auto"
            )}
          >
            {leadingContent}
            {(typeof children === "function"
              ? children(scrollElement)
              : children) ?? (
              <div
                className={cn("min-w-0", showEmpty && "flex flex-1 flex-col")}
              >
                <DataGridScrollArea>
                  {showEmpty ? (
                    <DataGridTableHeader />
                  ) : continuous && !loading ? (
                    <VirtualRecordsTable scrollElement={scrollElement} />
                  ) : (
                    <DataGridTable />
                  )}
                </DataGridScrollArea>
                {/* 空态使用剩余内容区，避免困在表格的一行里或随列宽横移。 */}
                {showEmpty && (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    {empty}
                  </div>
                )}
              </div>
            )}
            {continuous && (
              <div
                ref={sentinel}
                aria-hidden="true"
                className="h-px shrink-0"
              />
            )}
          </CardContent>
          <CardFooter className="shrink-0">
            {continuous ? (
              <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums" aria-live="polite">
                  已加载 {records.length} 项
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={continuous.loading || !continuous.hasMore}
                  aria-hidden={!continuous.hasMore}
                  className={!continuous.hasMore ? "invisible" : undefined}
                  onClick={continuous.onLoadMore}
                >
                  {continuous.loading
                    ? "加载中…"
                    : continuous.error
                      ? "重试加载"
                      : "加载更多"}
                </Button>
              </div>
            ) : (
              <DataGridPagination
                table={table}
                recordCount={server?.total ?? records.length}
                recordLabel="条记录"
              />
            )}
          </CardFooter>
        </Card>
      </DataGrid>
    </TooltipProvider>
  )
}
