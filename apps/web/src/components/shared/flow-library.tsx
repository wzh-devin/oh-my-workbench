"use client"

/**
 * A library of steps in the shell's secondary panel, whose rows are dragged
 * onto an editor's canvas. Shared by the Workflow Editor and the AI Agent
 * Builder: the list, the drag and its motion live here, and each editor says
 * what a point of its canvas takes (`targetAt`) and what a drop or a plain
 * add does there.
 *
 * A row is dragged and lands where it is let go. A click, Enter or Space adds
 * it without an aim instead; that is the keyboard's way in and the only one
 * in the phone drawer, which closes on the add.
 *
 * The drag runs on pointer events, as React Flow's own example does, because
 * HTML drag and drop never starts from a touch. The row captures the pointer,
 * so the drag survives leaving the row, the panel and the window.
 *
 * Motion, on purpose: the ghost follows the pointer one to one, with nothing
 * easing between the hand and the thing it holds. It lifts as it is picked
 * up (150ms). Let go over a target it is simply replaced by the card. Let go
 * anywhere else, or cancelled with Escape, it returns to its row (200ms),
 * which is what says nothing was added. Under reduced motion it does not
 * travel back; it fades where it is.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import type { XYPosition } from "@xyflow/react"
import { cn } from "cn"

import {
  InnerNavButton,
  InnerNavGroup,
} from "@/components/app-shell/inner-sidebar-nav"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSidebar } from "@/components/ui/sidebar"
import { GripVerticalIcon } from "lucide-react"

/**
 * How far a press may travel and still be a click. A finger rolls as it lands
 * and lifts, and the browser calls that a tap (and sends its click) for up to
 * 15px, so a touch becomes a drag only past that.
 */
const DRAG_SLOP = { mouse: 4, touch: 16 }

const RETURN_MS = 200
// The strong ease-out the page progress bar fades out on: quick off the
// mark, soft to land.
const RETURN_EASING = "cubic-bezier(0.23, 1, 0.32, 1)"

// Marks what the drag itself puts on screen, so the test for what lies under
// the pointer can look past it.
const DRAG_LAYER = "data-library-drag"

/**
 * The element of this canvas under a point of the screen, looking past the
 * drag's own ghost and cursor layer, or null where the point is off the
 * canvas or on one of its panels (toolbar, minimap).
 */
export function canvasElementAt(
  canvas: Element | null | undefined,
  { x, y }: XYPosition
): Element | null {
  const top = document
    .elementsFromPoint(x, y)
    .find((element) => !element.closest(`[${DRAG_LAYER}]`))

  return canvas &&
    top &&
    canvas.contains(top) &&
    !top.closest(".react-flow__panel")
    ? top
    : null
}

export type FlowLibraryItem = { id: string; label: string; icon: ReactNode }

export type FlowLibrarySection<T extends FlowLibraryItem> = {
  id: string
  title: string
  items: T[]
}

type FlowLibraryProps<T extends FlowLibraryItem> = {
  sections: FlowLibrarySection<T>[]
  disabled?: boolean
  /**
   * The icons are brand marks in their own colours, so they show at full
   * strength instead of the panel's dimmed monochrome icon.
   */
  brandIcons?: boolean
  /** Each row's description; `phone` is read in the drawer, where it is tapped. */
  hint: { desktop: string; phone: string }
  /**
   * What a drop at this point of the screen would do, as a key the editor
   * reads back in `onDrop`; null where nothing would land. Asked on every
   * move of a held row.
   */
  targetAt: (point: XYPosition) => string | null
  /** Told when the target under a held row changes, and null when it goes. */
  onTargetChange?: (target: string | null) => void
  onDrop: (item: T, target: string, point: XYPosition) => void
  /** Adds the item without an aim: a click, Enter, Space or a tap. */
  onAdd: (item: T) => void
}

type Press<T> = {
  pointerId: number
  item: T
  row: HTMLElement
  /** The row's width when it was pressed: the ghost's own. */
  width: number
  /** Where in the row the pointer holds it. */
  grab: XYPosition
  start: XYPosition
  /** The pointer's last position. */
  at: XYPosition
  dragging: boolean
}

type Drag<T> = {
  /** Tells one drag's ghost from the next, so a late return ends only its own. */
  id: number
  item: T
  width: number
  /** Let go and on its way back to the row: the pointer is free again. */
  returning: boolean
}

