import { useState } from "react"

import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { type AgentRecord } from "./data"
import { UI_ICONS } from "./icons"
import {
  APPS,
  callsOf,
  enabledOf,
  formatCalls,
  formatLatency,
  formatRelative,
  hoursOf,
  plural,
  sessionCountOf,
  TOOL_KINDS,
  type AgentDetails,
  type AgentTool,
} from "./sheet-data"
import { DotSeparator, ToolLogo } from "./value-faces"

type Show = "all" | "enabled" | "disabled"

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
]

function ToolRow({
  tool,
  calls,
  lastSessionAt,
  onToggle,
  onPreview,
  onRetry,
}: {
  tool: AgentTool
  /** Calls to this tool over the last 24 hours. */
  calls: number
  lastSessionAt: number | null
  onToggle: (tool: AgentTool, enabled: boolean) => void
  onPreview: (tool: AgentTool) => void
  onRetry: () => void
}) {
  const pii = tool.columns.some((column) => column.pii)
  const failing = tool.enabled && tool.failure !== undefined
  return (
    // px-2 matches the 8px vertical inset: the tile sits 9px from every edge.
    <Item size="xs" className="px-2">
      {/* translate-y-0 centres the 40px tile; phones give its room to the name. */}
      <ItemMedia className="translate-y-0 max-sm:hidden">
        <ToolLogo tool={tool} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5 group-data-[size=xs]/item:gap-0.5">
        <ItemTitle className="max-w-full min-w-0">
          <button
            type="button"
            onClick={() => onPreview(tool)}
            className="min-w-0 cursor-pointer truncate text-left font-mono underline-offset-2 hover:text-primary hover:underline"
          >
            {tool.key}
          </button>
          {failing ? (
            <Badge variant="warning-light" className="shrink-0">
              Failed Last Call
            </Badge>
          ) : tool.added ? (
            <Badge variant="info-light" className="shrink-0">
              New
            </Badge>
          ) : null}
        </ItemTitle>
        {/* One line: each dot travels with its segment, the tail truncates. */}
        <ItemDescription className="flex min-w-0 items-center gap-1.5 text-xs leading-normal tabular-nums">
          <span className="shrink-0">{formatCalls(calls)} in 24h</span>
          <span className="flex shrink-0 items-center gap-1.5 max-sm:hidden">
            <DotSeparator />
            {formatLatency(tool.avgMs)} avg
          </span>
          <span className="flex min-w-0 items-center gap-1.5 sm:shrink-0">
            <DotSeparator />
            <span className="truncate">
              {failing
                ? tool.failure
                : tool.enabled
                  ? lastSessionAt === null || tool.added
                    ? "First call pending"
                    : `Called ${formatRelative(lastSessionAt)}`
                  : "Off for every session"}
            </span>
          </span>
          {pii ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <DotSeparator />
              <span className="inline-flex items-center gap-1 [&_svg:not([class*=size-])]:size-3">
                {UI_ICONS.lock}
                PII
              </span>
            </span>
          ) : null}
          <span className="flex min-w-0 shrink-[4] items-center gap-1.5 max-sm:hidden">
            <DotSeparator />
            <span className="truncate">
              {TOOL_KINDS[tool.kind].label} via{" "}
              {tool.app ? APPS[tool.app].label : "HTTP"}
            </span>
          </span>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-1">
        {failing ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Retry ${tool.key}`}
                  onClick={onRetry}
                />
              }
            >
              {UI_ICONS.sync}
            </TooltipTrigger>
            <TooltipContent>Retry in a test session</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Preview ${tool.key}`}
                onClick={() => onPreview(tool)}
              />
            }
          >
            {UI_ICONS.rows}
          </TooltipTrigger>
          <TooltipContent>Preview output</TooltipContent>
        </Tooltip>
        <Switch
          size="sm"
          checked={tool.enabled}
          onCheckedChange={(checked) => onToggle(tool, checked)}
          aria-label={`Enable ${tool.key}`}
        />
      </ItemActions>
    </Item>
  )
}

export function ToolsTab({
  agent,
  details,
  onToggle,
  onPreview,
  onRetry,
  onOpenInBuilder,
}: {
  agent: AgentRecord
  details: AgentDetails
  onToggle: (tool: AgentTool, enabled: boolean) => void
  onPreview: (tool: AgentTool) => void
  onRetry: () => void
  onOpenInBuilder: () => void
}) {
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<Show>("all")
  const query = search.trim().toLowerCase()
  const visible = details.tools.filter(
    (tool) =>
      (show === "all" || tool.enabled === (show === "enabled")) &&
      (!query || tool.key.toLowerCase().includes(query))
  )
  const enabled = enabledOf(details)
  const lastSessionAt = details.sessions[0]?.startedAt ?? null
  // The same window as the Overview chart, so the two counts agree.
  const sessions = sessionCountOf(hoursOf(agent, details.sessions))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1 basis-40">
          <InputGroupAddon align="inline-start">
            {UI_ICONS.search}
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search tools..."
            aria-label="Search tools"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                size="icon-xs"
                onClick={() => setSearch("")}
              >
                {UI_ICONS.close}
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <ToggleGroup
          multiple={false}
          value={[show]}
          onValueChange={(value: string[]) => {
            const next = SHOW_OPTIONS.find((item) => item.value === value[0])
            if (next) setShow(next.value)
          }}
          variant="outline"
          spacing={0}
          aria-label="Tools shown"
        >
          {SHOW_OPTIONS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="text-muted-foreground data-pressed:text-foreground"
            >
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Card className="min-w-0 gap-0 py-0">
        {/* px-2.5 puts the text on the rows' tile spine, 9px in from the card. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 py-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              {enabled.length}
            </span>{" "}
            of {plural(details.tools.length, "tool")} enabled
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onOpenInBuilder}
          >
            {UI_ICONS.editor}
            Open in Builder
          </Button>
        </div>
        <CardContent className="p-0">
          {details.tools.length === 0 ? (
            // A new agent: nothing to search yet, so the way in is the Builder.
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">{UI_ICONS.tool}</EmptyMedia>
                <EmptyTitle>No Tools Yet</EmptyTitle>
                <EmptyDescription>
                  Connect tools in the Builder to let this agent act.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onOpenInBuilder}
                >
                  Open in Builder
                </Button>
              </EmptyContent>
            </Empty>
          ) : visible.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">{UI_ICONS.search}</EmptyMedia>
                <EmptyTitle>No Tools Match</EmptyTitle>
                <EmptyDescription>
                  Try another name or show every tool.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearch("")
                    setShow("all")
                  }}
                >
                  Clear
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            // No group inset: the separators run edge to edge of the card.
            <ItemGroup className="gap-0 has-data-[size=xs]:gap-0">
              {visible.map((tool, index) => (
                <div key={tool.id} role="listitem" className="contents">
                  {index > 0 ? <ItemSeparator className="my-0" /> : null}
                  <ToolRow
                    tool={tool}
                    calls={callsOf(tool, sessions)}
                    lastSessionAt={lastSessionAt}
                    onToggle={onToggle}
                    onPreview={onPreview}
                    onRetry={onRetry}
                  />
                </div>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </>
  )
}
