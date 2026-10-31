import type { ComponentProps } from "react"
import type { Workbook } from "@fortune-sheet/react"

/** 原值一律作为文本，保留前导零、换行和以 = 开头的字符串，不执行 CSV 公式。 */
export function spreadsheetData(
  rows: string[][]
): ComponentProps<typeof Workbook>["data"] {
  return [
    {
      id: "preview",
      name: "工作表",
      status: 1,
      order: 0,
      zoomRatio: 1,
      luckysheet_select_save: [
        { row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 },
      ],
      row: Math.max(100, rows.length),
      column: Math.max(26, ...rows.map((row) => row.length)),
      celldata: rows.flatMap((row, r) =>
        row.flatMap((value, c) =>
          value === ""
            ? []
            : [
                {
                  r,
                  c,
                  v: {
                    v: value,
                    m: value,
                    ff: "Arial",
                    ct: { fa: "@", t: "s" },
                  },
                },
              ]
        )
      ),
    },
  ]
}
