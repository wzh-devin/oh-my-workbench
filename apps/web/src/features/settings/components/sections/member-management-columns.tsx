"use client"

import { createContext, memo, useContext } from "react"
import { Badge, type BadgeProps } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { type ColumnDef, type Row } from "@tanstack/react-table"

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
import { type MemberAccess, type MemberRecord, type MemberStatus } from "./data"
import {
  MoreHorizontalIcon,
  UserIcon,
  ShieldCheckIcon,
  MailIcon,
  RefreshCwIcon,
  UserMinusIcon,
} from "lucide-react"

const ACCESS_BADGE_VARIANTS: Record<MemberAccess, BadgeProps["variant"]> = {
  Owner: "primary-light",
  Admin: "info-light",
  Editor: "outline",
  Viewer: "warning-light",
}

const STATUS_BADGE_VARIANTS: Record<MemberStatus, BadgeProps["variant"]> = {
  Active: "success-light",
  Invited: "info-light",
  "Needs review": "warning-light",
}

export const MemberStatusBadge = memo(function MemberStatusBadge({
  status,
}: {
  status: MemberStatus
}) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{status}</Badge>
})

export function AccessBadge({ access }: { access: MemberAccess }) {
  return <Badge variant={ACCESS_BADGE_VARIANTS[access]}>{access}</Badge>
}

/** What a row asks of the table, which owns the members and the sheet. */
export type MemberRowActions = {
  view: (id: string) => void
  changeAccess: (id: string) => void
  resendInvite: (member: MemberRecord) => void
  resetSession: (member: MemberRecord) => void
  requestRemove: (member: MemberRecord) => void
}

export const MemberRowActionsContext = createContext<MemberRowActions | null>(
  null
)

function useRowActions() {
  const actions = useContext(MemberRowActionsContext)
  if (!actions) throw new Error("MemberRowActionsContext is missing")
  return actions
}

function MemberCell({ row }: { row: Row<DataGridFeatures, MemberRecord> }) {
  const member = row.original
  const actions = useRowActions()

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={member.src} alt={member.name} />
        <AvatarFallback>{member.initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* The name opens the member, so a row reads as a link to them. */}
          <button
            type="button"
            onClick={() => actions.view(member.id)}
            className="truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {member.name}
          </button>
          <AccessBadge access={member.access} />
        </div>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
      </div>
    </div>
  )
}

function MemberActionsCell({
  row,
}: {
  row: Row<DataGridFeatures, MemberRecord>
}) {
  const member = row.original
  const actions = useRowActions()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            aria-label={`Open ${member.name} actions`}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => actions.view(member.id)}>
            <UserIcon aria-hidden="true" />
            View member
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => actions.changeAccess(member.id)}>
            <ShieldCheckIcon aria-hidden="true" />
            Change access
          </DropdownMenuItem>

          {member.status === "Invited" ? (
            <DropdownMenuItem onClick={() => actions.resendInvite(member)}>
              <MailIcon aria-hidden="true" />
              Resend invite
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => actions.resetSession(member)}>
              <RefreshCwIcon aria-hidden="true" />
              Reset session
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => actions.requestRemove(member)}
          >
            <UserMinusIcon aria-hidden="true" />
            Remove access
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const memberManagementColumns: ColumnDef<
  DataGridFeatures,
  MemberRecord
>[] = [
  {
    accessorKey: "name",
    id: "name",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} visibility={true} />
    ),
    cell: ({ row }) => <MemberCell row={row} />,
    size: 300,
    enableSorting: true,
    enableHiding: false,
    enableResizing: true,
    meta: {
      headerTitle: "Member",
      // Inset the leading column to the toolbar/pagination px-5 so the avatar
      // does not hug the table edge (the dense grid cell default is px-2).
      headerClassName: "ps-5",
      cellClassName: "ps-5",
    },
  },
  {
    accessorKey: "role",
    id: "role",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} visibility={true} />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-1 text-sm font-medium">
          {row.original.role}
        </span>
        <span className="line-clamp-1 text-sm text-muted-foreground">
          {row.original.team}
        </span>
      </div>
    ),
    size: 190,
    enableSorting: true,
    enableHiding: true,
    enableResizing: true,
    meta: {
      headerTitle: "Role",
    },
  },
  {
    accessorKey: "status",
    id: "status",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} visibility={true} />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-1">
        <MemberStatusBadge status={row.original.status} />
        <span className="line-clamp-1 text-sm text-muted-foreground">
          {row.original.lastActive}
        </span>
      </div>
    ),
    size: 160,
    enableSorting: true,
    enableHiding: true,
    enableResizing: true,
    meta: {
      headerTitle: "Activity",
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <MemberActionsCell row={row} />,
    size: 52,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
]
