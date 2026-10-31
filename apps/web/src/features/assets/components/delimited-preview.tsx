import { lazy, Suspense, useMemo } from "react"
import Papa from "papaparse"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/features/workbench/components"

const SpreadsheetPreview = lazy(() => import("./spreadsheet-preview"))
const maxRows = 10000,
  maxColumns = 100

/** PapaParse 负责引号和多行解析；预览边界保持显式，绝不修改原文件。 */
export function parseDelimited(text: string, delimiter: string) {
  if (!text) return { rows: [], truncated: false }
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    dynamicTyping: false,
    preview: maxRows + 1,
  })
  const rows = result.data
  // CSV 最后的换行符不代表额外一行，文件中间的空行仍保留。
  if (
    /[\r\n]$/.test(text) &&
    rows.at(-1)?.length === 1 &&
    rows.at(-1)?.[0] === ""
  )
    rows.pop()
  return {
    rows: rows.slice(0, maxRows).map((row) => row.slice(0, maxColumns)),
    truncated:
      result.meta.truncated ||
      rows.length > maxRows ||
      rows.some((row) => row.length > maxColumns),
  }
}

/** 开源工作表按需加载；弹窗、下载及容量限制继续使用系统现有流程。 */
export function DelimitedPreview({
  text,
  delimiter,
  onDownload,
}: {
  text: string
  delimiter: string
  onDownload: () => void
}) {
  const parsed = useMemo(
    () => parseDelimited(text.replace(/^\uFEFF/, ""), delimiter),
    [text, delimiter]
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {parsed.truncated && (
        <p className="text-xs text-muted-foreground">
          仅预览前 {maxRows.toLocaleString()} 行、{maxColumns} 列
        </p>
      )}
      {parsed.rows.length ? (
        <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1" />}>
          <SpreadsheetPreview rows={parsed.rows} />
        </Suspense>
      ) : (
        <EmptyState title="空表格" action="下载文件" onAction={onDownload} />
      )}
    </div>
  )
}
