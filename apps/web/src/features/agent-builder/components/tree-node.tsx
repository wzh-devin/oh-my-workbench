import { Fragment } from "react"
import { IconTile } from "@/components/reui/icon-tile"
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@/components/ui/item"
import {
  APP_ICON,
  ROOT_ID,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TONE,
  type AgentNodeType,
} from "./data"
import { NODE_WIDTH } from "./flow-layout"
import { useAgentActions } from "./node-actions"
import {
  EllipsisVerticalIcon,
  EyeIcon,
  PencilIcon,
  GitBranchIcon,
  Trash2Icon,
  PlusIcon,
} from "lucide-react"

// The engine positions a handle with transform, so the growth rides `scale`.
const HANDLE =
  "size-2! transition-[scale] duration-150 ease-out after:absolute after:-inset-2 after:content-[''] hover:scale-150 motion-reduce:transition-none [&.connectingto]:scale-150"

/**
 * The leaf's connector, drawn in DOM, so it holds 1px on screen and sits on the
 * same half pixel the edges snap to. Only leaves subscribe to the zoom.
 */
function LeafStub({ x }: { x: number }) {
  const zoom = useStore((state) => state.transform[2])
  const centre = x + NODE_WIDTH / 2
  const crisp = (Math.round(centre * zoom - 0.5) + 0.5) / zoom

  return (
    <span
      aria-hidden="true"
      className="relative h-5 bg-(--xy-edge-stroke)"
      style={{ left: crisp - centre, width: 1 / zoom }}
    />
  )
}

