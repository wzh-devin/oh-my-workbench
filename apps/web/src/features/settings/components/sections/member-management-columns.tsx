"use client"

import { createContext, memo, useContext } from "react"
import { Badge, type BadgeProps } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { type ColumnDef, type Row } from "@tanstack/react-table"

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
    <button
      type="button"
      onClick={() => actions.view(member.id)}
      className="block max-w-full truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      title={member.name}
    >
      {member.name}
    </button>
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
            size="icon-sm"
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
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => <MemberCell row={row} />,
    size: 220,
    enableSorting: true,
    enableHiding: false,
    meta: {
      headerTitle: "Member",
      fillWidth: true,
      headerClassName: "ps-5",
      cellClassName: "ps-5",
    },
  },
  {
    accessorKey: "email",
    id: "email",
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => (
      <span
        className="block truncate text-sm text-muted-foreground"
        title={row.original.email}
      >
        {row.original.email}
      </span>
    ),
    size: 200,
    enableSorting: true,
    meta: { headerTitle: "Email" },
  },
  {
    accessorKey: "access",
    id: "access",
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => <AccessBadge access={row.original.access} />,
    size: 120,
    enableSorting: true,
    meta: { headerTitle: "Access" },
  },
  {
    accessorKey: "role",
    id: "role",
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => (
      <span className="block truncate text-sm" title={row.original.role}>
        {row.original.role}
      </span>
    ),
    size: 140,
    enableSorting: true,
    meta: { headerTitle: "Role" },
  },
  {
    accessorKey: "team",
    id: "team",
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => (
      <span
        className="block truncate text-sm text-muted-foreground"
        title={row.original.team}
      >
        {row.original.team}
      </span>
    ),
    size: 120,
    enableSorting: true,
    meta: { headerTitle: "Team" },
  },
  {
    accessorKey: "status",
    id: "status",
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        className="text-sm font-medium text-foreground"
      />
    ),
    cell: ({ row }) => <MemberStatusBadge status={row.original.status} />,
    size: 120,
    enableSorting: true,
    meta: { headerTitle: "Status" },
  },
  {
    accessorKey: "lastActive",
    id: "lastActive",
    header: "Last active",
    cell: ({ row }) => (
      <span
        className="block truncate text-sm text-muted-foreground"
        title={row.original.lastActive}
      >
        {row.original.lastActive}
      </span>
    ),
    size: 120,
    enableSorting: false,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <MemberActionsCell row={row} />,
    size: 80,
    enableSorting: false,
    enableHiding: false,
    meta: { headerClassName: "text-center", cellClassName: "text-center" },
  },
]
