import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
} from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

const clampRatio = (value: number) => Math.max(30, Math.min(70, value))

/** 源码和预览保持挂载，只调整两栏比例与滚动。 */
export function MarkdownEditorLayout({
  toolbar,
  children,
  preview,
}: {
  toolbar: ReactNode
  children: ReactNode
  preview?: ReactNode
}) {
  const sourceId = useId()
  const root = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(50)
  const resize = useRef<{
    pointerId: number
    startX: number
    startRatio: number
    width: number
    ratio: number
  } | null>(null)
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    const held = resize.current
    if (!held || held.pointerId !== event.pointerId) return
    resize.current = null
    if (root.current) delete root.current.dataset.resizing
    setRatio(held.ratio)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const expected = useRef(new WeakMap<HTMLElement, number>())
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (resize.current) return
    const source = event.target
    if (
      !(source instanceof HTMLElement) ||
      source.dataset.slot !== "scroll-area-viewport"
    )
      return
    const pending = expected.current.get(source)
    expected.current.delete(source)
    if (pending !== undefined && Math.abs(source.scrollTop - pending) < 1)
      return
    const target = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      )
    ).find((element) => element !== source)
    const range = source.scrollHeight - source.clientHeight
    if (!target || range <= 0) return
    const top =
      Math.max(0, Math.min(1, source.scrollTop / range)) *
      Math.max(0, target.scrollHeight - target.clientHeight)
    if (Math.abs(target.scrollTop - top) < 1) return
    expected.current.set(target, top)
    target.scrollTop = top
  }
  return (
    <>
      {toolbar}
      <div
        ref={root}
        className="group/markdown-layout relative grid min-h-0 min-w-0 flex-1 grid-rows-2 data-[resizing=true]:select-none md:flex"
        style={{ "--note-editor-width": `${ratio}%` } as CSSProperties}
        onScrollCapture={onScroll}
      >
        <ScrollArea
          id={sourceId}
          aria-label="Markdown 编辑区"
          className="min-h-0 min-w-0 md:shrink-0 md:basis-[calc(var(--note-editor-width)_-_0.25rem)]"
        >
          {children}
        </ScrollArea>
        <div
          role="separator"
          tabIndex={0}
          aria-label="调整编辑与预览宽度"
          aria-orientation="vertical"
          aria-controls={sourceId}
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={ratio}
          aria-valuetext={`源码 ${Math.round(ratio)}%，预览 ${Math.round(100 - ratio)}%`}
          className="relative z-10 hidden w-2 shrink-0 cursor-col-resize touch-none self-stretch outline-none after:pointer-events-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-colors group-data-[resizing=true]/markdown-layout:after:bg-ring hover:after:bg-ring focus-visible:after:bg-ring md:block"
          onPointerDown={(event) => {
            if (event.button !== 0 || resize.current || !root.current) return
            const bounds = root.current.getBoundingClientRect()
            if (!bounds.width) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            resize.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startRatio: ratio,
              width: bounds.width,
              ratio,
            }
            root.current.dataset.resizing = "true"
          }}
          onPointerMove={(event) => {
            const held = resize.current
            if (!held || held.pointerId !== event.pointerId) return
            held.ratio = clampRatio(
              held.startRatio +
                ((event.clientX - held.startX) / held.width) * 100
            )
            root.current?.style.setProperty(
              "--note-editor-width",
              `${held.ratio}%`
            )
            event.currentTarget.setAttribute("aria-valuenow", `${held.ratio}`)
            event.currentTarget.setAttribute(
              "aria-valuetext",
              `源码 ${Math.round(held.ratio)}%，预览 ${Math.round(100 - held.ratio)}%`
            )
          }}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
          onDoubleClick={() => setRatio(50)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 2
            const next = {
              ArrowLeft: ratio - step,
              ArrowRight: ratio + step,
              Home: 30,
              End: 70,
            }[event.key]
            if (next === undefined) return
            event.preventDefault()
            setRatio(clampRatio(next))
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t group-data-[resizing=true]/markdown-layout:pointer-events-none md:border-t-0">
          {preview}
        </div>
      </div>
    </>
  )
}
