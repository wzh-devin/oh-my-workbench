import { useId, type ReactNode } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "cn"
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

import { type AgentRecord } from "@/lib/workspace/agents"
import { type Workflow } from "@/lib/workspace/workflows"

import { UI_ICONS } from "./icons"
import {
  agentHealthOf,
  DAY_MS,
  FAILED_BY_DAY,
  failedRunsOf,
  formatCompact,
  formatDay,
  formatDelta,
  healthOf,
  HEALTHY_YESTERDAY,
  LIVE_LAST_WEEK,
  REFERENCE_MS,
  RUNS_BY_DAY,
  runsOf,
  triageOrder,
} from "./ops-data"

type Segment = { key: string; label: string; count: number; tone: string }

// State tokens, never --chart-N: those flip hue between themes.
const TREND_CONFIG = {
  rows: { label: "Runs", color: "var(--success)" },
} satisfies ChartConfig

/** Change against a baseline: a toned arrow, then the share. Tone follows
 *  meaning, not direction: more failures is up and still bad. */
function DeltaChip({
  current,
  previous,
  better,
  basis,
}: {
  current: number
  previous: number
  better: "up" | "down"
  basis: string
}) {
  const share = formatDelta(current, previous)
  if (share === null || current === previous) return null
  const up = current > previous
  const good = up === (better === "up")
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 font-mono text-sm font-medium tabular-nums",
        good ? "text-success" : "text-destructive"
      )}
    >
      {/* The arrow inherits the value's tone, so the pair reads as one signal. */}
      <span
        aria-hidden="true"
        className="flex [&_svg:not([class*=size-])]:size-3.5"
      >
        {up ? UI_ICONS.up : UI_ICONS.down}
      </span>
      {share}
      <span className="sr-only">
        {up ? "up" : "down"} {basis}
      </span>
    </span>
  )
}

/** The shared card: header, value with its change, a basis line, the
 *  card's own picture, and a footer action pinned under the panel. */
function StatCard({
  icon,
  title,
  period,
  value,
  total,
  delta,
  basis,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  /** The window the card's picture covers. */
  period: string
  value: string
  total?: number
  delta: ReactNode
  basis: string
  children?: ReactNode
  action: { label: string; onClick: (origin: HTMLElement) => void }
}) {
  return (
    <Card className="h-full min-w-0 gap-0 py-0">
      <CardContent className="flex flex-1 flex-col gap-3 py-4">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground [&_svg:not([class*=size-])]:size-4">
          {icon}
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="ms-auto shrink-0 text-xs">{period}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
              {value}
              {total === undefined ? null : (
                <span className="text-base font-normal text-muted-foreground">
                  /{total}
                </span>
              )}
            </span>
            {delta}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {basis}
          </span>
        </div>
        {children}
      </CardContent>
      <CardFooter className="px-4 py-2">
        <button
          type="button"
          onClick={(event) => action.onClick(event.currentTarget)}
          className="group/action flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="truncate">{action.label}</span>
          <span className="flex shrink-0 transition-transform duration-150 group-hover/action:translate-x-0.5 motion-reduce:transition-none [&_svg:not([class*=size-])]:size-4">
            {UI_ICONS.go}
          </span>
        </button>
      </CardFooter>
    </Card>
  )
}

