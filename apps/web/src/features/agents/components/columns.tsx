import { type ComponentProps } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { cn } from "cn"
import {
  BlocksIcon,
  CopyIcon,
  CopyPlusIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
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

import { type AgentModel, type AgentRecord, type AgentStatus } from "./data"

export type AgentRowAction =
  "view" | "edit" | "builder" | "duplicate" | "copy" | "delete"

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const spendFormatter = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const countFormatter = new Intl.NumberFormat("en")

type AgentBadgeConfig = {
  variant: ComponentProps<typeof Badge>["variant"]
  dotClassName?: string
}

const AGENT_BADGE_SIZE = "default" satisfies ComponentProps<
  typeof Badge
>["size"]

const statusBadgeConfig: Record<AgentStatus, AgentBadgeConfig> = {
  Live: {
    variant: "success-outline",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  Draft: {
    variant: "info-outline",
    dotClassName: "bg-sky-500 dark:bg-sky-400",
  },
  Paused: {
    variant: "outline",
    dotClassName: "bg-zinc-400 dark:bg-zinc-500",
  },
  Error: {
    variant: "destructive-outline",
    dotClassName: "bg-rose-500 dark:bg-rose-400",
  },
}

// One dot colour per model family, so the column scans by provider.
const modelBadgeConfig: Record<AgentModel, AgentBadgeConfig> = {
  "GPT-5": {
    variant: "outline",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  "Claude Opus 5.5": {
    variant: "outline",
    dotClassName: "bg-amber-500 dark:bg-amber-400",
  },
  "Claude Sonnet 5.5": {
    variant: "outline",
    dotClassName: "bg-amber-500 dark:bg-amber-400",
  },
  "Gemini 3 Pro": {
    variant: "outline",
    dotClassName: "bg-sky-500 dark:bg-sky-400",
  },
  "Llama 4": {
    variant: "outline",
    dotClassName: "bg-violet-500 dark:bg-violet-400",
  },
}

export function formatAgentDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function formatAgentSpend(value: number) {
  return spendFormatter.format(value)
}

export function formatAgentCount(value: number) {
  return countFormatter.format(value)
}

function DotSeparator() {
  return (
    <span
      className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
      aria-hidden="true"
    />
  )
}

function AgentBadge({
  label,
  config,
  className,
}: {
  label: string
  config: AgentBadgeConfig
  className?: string
}) {
  return (
    <Badge
      variant={config.variant}
      size={AGENT_BADGE_SIZE}
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

function AgentNameCell({ agent }: { agent: AgentRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-sm leading-5 font-medium text-foreground">
        {agent.name}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
        <span className="truncate">{agent.id}</span>
        <DotSeparator />
        <span className="shrink-0 tabular-nums">
          Updated {formatAgentDate(agent.updatedAt)}
        </span>
      </div>
    </div>
  )
}

function OwnerCell({ agent }: { agent: AgentRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={agent.owner.avatarSrc} alt={agent.owner.name} />
        <AvatarFallback>{agent.owner.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{agent.owner.name}</div>
        <div className="truncate text-sm text-muted-foreground">
          {agent.owner.role}
        </div>
      </div>
    </div>
  )
}

export function AgentActions({
  agent,
  onAction,
  className,
}: {
  agent: AgentRecord
  onAction: (action: AgentRowAction, agent: AgentRecord) => void
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`View ${agent.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAction("view", agent)
        }}
      >
        <EyeIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Edit ${agent.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAction("edit", agent)
        }}
      >
        <PencilIcon aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`More actions for ${agent.name}`}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onAction("builder", agent)}>
              <BlocksIcon aria-hidden="true" />
              Open in builder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("duplicate", agent)}>
              <CopyPlusIcon aria-hidden="true" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("copy", agent)}>
              <CopyIcon aria-hidden="true" />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onAction("delete", agent)}
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

export function AgentStatusBadge({
  status,
  className,
}: {
  status: AgentStatus
  className?: string
}) {
  return (
    <AgentBadge
      label={status}
      config={statusBadgeConfig[status]}
      className={className}
    />
  )
}

export function AgentModelBadge({
  model,
  className,
}: {
  model: AgentModel
  className?: string
}) {
  return (
    <AgentBadge
      label={model}
      config={modelBadgeConfig[model]}
      className={className}
    />
  )
}

function NumberCell({ value }: { value: string }) {
  return <span className="block truncate text-sm tabular-nums">{value}</span>
}

function DateCell({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="block truncate text-sm text-muted-foreground">
        Never run
      </span>
    )
  }

  return (
    <span className="block truncate text-sm tabular-nums" title={value}>
      {formatAgentDate(value)}
    </span>
  )
}

export function createAgentColumns({
  onAction,
}: {
  onAction: (action: AgentRowAction, agent: AgentRecord) => void
}): ColumnDef<DataGridFeatures, AgentRecord>[] {
  return [
    {
      accessorKey: "name",
      id: "name",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <AgentNameCell agent={row.original} />,
      size: 290,
      minSize: 240,
      enableSorting: true,
      enableHiding: false,
      enableResizing: true,
      meta: {
        headerTitle: "Agent",
      },
    },
    {
      id: "owner",
      accessorFn: (row) => row.owner.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <OwnerCell agent={row.original} />,
      size: 210,
      minSize: 180,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Owner",
      },
    },
    {
      accessorKey: "model",
      id: "model",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <AgentModelBadge model={row.original.model} />,
      size: 150,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Model",
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <AgentStatusBadge status={row.original.status} />,
      size: 112,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Status",
      },
    },
    {
      accessorKey: "sessions",
      id: "sessions",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <NumberCell value={formatAgentCount(row.original.sessions)} />
      ),
      size: 100,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Sessions",
      },
    },
    {
      accessorKey: "spend",
      id: "spend",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <NumberCell value={formatAgentSpend(row.original.spend)} />
      ),
      size: 104,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Spend",
      },
    },
    {
      accessorKey: "lastActiveAt",
      id: "lastActiveAt",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => <DateCell value={row.original.lastActiveAt} />,
      // An agent that never ran ranks newest, so a fresh create or copy
      // lands on the first row; never-run agents order by their last edit.
      sortFn: (rowA, rowB) => {
        const a = rowA.original
        const b = rowB.original
        if (a.lastActiveAt === null || b.lastActiveAt === null) {
          if (a.lastActiveAt !== null) return -1
          if (b.lastActiveAt !== null) return 1
          return a.updatedAt.localeCompare(b.updatedAt)
        }
        return a.lastActiveAt.localeCompare(b.lastActiveAt)
      },
      size: 116,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      meta: {
        headerTitle: "Last active",
      },
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} visibility={true} />
      ),
      cell: ({ row }) => (
        <AgentActions agent={row.original} onAction={onAction} />
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
