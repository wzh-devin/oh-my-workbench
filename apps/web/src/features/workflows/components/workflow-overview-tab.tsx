import { useId, useState, type ReactNode } from "react"
import { Bar, BarChart, XAxis, YAxis, type BarShapeProps } from "recharts"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { TEAM } from "@/lib/workspace/team"

import { type WorkflowItem } from "./data"
import {
  ActiveLabelReporter,
  hatchDefs,
  HOUR_TRACK,
  HourLegend,
  renderHourSegment,
} from "./hour-columns"
import { UI_ICONS } from "./icons"
import { HintHeader } from "./section-header"
import {
  ALERT_CHANNEL,
  enabledOf,
  formatClock,
  formatCompact,
  formatDateTime,
  formatDay,
  formatDuration,
  formatItems,
  formatRelative,
  HOUR_MS,
  hoursOf,
  itemsOf,
  nextRunAt,
  OUTCOME_LABEL,
  plural,
  REFERENCE_MS,
  sourceOf,
  TRIGGER_SOURCE,
  type HourCell,
  type RunOutcome,
  type WorkflowDetails,
  type WorkflowRun,
} from "./sheet-data"
import { AppFace, EnvironmentFace, OwnerAvatar, OwnerFace } from "./value-faces"

/** Stack order, bottom to top. */
const RUN_SERIES = ["succeeded", "partial", "failed"] as const
type RunSeries = (typeof RUN_SERIES)[number]

