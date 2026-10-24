import { useState } from "react"

import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
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

import { type WorkflowItem } from "./data"
import { UI_ICONS } from "./icons"
import {
  APPS,
  enabledOf,
  formatDuration,
  formatItems,
  formatRelative,
  plural,
  STEP_KINDS,
  type WorkflowDetails,
  type WorkflowStep,
} from "./sheet-data"
import { DotSeparator } from "./value-faces"

type Show = "all" | "enabled" | "disabled"

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
]

function StepRow({
  step,
  items,
  lastRanAt,
  onToggle,
  onPreview,
  onRetry,
}: {
  step: WorkflowStep
  /** Items through this step over 28 days. */
  items: number
  lastRanAt: number | null
  onToggle: (step: WorkflowStep, enabled: boolean) => void
  onPreview: (step: WorkflowStep) => void
  onRetry: () => void
}) {
  const pii = step.columns.some((column) => column.pii)
  const failing = step.enabled && step.failure !== undefined
  return (
    // px-2 matches the 8px vertical inset: the tile sits 9px from every edge.
    <Item size="xs" className="px-2">
      {/* translate-y-0 centres the 40px tile; phones give its room to the name. */}
      <ItemMedia className="translate-y-0 max-sm:hidden">
        <IconTile variant="outline" aria-hidden="true">
          {STEP_KINDS[step.kind].icon}
        </IconTile>
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5 group-data-[size=xs]/item:gap-0.5">
        <ItemTitle className="max-w-full min-w-0">
          <button
            type="button"
            onClick={() => onPreview(step)}
            className="min-w-0 cursor-pointer truncate text-left font-mono underline-offset-2 hover:text-primary hover:underline"
          >
            {step.key}
          </button>
          {failing ? (
            <Badge variant="warning-light" className="shrink-0">
              Failed Last Run
            </Badge>
          ) : step.added ? (
            <Badge variant="info-light" className="shrink-0">
              New
            </Badge>
          ) : null}
        </ItemTitle>
        {/* One line: each dot travels with its segment, the tail truncates. */}
        <ItemDescription className="flex min-w-0 items-center gap-1.5 text-xs leading-normal tabular-nums">
          <span className="shrink-0">{formatItems(items)}</span>
          <span className="flex shrink-0 items-center gap-1.5 max-sm:hidden">
            <DotSeparator />
            {formatDuration(step.avgSec)} avg
          </span>
          <span className="flex min-w-0 items-center gap-1.5 sm:shrink-0">
            <DotSeparator />
            <span className="truncate">
              {step.enabled
                ? lastRanAt === null || step.added
                  ? "First run pending"
                  : `Ran ${formatRelative(lastRanAt)}`
                : "Skipped on every run"}
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
          {step.app ? (
            <span className="flex min-w-0 shrink-[4] items-center gap-1.5 max-sm:hidden">
              <DotSeparator />
              <span className="truncate">Uses {APPS[step.app].label}</span>
            </span>
          ) : null}
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
                  aria-label={`Retry ${step.key}`}
                  onClick={onRetry}
                />
              }
            >
              {UI_ICONS.sync}
            </TooltipTrigger>
            <TooltipContent>Retry the run</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Preview ${step.key}`}
                onClick={() => onPreview(step)}
              />
            }
          >
            {UI_ICONS.rows}
          </TooltipTrigger>
          <TooltipContent>Preview output</TooltipContent>
        </Tooltip>
        <Switch
          size="sm"
          checked={step.enabled}
          // The trigger starts every run, so it cannot be skipped.
          disabled={step.kind === "trigger"}
          onCheckedChange={(checked) => onToggle(step, checked)}
          aria-label={`Run ${step.key}`}
        />
      </ItemActions>
    </Item>
  )
}

export function StepsTab({
  workflow,
  details,
  onToggle,
  onPreview,
  onRetry,
  onOpenInEditor,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  onToggle: (step: WorkflowStep, enabled: boolean) => void
  onPreview: (step: WorkflowStep) => void
  onRetry: () => void
  onOpenInEditor: () => void
}) {
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<Show>("all")
  const query = search.trim().toLowerCase()
  const visible = details.steps.filter(
    (step) =>
      (show === "all" || step.enabled === (show === "enabled")) &&
      (!query || step.key.toLowerCase().includes(query))
  )
  const enabled = enabledOf(details)
  const lastRanAt = details.runs[0]?.startedAt ?? null
  const itemsThrough = workflow.runsSucceeded * details.itemsPerRun

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1 basis-40">
          <InputGroupAddon align="inline-start">
            {UI_ICONS.search}
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search steps..."
            aria-label="Search steps"
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
          aria-label="Steps shown"
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
            of {plural(details.steps.length, "step")} enabled
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onOpenInEditor}
          >
            {UI_ICONS.editor}
            Open in Editor
          </Button>
        </div>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">{UI_ICONS.search}</EmptyMedia>
                <EmptyTitle>No Steps Match</EmptyTitle>
                <EmptyDescription>
                  Try another name or show every step.
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
              {visible.map((step, index) => (
                <div key={step.id} role="listitem" className="contents">
                  {index > 0 ? <ItemSeparator className="my-0" /> : null}
                  <StepRow
                    step={step}
                    items={step.enabled && !step.added ? itemsThrough : 0}
                    lastRanAt={lastRanAt}
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
