import { useEffect, useRef, type ReactNode } from "react"
import { Badge, type BadgeProps } from "@/components/reui/badge"
import { cn } from "cn"

import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { type Workflow } from "@/lib/workspace/workflows"

import { TOAST_ERROR_ICON, TOAST_SUCCESS_ICON, UI_ICONS } from "./icons"
import {
  formatClock,
  formatCount,
  formatRelative,
  healthOf,
  opsOf,
  plural,
} from "./ops-data"
import { SectionHeader } from "./section-header"
import { IntegrationFace, IntegrationLogo, OwnerFace } from "./value-faces"

type Kind = "failing" | "degraded" | "paused"

type Act = (origin: HTMLElement, fallback: () => HTMLElement | null) => void

type Issue = {
  key: string
  kind: Kind
  workflow: Workflow
  label: string
  variant: BadgeProps["variant"]
  /** The full story, revealed in the row's hover card. */
  detail: string
  since: string | null
  action: { label: string; icon: ReactNode; run: Act }
}

export type AttentionHandlers = {
  /** Opens the workflow's sheet on Workflows. */
  onOpenWorkflow: (workflow: Workflow) => void
  /** Opens the workflow on the editor's canvas. */
  onEditWorkflow: (workflow: Workflow) => void
  onResume: (ids: string[]) => void
  /** Starts a run of each now, outside its trigger. */
  onRerun: (ids: string[]) => void
}

/** Everything a person has to act on, worst first: one row per problem. */
function issuesOf(workflows: Workflow[], handlers: AttentionHandlers) {
  const issues: Issue[] = []
  for (const workflow of workflows) {
    if (healthOf(workflow) !== "failing") continue
    const ops = opsOf(workflow)
    issues.push({
      key: `${workflow.id}-failing`,
      kind: "failing",
      workflow,
      label: "Failing",
      variant: "destructive-light",
      detail: ops.issue ?? "The last runs failed.",
      since: ops.failingSince
        ? `Since ${formatClock(Date.parse(ops.failingSince))} UTC`
        : null,
      action: {
        label: "Fix in Editor",
        icon: UI_ICONS.edit,
        run: () => handlers.onEditWorkflow(workflow),
      },
    })
  }
  for (const workflow of workflows) {
    if (healthOf(workflow) !== "degraded") continue
    issues.push({
      key: `${workflow.id}-degraded`,
      kind: "degraded",
      workflow,
      label: "Degraded",
      variant: "warning-light",
      detail:
        opsOf(workflow).issue ??
        `${workflow.successRate}% of runs succeeded in 28 days.`,
      since: null,
      action: {
        label: "Review",
        icon: UI_ICONS.view,
        run: () => handlers.onOpenWorkflow(workflow),
      },
    })
  }
  for (const workflow of workflows) {
    // One that has never run is a draft, not a stopped workflow to resume.
    if (healthOf(workflow) !== "paused" || workflow.lastRunAt === null) continue
    const note = opsOf(workflow).pauseNote
    issues.push({
      key: `${workflow.id}-paused`,
      kind: "paused",
      workflow,
      label: "Paused",
      variant: "outline",
      detail: note ? `${note}.` : "Runs are on hold.",
      since: workflow.lastRunAt
        ? `Last ran ${formatRelative(Date.parse(workflow.lastRunAt))}`
        : null,
      action: {
        label: "Resume",
        icon: UI_ICONS.resume,
        run: () => handlers.onResume([workflow.id]),
      },
    })
  }
  return issues
}

function summaryOf(issues: Issue[]) {
  return issues
    .map((issue) => `${issue.label}: ${issue.workflow.name}. ${issue.detail}`)
    .join("\n")
}

/** The row's detail on hover: the issue, then who owns it and how it runs. */
function IssueCard({ issue }: { issue: Issue }) {
  const { workflow } = issue
  const rows: [string, ReactNode][] = [
    ["App", <IntegrationFace key="app" integration={opsOf(workflow).app} />],
    ["Owner", <OwnerFace key="owner" owner={workflow.owner} compact />],
    [
      "Last run",
      workflow.lastRunAt
        ? formatRelative(Date.parse(workflow.lastRunAt))
        : "None yet",
    ],
    [
      "Runs",
      `${formatCount(workflow.runsSucceeded)} of ${formatCount(workflow.runs)} succeeded`,
    ],
    ["Trigger", workflow.cadence],
  ]
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{workflow.name}</span>
        <Badge variant={issue.variant} className="shrink-0">
          {issue.label}
        </Badge>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        {issue.since ? `${issue.since}: ` : ""}
        {issue.detail}
      </p>
      <Separator />
      <dl className="flex flex-col gap-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-0 items-center justify-between gap-3"
          >
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 justify-end truncate text-right tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}

