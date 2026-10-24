"use client"

import { type DataGridTableInstance } from "@/components/reui/data-grid/data-grid"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { type WorkflowRecord } from "./data"

// The grid's footer, as on the Workflows page. It is a local component because
// its page sizes need the SelectGroup that gives the Select its p-1: listed
// straight in the popup, the sizes run edge to edge.

export const PAGE_SIZES = [5, 10, 20]
const PAGE_GROUP_LIMIT = 5

export function DataGridPagination({
  table,
  recordCount,
}: {
  table: DataGridTableInstance<WorkflowRecord>
  recordCount: number
}) {
  const pageIndex = table.state.pagination.pageIndex
  const pageSize = table.state.pagination.pageSize
  const pageCount = table.getPageCount()
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, recordCount)
  const currentGroupStart =
    Math.floor(pageIndex / PAGE_GROUP_LIMIT) * PAGE_GROUP_LIMIT
  const currentGroupEnd = Math.min(
    currentGroupStart + PAGE_GROUP_LIMIT,
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
          <SelectTrigger aria-label="Rows per page" className="w-16" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" className="min-w-18">
            <SelectGroup>
              {PAGE_SIZES.map((size) => (
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
