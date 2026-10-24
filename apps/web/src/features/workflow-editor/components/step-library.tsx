"use client"

/**
 * The Workflow Editor's step library (components/shared/flow-library.tsx has
 * the list and the drag). A step lands on the canvas where it is let go,
 * centred on the pointer and snapped to the grid, unconnected, even over
 * another card. Added with a click or a key it has no aim: it goes to the
 * middle of the view, or the first free lane under it, and the view moves if
 * it has to, to show it.
 */
import { useCallback } from "react"
import { useReactFlow, useStoreApi, type XYPosition } from "@xyflow/react"

import { useSidebar } from "@/components/ui/sidebar"

import {
  canvasElementAt,
  FlowLibrary,
  type FlowLibrarySection,
} from "@/components/shared/flow-library"
import { CATEGORY_ICON, STEP_LIBRARY, type StepTemplate } from "./data"
import { LastRunCard } from "./last-run-card"
import { useStepActions } from "./step-actions"

// A step card before any has been measured: w-60, and the height the card
// renders at.
const CARD_SIZE = { width: 240, height: 83 }

// How far above the canvas's foot a step added from the keyboard is shown:
// clear of the canvas toolbar, which lies over the bottom 60px.
const REVEAL_MARGIN = 80

type LibraryStep = StepTemplate & { icon: React.ReactNode }

// The category picks the glyph, in the list as on the card.
const SECTIONS: FlowLibrarySection<LibraryStep>[] = STEP_LIBRARY.map(
  (section) => ({
    ...section,
    items: section.items.map((template) => ({
      ...template,
      icon: CATEGORY_ICON[template.category],
    })),
  })
)

const snap = (value: number, grid: number) => Math.round(value / grid) * grid

export function StepLibrary() {
  const { addFromLibrary, locked } = useStepActions()
  const { isMobile } = useSidebar()
  const {
    flowToScreenPosition,
    getViewport,
    screenToFlowPosition,
    setViewport,
  } = useReactFlow()
  const store = useStoreApi()

  /** Every card is one size, so any measured step stands for the new one. */
  const cardSize = useCallback(() => {
    const measured = store.getState().nodeLookup.values().next().value?.measured

    return {
      width: measured?.width ?? CARD_SIZE.width,
      height: measured?.height ?? CARD_SIZE.height,
    }
  }, [store])

  /** Where a card goes for its middle to sit at this point of the screen. */
  const cardPositionAt = (point: XYPosition): XYPosition => {
    const { snapGrid, snapToGrid } = store.getState()
    const { width, height } = cardSize()
    // Snapped here, after the half card is taken off, so it is the card's
    // corner that lands on the grid and not the pointer.
    const flow = screenToFlowPosition(point, { snapToGrid: false })
    const x = flow.x - width / 2
    const y = flow.y - height / 2

    return snapToGrid
      ? { x: snap(x, snapGrid[0]), y: snap(y, snapGrid[1]) }
      : { x, y }
  }

  /** The keyboard's and the phone's way in: the middle of what is on screen. */
  const addToView = (template: StepTemplate) => {
    const canvas = store.getState().domNode?.getBoundingClientRect()

    if (!canvas) {
      return
    }

    const placed = addFromLibrary(
      template,
      cardPositionAt({
        x: canvas.left + canvas.width / 2,
        y: canvas.top + canvas.height / 2,
      }),
      false
    )

    // The free lane can lie below what the canvas shows, more so zoomed in.
    // The view then moves down just far enough to show the step it was told
    // was added. It moves at once, as the toolbar's zoom and fit do.
    if (placed) {
      const foot = flowToScreenPosition({
        x: placed.x,
        y: placed.y + cardSize().height,
      }).y
      const below = Math.ceil(foot + REVEAL_MARGIN - canvas.bottom)

      if (below > 0) {
        const { x, y, zoom } = getViewport()

        void setViewport({ x, y: y - below, zoom })
      }
    }
  }

  return (
    <>
      {/* Names the panel and says what it is for: a list of steps reads as
          navigation until something says they go on the canvas. */}
      <div className="shrink-0 space-y-0.5 border-b border-border p-3">
        <h2 className="text-sm font-medium text-foreground">Step Library</h2>
        <p className="text-xs leading-snug text-muted-foreground">
          {isMobile
            ? "Tap a step to add it to the workflow."
            : "Drag a step onto the canvas, or click it to add one."}
        </p>
      </div>
      <FlowLibrary
        sections={SECTIONS}
        disabled={locked}
        hint={{
          desktop:
            "Adds this step to the middle of the canvas. Drag it to put it somewhere else.",
          phone: "Adds this step to the middle of the canvas.",
        }}
        targetAt={(point) =>
          canvasElementAt(store.getState().domNode, point) ? "canvas" : null
        }
        onDrop={(template, _target, point) =>
          addFromLibrary(template, cardPositionAt(point), true)
        }
        onAdd={addToView}
      />
      {/* The panel's footer, under the list as a section's footer sits. */}
      <div className="shrink-0">
        <LastRunCard />
      </div>
    </>
  )
}
