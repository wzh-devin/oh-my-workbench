import { useLayoutEffect, useRef, type RefObject } from "react"
import type { PaginationState } from "@tanstack/react-table"

/** 按实际表头、行高和页脚测量可见行数；用户手选后停止自适应。 */
export function useGridPageSize(
  container: RefObject<HTMLDivElement | null>,
  onAutoSize: (size: number) => void,
  loading = false,
  fillHeight = false
) {
  const manual = useRef(false)
  const update = useRef(onAutoSize)
  useLayoutEffect(() => {
    update.current = onAutoSize
  })
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => {
      // 骨架行高度不同，不能用它反推条数，否则会在两种行高间反复请求。
      if (manual.current || loading) return
      const body = element.querySelector("tbody")
      const row = body?.querySelector("tr:has(td)")
      const parent = element.parentElement
      if (
        !body ||
        !row ||
        !parent ||
        row.querySelector('[data-slot="data-grid-table-empty"]')
      )
        return
      const rowCount = body.querySelectorAll("tr:has(td)").length
      const bodyRect = body.getBoundingClientRect()
      const cardRect = element.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      const paddingBottom =
        Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0
      const bottom =
        Math.min(window.innerHeight, parentRect.bottom) - paddingBottom
      // 直接扣除实测的表头、滚动条、间距和分页栏，避免固定预留高度少算一行。
      const content = element.querySelector('[data-slot="card-content"]')
      const contentRect = content?.getBoundingClientRect()
      const scrollbar = element.querySelector(
        '[data-slot="data-grid-scrollbar"][data-orientation="horizontal"]'
      )
      // 撑满面板时排除内容区留白，只扣除工具栏、表头和滚动条。
      const chromeHeight =
        fillHeight && contentRect
          ? cardRect.height -
            contentRect.height +
            bodyRect.top -
            contentRect.top +
            (scrollbar?.getBoundingClientRect().height ?? 0)
          : cardRect.height - bodyRect.height
      // tbody 最后一行没有底边框，补回共享边框后再取平均，短尾页也保持同一行高。
      const rowHeight = rowCount > 0 ? (bodyRect.height + 1) / rowCount : 0
      const available = bottom - cardRect.top - chromeHeight
      // 折叠边框共享一条像素，不应因此少算最后一行。
      if (rowHeight > 0 && available > 0)
        update.current(
          Math.max(1, Math.min(100, Math.floor((available + 1) / rowHeight)))
        )
    }
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    if (element.parentElement) observer?.observe(element.parentElement)
    window.addEventListener("resize", measure)
    measure()
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [container, loading, fillHeight])
  return () => {
    manual.current = true
  }
}

/** 重算默认条数时保留首条记录所在位置，避免尺寸变化跳回第一页。 */
export const resizeGridPage = (page: PaginationState, pageSize: number) =>
  page.pageSize === pageSize
    ? page
    : {
        pageSize,
        pageIndex: Math.floor((page.pageIndex * page.pageSize) / pageSize),
      }
