/**
 * Run Activity: the last day as one column per hour on a muted track. Runs
 * stacks each hour by outcome; Steps shows the work done, split by trigger.
 * Columns rest hatched; the one under the pointer or keyboard turns solid.
 */
import { useId, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "cn"
import { Bar, BarChart, XAxis, YAxis, type BarShapeProps } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { type Workflow, type WorkflowTrigger } from "@/lib/workspace/workflows"

import {
  ActiveLabelReporter,
  hatchDefs,
  HOUR_TRACK,
  HourLegend,
  renderHourSegment,
} from "./hour-columns"
import {
  formatClock,
  formatCompact,
  HOUR_MS,
  HOURS,
  hoursOf,
  REFERENCE_MS,
  TRIGGER_ORDER,
  TRIGGERS,
} from "./ops-data"
import { SectionHeader } from "./section-header"

type Mode = "runs" | "rows"
type Outcome = "succeeded" | "partial" | "failed"
type Series = Outcome | "volume"

const MODES: { value: Mode; label: string }[] = [
  { value: "runs", label: "Runs" },
  { value: "rows", label: "Steps" },
]

/** Stack order, bottom to top. */
const SERIES: Record<Mode, Series[]> = {
  runs: ["succeeded", "partial", "failed"],
  rows: ["volume"],
}

// State tokens, never --chart-N: theme presets grey those out or flip their hue.
const ACTIVITY_CONFIG = {
  succeeded: { label: "Succeeded", color: "var(--success)" },
  partial: { label: "Slow", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  volume: { label: "Steps run", color: "var(--info)" },
} satisfies ChartConfig

const LEGEND_TONE: Record<Series, string> = {
  succeeded: "bg-success",
  partial: "bg-warning",
  failed: "bg-destructive",
  volume: "bg-info",
}

type HourBucket = Record<Series, number> & {
  label: string
  start: number
  runs: number
  /** Steps by what triggered the runs, for the Steps card. */
  sources: Record<WorkflowTrigger, number>
  /** Workflows with failed runs in the hour, worst first. */
  failedBy: { name: string; failed: number }[]
  /** The workflow that ran the most steps in the hour. */
  busiest: { name: string; rows: number } | null
}

function bucketsOf(workflows: Workflow[]): HourBucket[] {
  return Array.from({ length: HOURS }, (_, index) => {
    const bucket: HourBucket = {
      label: "",
      start: 0,
      runs: 0,
      volume: 0,
      succeeded: 0,
      partial: 0,
      failed: 0,
      sources: { Schedule: 0, Webhook: 0, Event: 0 },
      failedBy: [],
      busiest: null,
    }
    for (const workflow of workflows) {
      const cell = hoursOf(workflow)[index]
      if (!cell) continue
      bucket.start = cell.start
      const landed = cell.runs - cell.failed
      if (cell.outcome === "partial") bucket.partial += landed
      else bucket.succeeded += landed
      bucket.failed += cell.failed
      bucket.sources[workflow.trigger] += cell.steps
      bucket.volume += cell.steps
      if (cell.failed > 0)
        bucket.failedBy.push({ name: workflow.name, failed: cell.failed })
      if (cell.steps > (bucket.busiest?.rows ?? 0))
        bucket.busiest = { name: workflow.name, rows: cell.steps }
    }
    bucket.label = formatClock(bucket.start)
    bucket.runs = bucket.succeeded + bucket.partial + bucket.failed
    bucket.failedBy.sort((a, b) => b.failed - a.failed)
    return bucket
  })
}

const rangeOf = (bucket: HourBucket) =>
  `${formatClock(bucket.start)} to ${bucket.start + HOUR_MS > REFERENCE_MS ? "now" : formatClock(bucket.start + HOUR_MS)}`

const isBucket = (value: unknown): value is HourBucket =>
  typeof value === "object" && value !== null && "failedBy" in value

export function RunActivity({
  workflows,
  className,
}: {
  workflows: Workflow[]
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [mode, setMode] = useState<Mode>("runs")
  const [active, setActive] = useState<string | null>(null)
  const buckets = bucketsOf(workflows)
  const series = SERIES[mode]
  const runs = buckets.reduce((sum, bucket) => sum + bucket.runs, 0)
  const failed = buckets.reduce((sum, bucket) => sum + bucket.failed, 0)
  const rows = buckets.reduce((sum, bucket) => sum + bucket.volume, 0)
  const landed = runs === 0 ? 1 : (runs - failed) / runs
  const ticks = buckets
    .filter((_, index) => index % 4 === 3)
    .map((bucket) => bucket.label)

  return (
    <Card className={cn("min-w-0 gap-0 py-0", className)}>
      <SectionHeader
        title="Run Activity"
        description={
          mode === "runs"
            ? `${formatCompact(runs)} runs in 24 hours, ${(landed * 100).toFixed(1)}% succeeded`
            : `${formatCompact(rows)} steps in 24 hours, by trigger`
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <HourLegend
            items={series.map((key) => ({
              key,
              label: ACTIVITY_CONFIG[key].label,
              tone: LEGEND_TONE[key],
            }))}
          />
          <ToggleGroup
            multiple={false}
            value={[mode]}
            onValueChange={(value: string[]) => {
              const next = MODES.find((item) => item.value === value[0])
              if (next) setMode(next.value)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Activity shown"
          >
            {MODES.map((item) => (
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
      </SectionHeader>
      <CardContent className="flex-1 py-4">
        {workflows.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyTitle>No Runs Yet</EmptyTitle>
              <EmptyDescription>
                No workflow has run in the last 24 hours.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer
            config={ACTIVITY_CONFIG}
            className="aspect-auto h-56 w-full min-w-0"
            initialDimension={{ width: 720, height: 224 }}
          >
            <BarChart
              data={buckets}
              accessibilityLayer
              barCategoryGap="20%"
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <ActiveLabelReporter onChange={setActive} />
              {hatchDefs(uid, series)}
              <XAxis
                dataKey="label"
                ticks={ticks}
                tickFormatter={(label: string) =>
                  label === buckets[buckets.length - 1].label ? "Now" : label
                }
                tickLine={false}
                axisLine={false}
                tickMargin={8}
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
                content={(props) => {
                  const items =
                    props.payload?.filter((item) => Number(item.value) > 0) ??
                    []
                  return (
                    <ChartTooltipContent
                      active={props.active}
                      payload={items}
                      className="w-56"
                      labelFormatter={(_, payload) => {
                        const bucket = payload?.[0]?.payload
                        return isBucket(bucket) ? (
                          <span className="flex items-center justify-between gap-3">
                            {rangeOf(bucket)}
                            <span className="font-normal text-muted-foreground tabular-nums">
                              {mode === "runs"
                                ? `${bucket.runs} runs`
                                : `${formatCompact(bucket.volume)} steps`}
                            </span>
                          </span>
                        ) : null
                      }}
                      formatter={(value, name, item, index) => {
                        const bucket = isBucket(item.payload)
                          ? item.payload
                          : null
                        const key = series.find((entry) => entry === name)
                        if (!bucket || !key) return null
                        const last = index === items.length - 1
                        return (
                          <div className="flex flex-1 flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "size-2 rounded-full",
                                    LEGEND_TONE[key]
                                  )}
                                />
                                {ACTIVITY_CONFIG[key].label}
                              </span>
                              <span className="font-mono font-medium tabular-nums">
                                {mode === "runs"
                                  ? Number(value)
                                  : formatCompact(Number(value))}
                              </span>
                            </div>
                            {last &&
                            mode === "runs" &&
                            bucket.failedBy.length > 0 ? (
                              <div className="flex flex-col gap-1 border-t border-border/50 pt-1.5">
                                {bucket.failedBy.map((entry) => (
                                  <span
                                    key={entry.name}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="truncate">
                                      {entry.name}
                                    </span>
                                    <span className="shrink-0 font-medium text-destructive tabular-nums">
                                      {entry.failed} failed
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {last && mode === "rows" ? (
                              <div className="flex flex-col gap-1 border-t border-border/50 pt-1.5">
                                {TRIGGER_ORDER.filter(
                                  (category) => bucket.sources[category] > 0
                                ).map((category) => (
                                  <span
                                    key={category}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="inline-flex items-center gap-1.5 text-muted-foreground [&_svg:not([class*=size-])]:size-3">
                                      {TRIGGERS[category].icon}
                                      {TRIGGERS[category].plural}
                                    </span>
                                    <span className="font-mono tabular-nums">
                                      {formatCompact(bucket.sources[category])}
                                    </span>
                                  </span>
                                ))}
                                {bucket.busiest ? (
                                  <span className="flex items-center justify-between gap-3">
                                    <span className="truncate">
                                      Most from {bucket.busiest.name}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      }}
                    />
                  )
                }}
              />
              {series.map((key, index) => (
                <Bar
                  key={`${mode}-${key}`}
                  dataKey={key}
                  stackId={mode}
                  fill={`var(--color-${key})`}
                  maxBarSize={28}
                  isAnimationActive={false}
                  // The first series lays the full-height track behind each column.
                  background={index === 0 ? HOUR_TRACK : undefined}
                  shape={(props: BarShapeProps) =>
                    renderHourSegment(props, key, series, active, uid)
                  }
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
