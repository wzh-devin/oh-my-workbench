import { type ComponentProps } from "react"
import { Badge } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { type ColumnDef } from "@tanstack/react-table"
import { cn } from "cn"
import {
  CopyIcon,
  CopyPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"

import { type WorkflowItem, type WorkflowLastRun } from "./data"

export type WorkflowRowAction =
  "view" | "edit" | "delete" | "open" | "duplicate" | "copy"

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const runFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})

const numberFormatter = new Intl.NumberFormat("en")

type WorkflowBadgeConfig = {
  variant: ComponentProps<typeof Badge>["variant"]
  dotClassName?: string
}

const WORKFLOW_BADGE_SIZE = "default" satisfies ComponentProps<
  typeof Badge
>["size"]

const lastRunBadgeConfig: Record<WorkflowLastRun, WorkflowBadgeConfig> = {
  Succeeded: {
    variant: "success-outline",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  Failed: {
    variant: "destructive-outline",
    dotClassName: "bg-rose-500 dark:bg-rose-400",
  },
  Never: {
    variant: "outline",
    dotClassName: "bg-muted-foreground/50",
  },
}

const LAST_RUN_LABEL: Record<WorkflowLastRun, string> = {
  Succeeded: "Succeeded",
  Failed: "Failed",
  Never: "Never run",
}

export function formatWorkflowDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

export function formatWorkflowRunTime(value: string | null) {
  return value ? runFormatter.format(new Date(value)) : "Not yet"
}

export function formatWorkflowRuns(value: number) {
  return numberFormatter.format(value)
}

function DotSeparator() {
  return (
    <span
      className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
      aria-hidden="true"
    />
  )
}

function WorkflowBadge({
  label,
  config,
  className,
}: {
  label: string
  config: WorkflowBadgeConfig
  className?: string
}) {
  return (
    <Badge
      variant={config.variant}
      size={WORKFLOW_BADGE_SIZE}
      className={cn("max-w-full min-w-0 shrink justify-start", className)}
    >
      {config.dotClassName ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", config.dotClassName)}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </Badge>
  )
}

export function WorkflowLastRunBadge({
  lastRun,
  className,
}: {
  lastRun: WorkflowLastRun
  className?: string
}) {
  return (
    <WorkflowBadge
      label={LAST_RUN_LABEL[lastRun]}
      config={lastRunBadgeConfig[lastRun]}
      className={className}
    />
  )
}

export function WorkflowEnabledBadge({
  enabled,
  className,
}: {
  enabled: boolean
  className?: string
}) {
  return (
    <WorkflowBadge
      label={enabled ? "On" : "Off"}
      config={{
        variant: enabled ? "success-outline" : "outline",
        dotClassName: enabled
          ? "bg-emerald-500 dark:bg-emerald-400"
          : "bg-muted-foreground/50",
      }}
      className={className}
    />
  )
}

export function WorkflowTags({
  tags,
  max = 2,
  className,
}: {
  tags: string[]
  max?: number
  className?: string
}) {
  if (tags.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const shown = tags.slice(0, max)
  const hidden = tags.length - shown.length

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1", className)}
      title={tags.join(", ")}
    >
      {shown.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          size={WORKFLOW_BADGE_SIZE}
          className="min-w-0 shrink"
        >
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
      {hidden > 0 ? (
        <Badge variant="secondary" size={WORKFLOW_BADGE_SIZE}>
          +{hidden}
        </Badge>
      ) : null}
    </div>
  )
}

function WorkflowNameCell({ item }: { item: WorkflowItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-sm leading-5 font-medium text-foreground">
        {item.name}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
        <span className="truncate">{item.trigger}</span>
        <DotSeparator />
        <span className="truncate">{item.cadence}</span>
      </div>
    </div>
  )
}

function OwnerCell({ item }: { item: WorkflowItem }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={item.owner.avatarSrc} alt={item.owner.name} />
        <AvatarFallback>{item.owner.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.owner.name}</div>
        <div className="truncate text-sm text-muted-foreground">
          {item.owner.role}
        </div>
      </div>
    </div>
  )
}

export function WorkflowEnabledSwitch({
  item,
  onToggle,
}: {
  item: WorkflowItem
  onToggle: (item: WorkflowItem, enabled: boolean) => void
}) {
  return (
    <div
      className="flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <Switch
        size="sm"
        checked={item.enabled}
        onCheckedChange={(checked) => onToggle(item, checked)}
        aria-label={`${item.enabled ? "Pause" : "Activate"} ${item.name}`}
      />
      <span
        className={cn(
          "text-sm",
          item.enabled ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {item.enabled ? "On" : "Off"}
      </span>
    </div>
  )
}

function LastRunCell({ item }: { item: WorkflowItem }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <WorkflowLastRunBadge lastRun={item.lastRun} />
      {item.lastRunAt ? (
        <span className="truncate text-xs leading-4 text-muted-foreground tabular-nums">
          {formatWorkflowRunTime(item.lastRunAt)}
        </span>
      ) : null}
    </div>
  )
}

export function WorkflowActions({
  item,
  onAction,
  className,
}: {
  item: WorkflowItem
  onAction: (action: WorkflowRowAction, item: WorkflowItem) => void
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Edit ${item.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAction("edit", item)
        }}
      >
        <PencilIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="hover:text-destructive"
        aria-label={`Delete ${item.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAction("delete", item)
        }}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`More actions for ${item.name}`}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onAction("open", item)}>
              <SquarePenIcon aria-hidden="true" />
              Open in editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("duplicate", item)}>
              <CopyPlusIcon aria-hidden="true" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("copy", item)}>
              <CopyIcon aria-hidden="true" />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onAction("delete", item)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DateCell({ value }: { value: string }) {
  return (
    <span
      className="block truncate text-sm text-muted-foreground tabular-nums"
      title={value}
    >
      {formatWorkflowDate(value)}
    </span>
  )
}

export function createWorkflowColumns({
  onAction,
  onToggle,
}: {
  onAction: (action: WorkflowRowAction, item: WorkflowItem) => void
  onToggle: (item: WorkflowItem, enabled: boolean) => void
}): ColumnDef<DataGridFeatures, WorkflowItem>[] {
  return [
    {
      accessorKey: "name",
      id: "name",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <WorkflowNameCell item={row.original} />,
      size: 280,
      minSize: 220,
      enableSorting: true,
      enableHiding: false,
      enableResizing: true,
      meta: {
        headerTitle: "Workflow",
      },
    },
    {
      id: "owner",
      accessorFn: (row) => row.owner.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <OwnerCell item={row.original} />,
      size: 200,
      minSize: 170,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Owner",
      },
    },
    {
      id: "enabled",
      accessorFn: (row) => (row.enabled ? 1 : 0),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <WorkflowEnabledSwitch item={row.original} onToggle={onToggle} />
      ),
      size: 104,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Status",
      },
    },
    {
      id: "tags",
      accessorFn: (row) => row.tags.join(", "),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <WorkflowTags tags={row.original.tags} />,
      size: 180,
      enableSorting: false,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Tags",
      },
    },
    {
      id: "lastRun",
      accessorFn: (row) => row.lastRunAt ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <LastRunCell item={row.original} />,
      size: 140,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Last run",
      },
    },
    {
      accessorKey: "runs",
      id: "runs",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="block truncate text-sm tabular-nums">
          {formatWorkflowRuns(row.original.runs)}
        </span>
      ),
      size: 90,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Runs",
      },
    },
    {
      accessorKey: "updatedAt",
      id: "updatedAt",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <DateCell value={row.original.updatedAt} />,
      size: 120,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Updated",
      },
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <WorkflowActions item={row.original} onAction={onAction} />
      ),
      size: 112,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerTitle: "Actions",
      },
    },
  ]
}
