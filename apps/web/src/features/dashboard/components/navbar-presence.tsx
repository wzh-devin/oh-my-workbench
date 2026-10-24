"use client"

import { useState } from "react"
import { UserPlusIcon } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { CollaboratorInviteDialog } from "./collaborator-invite-dialog"
import { TEAM_EXTRA_COUNT, TEAM_MEMBERS } from "./data"

// Navbar presence with team avatars, and Invite opening the dialog-8 invite

export function NavbarPresence() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* List */}
      <AvatarGroup>
        {TEAM_MEMBERS.map((member) => (
          <Avatar key={member.name} size="sm">
            <AvatarImage src={member.src} alt={member.name} />
            <AvatarFallback className="text-[8px]">
              {member.initials}
            </AvatarFallback>
          </Avatar>
        ))}
        <AvatarGroupCount>+{TEAM_EXTRA_COUNT}</AvatarGroupCount>
      </AvatarGroup>

      <Separator orientation="vertical" className="my-auto h-4" />

      <Button
        variant="outline"
        aria-label="Invite team member"
        onClick={() => setOpen(true)}
      >
        <UserPlusIcon aria-hidden="true" />
        <span className="hidden md:block">Invite</span>
      </Button>

      <CollaboratorInviteDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
