"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Badge } from "@/components/reui/badge"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from "@xyflow/react"

import { Button } from "@/components/ui/button"
import { useTestRun } from "./test-run"
import { XIcon } from "lucide-react"

// The pointer crosses a gap from the line to its Delete, which lives in
// another layer; the hover outlasts that crossing by this much.
const LEAVE_MS = 150

type EdgeHover = {
  hovered: string | null
  enter: (id: string) => void
  leave: () => void
}

const EdgeHoverContext = createContext<EdgeHover & { editable: boolean }>({
  hovered: null,
  enter: () => {},
  leave: () => {},
  editable: false,
})

export const EdgeHoverProvider = EdgeHoverContext.Provider

/** Which edge the pointer is on, held a beat after it leaves. */
export function useEdgeHover(): EdgeHover {
  const [hovered, setHovered] = useState<string | null>(null)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const enter = useCallback((id: string) => {
    window.clearTimeout(timer.current)
    setHovered(id)
  }, [])

  const leave = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHovered(null), LEAVE_MS)
  }, [])

  return useMemo(() => ({ hovered, enter, leave }), [hovered, enter, leave])
}

/**
 * One edge component for the whole graph, so every path shares a style.
 * EdgeLabelRenderer puts the label in real DOM, so it takes a themed Badge.
 */
export function LabeledEdge({
  id,
  label,
  selected,
  markerEnd,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps) {
  // A test run lights the path it takes: the edge it is crossing marches,
  // the ones behind it stay lit.
  const run = useTestRun().edges[id]
  const { hovered, enter, leave, editable } = useContext(EdgeHoverContext)
  const { deleteElements } = useReactFlow()
  // A wire under the pointer, or picked, offers its own Delete; the engine
  // runs it through the same removal as Backspace, Undo toast included.
  const offerDelete = editable && (hovered === id || selected)
  // Strokes scale with the viewport, so dividing by zoom holds every line at 1px.
  const zoom = useStore((state) => state.transform[2])
  // A 1px line centred on a whole pixel smears across two, so every point lands on
  // a half pixel at this zoom; the viewport itself snaps to whole pixels.
  const crisp = (value: number) => (Math.round(value * zoom - 0.5) + 0.5) / zoom
  const source = { x: crisp(sourceX), y: crisp(sourceY) }
  const target = { x: crisp(targetX), y: crisp(targetY) }
  const [path, labelX, labelY] = getSmoothStepPath({
    borderRadius: 12,
    centerX: crisp((source.x + target.x) / 2),
    centerY: crisp((source.y + target.y) / 2),
    sourcePosition,
    sourceX: source.x,
    sourceY: source.y,
    targetPosition,
    targetX: target.x,
    targetY: target.y,
  })

  return (
    <>
      {/* The engine's dash loop ignores reduced motion, so it is stopped here. */}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        // Inline, because the engine's unlayered stroke rule outranks any
        // utility class.
        style={{
          strokeWidth: (run ? 1.5 : 1) / zoom,
          ...(run ? { stroke: "var(--primary)" } : {}),
          ...(run === "active"
            ? {
                strokeDasharray: 5 / zoom,
                animation: "dashdraw 0.5s linear infinite",
              }
            : {}),
        }}
        className="motion-reduce:animate-none!"
      />
      {offerDelete ? (
        <EdgeLabelRenderer>
          <Button
            variant="outline"
            size="xs"
            aria-label="Delete connection"
            className="nodrag nopan pointer-events-auto absolute bg-background"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (label ? 24 : 0)}px)`,
            }}
            onPointerEnter={() => enter(id)}
            onPointerLeave={leave}
            onClick={() => void deleteElements({ edges: [{ id }] })}
          >
            <XIcon aria-hidden="true" />
            Delete
          </Button>
        </EdgeLabelRenderer>
      ) : null}
      {label ? (
        <EdgeLabelRenderer>
          <Badge
            variant="outline"
            className="nodrag nopan absolute bg-background"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </Badge>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
