"use client"

/**
 * The React Flow canvas both editors draw on: the kit's tokens mapped onto the
 * engine's variables, one fit, and a flow that fades in once it is measured.
 * Shared by the Workflow Editor and the AI Agent Builder, so the two cannot
 * drift. The engine's stylesheet is imported once, in the root layout.
 */
import { useEffect, useState } from "react"

import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowProps,
  useNodesInitialized,
  useStore,
} from "@xyflow/react"

import { cn } from "cn"

// React Flow paints from its own --xy-* variables; mapping them onto the
// shadcn tokens makes the canvas follow the active style and dark mode.
const FLOW_THEME = [
  "[--xy-background-color:transparent]",
  "[--xy-background-pattern-color:var(--border)]",
  // The kit's edge stroke is translucent, so a shared trunk darkened where
  // two connections overlap; the same grey mixed into the page stays one
  // solid color.
  "[--xy-edge-stroke:color-mix(in_oklab,var(--muted-foreground)_45%,var(--background))]",
  "[--xy-edge-stroke-selected:var(--primary)]",
  "[--xy-connectionline-stroke:var(--primary)]",
  "[--xy-connectionline-stroke-width:1]",
  "[--xy-handle-background-color:var(--primary)]",
  "[--xy-handle-border-color:var(--card)]",
  "[--xy-minimap-background-color:var(--card)]",
  "[--xy-minimap-mask-background-color:color-mix(in_oklab,var(--muted)_70%,transparent)]",
  "[--xy-minimap-node-background-color:color-mix(in_oklab,var(--muted-foreground)_35%,transparent)]",
  "[--xy-selection-background-color:color-mix(in_oklab,var(--primary)_8%,transparent)]",
  "[--xy-selection-border:1px_dashed_var(--primary)]",
  "[--xy-attribution-background-color:transparent]",
].join(" ")

/**
 * padding is a share of the viewport per side, so 0.1 leaves a real margin
 * without shrinking the graph; maxZoom 1 keeps Fit from magnifying it.
 */
export const FIT_VIEW_OPTIONS = { padding: 0.1, maxZoom: 1 }

// `className` is not offered: the flow's own class carries the fade-in, and a
// caller's would replace it.
type FlowCanvasProps<N extends Node, E extends Edge> = Omit<
  ReactFlowProps<N, E>,
  "className"
> & {
  /** A graph small enough to read whole does not need an overview. */
  showMiniMap?: boolean
}

/**
 * The server renders the canvas surface and nothing on it: nodes need to be
 * measured before React Flow can place and fit them, which happens a frame
 * after hydration. Until then the flow is transparent; it fades in once the
 * nodes are measured and the fit has been applied, instead of popping into
 * a page that is already on screen. A graph with no nodes is ready at once,
 * and a safety timer reveals the flow regardless.
 */
function useFlowReady() {
  const nodesInitialized = useNodesInitialized()
  const empty = useStore((state) => state.nodeLookup.size === 0)
  const measured = useStore((state) => state.width > 0 && state.height > 0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return
    if (measured && (nodesInitialized || empty)) {
      // One frame, so the fit that follows measurement has been painted.
      const frame = window.requestAnimationFrame(() => setReady(true))
      return () => window.cancelAnimationFrame(frame)
    }
    const timer = window.setTimeout(() => setReady(true), 1500)
    return () => window.clearTimeout(timer)
  }, [empty, measured, nodesInitialized, ready])

  return ready
}

export function FlowCanvas<N extends Node, E extends Edge>({
  children,
  showMiniMap = true,
  ...props
}: FlowCanvasProps<N, E>) {
  const ready = useFlowReady()

  return (
    // min-w-0: the canvas shares its row with the inspector dock and gives up
    // the room when the dock opens.
    <div
      className={cn(
        "@container relative min-h-0 min-w-0 flex-1 bg-muted/30",
        FLOW_THEME
      )}
    >
      <ReactFlow<N, E>
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        attributionPosition="bottom-center"
        minZoom={0.25}
        zoomOnDoubleClick={false}
        maxZoom={2}
        data-ready={ready || undefined}
        className="opacity-0 transition-opacity duration-200 ease-out data-[ready]:opacity-100 motion-reduce:transition-none"
        {...props}
      >
        {/* A whole-pixel radius on a 24px pitch, so the field stays crisp at
            every zoom instead of antialiasing into a haze. */}
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} />
        {showMiniMap ? (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            // By the canvas's own width as well as the viewport's: beside an
            // open inspector dock a narrow canvas has no room for both the
            // overview and the toolbar.
            className="max-md:hidden @max-[540px]:hidden"
          />
        ) : null}
        {children}
      </ReactFlow>
    </div>
  )
}
