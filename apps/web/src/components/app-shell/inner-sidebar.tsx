"use client"

import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react"
import { cn } from "cn"

// ── Context ──

type InnerSidebarContextType = {
  isOpen: boolean
  toggle: () => void
}

const InnerSidebarContext = createContext<InnerSidebarContextType>({
  isOpen: true,
  toggle: () => {},
})

// ── Provider ──

export function InnerSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <InnerSidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((o) => !o),
      }}
    >
      {children}
    </InnerSidebarContext.Provider>
  )
}

// ── Hook ──

export function useInnerSidebar() {
  return useContext(InnerSidebarContext)
}

// ── Inner Sidebar ──
// Desktop-only: on mobile the inner content is surfaced inside the app sidebar.

interface InnerSidebarProps {
  /** Accessible name of the sidebar region */
  label: string
  /**
   * The section has no panel at all (no INNER_NAV entry): the aside closes
   * the way a collapsed panel does, at every width, and takes no room.
   */
  absent?: boolean
  /** Composable content rendered inside the desktop aside */
  children: ReactNode
}

export function InnerSidebar({ label, absent, children }: InnerSidebarProps) {
  const { isOpen } = useInnerSidebar()
  const panelId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(200)
  const [isResizing, setIsResizing] = useState(false)
  const resize = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    width: number
    scope: HTMLElement
  } | null>(null)
  useLayoutEffect(() => {
    if (absent) return
    const scope = panelRef.current?.closest<HTMLElement>(
      '[data-slot="sidebar-wrapper"]'
    )
    if (!scope) return
    const previousWidth = scope.style.getPropertyValue("--sidebar-width-inner")
    scope.style.setProperty("--sidebar-width-inner", `${width}px`)
    return () => {
      if (previousWidth)
        scope.style.setProperty("--sidebar-width-inner", previousWidth)
      else scope.style.removeProperty("--sidebar-width-inner")
    }
  }, [absent, width])
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resize.current || resize.current.pointerId !== event.pointerId) return
    setWidth(resize.current.width)
    resize.current = null
    setIsResizing(false)
  }
  // Only the rail toggle slides the panel. A route change that brings the
  // panel in or takes it away (`absent` flips) swaps it at once, with the
  // page. Read from the previous render, during render, so the class is
  // right in the same commit as the width.
  const [previous, setPrevious] = useState({ isOpen, absent })
  const [animated, setAnimated] = useState(false)
  if (previous.isOpen !== isOpen || previous.absent !== absent) {
    setPrevious({ isOpen, absent })
    setAnimated(previous.absent === absent)
  }

  return (
    <>
      <aside
        ref={panelRef}
        id={panelId}
        className={cn(
          "hidden w-(--sidebar-width-inner) shrink-0 overflow-hidden border-r border-border md:flex",
          animated &&
            !isResizing &&
            // ReUI motion.md permits width transitions for sidebar collapse only.
            "transition-[width,visibility] duration-200 ease-linear motion-reduce:transition-none",
          // Collapsed only from lg up, where the rail toggle that reopens the
          // panel exists. `invisible` takes the hidden controls out of the tab
          // order and the accessibility tree; its transition holds them on
          // screen until the width has closed.
          !isOpen && "lg:invisible lg:w-0 lg:border-r-0",
          absent && "md:invisible md:w-0 md:border-r-0"
        )}
        aria-label={label}
      >
        <div className="flex w-(--sidebar-width-inner) shrink-0 flex-col overflow-hidden">
          {children}
        </div>
      </aside>
      {!absent && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="调整侧栏宽度"
          aria-orientation="vertical"
          aria-controls={panelId}
          aria-valuemin={200}
          aria-valuemax={480}
          aria-valuenow={width}
          className={cn(
            "relative z-40 -mx-1 hidden w-2 shrink-0 cursor-col-resize touch-none self-stretch outline-none after:pointer-events-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-px after:transition-colors hover:after:bg-ring focus-visible:after:bg-ring md:block",
            isResizing && "after:bg-ring",
            !isOpen && "lg:hidden"
          )}
          onPointerDown={(event) => {
            if (event.button !== 0 || resize.current) return
            const panel = panelRef.current
            const scope = panel?.closest<HTMLElement>(
              '[data-slot="sidebar-wrapper"]'
            )
            if (!panel || !scope) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            const startWidth = panel.getBoundingClientRect().width
            resize.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth,
              width: startWidth,
              scope,
            }
            setIsResizing(true)
          }}
          onPointerMove={(event) => {
            const held = resize.current
            if (!held || held.pointerId !== event.pointerId) return
            held.width = Math.max(
              200,
              Math.min(480, held.startWidth + event.clientX - held.startX)
            )
            held.scope.style.setProperty(
              "--sidebar-width-inner",
              `${held.width}px`
            )
            event.currentTarget.setAttribute("aria-valuenow", `${held.width}`)
          }}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
          onKeyDown={(event) => {
            const next = {
              ArrowLeft: width - 16,
              ArrowRight: width + 16,
              Home: 200,
              End: 480,
            }[event.key]
            if (next === undefined) return
            event.preventDefault()
            setWidth(Math.max(200, Math.min(480, next)))
          }}
        />
      )}
    </>
  )
}
