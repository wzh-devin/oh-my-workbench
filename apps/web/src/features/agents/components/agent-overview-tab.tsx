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

import { type AgentRecord } from "./data"
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
  budgetOf,
  callsOf,
  CURRENT_HOUR_MS,
  enabledOf,
  endpointOf,
  formatCalls,
  formatClock,
  formatCompact,
  formatDateTime,
  formatDay,
  formatDuration,
  formatRelative,
  formatSessions,
  HOUR_MS,
  HOURS,
  hoursOf,
  MODEL_PROVIDER,
  money,
  OUTCOME_LABEL,
  plural,
  REFERENCE_MS,
  SESSION_OUTCOMES,
  sessionCountOf,
  type AgentDetails,
  type AgentSession,
  type HourCell,
  type SessionOutcome,
} from "./sheet-data"
import { AppFace, EnvironmentFace, OwnerAvatar, OwnerFace } from "./value-faces"

// State tokens, never --chart-N: those flip hue between themes.
const SESSIONS_CHART_CONFIG = {
  resolved: { label: "Resolved", color: "var(--success)" },
  handedOff: { label: "Handed Off", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig

const SESSIONS_TONE: Record<SessionOutcome, string> = {
  resolved: "bg-success",
  handedOff: "bg-warning",
  failed: "bg-destructive",
}

const SESSIONS_LEGEND = SESSION_OUTCOMES.map((key) => ({
  key,
  label: SESSIONS_CHART_CONFIG[key].label,
  tone: SESSIONS_TONE[key],
}))

type HourPoint = HourCell & { label: string }

const SESSION_GLYPH: Record<SessionOutcome, { icon: ReactNode; tone: string }> =
  {
    resolved: { icon: UI_ICONS.passed, tone: "text-success" },
    handedOff: { icon: UI_ICONS.handoff, tone: "text-warning" },
    failed: { icon: UI_ICONS.failed, tone: "text-destructive" },
  }

/** The oldest instant the chart covers: older sessions carry their day. */
const WINDOW_START_MS = CURRENT_HOUR_MS - (HOURS - 1) * HOUR_MS

/** "14:20" inside the chart's 24 hours, "Sep 22, 14:20" before them. */
const whenOf = (ms: number) =>
  ms < WINDOW_START_MS
    ? `${formatDay(ms)}, ${formatClock(ms)}`
    : formatClock(ms)

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

/** The one thing to know first: a failure, a pause, an overspend or no
 *  sessions yet. */
function StateAlert({
  agent,
  details,
  onRun,
  onResume,
}: {
  agent: AgentRecord
  details: AgentDetails
  onRun: () => void
  onResume: () => void
}) {
  const failing = details.tools.find((tool) => tool.failure)
  const budget = budgetOf(agent)
  if (agent.status === "Error") {
    const last = details.sessions[0]
    return (
      <Alert variant="destructive">
        {UI_ICONS.failed}
        <AlertTitle>Last Session Failed</AlertTitle>
        <AlertAction>
          <Button type="button" size="xs" variant="outline" onClick={onRun}>
            Retry
          </Button>
        </AlertAction>
        <AlertDescription>
          {failing
            ? `${failing.failure} at ${failing.key}`
            : "A tool returned an error"}
          {last ? `, at ${whenOf(last.startedAt)} UTC.` : "."} New sessions hand
          off to a person until a test run passes.
        </AlertDescription>
      </Alert>
    )
  }
  if (agent.status === "Paused") {
    return (
      <Alert variant="info">
        {UI_ICONS.pause}
        <AlertTitle>Agent Paused</AlertTitle>
        <AlertAction>
          <Button type="button" size="xs" variant="outline" onClick={onResume}>
            Resume
          </Button>
        </AlertAction>
        <AlertDescription>
          It takes no new sessions until you resume it. Paused by{" "}
          {agent.owner.name}.
        </AlertDescription>
      </Alert>
    )
  }
  if (budget.over) {
    return (
      <Alert variant="warning">
        {UI_ICONS.budget}
        <AlertTitle>Over Budget</AlertTitle>
        <AlertDescription>
          {money(budget.spend)} spent against a {money(budget.budget)} monthly
          budget, {money(budget.spend - budget.budget)} over. Sessions keep
          running; raise the budget in Settings.
        </AlertDescription>
      </Alert>
    )
  }
  if (details.sessions.length === 0) {
    return (
      <Alert variant="info">
        {UI_ICONS.sync}
        <AlertTitle>First Session</AlertTitle>
        <AlertDescription>
          {agent.status === "Draft"
            ? "A draft only takes test runs; history fills in as they land."
            : "Waiting for its first session; history fills in as sessions land."}
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Sessions per hour on the Sync Activity grammar: every hour keeps its
 *  track, so a quiet day still reads as 24 slots rather than an empty panel. */
function SessionsChart({ hours }: { hours: HourCell[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [active, setActive] = useState<string | null>(null)
  const points: HourPoint[] = hours.map((hour) => ({
    ...hour,
    label: formatClock(hour.start),
  }))
  const ticks = points
    .filter((_, index) => index % 4 === 3)
    .map((point) => point.label)
  const now = points[points.length - 1]?.label
  return (
    <ChartContainer
      config={SESSIONS_CHART_CONFIG}
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
        {hatchDefs(uid, SESSION_OUTCOMES)}
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
                const split = [
                  `${point.resolved} resolved`,
                  point.handedOff > 0 ? `${point.handedOff} handed off` : null,
                  point.failed > 0 ? `${point.failed} failed` : null,
                ].filter(Boolean)
                return (
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="font-medium tabular-nums">
                      {formatClock(point.start)} to{" "}
                      {end > REFERENCE_MS ? "now" : formatClock(end)}
                    </span>
                    <span className="flex items-center justify-between gap-3 text-muted-foreground">
                      {OUTCOME_LABEL[point.outcome]}
                      <span className="font-mono text-foreground tabular-nums">
                        {point.outcome === "none" || point.outcome === "paused"
                          ? "None"
                          : formatSessions(point.sessions)}
                      </span>
                    </span>
                    {point.sessions > 0 ? (
                      <span className="text-muted-foreground tabular-nums">
                        {split.join(", ")}
                      </span>
                    ) : null}
                  </div>
                )
              }}
            />
          }
        />
        {SESSION_OUTCOMES.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="sessions"
            fill={`var(--color-${key})`}
            maxBarSize={28}
            isAnimationActive={false}
            background={index === 0 ? HOUR_TRACK : undefined}
            shape={(props: BarShapeProps) =>
              renderHourSegment(props, key, SESSION_OUTCOMES, active, uid)
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function SessionRow({ session }: { session: AgentSession }) {
  const glyph = SESSION_GLYPH[session.outcome]
  const by = session.by ? TEAM[session.by] : null
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
            {whenOf(session.startedAt)}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {session.id}
          </span>
          {by ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <OwnerAvatar owner={by.id} compact />
              <span className="truncate">Test</span>
            </span>
          ) : null}
        </span>
        {session.message ? (
          <span
            className={cn(
              "text-xs text-pretty",
              session.outcome === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {session.message}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs tabular-nums">
        <span className="font-medium text-foreground">
          {plural(session.turns, "turn")}
        </span>
        <span className="text-muted-foreground">
          {formatDuration(session.durationSec)}
        </span>
      </div>
    </li>
  )
}

export function AgentOverviewTab({
  agent,
  details,
  onRun,
  onResume,
  onRotate,
  onShowTools,
}: {
  agent: AgentRecord
  details: AgentDetails
  onRun: () => void
  onResume: () => void
  onRotate: () => void
  onShowTools: () => void
}) {
  const hours = hoursOf(agent, details.sessions)
  const sessions = sessionCountOf(hours)
  const enabled = enabledOf(details)
  const calls = enabled.reduce((sum, tool) => sum + callsOf(tool, sessions), 0)
  const last = details.sessions[0]?.startedAt ?? null
  const budget = budgetOf(agent)
  const rotatedBy = TEAM[details.secret.rotatedBy]?.name ?? ""

  return (
    <>
      <StateAlert
        agent={agent}
        details={details}
        onRun={onRun}
        onResume={onResume}
      />

      <Card className="min-w-0 gap-0 py-0">
        <HintHeader
          title="Last 24 Hours"
          hint={`${plural(sessions, "session")}, ${formatCalls(calls)} to tools`}
        >
          <HourLegend items={SESSIONS_LEGEND} />
        </HintHeader>
        <CardContent className="py-4">
          <SessionsChart hours={hours} />
        </CardContent>
      </Card>

      <FactGroup
        title="Runtime"
        facts={[
          {
            label: "Model",
            value: (
              <>
                <span className="shrink-0 whitespace-nowrap">
                  {agent.model}
                </span>
                <Muted>{MODEL_PROVIDER[agent.model]}</Muted>
              </>
            ),
          },
          {
            label: "Last session",
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
            label: "Budget",
            value: (
              <>
                <span className="shrink-0 whitespace-nowrap">
                  {money(budget.spend)} of {money(budget.budget)}
                </span>
                <Muted>
                  {budget.over
                    ? `${money(budget.spend - budget.budget)} over`
                    : "this month"}
                </Muted>
              </>
            ),
          },
          {
            label: "Tools",
            value: (
              <button
                type="button"
                onClick={onShowTools}
                className="cursor-pointer underline-offset-2 hover:text-primary hover:underline"
              >
                {enabled.length} of {details.tools.length} enabled
              </button>
            ),
          },
        ]}
      />

      <FactGroup
        title="Deployment"
        facts={[
          {
            label: "Channel",
            value: <AppFace app={details.app} detail={details.channel} />,
          },
          {
            label: "Endpoint",
            value: (
              <span className="truncate font-mono text-xs">
                {endpointOf(agent)}
              </span>
            ),
          },
          {
            label: "Environment",
            value: <EnvironmentFace environment={details.environment} />,
          },
          {
            label: "Signs in as",
            value: <span className="truncate">{details.principal}</span>,
          },
          {
            label: "API Key",
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

      <Section title="Recent Sessions">
        {details.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {agent.status === "Draft"
              ? "No sessions yet; Run Test starts the first one."
              : "No sessions yet; the first one starts on its channel."}
          </p>
        ) : (
          <ul className="-my-2 flex flex-col divide-y divide-border">
            {details.sessions.slice(0, 8).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
      </Section>

      <FactGroup
        title="Ownership"
        facts={[
          { label: "Owner", value: <OwnerFace owner={agent.owner.id} /> },
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
