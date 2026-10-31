import { useCallback, useLayoutEffect, useRef, useState } from "react"

/** 跟随实际阅读区域计算适应比例；按钮缩放保持当前可视区域中心。 */
export function usePreviewViewport() {
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const center = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const restoreCenter = useCallback(() => {
    const element = viewport.current,
      point = center.current
    if (!element || !point) return
    element.scrollLeft = point.x * element.scrollWidth - element.clientWidth / 2
    element.scrollTop =
      point.y * element.scrollHeight - element.clientHeight / 2
    center.current = null
  }, [])
  const rememberCenter = () => {
    const element = viewport.current
    if (element)
      center.current = {
        x:
          (element.scrollLeft + element.clientWidth / 2) /
          Math.max(1, element.scrollWidth),
        y:
          (element.scrollTop + element.clientHeight / 2) /
          Math.max(1, element.scrollHeight),
      }
  }
  return { viewport, size, rememberCenter, restoreCenter }
}
