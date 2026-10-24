/**
 * One face per value. The sheet header, its tabs and the form selects all
 * render through these, so a value reads the same everywhere.
 */
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { findTeamMember } from "@/lib/workspace/team"

import { type AgentModel } from "./data"
import {
  AGENT_HEALTH,
  APPS,
  COLUMN_TYPES,
  ENVIRONMENTS,
  MODEL_LOGO,
  TOOL_KINDS,
  type AgentHealth,
  type AgentTool,
  type AppId,
  type ColumnType,
  type Environment,
} from "./sheet-data"

type TileSize = "xs" | "sm" | "default"

export function DotSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1 shrink-0 rounded-full bg-muted-foreground/40",
        className
      )}
    />
  )
}

export function HealthFace({ health }: { health: AgentHealth }) {
  const config = AGENT_HEALTH[health]
  return (
    <Badge variant={config.variant}>
      {/* Decorative: the badge text already says Running. */}
      {health === "running" ? (
        <Spinner
          role="presentation"
          aria-label={undefined}
          aria-hidden="true"
        />
      ) : null}
      {config.label}
    </Badge>
  )
}

export function EnvironmentFace({ environment }: { environment: Environment }) {
  return <Badge variant="outline">{ENVIRONMENTS[environment].label}</Badge>
}

/** The app's mark in an outline tile; the tile sizes the logo. */
function AppLogo({
  app,
  size = "default",
  className,
}: {
  app: AppId
  size?: TileSize
  className?: string
}) {
  return (
    <IconTile
      variant="outline"
      size={size}
      aria-hidden="true"
      className={className}
    >
      {APPS[app].logo}
    </IconTile>
  )
}

export function AppFace({
  app,
  detail,
}: {
  app: AppId
  /** Where on the app, beside its name: "Slack #data-alerts". */
  detail?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AppLogo app={app} size="xs" />
      {/* The app's name holds; a long detail truncates first. */}
      <span className={cn("truncate", detail && "shrink-0")}>
        {APPS[app].label}
      </span>
      {detail ? (
        <span className="truncate text-muted-foreground">{detail}</span>
      ) : null}
    </span>
  )
}

/** The model maker's mark in an outline tile: the title row's logo. */
export function ModelLogo({
  model,
  size = "default",
  className,
}: {
  model: AgentModel
  size?: TileSize
  className?: string
}) {
  return (
    <IconTile
      variant="outline"
      size={size}
      aria-hidden="true"
      className={className}
    >
      {MODEL_LOGO[model]}
    </IconTile>
  )
}

/** A tool's tile: its app's mark, or its kind's glyph for a plain request. */
export function ToolLogo({
  tool,
  size = "default",
  className,
}: {
  tool: Pick<AgentTool, "app" | "kind">
  size?: TileSize
  className?: string
}) {
  if (tool.app)
    return <AppLogo app={tool.app} size={size} className={className} />
  return (
    <IconTile
      variant="outline"
      size={size}
      aria-hidden="true"
      className={className}
    >
      {TOOL_KINDS[tool.kind].icon}
    </IconTile>
  )
}

/** A field's type glyph; the label rides along in the schema view only. */
export function ColumnTypeGlyph({
  type,
  className,
}: {
  type: ColumnType
  className?: string
}) {
  return (
    <span
      title={COLUMN_TYPES[type].label}
      className={cn(
        "flex shrink-0 text-muted-foreground [&_svg:not([class*=size-])]:size-3.5",
        className
      )}
    >
      {COLUMN_TYPES[type].icon}
    </span>
  )
}

/** The face sits at text height: size-5 beside text-sm, size-4 in xs rows. */
export function OwnerAvatar({
  owner: nameOrId,
  compact = false,
}: {
  owner: string
  compact?: boolean
}) {
  const owner = findTeamMember(nameOrId)
  if (!owner) return null
  return (
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
  )
}

export function OwnerFace({
  owner: nameOrId,
  compact = false,
}: {
  owner: string
  compact?: boolean
}) {
  const owner = findTeamMember(nameOrId)
  if (!owner) return <span className="text-muted-foreground">Unassigned</span>
  return (
    <span
      className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}
    >
      <OwnerAvatar owner={owner.id} compact={compact} />
      <span className="truncate">{owner.name}</span>
    </span>
  )
}
