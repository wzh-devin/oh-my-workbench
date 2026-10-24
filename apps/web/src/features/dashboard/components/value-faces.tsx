import { IconTile } from "@/components/reui/icon-tile"
import { cn } from "cn"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { type TeamMember } from "@/lib/workspace/team"

import { INTEGRATIONS, type IntegrationId } from "./ops-data"

/** The app's mark in an outline tile; the tile sizes the logo. */
export function IntegrationLogo({
  integration,
  size = "default",
  className,
}: {
  integration: IntegrationId
  size?: "xs" | "sm" | "default"
  className?: string
}) {
  return (
    <IconTile
      variant="outline"
      size={size}
      aria-hidden="true"
      className={className}
    >
      {INTEGRATIONS[integration].logo}
    </IconTile>
  )
}

export function IntegrationFace({
  integration,
}: {
  integration: IntegrationId
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <IntegrationLogo integration={integration} size="xs" />
      <span className="truncate">{INTEGRATIONS[integration].label}</span>
    </span>
  )
}

/** The face sits at text height: size-5 beside text-sm, size-4 in xs rows. */
export function OwnerFace({
  owner,
  compact = false,
}: {
  owner: TeamMember
  compact?: boolean
}) {
  return (
    <span
      className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}
    >
      {/* The local Avatar's data-[size=sm]:size-6 outranks a plain size-4;
          the block's face is 16px (20px beside text-sm). */}
      <Avatar
        size="sm"
        className={
          compact
            ? "size-4 data-[size=sm]:size-4"
            : "size-5 data-[size=sm]:size-5"
        }
      >
        <AvatarImage src={owner.avatarSrc} alt="" />
        <AvatarFallback className={compact ? "text-[8px]" : "text-[9px]"}>
          {owner.initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{owner.name}</span>
    </span>
  )
}
