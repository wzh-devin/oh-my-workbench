import { Badge } from "@/components/reui/badge"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
} from "@xyflow/react"

import { Button } from "@/components/ui/button"
import type { AgentEdgeType } from "./data"
import { useAgentActions } from "./node-actions"
import { PlusIcon, UnlinkIcon } from "lucide-react"

export function TreeEdge({
  data,
  id,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<AgentEdgeType>) {
  const actions = useAgentActions()
  // Strokes scale with the viewport, so dividing by zoom holds every line at 1px.
  const zoom = useStore((state) => state.transform[2])
  // A 1px line centred on a whole pixel smears across two, so every point lands on
  // a half pixel at this zoom; the viewport itself snaps to whole pixels.
  const crisp = (value: number) => (Math.round(value * zoom - 0.5) + 0.5) / zoom
  const source = { x: crisp(sourceX), y: crisp(sourceY) }
  const target = { x: crisp(targetX), y: crisp(targetY) }
  const centerY = crisp((source.y + target.y) / 2)
  const [path] = getSmoothStepPath({
    borderRadius: 12,
    centerX: crisp((source.x + target.x) / 2),
    centerY,
    sourcePosition,
    sourceX: source.x,
    sourceY: source.y,
    targetPosition,
    targetX: target.x,
    targetY: target.y,
  })
  const label = data?.branchLabel
  // Both sit on the connector midpoint, so the caption yields while the
  // pointer is on this edge and comes back the moment it leaves.
  const revealed = actions.hoveredEdge === id
  // A selected connection keeps its controls, so the cut is reachable
  // without holding the pointer on a 1px line.
  const controls = revealed || selected

  return (
    <>
      {/* A connector a library step is held over (data-drop-target, set by
          agent-library.tsx) takes the primary colour and shows its plus. The
          engine's stroke rule is unlayered, so the colour has to win. */}
      <BaseEdge
        id={id}
        path={path}
        style={{ strokeWidth: 1 / zoom }}
        className="in-data-drop-target:stroke-primary!"
      />
      <EdgeLabelRenderer>
        {/* The label layer takes no pointer events, so the button restores them.
            nodrag and nopan keep the press off the canvas gestures. */}
        <div
          data-edge-id={id}
          className="group/edge-controls nodrag nopan pointer-events-auto absolute flex items-center justify-center"
          style={{
            transform: `translate(-50%, -50%) translate(${target.x}px, ${centerY}px)`,
          }}
        >
          {label ? (
            <Badge
              variant="outline"
              data-revealed={revealed || undefined}
              // The caption sits on the connector, so it wears the line's own colour.
              className="border-(--xy-edge-stroke) bg-background transition-opacity in-data-drop-target:opacity-0 data-revealed:opacity-0 motion-reduce:transition-none"
            >
              {label}
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="icon-xs"
            data-revealed={controls || undefined}
            // The outline variant's hover, focus and dark colours outrank the
            // plain ones here, where reui.io keeps the plus on the page colour
            // and the edge's stroke in every state, so each one is restated.
            className="absolute rounded-full border-(--xy-edge-stroke) bg-background opacity-0 transition-opacity group-hover/edge-controls:opacity-100 hover:bg-background focus-visible:border-(--xy-edge-stroke) focus-visible:opacity-100 in-data-drop-target:opacity-100 data-revealed:opacity-100 motion-reduce:transition-none dark:border-(--xy-edge-stroke) dark:bg-background dark:hover:bg-background"
            aria-label={
              label ? `Add a step on the ${label} path` : "Add a step here"
            }
            onClick={() => actions.insertOn(id)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          {/* Beside the plus: cuts the connection, leaving the step below
              loose, to be linked somewhere else. */}
          <Button
            variant="outline"
            size="icon-xs"
            data-revealed={controls || undefined}
            className="absolute translate-x-7 rounded-full border-(--xy-edge-stroke) bg-background text-muted-foreground opacity-0 transition-opacity group-hover/edge-controls:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100 data-revealed:opacity-100 motion-reduce:transition-none dark:border-(--xy-edge-stroke) dark:bg-background dark:hover:bg-background"
            aria-label={
              label
                ? `Remove the connection on the ${label} path`
                : "Remove this connection"
            }
            onClick={() => actions.removeEdge(id)}
          >
            <UnlinkIcon aria-hidden="true" />
          </Button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
