import { useMemo } from "react"
import { Workbook } from "@fortune-sheet/react"
import "@fortune-sheet/react/dist/index.css"
import "./spreadsheet-preview.css"
import { spreadsheetData } from "../spreadsheet-data"

/** FortuneSheet 管理选格、内容栏、复制和缩放；预览不提供任何写入能力。 */
export default function SpreadsheetPreview({ rows }: { rows: string[][] }) {
  const data = useMemo(() => spreadsheetData(rows), [rows])
  return (
    <div
      className="asset-spreadsheet min-h-0 min-w-0 flex-1 overflow-hidden"
      aria-label="CSV工作表"
    >
      <Workbook
        data={data}
        lang="zh"
        allowEdit={false}
        showToolbar={false}
        showFormulaBar
        showSheetTabs
        forceCalculation={false}
        defaultFontSize={11}
        defaultRowHeight={28}
        defaultColWidth={160}
        cellContextMenu={["copy"]}
        headerContextMenu={[]}
        sheetTabContextMenu={[]}
        addRows={0}
      />
    </div>
  )
}
