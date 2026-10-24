"use client"

/**
 * The editors' inspector: a dock in the row beside the canvas, and a sheet
 * where that row is too narrow for both. Shared by the Workflow Editor and
 * the AI Agent Builder, so the two cannot drift.
 *
 * The dock is the mirror of the shell's secondary panel: the same width
 * transition opens and closes it, and the canvas gives up the room instead of
 * being covered. Its width is `--inspector-width`, which also caps the sheet.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { cn } from "cn"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Below lg the panel rides an overlay sheet; at lg+ it is an in-flow dock.
// A 340px panel beside a canvas needs about 1024px before both read well.
const LG_QUERY = "(max-width: 1023px)"

function subscribeBelowLg(onChange: () => void) {
  const query = window.matchMedia(LG_QUERY)

  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/**
 * Read straight from matchMedia, so a phone's first paint already gets the
 * sheet instead of flashing the desktop dock for a frame.
 */
function useIsBelowLg() {
  return useSyncExternalStore(
    subscribeBelowLg,
    () => window.matchMedia(LG_QUERY).matches,
    () => false
  )
}

// Inside the app shell the row the canvas and the dock share is narrower than
// the viewport, so a wide screen can still leave too little of it: under this
// width the dock would squeeze the canvas to a strip, and the sheet takes over
// instead. Measured on the row, not on the canvas: the canvas narrows as the
// dock opens, and a mode chosen from it would flip in the middle of opening.
const DOCK_MIN_ROW = 768

/** How long the dock waits for a canvas that does not report ready. */
const READY_TIMEOUT_MS = 600

// React Flow listens for its keys (Backspace deletes the selection) on the
// document and skips only form fields. Its `nokey` class extends that to a
// subtree: a key pressed on a button in the panel, or on the sheet itself
// (it holds focus after a click on plain text), belongs to the panel, not to
// the step selected on the canvas behind it. A select's list is portaled out
// of the panel, so the editors put the same class on those lists.
const PANEL_KEYS = "nokey"

