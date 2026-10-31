import { useLayoutEffect, useRef, useState } from "react"
import { flexRender } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useDataGrid } from "@/components/reui/data-grid/data-grid"
import {
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableRenderedRow,
} from "@/components/reui/data-grid/data-grid-table"

/** 沿用ReUI表头/行/列宽，只挂载可见行；CSV长单元格使用实际测量高度。 */
export function VirtualRecordsTable({
  scrollElement,
}: {
  scrollElement: HTMLDivElement | null
}) {
  const { table } = useDataGrid(),
    rows = table.getRowModel().rows
  const container = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 44,
    overscan: 6,
    getItemKey: (index) => rows[index].id,
    scrollMargin: margin,
  })
  useLayoutEffect(() => {
    const element = container.current,
      scroll = scrollElement
    if (!element || !scroll) return
    const measure = () => {
      const body = element.querySelector("tbody")
      if (body)
        setMargin(
          body.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top +
            scroll.scrollTop
        )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [scrollElement])
  const items = virtual.getVirtualItems(),
    columns = table.getVisibleLeafColumns().length
  const before = items.length ? Math.max(0, items[0].start - margin) : 0
  const after = items.length
    ? Math.max(0, virtual.getTotalSize() - (items.at(-1)!.end - margin))
    : 0
  return (
    <div ref={container} className="min-w-0">
      <DataGridTableBase>
        <DataGridTableHead>
          {table.getHeaderGroups().map((group) => (
            <DataGridTableHeadRow key={group.id} rowId={group.id}>
              {group.headers.map((header) => (
                <DataGridTableHeadRowCell key={header.id} header={header}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </DataGridTableHeadRowCell>
              ))}
            </DataGridTableHeadRow>
          ))}
        </DataGridTableHead>
        <DataGridTableBody>
          {before > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={columns}
                style={{ height: before, padding: 0, border: 0 }}
              />
            </tr>
          )}
          {items.map((item) => (
            <DataGridTableRenderedRow
              key={item.key}
              row={rows[item.index]}
              rowIndex={item.index}
              rowRef={virtual.measureElement}
            />
          ))}
          {after > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={columns}
                style={{ height: after, padding: 0, border: 0 }}
              />
            </tr>
          )}
        </DataGridTableBody>
      </DataGridTableBase>
    </div>
  )
}
