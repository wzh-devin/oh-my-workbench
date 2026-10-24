import { type ComponentProps } from "react"
import { Badge } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { type ColumnDef } from "@tanstack/react-table"
import { cn } from "cn"

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
import {
  ArchiveIcon,
  ClockIcon,
  CopyIcon,
  MoreHorizontalIcon,
  SquarePenIcon,
  StarIcon,
} from "lucide-react"

import { type WorkflowRecord, type WorkflowStatus } from "./data"

export type WorkflowRowAction = "open" | "favorite" | "duplicate" | "archive"

const statusVariant: Record<
  WorkflowStatus,
  ComponentProps<typeof Badge>["variant"]
> = {
  Active: "success-outline",
  Paused: "outline",
  Failing: "destructive-outline",
}

const statusDotClass: Record<WorkflowStatus, string> = {
  Active: "bg-emerald-500 dark:bg-emerald-400",
  Paused: "bg-muted-foreground/50",
  Failing: "bg-destructive",
}

function DotSeparator() {
  return (
    <span
      className="size-1 shrink-0 rounded-full bg-muted-foreground/45"
      aria-hidden="true"
    />
  )
}

// Success rate reads as health: green is healthy, amber needs a look, red is
// failing, and a workflow with no runs yet stays grey.
function getSuccessToneClass(workflow: WorkflowRecord) {
  const value = workflow.successRate
  if (workflow.runsTotal === 0) return "text-muted-foreground/35"
  if (value >= 95) return "text-emerald-500 dark:text-emerald-400"
  if (value >= 80) return "text-amber-500 dark:text-amber-400"

  return "text-destructive"
}

function WorkflowSuccess({ workflow }: { workflow: WorkflowRecord }) {
  const value = workflow.successRate
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (value / 100) * circumference
  const progressClassName = getSuccessToneClass(workflow)

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="relative size-10 shrink-0">
        <svg
          viewBox="0 0 44 44"
          className="absolute inset-0 size-10 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            className="stroke-muted-foreground/20"
            strokeWidth="3.25"
          />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            className={cn("stroke-current", progressClassName)}
            strokeWidth="3.25"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] leading-none font-medium text-muted-foreground tabular-nums">
          {value}%
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground tabular-nums">
          {workflow.runsTotal === 0 ? "No runs" : `${value}% success`}
        </span>
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          {workflow.runsSucceeded.toLocaleString("en-US")}/
          {workflow.runsTotal.toLocaleString("en-US")} runs
        </span>
      </div>
    </div>
  )
}

function WorkflowNameCell({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-sm leading-5 font-medium text-foreground">
        {workflow.name}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{workflow.trigger}</span>
        <DotSeparator />
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Avatar className="size-4 shrink-0">
            {workflow.owner.avatar ? (
              <AvatarImage
                src={workflow.owner.avatar}
                alt={workflow.owner.name}
              />
            ) : null}
            <AvatarFallback className="text-[8px]">
              {workflow.owner.initials}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{workflow.owner.name}</span>
        </span>
        <DotSeparator />
        <span className="truncate font-mono tracking-wide">
          {workflow.slug}
        </span>
      </div>
    </div>
  )
}

function LastRunCell({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm font-medium text-foreground tabular-nums">
        {workflow.lastRun}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
        <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
        {workflow.cadence}
      </span>
    </div>
  )
}

function StatusCell({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <Badge variant={statusVariant[workflow.status]}>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full!",
          statusDotClass[workflow.status]
        )}
        aria-hidden="true"
      />
      {workflow.status}
    </Badge>
  )
}

function WorkflowActions({
  workflow,
  onAction,
}: {
  workflow: WorkflowRecord
  onAction: (action: WorkflowRowAction, workflow: WorkflowRecord) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Open ${workflow.name} in the editor`}
        onClick={(event) => {
          event.stopPropagation()
          onAction("open", workflow)
        }}
      >
        <SquarePenIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`${workflow.favorite ? "Unstar" : "Star"} ${workflow.name}`}
        aria-pressed={workflow.favorite}
        className={cn(workflow.favorite && "text-amber-500")}
        onClick={(event) => {
          event.stopPropagation()
          onAction("favorite", workflow)
        }}
      >
        <StarIcon aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`More actions for ${workflow.name}`}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onAction("duplicate", workflow)}>
              <CopyIcon aria-hidden="true" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onAction("archive", workflow)}
            >
              <ArchiveIcon aria-hidden="true" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function createWorkflowGridColumns({
  onAction,
}: {
  onAction: (action: WorkflowRowAction, workflow: WorkflowRecord) => void
}): ColumnDef<DataGridFeatures, WorkflowRecord>[] {
  return [
    {
      accessorKey: "successRate",
      id: "successRate",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <WorkflowSuccess workflow={row.original} />,
      size: 210,
      enableSorting: true,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerTitle: "Success",
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <WorkflowNameCell workflow={row.original} />,
      minSize: 300,
      enableSorting: true,
      enableHiding: false,
      enableResizing: false,
      meta: {
        autoSize: true,
        headerTitle: "Workflow",
      },
    },
    {
      accessorKey: "lastRunAt",
      id: "lastRunAt",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <LastRunCell workflow={row.original} />,
      sortFn: (rowA, rowB) =>
        new Date(rowA.original.lastRunAt).getTime() -
        new Date(rowB.original.lastRunAt).getTime(),
      size: 180,
      enableSorting: true,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerTitle: "Last run",
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <StatusCell workflow={row.original} />,
      size: 126,
      enableSorting: true,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerTitle: "Status",
      },
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <WorkflowActions workflow={row.original} onAction={onAction} />
      ),
      size: 104,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerTitle: "Actions",
      },
    },
  ]
}