export function FlowLibrary<T extends FlowLibraryItem>(
  props: FlowLibraryProps<T>
) {
  const { sections, disabled = false, brandIcons = false, hint } = props
  // The shell's row dims its icon (opacity-70) for monochrome glyphs.
  const iconTone = brandIcons ? "[&>span:first-child]:opacity-100" : undefined
  const { isMobile, setOpenMobile } = useSidebar()
  const hintId = useId()
  const [drag, setDrag] = useState<Drag<T> | null>(null)
  const press = useRef<Press<T> | null>(null)
  const ghost = useRef<HTMLDivElement | null>(null)
  const dragCount = useRef(0)
  const target = useRef<string | null>(null)
  // The release that ends a drag is followed by a click on the same row,
  // which must not add a second step. Only a pointer's click is swallowed
  // (see the row's onClick): Enter and Space add, except while a step is
  // being dragged.
  const swallowClick = useRef(false)
  // The editor's callbacks change with its state; the drag reads the latest.
  const latest = useRef(props)

  useEffect(() => {
    latest.current = props
  })

  const setTarget = useCallback((next: string | null) => {
    if (target.current !== next) {
      target.current = next
      latest.current.onTargetChange?.(next)
    }
  }, [])

  /** Puts the ghost under the pointer and tells it whether a drop would land. */
  const placeGhost = useCallback(() => {
    const held = press.current
    const node = ghost.current

    if (!held || !node) {
      return
    }

    const next = latest.current.targetAt(held.at)

    // Set on the element itself: a variable on a parent would restyle every
    // child on each move.
    node.style.transform = `translate3d(${held.at.x - held.grab.x}px, ${held.at.y - held.grab.y}px, 0)`
    node.toggleAttribute("data-droppable", next !== null)
    setTarget(next)
  }, [setTarget])

  // The ghost mounts a render after the drag begins, and the pointer has
  // moved on by then.
  const ghostRef = useCallback(
    (node: HTMLDivElement | null) => {
      ghost.current = node
      placeGhost()
    },
    [placeGhost]
  )

  /** Ends a drag that added nothing: the ghost goes back to its row. */
  const cancelDrag = useCallback((held: Press<T>) => {
    const node = ghost.current
    const id = dragCount.current
    const clear = () =>
      setDrag((current) => (current?.id === id ? null : current))

    if (!node) {
      clear()
      return
    }

    // The layer that held the cursor goes at once: the pointer has let go,
    // and only the ghost is still on its way.
    setDrag((current) =>
      current?.id === id ? { ...current, returning: true } : current
    )

    // Measured now, not at the press: the list may have scrolled under the
    // held step, and a row that can no longer be seen is nowhere to fly to.
    const box = held.row.getBoundingClientRect()
    const hidden = getComputedStyle(held.row).visibility !== "visible"
    const still =
      hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const home = `translate3d(${box.left}px, ${box.top}px, 0)`

    node.removeAttribute("data-droppable")
    // No opacity to start from: the fade begins at what is on screen, which
    // is 80% anywhere a drop would not land.
    node
      .animate(
        still
          ? [{ opacity: 0 }]
          : [
              { transform: node.style.transform },
              { transform: home, opacity: 0 },
            ],
        { duration: RETURN_MS, easing: RETURN_EASING, fill: "forwards" }
      )
      .finished.then(clear, clear)
  }, [])

  const endPress = useCallback(
    (pointerId: number, drop: XYPosition | null) => {
      const held = press.current

      if (!held || held.pointerId !== pointerId) {
        return
      }

      press.current = null

      if (held.row.hasPointerCapture(pointerId)) {
        held.row.releasePointerCapture(pointerId)
      }

      if (!held.dragging) {
        // A press that never moved is a click, and the click handler adds.
        return
      }

      swallowClick.current = true
      setTarget(null)

      const landing = drop ? latest.current.targetAt(drop) : null

      if (drop && landing) {
        latest.current.onDrop(held.item, landing, drop)
        setDrag(null)
      } else {
        cancelDrag(held)
      }
    },
    [cancelDrag, setTarget]
  )

  // Escape puts the step back. Claimed in the capture phase and stopped
  // there, so it does not also close whatever else is listening for it.
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && press.current) {
        event.preventDefault()
        event.stopPropagation()
        endPress(press.current.pointerId, null)
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [dragging, endPress])

  // A highlight the editor drew for a target must not outlive the library.
  useEffect(() => () => latest.current.onTargetChange?.(null), [])

  const add = (item: T) => {
    latest.current.onAdd(item)

    // The drawer covers the canvas the step was just added to.
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const pickUp = (event: React.PointerEvent<HTMLButtonElement>, item: T) => {
    swallowClick.current = false

    // One pointer holds a step: a second finger does not take it over, and
    // only the main button picks up. In the phone drawer a step is tapped.
    if (press.current || event.button !== 0 || isMobile) {
      return
    }

    const row = event.currentTarget
    const box = row.getBoundingClientRect()
    const at = { x: event.clientX, y: event.clientY }

    press.current = {
      pointerId: event.pointerId,
      item,
      row,
      width: box.width,
      grab: { x: at.x - box.left, y: at.y - box.top },
      start: at,
      at,
      dragging: false,
    }
    row.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const held = press.current

    if (!held || held.pointerId !== event.pointerId) {
      return
    }

    // A mouse that moves with no button down was let go where the page
    // could not see it (over a native menu, in another window).
    if (event.pointerType === "mouse" && event.buttons === 0) {
      endPress(event.pointerId, null)
      return
    }

    held.at = { x: event.clientX, y: event.clientY }

    if (held.dragging) {
      placeGhost()
      return
    }

    const slop =
      event.pointerType === "mouse" ? DRAG_SLOP.mouse : DRAG_SLOP.touch

    if (Math.hypot(held.at.x - held.start.x, held.at.y - held.start.y) < slop) {
      return
    }

    held.dragging = true
    dragCount.current += 1
    setDrag({
      id: dragCount.current,
      item: held.item,
      width: held.width,
      returning: false,
    })
  }

  const release = (event: React.PointerEvent<HTMLElement>) =>
    endPress(event.pointerId, { x: event.clientX, y: event.clientY })

  const abandon = (event: React.PointerEvent<HTMLElement>) =>
    endPress(event.pointerId, null)

  return (
    <>
      <div className="max-h-full min-h-0 grow">
        <ScrollArea className="scroll-fade-y h-full grow">
          <div className="flex flex-col py-1">
            {/* Hidden, so it is read as each row's description and not as a
                sentence of its own at the head of the panel. */}
            <p id={hintId} hidden>
              {isMobile ? hint.phone : hint.desktop}
            </p>
            {sections.map((section, index) => (
              <InnerNavGroup
                key={section.id}
                title={section.title}
                separated={index > 0}
              >
                {section.items.map((item) => (
                  <InnerNavButton
                    key={item.id}
                    item={item}
                    disabled={disabled}
                    aria-describedby={hintId}
                    data-dragging={drag?.item.id === item.id || undefined}
                    // Held, the row does nothing (see onClick), and says so:
                    // a dimmed control that still read as live would fail
                    // the contrast it is exempt from when inactive.
                    aria-disabled={drag?.item.id === item.id || undefined}
                    // touch-none: a finger on a row drags the step, it does
                    // not scroll the list or the page under it.
                    className={cn(
                      iconTone,
                      !isMobile &&
                        "cursor-grab touch-none data-dragging:cursor-grabbing data-dragging:opacity-50"
                    )}
                    onPointerDown={(event) => pickUp(event, item)}
                    onPointerMove={move}
                    onPointerUp={release}
                    onPointerCancel={abandon}
                    onLostPointerCapture={abandon}
                    onClick={(event) => {
                      // A key pressed while the pointer is dragging a step
                      // is not a second way in.
                      if (press.current?.dragging) {
                        return
                      }

                      // `detail` counts the presses behind a click and is 0
                      // for one made from the keyboard.
                      const fromDrag = swallowClick.current && event.detail > 0

                      swallowClick.current = false

                      if (!fromDrag) {
                        add(item)
                      }
                    }}
                  >
                    {isMobile ? null : <Grip />}
                  </InnerNavButton>
                ))}
              </InnerNavGroup>
            ))}
          </div>
        </ScrollArea>
      </div>
      {drag
        ? createPortal(
            <>
              {/* Holds the grabbing cursor wherever the pointer goes, and
                  keeps what lies under it from answering a hover. The row
                  has the pointer, so nothing should reach this layer; if
                  that hold is ever lost the events land here, and the drag
                  carries on and ends from here instead of being stranded
                  under a layer that covers the page. */}
              {drag.returning ? null : (
                <div
                  {...{ [DRAG_LAYER]: "" }}
                  className="fixed inset-0 z-50 cursor-grabbing"
                  onPointerMove={move}
                  onPointerUp={release}
                  onPointerCancel={abandon}
                />
              )}
              <div
                key={drag.id}
                ref={ghostRef}
                {...{ [DRAG_LAYER]: "" }}
                aria-hidden="true"
                inert
                className="pointer-events-none fixed top-0 left-0 z-50 opacity-80 transition-opacity duration-150 ease-out will-change-transform data-droppable:opacity-100 motion-reduce:transition-none"
                style={{ width: drag.width }}
              >
                <InnerNavButton
                  item={drag.item}
                  tabIndex={-1}
                  className={cn(
                    "scale-[1.03] border-border bg-popover text-popover-foreground shadow-lg transition-[scale,box-shadow] duration-150 ease-out motion-reduce:transition-none starting:scale-100 starting:shadow-none",
                    iconTone
                  )}
                >
                  <Grip shown />
                </InnerNavButton>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  )
}

/** The handle a row shows on hover or focus, and the ghost always. */
function Grip({ shown = false }: { shown?: boolean }) {
  return (
    <GripVerticalIcon
      aria-hidden="true"
      className={
        shown
          ? "ml-auto opacity-60"
          : "ml-auto opacity-0 transition-opacity duration-150 ease-out group-hover/button:opacity-60 group-focus-visible/button:opacity-60 motion-reduce:transition-none"
      }
    />
  )
}
