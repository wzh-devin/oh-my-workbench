import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react"
import { cn } from "cn"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@/components/ui/item"
import {
  CATEGORY_ICON,
  STATUS_BADGE,
  STATUS_ICON,
  STATUS_LABEL,
  type StepKind,
  type StepNodeType,
} from "./data"
import { RunBadge, useStepActions } from "./step-actions"
import { useTestRun } from "./test-run"
import {
  PlusIcon,
  EyeIcon,
  PencilIcon,
  CopyIcon,
  Trash2Icon,
} from "lucide-react"

// The trigger is the one entry point, so its tile is filled and every step
// after it stays quiet. Swap a value to restyle that kind everywhere.
const TILE_VARIANT: Record<StepKind, "solid" | "outline"> = {
  trigger: "solid",
  condition: "outline",
  action: "outline",
}

// The dot stays the block's 6px; an invisible ring around it is what the
// pointer grabs, and the dot swells under the pointer and while a wire is
// drawn to it, so it reads as something to pull.
const HANDLE =
  "transition-[scale] duration-150 ease-out after:absolute after:-inset-2 after:rounded-full after:content-[''] hover:scale-[1.75] motion-reduce:transition-none [&.connectingto]:scale-[1.75]"

export function StepNode({
  data,
  deletable,
  id,
  isConnectable,
  selected,
}: NodeProps<StepNodeType>) {
  const actions = useStepActions()
  // A test run draws over the last live run while it is the newer news.
  const tested = useTestRun().states[id]

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Add a step after ${data.title}`}
            onClick={() => actions.addAfter(id)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`View ${data.title}`}
            onClick={() => actions.inspect(id, "view")}
          >
            <EyeIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Edit ${data.title}`}
            onClick={() => actions.inspect(id, "edit")}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
          {deletable ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Duplicate ${data.title}`}
              onClick={() => actions.duplicate(id)}
            >
              <CopyIcon aria-hidden="true" />
            </Button>
          ) : null}
          {/* The trigger starts the run, so it is the one step you cannot copy
              or drop; the engine is told the same thing. */}
          {deletable ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Delete ${data.title}`}
              onClick={() => actions.remove(id)}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : null}
        </ButtonGroup>
      </NodeToolbar>
      <ContextMenu>
        {/* A locked canvas makes the engine switch its node wrappers off, and
            a step would then take no right-click or double-click, so the card
            keeps its own pointer events. A drag on it still pans, and it keeps
            the cursor the pane showed through it. */}
        <ContextMenuTrigger
          className={cn(
            "pointer-events-auto block",
            actions.locked && "cursor-grab active:cursor-grabbing"
          )}
        >
          <Item
            variant="outline"
            size="xs"
            data-selected={selected || undefined}
            onDoubleClick={() => actions.inspect(id, "view")}
            // The strip's negative margins must track this p-2 exactly.
            // bg-card makes the node opaque over the canvas dot grid.
            className="w-60 gap-2 bg-card p-2 group-focus-visible/node:border-ring data-selected:border-primary data-selected:ring-[3px] data-selected:ring-primary/20"
          >
            {data.kind !== "trigger" ? (
              <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className={HANDLE}
              />
            ) : null}
            <IconTile size="sm" variant={TILE_VARIANT[data.kind]}>
              {CATEGORY_ICON[data.category]}
            </IconTile>
            {/* gap-0 pins a row gap five of the styles otherwise widen, so the
              text stack always measures the same as the tile beside it. */}
            <ItemContent className="min-w-0 gap-0">
              <ItemTitle className="w-full leading-4">
                {/* ItemTitle is a flex row, which defeats line-clamp, so this span
                  is what holds an edited title to one line. */}
                <span className="truncate">{data.title}</span>
              </ItemTitle>
              <ItemDescription className="line-clamp-1 leading-4">
                {data.detail}
              </ItemDescription>
            </ItemContent>
            {/* grow spends the slack the negative margins freed, which carries the
              rule out to both borders instead of merely centring it. */}
            <ItemFooter className="-mx-2 -mb-2 grow gap-2 border-t px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <Avatar className="size-4">
                  <AvatarImage
                    keepMounted
                    src={data.owner.avatar}
                    alt={data.owner.name}
                  />
                  {/* The kept image holds the box while it loads or after it
                      fails, so the fallback lies over it, not beside it. */}
                  <AvatarFallback
                    delay={600}
                    className="absolute inset-0 text-[8px]"
                  >
                    {data.owner.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-muted-foreground tabular-nums">
                  {tested
                    ? (tested.duration ??
                      (tested.state === "skipped" ? "Not run" : "Running"))
                    : data.duration}
                </span>
              </div>
              {tested ? (
                <RunBadge state={tested.state} />
              ) : (
                <Badge variant={STATUS_BADGE[data.status]}>
                  {STATUS_ICON[data.status]}
                  {STATUS_LABEL[data.status]}
                </Badge>
              )}
            </ItemFooter>
            {/* A handle ignores the canvas connectable flag unless it is passed down,
                so Pan and a locked canvas would still start a connection. */}
            <Handle
              type="source"
              position={Position.Right}
              isConnectable={isConnectable}
              className={HANDLE}
            />
          </Item>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            disabled={actions.locked}
            onClick={() => actions.addAfter(id)}
          >
            <PlusIcon aria-hidden="true" />
            Add step after
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => actions.inspect(id, "view")}>
            <EyeIcon aria-hidden="true" />
            View details
          </ContextMenuItem>
          <ContextMenuItem
            disabled={actions.locked}
            onClick={() => actions.inspect(id, "edit")}
          >
            <PencilIcon aria-hidden="true" />
            Edit step
          </ContextMenuItem>
          {deletable ? (
            <ContextMenuItem
              disabled={actions.locked}
              onClick={() => actions.duplicate(id)}
            >
              <CopyIcon aria-hidden="true" />
              Duplicate
            </ContextMenuItem>
          ) : null}
          {deletable ? <ContextMenuSeparator /> : null}
          {deletable ? (
            <ContextMenuItem
              variant="destructive"
              disabled={actions.locked}
              onClick={() => actions.remove(id)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </>
  )
}
