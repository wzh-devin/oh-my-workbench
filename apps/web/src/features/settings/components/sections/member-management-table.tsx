"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/reui/badge"
import {
  DataGrid,
  dataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import {
  useTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { type MemberRecord, type MemberStatus } from "./data"
import {
  memberManagementColumns,
  MemberRowActionsContext,
  MemberStatusBadge,
  type MemberRowActions,
} from "./member-management-columns"
import {
  MemberSheet,
  RemoveMemberDialog,
  type MemberSheetActions,
  type MemberSheetMode,
} from "./member-sheet"
import { PLAN_SEATS } from "../live-status"
import { membersStore, useStore } from "../settings-store"
import { InviteMemberSheet } from "./invite-member-sheet"
import { MembersPagination } from "./members-pagination"
import { SearchIcon, XIcon, FilterIcon, UserPlusIcon } from "lucide-react"

/** A toast that carries Undo stays long enough to reach it by keyboard. */
const UNDO_TOAST_MS = 8000

const MEMBER_STATUS_ORDER: MemberStatus[] = [
  "Active",
  "Invited",
  "Needs review",
]
const EMPTY_MEMBER_STATUS_COUNTS: Record<MemberStatus, number> = {
  Active: 0,
  Invited: 0,
  "Needs review": 0,
}

function memberSearchBlob(member: MemberRecord): string {
  return [
    member.name,
    member.email,
    member.role,
    member.team,
    member.access,
    member.status,
    member.lastActive,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function getMemberStatusCounts(
  members: MemberRecord[]
): Record<MemberStatus, number> {
  const counts = { ...EMPTY_MEMBER_STATUS_COUNTS }

  for (const member of members) {
    counts[member.status] += 1
  }

  return counts
}

function MemberManagementToolbar({
  searchQuery,
  onSearchChange,
  selectedStatuses,
  onStatusChange,
  onClearFilters,
  hasActiveFilters,
  statusCounts,
  onInvite,
}: {
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedStatuses: MemberStatus[]
  onStatusChange: (checked: boolean, status: MemberStatus) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
  statusCounts: Record<MemberStatus, number>
  onInvite: () => void
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Actions */}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="w-full sm:max-w-sm">
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search members..."
            aria-label="Search members"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchQuery.length > 0 ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                size="icon-xs"
                onClick={() => onSearchChange("")}
              >
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                aria-label="Filter members by status"
              >
                <FilterIcon aria-hidden="true" />
                Status
                {selectedStatuses.length > 0 ? (
                  <Badge variant="info-light">{selectedStatuses.length}</Badge>
                ) : null}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="flex w-44 flex-col gap-2.5 p-3"
          >
            <span className="text-xs font-medium text-muted-foreground">
              Filter by status
            </span>
            {MEMBER_STATUS_ORDER.map((status) => (
              <div key={status} className="flex items-center gap-2.5">
                <Checkbox
                  id={`settings-member-status-${status.toLowerCase().replace(/\s+/g, "-")}`}
                  checked={selectedStatuses.includes(status)}
                  onCheckedChange={(checked) =>
                    onStatusChange(checked === true, status)
                  }
                />
                <Label
                  htmlFor={`settings-member-status-${status.toLowerCase().replace(/\s+/g, "-")}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 font-normal"
                >
                  <MemberStatusBadge status={status} />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {statusCounts[status] ?? 0}
                  </span>
                </Label>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* Where the block counts members: the pager below counts them too. */}
      <Button
        type="button"
        variant="outline"
        className="self-start sm:self-auto"
        onClick={onInvite}
      >
        <UserPlusIcon aria-hidden="true" />
        Invite member
      </Button>
    </div>
  )
}

export function MemberManagementTable() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatuses, setSelectedStatuses] = useState<MemberStatus[]>([])
  const members = useStore(membersStore)
  const setMembers = membersStore.set

  // The member sheet: which member, in which mode, and an open count that
  // starts the access form afresh each time.
  const [sheet, setSheet] = useState<{
    id: string | null
    mode: MemberSheetMode
    open: boolean
    session: number
  }>({ id: null, mode: "view", open: false, session: 0 })
  // Kept after closing, so the confirm holds its copy through the exit.
  const [removing, setRemoving] = useState<MemberRecord | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  // Invite Member (sheet-21): an empty form on every open.
  const [invite, setInvite] = useState({ open: false, session: 0 })

  const statusCounts = useMemo(() => getMemberStatusCounts(members), [members])

  const filteredData = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase()

    return members.filter((member) => {
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        memberSearchBlob(member).includes(normalizedSearchQuery)
      const matchesStatus =
        !selectedStatuses.length || selectedStatuses.includes(member.status)

      return matchesSearch && matchesStatus
    })
  }, [members, searchQuery, selectedStatuses])

  const hasActiveFilters =
    searchQuery.trim().length > 0 || selectedStatuses.length > 0

  const table = useTable({
    features: dataGridFeatures,
    columns: memberManagementColumns,
    defaultColumn: { enableResizing: false },
    data: filteredData,
    pageCount: Math.ceil(filteredData.length / pagination.pageSize),
    getRowId: (row) => row.id,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  })

  // J and K walk the list as it reads: sorted and filtered, across pages.
  const ordered = table
    .getPrePaginatedRowModel()
    .rows.map((row) => row.original)
  const sheetIndex = ordered.findIndex((member) => member.id === sheet.id)
  const sheetMember = members.find((member) => member.id === sheet.id)
  const ownerCount = members.filter(
    (member) => member.access === "Owner"
  ).length

  function openSheet(id: string, mode: MemberSheetMode) {
    setSheet((current) => ({
      id,
      mode,
      open: true,
      session: current.session + 1,
    }))
  }

  function restoreMember(original: MemberRecord, at: number) {
    setMembers((current) => {
      if (current.some((member) => member.id === original.id)) {
        return current.map((member) =>
          member.id === original.id ? original : member
        )
      }
      const next = [...current]
      next.splice(Math.min(at, next.length), 0, original)
      return next
    })
  }

  const sheetActions: MemberSheetActions = {
    save: (id, draft) => {
      const index = members.findIndex((member) => member.id === id)
      const original = members[index]
      if (!original) return
      setMembers((current) =>
        current.map((member) =>
          member.id === id ? { ...member, ...draft } : member
        )
      )
      toast.success("Access updated", {
        closeButton: true,
        description: `${original.name} is now ${draft.access === "Admin" || draft.access === "Owner" ? "an" : "a"} ${draft.access}.`,
        duration: UNDO_TOAST_MS,
        action: {
          label: "Undo",
          onClick: () => restoreMember(original, index),
        },
      })
    },
    requestRemove: (member) => {
      setRemoving(member)
      setRemoveOpen(true)
    },
    resendInvite: (member) =>
      toast.success("Invite resent", {
        closeButton: true,
        description: `A fresh invite went to ${member.email}.`,
      }),
    resetSession: (member) =>
      toast.success("Session reset", {
        closeButton: true,
        description: `${member.name} signs in again on their next visit.`,
      }),
  }

  const rowActions: MemberRowActions = {
    view: (id) => openSheet(id, "view"),
    changeAccess: (id) => openSheet(id, "edit"),
    resendInvite: sheetActions.resendInvite,
    resetSession: sheetActions.resetSession,
    requestRemove: sheetActions.requestRemove,
  }

  function confirmRemove() {
    const member = removing
    setRemoveOpen(false)
    if (!member) return
    const index = members.findIndex((item) => item.id === member.id)
    setMembers((current) => current.filter((item) => item.id !== member.id))
    if (sheet.id === member.id)
      setSheet((current) => ({ ...current, open: false }))
    toast.success("Access removed", {
      closeButton: true,
      description: `${member.name} can no longer open Flowly Labs.`,
      duration: UNDO_TOAST_MS,
      action: { label: "Undo", onClick: () => restoreMember(member, index) },
    })
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }))
  }

  const handleStatusChange = (checked: boolean, status: MemberStatus) => {
    setSelectedStatuses((current) =>
      checked ? [...current, status] : current.filter((item) => item !== status)
    )
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }))
  }

  const handleClearFilters = () => {
    setSearchQuery("")
    setSelectedStatuses([])
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }))
  }

  return (
    <MemberRowActionsContext.Provider value={rowActions}>
      <DataGrid
        table={table}
        recordCount={filteredData.length}
        emptyMessage={
          filteredData.length === 0
            ? "No members match your filters."
            : undefined
        }
        tableLayout={{
          columnsPinnable: false,
          columnsResizable: true,
          columnsMovable: false,
          columnsVisibility: false,
          headerSticky: false,
          dense: true,
        }}
      >
        <div className="flex flex-col">
          <MemberManagementToolbar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            selectedStatuses={selectedStatuses}
            onStatusChange={handleStatusChange}
            onClearFilters={handleClearFilters}
            hasActiveFilters={hasActiveFilters}
            statusCounts={statusCounts}
            onInvite={() =>
              setInvite((current) => ({
                open: true,
                session: current.session + 1,
              }))
            }
          />
          <Separator />
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
          <Separator />
          <div className="px-5 py-4">
            <MembersPagination
              table={table}
              recordCount={filteredData.length}
            />
          </div>
        </div>
      </DataGrid>

      <MemberSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        mode={sheet.mode}
        onModeChange={(mode) =>
          setSheet((current) => ({
            ...current,
            mode,
            session: current.session + 1,
          }))
        }
        member={sheetMember}
        index={Math.max(sheetIndex, 0)}
        total={ordered.length}
        onStep={(direction) => {
          const next = ordered[sheetIndex + direction]
          if (next) setSheet((current) => ({ ...current, id: next.id }))
        }}
        isLastOwner={sheetMember?.access === "Owner" && ownerCount === 1}
        session={sheet.session}
        actions={sheetActions}
      />
      <InviteMemberSheet
        open={invite.open}
        onOpenChange={(open) => setInvite((current) => ({ ...current, open }))}
        session={invite.session}
        teams={[...new Set(members.map((member) => member.team))]}
        takenEmails={members.map((member) => member.email.toLowerCase())}
        seatsLeft={PLAN_SEATS - members.length}
        onInvite={(draft) => {
          const initials = draft.name
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
          const member: MemberRecord = {
            id: `invite-${draft.email}`,
            name: draft.name,
            email: draft.email,
            role: draft.role || "New member",
            team: draft.team,
            access: draft.access,
            status: "Invited",
            lastActive: "Invited just now",
            src: "",
            initials,
            areas: draft.areas,
          }
          setMembers((current) => [...current, member])
          toast.success("Invite sent", {
            closeButton: true,
            description: `${draft.email} joins as ${/^[AEIOU]/.test(draft.access) ? "an" : "a"} ${draft.access}.`,
            duration: UNDO_TOAST_MS,
            action: {
              label: "Undo",
              onClick: () =>
                setMembers((current) =>
                  current.filter((item) => item.id !== member.id)
                ),
            },
          })
        }}
      />
      <RemoveMemberDialog
        member={removing}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={confirmRemove}
      />
    </MemberRowActionsContext.Provider>
  )
}
