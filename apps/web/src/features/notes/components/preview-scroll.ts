/** iframe不执行脚本；父页面负责测量正文，将滚轮和阅读键交给项目ScrollArea。 */
export function connectPreviewScroll(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument
  const viewport = frame.closest<HTMLElement>(
    '[data-slot="scroll-area-viewport"]'
  )
  if (!doc || !viewport) return () => {}
  const measure = () => {
    const height = `${Math.max(1, Math.ceil(doc.body.getBoundingClientRect().height))}px`
    if (frame.style.height !== height) frame.style.height = height
  }
  const observer = new ResizeObserver(measure)
  observer.observe(doc.body)
  measure()
  const wheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      event.shiftKey ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? viewport.clientHeight
          : 1
    if (event.deltaY && viewport.scrollHeight > viewport.clientHeight) {
      event.preventDefault()
      viewport.scrollTop += event.deltaY * unit
    }
  }
  const key = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    const page = viewport.clientHeight * 0.9
    const delta = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: page,
      PageUp: -page,
      " ": event.shiftKey ? -page : page,
      Home: -viewport.scrollHeight,
      End: viewport.scrollHeight,
    }[event.key]
    if (delta === undefined) return
    event.preventDefault()
    viewport.scrollTop += delta
  }
  doc.addEventListener("wheel", wheel, { passive: false })
  doc.addEventListener("keydown", key)
  return () => {
    observer.disconnect()
    doc.removeEventListener("wheel", wheel)
    doc.removeEventListener("keydown", key)
  }
}