/** The width of the row the dock sits in, watched through the dock's ref. */
function useRowWidth() {
  const [width, setWidth] = useState(0)
  const ref = useCallback((node: HTMLElement | null) => {
    const row = node?.parentElement
    if (!row) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })

    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

/**
 * The width a canvas beside a dock will have once the dock has settled.
 *
 * The dock takes 200ms to open or close and its row gives the canvas what is
 * left, so the canvas's width of the instant is wrong for anything that fits
 * content to it in the same tick as an open or a close: an editor that frames
 * its graph as the inspector closes (Restore sample removing the inspected
 * step, the re-centring that follows a close) or before an opening dock has
 * settled. Pass the canvas element; null when it sits beside no dock.
 */
export function settledCanvasWidth(canvas: Element | null): number | null {
  const found = dockBeside(canvas)

  if (!found) return null

  const taken = found.dock.hasAttribute("data-docked")
    ? parseFloat(
        getComputedStyle(found.dock).getPropertyValue("--inspector-width")
      )
    : 0

  return found.row.clientWidth - (Number.isFinite(taken) ? taken : 0)
}

/** Whether the dock beside this canvas is open or on its way open. */
export function isDockOpening(canvas: Element | null): boolean {
  return dockBeside(canvas)?.dock.hasAttribute("data-docked") ?? false
}

/** The dock that shares a row with this canvas, and that row. */
function dockBeside(canvas: Element | null) {
  for (let row = canvas?.parentElement; row; row = row.parentElement) {
    const dock = row.querySelector(':scope > [data-slot="inspector-dock"]')

    if (dock instanceof HTMLElement) {
      return { row, dock }
    }
  }

  return null
}

type InspectorDockProps = {
  /** Accessible name of the dock region. */
  label: string
  /** The sheet's title, read by screen readers only. */
  title: string
  /** The sheet's description, read by screen readers only. */
  description: string
  open: boolean
  onClose: () => void
  /**
   * False while the canvas is still digesting what opened or closed the dock
   * (a step just added and not measured yet). The dock waits for it before
   * it moves, so its transition does not share frames with that work.
   */
  ready?: boolean
  /** The panel. It renders in the dock or in the sheet, never in both. */
  children: ReactNode
}

/** Render as the last child of the flex row that holds the canvas. */
export function InspectorDock({
  label,
  title,
  description,
  open,
  onClose,
  ready = true,
  children,
}: InspectorDockProps) {
  const [rowRef, rowWidth] = useRowWidth()
  // The row reports 0 until it is measured; that first render keeps the
  // dock, as the server rendered it.
  const asSheet = useIsBelowLg() || (rowWidth > 0 && rowWidth < DOCK_MIN_ROW)
  const docked = open && !asSheet

  // The width follows `docked` late: once the canvas is `ready`, and two
  // frames after that. The click that opens the dock often starts heavy work
  // (a new step is inserted, measured and laid out), and a transition whose
  // clock runs through those frames is most of the way done by the next
  // repaint: the dock would jump instead of sliding. This way it starts on a
  // frame of its own. A canvas that never reports ready does not hold it.
  const [wide, setWide] = useState(docked)

  useEffect(() => {
    if (wide === docked) return

    if (!ready) {
      const timer = window.setTimeout(() => setWide(docked), READY_TIMEOUT_MS)

      return () => window.clearTimeout(timer)
    }

    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setWide(docked))
    })

    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
    }
  }, [docked, ready, wide])

  // A closing panel is inert, but the browser only moves focus out of an
  // inert subtree at its next rendering update: until then a button in it
  // still takes Enter, and the panel shows a held value whose Save would act
  // on a step already closed. Focus leaves in the same commit instead.
  useLayoutEffect(() => {
    if (open) return

    const active = document.activeElement

    if (
      active instanceof HTMLElement &&
      active.closest('[data-slot="inspector-panel"]')
    ) {
      active.blur()
    }
  }, [open])

  return (
    <>
      {/* `data-docked` is where the dock is heading, for settledCanvasWidth;
          the width class is where it is. The inner box keeps the full width
          and carries the border, so nothing in the panel reflows while the
          dock moves and a shut dock shows no edge. */}
      <aside
        ref={rowRef}
        data-slot="inspector-dock"
        data-docked={docked || undefined}
        aria-label={label}
        aria-hidden={!docked}
        inert={!docked}
        className={cn(
          "shrink-0 overflow-hidden",
          "transition-[width] duration-200 ease-linear motion-reduce:transition-none",
          wide ? "w-(--inspector-width)" : "w-0"
        )}
      >
        {asSheet ? null : (
          <div
            data-slot="inspector-panel"
            className={cn("h-full w-(--inspector-width) border-s", PANEL_KEYS)}
          >
            {children}
          </div>
        )}
      </aside>

      {/* Mounted closed so the first open still plays the sheet transition. */}
      <Sheet open={asSheet && open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          // The kit's side width (w-3/4) and cap (sm:max-w-sm) outrank plain
          // utilities, so both are restated for this side: full width on a
          // phone, the dock's width from sm up.
          className={cn(
            "w-full p-0 data-[side=right]:w-full motion-reduce:transition-none data-[side=right]:sm:max-w-(--inspector-width)",
            PANEL_KEYS,
            // Closed by a mode switch, not by the user: the panel has moved
            // to the dock, and an empty sheet has no exit to play.
            !asSheet && "transition-none"
          )}
        >
          {/* p-0 as on reui.io, where sr-only's zero padding beats the header's. */}
          <SheetHeader className="sr-only p-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {/* Only in sheet mode, so the panel never renders twice when the
              mode switches while open. Inert while the sheet leaves: the
              panel then shows a held value whose Save and Edit would act on
              a step the user has already closed. */}
          {asSheet ? (
            <div data-slot="inspector-panel" className="contents" inert={!open}>
              {children}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