export function TreeNode({
  data,
  id,
  isConnectable,
  positionAbsoluteX,
  selected,
}: NodeProps<AgentNodeType>) {
  const actions = useAgentActions()
  const isRoot = id === ROOT_ID
  const isLeaf = actions.leafIds.has(id)
  // A link is being drawn from another step: the whole card takes it, so it
  // lights under the pointer (agent-builder.tsx finishConnection).
  const linking = useStore(
    (state) =>
      state.connection.inProgress && state.connection.fromNode.id !== id
  )

  return (
    // This wrapper is the measured box, and it is the card alone. A leaf's
    // stub and plus hang below it (LEAF_TAIL), so a card measures the same
    // whether or not it is a leaf and the layout never moves one for gaining
    // or losing a child.
    <div className="relative w-64">
      <div className="relative w-full">
        <Item
          variant="outline"
          size="xs"
          data-selected={selected || undefined}
          data-link-target={linking || undefined}
          // A double press on the card opens its details; on the card's
          // menu button it is two presses of that button. With the panel
          // already showing a step, one press shows this one instead; a form
          // in progress is left alone.
          onClick={(event) => {
            if (
              actions.target?.mode === "view" &&
              actions.target.nodeId !== id &&
              !(
                event.target instanceof Element &&
                event.target.closest("button")
              )
            ) {
              actions.inspect(id, "view")
            }
          }}
          onDoubleClick={(event) => {
            if (
              !(event.target instanceof Element) ||
              !event.target.closest("button")
            ) {
              actions.inspect(id, "view")
            }
          }}
          // The strip's negative margins must track this p-2 exactly. A card
          // a library step is held over (data-drop-target, set by
          // agent-library.tsx) is lit the way a selected one is.
          className="w-full gap-2 overflow-hidden bg-card p-2 group-focus-visible/node:border-ring in-data-drop-target:border-primary in-data-drop-target:ring-[3px] in-data-drop-target:ring-primary/20 data-link-target:hover:border-primary data-link-target:hover:ring-[3px] data-link-target:hover:ring-primary/20 data-selected:border-primary data-selected:ring-[3px] data-selected:ring-primary/20"
        >
          <IconTile size="sm" variant="outline">
            {APP_ICON[data.app]}
          </IconTile>
          {/* gap-0 pins a row gap five of the styles otherwise widen. */}
          <ItemContent className="min-w-0 gap-0">
            {/* One size for both lines: weight and colour carry the hierarchy,
              so the card reads as a single block rather than two tiers. */}
            <ItemTitle className="w-full text-[13px] leading-4 font-semibold">
              {/* ItemTitle is a flex row, which defeats line-clamp. */}
              <span className="truncate">{data.title}</span>
            </ItemTitle>
            {/* The xs item's text-xs is scoped to its size and outranks a plain
                size here, where reui.io lets 13px win, so it is restated. */}
            <ItemDescription className="line-clamp-1 text-[13px] leading-4 group-data-[size=xs]/item:text-[13px]">
              {data.detail}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <DropdownMenu>
              {/* nodrag and nopan on the button alone, so the rest of the card
                  still drags and pans. Without nopan the Pan tool's gesture
                  swallows the press the trigger opens and closes on. */}
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    // Open, it keeps its resting look unless hovered: measured on
                    // reui.io, its older Base UI leaves this trigger unexpanded
                    // for as long as the menu is open, controlled or not.
                    className="nodrag nopan -me-1 text-muted-foreground hover:text-foreground aria-expanded:not-hover:bg-transparent aria-expanded:not-hover:text-muted-foreground"
                    aria-label={`Actions for ${data.title}`}
                  />
                }
              >
                <EllipsisVerticalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              {/* The popup sizes to its anchor, so a 24px trigger needs a width. */}
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => actions.inspect(id, "view")}>
                  <EyeIcon aria-hidden="true" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.inspect(id, "edit")}>
                  <PencilIcon aria-hidden="true" />
                  Edit step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.branch(id)}>
                  <GitBranchIcon aria-hidden="true" />
                  Add branch
                </DropdownMenuItem>
                {/* The trigger opens the run, so it is the one node you cannot drop. */}
                {isRoot ? null : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => actions.remove(id)}
                    >
                      <Trash2Icon aria-hidden="true" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </ItemActions>
          {/* grow spends the slack the negative margins freed, so the band
            reaches both borders instead of merely centring itself. */}
          <ItemFooter className="-mx-2 -mb-2 grow justify-start gap-1.5 border-t bg-muted/50 px-2 py-1.5">
            <span
              className={cn(
                "shrink-0 [&_svg]:size-3.5",
                STATUS_TONE[data.status]
              )}
            >
              {STATUS_ICON[data.status]}
            </span>
            <span className="sr-only">{STATUS_LABEL[data.status]}</span>
            {data.facts.map((fact, index) => (
              <Fragment key={fact}>
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
                  />
                ) : null}
                <span className="truncate text-xs text-muted-foreground tabular-nums">
                  {fact}
                </span>
              </Fragment>
            ))}
          </ItemFooter>
        </Item>
        {/* Written after the card and anchored to its box, so both paint above it
            and a leaf still takes a child from its bottom edge. */}
        {/* A Handle defaults to connectable, so Pan's canvas flag reaches it only here. */}
        {/* The dots grow under the pointer and while a link is aimed at them,
            and an invisible ring around each widens what takes the press. */}
        {isRoot ? null : (
          <Handle
            type="target"
            position={Position.Top}
            isConnectable={isConnectable}
            className={HANDLE}
          />
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className={HANDLE}
        />
      </div>
      {/* A leaf ends in a stub and the trailing plus, which extends the path.
          Only the plus takes the pointer: the tail starts on the source
          handle's centre line and would otherwise cover its lower half. */}
      {isLeaf ? (
        <div className="pointer-events-none absolute top-full left-0 flex w-full flex-col items-center">
          <LeafStub x={positionAbsoluteX} />
          <Button
            variant="outline"
            size="icon-xs"
            // Restated for hover, focus and dark, as on the edge plus (tree-edge.tsx).
            className="nodrag nopan pointer-events-auto rounded-full border-(--xy-edge-stroke) bg-background hover:bg-background focus-visible:border-(--xy-edge-stroke) dark:border-(--xy-edge-stroke) dark:bg-background dark:hover:bg-background"
            aria-label={`Add a step after ${data.title}`}
            onClick={() => actions.appendAfter(id)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