export function AttentionList({
  workflows,
  className,
  ...handlers
}: AttentionHandlers & { workflows: Workflow[]; className?: string }) {
  const issues = issuesOf(workflows, handlers)
  // Action buttons by issue key: a fix removes its own row, so focus moves on.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const menuRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<string | null>(null)

  /** The next surviving action, else the first, else the header menu. */
  const focusTarget = (key: string | null) =>
    (key ? buttons.current.get(key) : undefined) ??
    buttons.current.values().next().value ??
    menuRef.current

  useEffect(() => {
    const key = pendingFocus.current
    if (key === null) return
    pendingFocus.current = null
    focusTarget(key)?.focus({ preventScroll: true })
  })

  function neighbourOf(key: string) {
    const index = issues.findIndex((issue) => issue.key === key)
    return issues[index + 1]?.key ?? issues[index - 1]?.key ?? null
  }

  const idsOf = (kind: Kind) =>
    issues
      .filter((issue) => issue.kind === kind)
      .map((issue) => issue.workflow.id)
  const pausedIds = idsOf("paused")
  const failingIds = idsOf("failing")
  const slowIds = idsOf("degraded")

  function copySummary() {
    const failed = () =>
      toast.error("Copy failed", {
        icon: TOAST_ERROR_ICON,
        description: "Clipboard access was blocked.",
        closeButton: true,
      })
    // Clipboard access can be refused (an iframe, an insecure origin), so both paths answer.
    if (!navigator.clipboard) {
      failed()
      return
    }
    navigator.clipboard.writeText(summaryOf(issues)).then(
      () =>
        toast.success("Summary copied", {
          icon: TOAST_SUCCESS_ICON,
          description: plural(issues.length, "item"),
          closeButton: true,
        }),
      failed
    )
  }

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <SectionHeader
        title="Needs Attention"
        description={
          issues.length > 0
            ? `${plural(issues.length, "item")}, worst first`
            : "Nothing waiting on you"
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={menuRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Attention actions"
              />
            }
          >
            {UI_ICONS.more}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Fix in bulk</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={pausedIds.length === 0}
                onClick={() => handlers.onResume(pausedIds)}
              >
                {UI_ICONS.resume}
                Resume Paused
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={failingIds.length === 0}
                onClick={() => handlers.onRerun(failingIds)}
              >
                {UI_ICONS.sync}
                Re-run Failing Now
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={slowIds.length === 0}
                onClick={() => handlers.onRerun(slowIds)}
              >
                {UI_ICONS.sync}
                Re-run Degraded Now
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={issues.length === 0}
                onClick={copySummary}
              >
                {UI_ICONS.copy}
                Copy Summary
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SectionHeader>
      <CardContent className="flex-1 py-4">
        {issues.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">{UI_ICONS.shield}</EmptyMedia>
              <EmptyTitle>All Clear</EmptyTitle>
              <EmptyDescription>
                Every workflow is healthy and running.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0 has-data-[size=xs]:gap-0">
            {/* The local ItemGroup's has-[size=xs]:gap-2 outranks a plain
                gap-0; the block's rows touch, as on its preview. */}
            {issues.map((issue) => (
              // Rows sit on the panel's own inset: no second side padding.
              <Item key={issue.key} size="xs" className="px-0">
                <ItemMedia>
                  <IntegrationLogo
                    integration={opsOf(issue.workflow).app}
                    size="xs"
                  />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full min-w-0">
                    {/* Hover or focus reveals the detail; a click opens the workflow. */}
                    <HoverCard>
                      <HoverCardTrigger
                        render={
                          <button
                            type="button"
                            onClick={() =>
                              handlers.onOpenWorkflow(issue.workflow)
                            }
                            className="min-w-0 cursor-pointer truncate text-left underline-offset-2 outline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring/50"
                          />
                        }
                      >
                        {issue.workflow.name}
                      </HoverCardTrigger>
                      <HoverCardContent
                        align="start"
                        className="flex w-80 flex-col gap-2.5"
                      >
                        <IssueCard issue={issue} />
                      </HoverCardContent>
                    </HoverCard>
                    <Badge variant={issue.variant} className="shrink-0">
                      {issue.label}
                    </Badge>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          ref={(node) => {
                            if (node) buttons.current.set(issue.key, node)
                            else buttons.current.delete(issue.key)
                          }}
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label={`${issue.action.label} ${issue.workflow.name}`}
                          onClick={(event) => {
                            const neighbour = neighbourOf(issue.key)
                            // Resume removes the row at once; the others leave the page.
                            if (issue.kind === "paused")
                              pendingFocus.current = neighbour
                            issue.action.run(event.currentTarget, () =>
                              focusTarget(neighbour)
                            )
                          }}
                        />
                      }
                    >
                      {issue.action.icon}
                    </TooltipTrigger>
                    <TooltipContent>{issue.action.label}</TooltipContent>
                  </Tooltip>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}
