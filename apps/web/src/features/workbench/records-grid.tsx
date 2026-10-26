import { useTable, type ColumnDef } from "@tanstack/react-table"
import { useId, type ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"
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
import { Card } from "@/components/ui/card"
import { DataGridPagination } from "@/features/dashboard/components/data-grid-pagination"

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
}: {
  records: T[]
  columns: ColumnDef<DataGridFeatures, T>[]
  toolbar: ReactNode
  empty: ReactNode
  title?: string
  icon?: ReactNode
}) {
  const table = useTable({
    features: dataGridFeatures,
    data: records,
    defaultColumn: { enableResizing: false, enableSorting: false },
    columns: columns.map<ColumnDef<DataGridFeatures, T>>((definition) => {
      if (typeof definition.header !== "string") return definition
      const title = definition.header
      return {
        ...definition,
        id:
          definition.id ??
          ("accessorKey" in definition
            ? String(definition.accessorKey)
            : title),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={title}
            className="text-sm font-medium text-foreground"
          />
        ),
      }
    }),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    getRowId: (row, index) => ("id" in row ? String(row.id) : String(index)),
  })
  return (
    <TooltipProvider>
      <DataGrid
        table={table}
        recordCount={records.length}
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
          },
        }}
      >
        <Card className="w-full min-w-0 gap-0 py-0">
          <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {icon}
              <h2 className="shrink-0 text-sm font-medium text-foreground">
                {title}
              </h2>
              <span className="text-xs tabular-nums">{records.length}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto">
              {toolbar}
            </div>
          </div>
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
          <div className="border-t px-4 py-3">
            <DataGridPagination
              table={table}
              recordCount={records.length}
              recordLabel="条记录"
            />
          </div>
        </Card>
      </DataGrid>
    </TooltipProvider>
  )
}