/** One rounded run per group, sized by its count, then a counted legend. */
function SegmentBar({
  segments,
  label,
}: {
  segments: Segment[]
  label: string
}) {
  const shown = segments.filter((segment) => segment.count > 0)
  return (
    <div className="mt-auto flex flex-col gap-2.5">
      <div
        role="img"
        aria-label={`${label}: ${shown.map((segment) => `${segment.count} ${segment.label.toLowerCase()}`).join(", ")}`}
        className="flex h-2 w-full gap-1"
      >
        {shown.map((segment) => (
          <span
            key={segment.key}
            className={cn("h-full min-w-1 rounded-full", segment.tone)}
            style={{ flexGrow: segment.count }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="flex min-w-0 items-center gap-1.5 text-xs"
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", segment.tone)}
            />
            <dt className="min-w-0 truncate text-muted-foreground">
              {segment.label}
            </dt>
            <dd className="ms-auto font-medium tabular-nums">
              {segment.count}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

type TrendPoint = { day: string; rows: number }

/** Daily rows across the card's full width, today marked by a ringed dot
 *  on a dashed guide. */
function TrendArea({ points, good }: { points: TrendPoint[]; good: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const fillId = `stat-fill-${uid}`
  const tone = good ? "var(--success)" : "var(--destructive)"
  const last = points[points.length - 1]
  const values = points.map((point) => point.rows)
  // A low floor keeps the day-to-day swing gentle, as a trend should read.
  const floor = Math.min(...values) * 0.45
  return (
    <div
      role="img"
      aria-label={`Workflow runs per day, last ${points.length} days, today ${formatCompact(last.rows)}`}
      className="mt-auto h-14 w-full"
    >
      <ChartContainer
        config={TREND_CONFIG}
        className="aspect-auto h-14 w-full"
        initialDimension={{ width: 240, height: 56 }}
      >
        <AreaChart
          data={points}
          accessibilityLayer={false}
          margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.24} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" hide />
          <YAxis hide domain={[floor, "dataMax"]} />
          <ReferenceLine
            x={last.day}
            stroke={tone}
            strokeOpacity={0.5}
            strokeDasharray="2 3"
          />
          <Area
            dataKey="rows"
            type="monotone"
            baseValue={floor}
            stroke={tone}
            strokeWidth={1.5}
            fill={`url(#${fillId})`}
            fillOpacity={1}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={last.day}
            y={last.rows}
            r={4}
            fill={tone}
            stroke="var(--card)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

/** Failures per day on tracks across the card's full width; today stands out. */
function DayBars({ values }: { values: number[] }) {
  const peak = Math.max(1, ...values)
  return (
    <div
      role="img"
      aria-label={`Failed runs per day, last ${values.length} days: ${values.join(", ")}`}
      className="mt-auto flex h-14 w-full items-end gap-1"
    >
      {values.map((value, index) => (
        // The track and the fill are siblings: neither wraps content.
        <span key={index} className="relative h-full flex-1">
          <span className="absolute inset-0 rounded-full bg-muted" />
          {value > 0 ? (
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 rounded-full",
                index === values.length - 1
                  ? "bg-destructive"
                  : "bg-destructive/40"
              )}
              style={{ height: `${Math.max((value / peak) * 100, 14)}%` }}
            />
          ) : null}
        </span>
      ))}
    </div>
  )
}

/** Opens a page: a record's sheet on Workflows or Agents, or a list. */
type Navigate = (href: string) => void

export function StatCards({
  workflows,
  agents,
  onNavigate,
}: {
  workflows: Workflow[]
  agents: AgentRecord[]
  onNavigate: Navigate
}) {
  // Grouped as the grid reads them: off is Paused, a failed last run Failing.
  const triaged = triageOrder(workflows)
  const failing = triaged.filter((workflow) => healthOf(workflow) === "failing")
  const degraded = triaged.filter(
    (workflow) => healthOf(workflow) === "degraded"
  )
  const paused = triaged.filter((workflow) => healthOf(workflow) === "paused")
  const healthy =
    workflows.length - failing.length - degraded.length - paused.length
  const worst = failing[0] ?? degraded[0] ?? paused[0] ?? null

  const live = agents.filter((agent) => agentHealthOf(agent) === "live")
  const attention = agents.filter(
    (agent) => agentHealthOf(agent) === "attention"
  )
  const liveCount = agents.filter((agent) => agent.status === "Live").length

  const runsToday = workflows.reduce(
    (sum, workflow) => sum + runsOf(workflow),
    0
  )
  const runSeries = [...RUNS_BY_DAY, runsToday]
  const runPoints = runSeries.map((rows, index) => ({
    day: formatDay(REFERENCE_MS - (runSeries.length - 1 - index) * DAY_MS),
    rows,
  }))
  const runsYesterday = RUNS_BY_DAY[RUNS_BY_DAY.length - 1]
  const busiest =
    [...workflows].sort((a, b) => runsOf(b) - runsOf(a))[0] ?? null

  const failedBy = workflows
    .map((workflow) => ({ workflow, failed: failedRunsOf(workflow) }))
    .filter((entry) => entry.failed > 0)
    .sort((a, b) => b.failed - a.failed)
  const failedToday = failedBy.reduce((sum, entry) => sum + entry.failed, 0)
  const failedYesterday = FAILED_BY_DAY[FAILED_BY_DAY.length - 1]

  const allWorkflows = {
    label: "View all workflows",
    onClick: () => onNavigate("/workflows"),
  }
  const openWorkflow = (workflow: Workflow) => ({
    label: `View ${workflow.name}`,
    onClick: () => onNavigate(`/workflows?open=${workflow.id}`),
  })

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:gap-3">
      <StatCard
        icon={UI_ICONS.workflow}
        title="Workflow Health"
        period="Now"
        value={String(healthy)}
        total={workflows.length}
        delta={
          <DeltaChip
            current={healthy}
            previous={HEALTHY_YESTERDAY}
            better="up"
            basis="against yesterday"
          />
        }
        basis={`${HEALTHY_YESTERDAY} healthy yesterday`}
        action={worst ? openWorkflow(worst) : allWorkflows}
      >
        <SegmentBar
          label="Workflows by health"
          segments={[
            {
              key: "healthy",
              label: "Healthy",
              count: healthy,
              tone: "bg-success",
            },
            {
              key: "degraded",
              label: "Degraded",
              count: degraded.length,
              tone: "bg-warning",
            },
            {
              key: "failing",
              label: "Failing",
              count: failing.length,
              tone: "bg-destructive",
            },
            {
              key: "paused",
              label: "Paused",
              count: paused.length,
              tone: "bg-muted-foreground/40",
            },
          ]}
        />
      </StatCard>

      <StatCard
        icon={UI_ICONS.agent}
        title="Live Agents"
        period="Now"
        value={String(liveCount)}
        total={agents.length}
        delta={
          <DeltaChip
            current={liveCount}
            previous={LIVE_LAST_WEEK}
            better="up"
            basis="against last week"
          />
        }
        basis={`${LIVE_LAST_WEEK} live last week`}
        action={
          attention[0]
            ? {
                label: `Review ${attention[0].name}`,
                onClick: () => onNavigate(`/agents?open=${attention[0].id}`),
              }
            : {
                label: "View all agents",
                onClick: () => onNavigate("/agents"),
              }
        }
      >
        <SegmentBar
          label="Agents by state"
          segments={[
            {
              key: "live",
              label: "Live",
              count: live.length,
              tone: "bg-info",
            },
            {
              key: "attention",
              label: "Need review",
              count: attention.length,
              tone: "bg-warning",
            },
            {
              key: "idle",
              label: "Draft or paused",
              count: agents.length - live.length - attention.length,
              tone: "bg-muted-foreground/30",
            },
          ]}
        />
      </StatCard>

      <StatCard
        icon={UI_ICONS.activity}
        title="Workflow Runs"
        period={`${runPoints.length} days`}
        value={formatCompact(runsToday)}
        delta={
          <DeltaChip
            current={runsToday}
            previous={runsYesterday}
            better="up"
            basis="against yesterday"
          />
        }
        basis={`${formatCompact(runsYesterday)} yesterday`}
        action={busiest ? openWorkflow(busiest) : allWorkflows}
      >
        <TrendArea points={runPoints} good={runsToday >= runsYesterday} />
      </StatCard>

      <StatCard
        icon={UI_ICONS.alert}
        title="Failed Runs"
        period={`${FAILED_BY_DAY.length + 1} days`}
        value={String(failedToday)}
        delta={
          <DeltaChip
            current={failedToday}
            previous={failedYesterday}
            better="down"
            basis="against yesterday"
          />
        }
        basis={`${failedYesterday} yesterday, ${FAILED_BY_DAY.reduce((sum, value) => sum + value, failedToday)} in ${FAILED_BY_DAY.length + 1} days`}
        action={failedBy[0] ? openWorkflow(failedBy[0].workflow) : allWorkflows}
      >
        <DayBars values={[...FAILED_BY_DAY, failedToday]} />
      </StatCard>
    </div>
  )
}
