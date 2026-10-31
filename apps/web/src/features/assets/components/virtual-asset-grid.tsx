import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { AssetEntry } from "../asset-rules"

/** 以响应式卡片行虚拟化，加载更多文件不会持续增加DOM与图片请求。 */
export function VirtualAssetGrid({
  entries,
  scrollElement,
  renderItem,
}: {
  entries: AssetEntry[]
  scrollElement: HTMLDivElement | null
  renderItem: (entry: AssetEntry) => ReactNode
}) {
  const container = useRef<HTMLDivElement>(null),
    probe = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ columns: 1, margin: 0 })
  const virtual = useVirtualizer({
    count: Math.ceil(entries.length / layout.columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => 252,
    overscan: 2,
    scrollMargin: layout.margin,
    getItemKey: (index) => entries[index * layout.columns]?.id ?? index,
  })
  useLayoutEffect(() => {
    const root = container.current,
      marker = probe.current,
      scroll = scrollElement
    if (!root || !marker || !scroll) return
    const measure = () => {
      const columns =
        getComputedStyle(marker).gridTemplateColumns.split(" ").length
      const margin =
        root.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top +
        scroll.scrollTop
      setLayout((current) =>
        current.columns === columns && current.margin === margin
          ? current
          : { columns, margin }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [scrollElement])
  return (
    <div
      ref={container}
      aria-label="文件网格"
      role="list"
      className="relative shrink-0"
      style={{ height: virtual.getTotalSize() }}
    >
      <div
        ref={probe}
        aria-hidden="true"
        className="invisible grid h-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      />
      {virtual.getVirtualItems().map((item) => (
        <div
          key={item.key}
          ref={virtual.measureElement}
          data-index={item.index}
          role="presentation"
          className="absolute top-0 left-0 grid w-full grid-cols-1 gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          style={{ transform: `translateY(${item.start - layout.margin}px)` }}
        >
          {entries
            .slice(
              item.index * layout.columns,
              (item.index + 1) * layout.columns
            )
            .map(renderItem)}
        </div>
      ))}
    </div>
  )
}