// State tokens, never --chart-N: those flip hue between themes.
const RUNS_CHART_CONFIG = {
  succeeded: { label: "Succeeded", color: "var(--success)" },
  partial: { label: "Slow", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig

const RUNS_TONE: Record<RunSeries, string> = {
  succeeded: "bg-success",
  partial: "bg-warning",
  failed: "bg-destructive",
}

const RUNS_LEGEND = RUN_SERIES.map((key) => ({
  key,
  label: RUNS_CHART_CONFIG[key].label,
  tone: RUNS_TONE[key],
}))

type HourPoint = HourCell & {
  label: string
  succeeded: number
  partial: number
  failed: number
}

const RUN_GLYPH: Record<RunOutcome, { icon: ReactNode; tone: string }> = {
  succeeded: { icon: UI_ICONS.passed, tone: "text-success" },
  partial: { icon: UI_ICONS.alert, tone: "text-warning" },
  failed: { icon: UI_ICONS.failed, tone: "text-destructive" },
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

type Fact = { label: string; value: ReactNode }

function FactGroup({
  title,
  facts,
  action,
}: {
  title: string
  facts: Fact[]
  action?: ReactNode
}) {
  return (
    <Section title={title} action={action}>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 leading-5 tabular-nums">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="truncate text-muted-foreground">{children}</span>
}

/** The one thing to know first: a failure, a pause, flaky runs or no runs. */
function StateAlert({
  workflow,
  details,
  onRun,
  onResume,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  onRun: () => void
  onResume: () => void
}) {
  const failing = details.steps.find((step) => step.failure)
  if (workflow.enabled && workflow.lastRun === "Failed") {
    const last = details.runs[0]
    return (
      <Alert variant="destructive">
        {UI_ICONS.failed}
        <AlertTitle>Last Run Failed</AlertTitle>
        <AlertAction>
          <Button type="button" size="xs" variant="outline" onClick={onRun}>
            Retry
          </Button>
        </AlertAction>
        <AlertDescription>
          {failing
            ? `${failing.failure} at ${failing.key}`
            : "A step returned an error"}
          {last ? `, at ${formatClock(last.startedAt)} UTC.` : "."} Later
          triggers wait in the queue until a run passes.
        </AlertDescription>
      </Alert>
    )
  }
  if (!workflow.enabled) {
    return (
      <Alert variant="info">
        {UI_ICONS.pause}
        <AlertTitle>Workflow Paused</AlertTitle>
        <AlertAction>
          <Button type="button" size="xs" variant="outline" onClick={onResume}>
            Resume
          </Button>
        </AlertAction>
        <AlertDescription>
          Its trigger is ignored until you resume it. Paused by{" "}
          {workflow.owner.name}.
        </AlertDescription>
      </Alert>
    )
  }
  if (workflow.runs === 0) {
    return (
      <Alert variant="info">
        {UI_ICONS.sync}
        <AlertTitle>First Run</AlertTitle>
        <AlertDescription>
          Waiting for its first trigger; history fills in as runs land.
        </AlertDescription>
      </Alert>
    )
  }
  if (workflow.successRate < 90) {
    const issue = details.runs.find((run) => run.message)?.message
    return (
      <Alert variant="warning">
        {UI_ICONS.clock}
        <AlertTitle>Some Runs Failing</AlertTitle>
        <AlertDescription>
          {100 - workflow.successRate}% of runs in 28 days did not finish
          {issue ? `. Latest: ${issue}.` : "."}
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Items per hour on the Sync Activity grammar: every hour keeps its track,
 *  so a quiet day still reads as 24 slots rather than an empty panel. */
function RunsChart({ hours }: { hours: HourCell[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [active, setActive] = useState<string | null>(null)
  const peak = Math.max(1, ...hours.map((hour) => hour.items))
  const points: HourPoint[] = hours.map((hour) => ({
    ...hour,
    label: formatClock(hour.start),
    succeeded: hour.outcome === "succeeded" ? hour.items : 0,
    partial: hour.outcome === "partial" ? hour.items : 0,
    // A failed hour moved nothing: a short stub keeps it visible.
    failed: hour.outcome === "failed" ? Math.max(hour.items, peak * 0.08) : 0,
  }))
  const ticks = points
    .filter((_, index) => index % 4 === 3)
    .map((point) => point.label)
  const now = points[points.length - 1]?.label
  return (
    <ChartContainer
      config={RUNS_CHART_CONFIG}
      className="aspect-auto h-36 w-full min-w-0"
      initialDimension={{ width: 560, height: 144 }}
    >
      <BarChart
        data={points}
        accessibilityLayer
        barCategoryGap="20%"
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <ActiveLabelReporter onChange={setActive} />
        {hatchDefs(uid, RUN_SERIES)}
        <XAxis
          dataKey="label"
          ticks={ticks}
          tickFormatter={(label: string) => (label === now ? "Now" : label)}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // The label band ends at the svg edge, so bottom ink matches the top.
          height={26}
        />
        <YAxis
          allowDecimals={false}
          tickCount={4}
          tickFormatter={(value: number) => formatCompact(value)}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width="auto"
        />
        <ChartTooltip
          cursor={false}
          isAnimationActive={false}
          content={
            <ChartTooltipContent
              hideLabel
              className="w-52"
              formatter={(_value, _name, item, index) => {
                const point: HourPoint = item.payload
                // One readout per hour, written once under the first series.
                if (index !== 0) return null
                const end = point.start + HOUR_MS
                return (
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="font-medium tabular-nums">
                      {formatClock(point.start)} to{" "}
                      {end > REFERENCE_MS ? "now" : formatClock(end)}
                    </span>
                    <span className="flex items-center justify-between gap-3 text-muted-foreground">
                      {OUTCOME_LABEL[point.outcome]}
                      <span className="font-mono text-foreground tabular-nums">
                        {point.outcome === "none" || point.outcome === "skipped"
                          ? "None"
                          : formatItems(point.items)}
                      </span>
                    </span>
                    {point.runs > 0 ? (
                      <span className="text-muted-foreground tabular-nums">
                        {plural(point.runs, "run")}
                        {point.failed > 0 ? `, ${point.failed} failed` : ""}
                      </span>
                    ) : null}
                  </div>
                )
              }}
            />
          }
        />
        {RUN_SERIES.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="items"
            fill={`var(--color-${key})`}
            maxBarSize={28}
            isAnimationActive={false}
            background={index === 0 ? HOUR_TRACK : undefined}
            shape={(props: BarShapeProps) =>
              renderHourSegment(props, key, RUN_SERIES, active, uid)
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function RunRow({ run }: { run: WorkflowRun }) {
  const glyph = RUN_GLYPH[run.outcome]
  const by = run.by ? TEAM[run.by] : null
  return (
    <li className="flex min-w-0 items-start gap-2.5 py-2">
      <span
        className={cn(
          "flex h-5 w-4 shrink-0 items-center justify-center [&_svg:not([class*=size-])]:size-4",
          glyph.tone
        )}
      >
        {glyph.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">
            {formatClock(run.startedAt)}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {run.id}
          </span>
          {by ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <OwnerAvatar owner={by.id} compact />
              <span className="truncate">Manual</span>
            </span>
          ) : null}
        </span>
        {run.message ? (
          <span
            className={cn(
              "text-xs text-pretty",
              run.outcome === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {run.message}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs tabular-nums">
        <span className="font-medium text-foreground">
          {run.outcome === "failed" ? "0 items" : formatItems(run.items)}
        </span>
        <span className="text-muted-foreground">
          {formatDuration(run.durationSec)}
        </span>
      </div>
    </li>
  )
}

export function WorkflowOverviewTab({
  workflow,
  details,
  onRun,
  onResume,
  onRotate,
  onShowSteps,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  onRun: () => void
  onResume: () => void
  onRotate: () => void
  onShowSteps: () => void
}) {
  const hours = hoursOf(workflow, details.runs)
  const runs = hours.reduce((sum, hour) => sum + hour.runs, 0)
  const last = details.runs[0]?.startedAt ?? null
  const next = nextRunAt(workflow, details.runs)
  const enabled = enabledOf(details)
  const source = TRIGGER_SOURCE[workflow.trigger]
  const rotatedBy = TEAM[details.secret.rotatedBy]?.name ?? ""

  return (
    <>
      <StateAlert
        workflow={workflow}
        details={details}
        onRun={onRun}
        onResume={onResume}
      />

      <Card className="min-w-0 gap-0 py-0">
        <HintHeader
          title="Last 24 Hours"
          hint={`${plural(runs, "run")}, ${formatItems(itemsOf(hours))} processed`}
        >
          <HourLegend items={RUNS_LEGEND} />
        </HintHeader>
        <CardContent className="py-4">
          <RunsChart hours={hours} />
        </CardContent>
      </Card>

      <FactGroup
        title="Trigger"
        facts={[
          { label: "Type", value: workflow.trigger },
          { label: "Fires", value: <span>{workflow.cadence}</span> },
          {
            label: "Last run",
            value:
              last === null ? (
                <Muted>Not yet</Muted>
              ) : (
                <>
                  <span className="shrink-0 whitespace-nowrap">
                    {formatRelative(last)}
                  </span>
                  <Muted>{formatDateTime(last)}</Muted>
                </>
              ),
          },
          {
            label: "Next run",
            value: !workflow.enabled ? (
              <Muted>Paused</Muted>
            ) : next === null ? (
              <Muted>On the next {workflow.trigger.toLowerCase()}</Muted>
            ) : (
              <>
                <span className="shrink-0 whitespace-nowrap">
                  {formatRelative(next)}
                </span>
                <Muted>{formatClock(next)} UTC</Muted>
              </>
            ),
          },
          {
            label: "Steps",
            value: (
              <button
                type="button"
                onClick={onShowSteps}
                className="cursor-pointer underline-offset-2 hover:text-primary hover:underline"
              >
                {enabled.length} of {details.steps.length} enabled
              </button>
            ),
          },
        ]}
      />

      <FactGroup
        title="Endpoint"
        facts={[
          {
            label: "App",
            value: <AppFace app={details.app} detail />,
          },
          {
            label: source.label,
            value: (
              <span className="truncate font-mono text-xs">
                {sourceOf(workflow)}
              </span>
            ),
          },
          {
            label: "Environment",
            value: <EnvironmentFace environment={details.environment} />,
          },
          {
            label: "Runs as",
            value: <span className="truncate">{details.principal}</span>,
          },
          {
            label: source.secret,
            value: (
              <>
                <span className="font-mono text-xs">{details.secret.hint}</span>
                <Muted>
                  {formatDay(details.secret.rotatedAt)}
                  {rotatedBy ? ` by ${rotatedBy}` : ""}
                </Muted>
              </>
            ),
          },
        ]}
        action={
          <Button type="button" size="xs" variant="outline" onClick={onRotate}>
            {UI_ICONS.key}
            Rotate
          </Button>
        }
      />

      <Section title="Recent Runs">
        {details.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs yet; the first one starts on its trigger.
          </p>
        ) : (
          <ul className="-my-2 flex flex-col divide-y divide-border">
            {details.runs.slice(0, 8).map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </Section>

      <FactGroup
        title="Ownership"
        facts={[
          { label: "Owner", value: <OwnerFace owner={workflow.owner.id} /> },
          {
            label: "Failure alerts",
            value: details.alertOnFailure ? (
              <span>{ALERT_CHANNEL}</span>
            ) : (
              <Muted>Off</Muted>
            ),
          },
          { label: "Created", value: formatDay(details.createdAt) },
        ]}
      />
    </>
  )
}
