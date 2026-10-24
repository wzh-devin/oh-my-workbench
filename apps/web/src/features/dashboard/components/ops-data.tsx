import { type ReactNode } from "react"
import { CalendarClockIcon, WebhookIcon, ZapIcon } from "lucide-react"

import { GoogleCloud } from "@/components/ui/svgs/googleCloud"
import { GoogleDrive } from "@/components/ui/svgs/googleDrive"
import { Gmail } from "@/components/ui/svgs/gmail"
import { Linear } from "@/components/ui/svgs/linear"
import { Notion } from "@/components/ui/svgs/notion"
import { Planetscale } from "@/components/ui/svgs/planetscale"
import { PlanetscaleDark } from "@/components/ui/svgs/planetscaleDark"
import { ResendIconBlack } from "@/components/ui/svgs/resendIconBlack"
import { ResendIconWhite } from "@/components/ui/svgs/resendIconWhite"
import { Slack } from "@/components/ui/svgs/slack"
import { Stripe } from "@/components/ui/svgs/stripe"
import { Supabase } from "@/components/ui/svgs/supabase"
import { type AgentRecord } from "@/lib/workspace/agents"
import { type Workflow, type WorkflowTrigger } from "@/lib/workspace/workflows"

// ── Operations data ──
// What the Dashboard's stat cards, Run Activity and Needs Attention read.
// Health and the last day's runs are derived from the workspace's workflows,
// so a workflow paused or resumed anywhere moves these numbers too.

const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
/** The demo clock: every relative time reads against this instant. */
export const REFERENCE_MS = Date.parse("2026-10-06T09:50:00Z")
/** Start of the hour the reference falls in; the last chart column. */
export const CURRENT_HOUR_MS = REFERENCE_MS - (REFERENCE_MS % HOUR_MS)
export const HOURS = 24

/** Totals before today, oldest first: the stat cards' trend lines. */
export const RUNS_BY_DAY = [
  262, 271, 248, 284, 279, 231, 226, 268, 281, 276, 290, 271, 264,
]
export const FAILED_BY_DAY = [4, 6, 3, 5, 8, 4, 2, 5, 3, 9, 7, 4, 6]
export const HEALTHY_YESTERDAY = 8
export const LIVE_LAST_WEEK = 5

// ── Apps ──

export type IntegrationId =
  | "slack"
  | "linear"
  | "notion"
  | "stripe"
  | "googleDrive"
  | "googleCloud"
  | "gmail"
  | "supabase"
  | "planetscale"
  | "resend"

// prettier-ignore
export const INTEGRATIONS: Record<IntegrationId, { label: string; logo: ReactNode }> = {
  slack:       { label: "Slack",        logo: <Slack aria-hidden="true" /> },
  linear:      { label: "Linear",       logo: <Linear aria-hidden="true" /> },
  notion:      { label: "Notion",       logo: <Notion aria-hidden="true" /> },
  stripe:      { label: "Stripe",       logo: <Stripe aria-hidden="true" /> },
  googleDrive: { label: "Google Drive", logo: <GoogleDrive aria-hidden="true" /> },
  googleCloud: { label: "BigQuery",     logo: <GoogleCloud aria-hidden="true" /> },
  gmail:       { label: "Gmail",        logo: <Gmail aria-hidden="true" /> },
  supabase:    { label: "Supabase",     logo: <Supabase aria-hidden="true" /> },
  planetscale: { label: "PlanetScale",
    logo: (<><Planetscale className="dark:hidden" aria-hidden="true" /><PlanetscaleDark className="hidden dark:block" aria-hidden="true" /></>) },
  resend:      { label: "Resend",
    logo: (<><ResendIconBlack className="dark:hidden" aria-hidden="true" /><ResendIconWhite className="hidden dark:block" aria-hidden="true" /></>) },
}

// ── Triggers ──
// The Steps view splits each hour by what started the runs.

// prettier-ignore
export const TRIGGERS: Record<WorkflowTrigger, { label: string; plural: string; icon: ReactNode }> = {
  Schedule: { label: "Schedule", plural: "Schedules", icon: <CalendarClockIcon aria-hidden="true" /> },
  Webhook:  { label: "Webhook",  plural: "Webhooks",  icon: <WebhookIcon aria-hidden="true" /> },
  Event:    { label: "Event",    plural: "Events",    icon: <ZapIcon aria-hidden="true" /> },
}

export const TRIGGER_ORDER: WorkflowTrigger[] = ["Schedule", "Webhook", "Event"]

// ── Per-workflow operations ──

type WorkflowOps = {
  /** The app the workflow works in, shown as its logo */
  app: IntegrationId
  /** Steps one run executes */
  steps: number
  /** Why it fails or runs slow, in one sentence */
  issue?: string
  /** ISO time the current failures began */
  failingSince?: string
  /** Why it was paused */
  pauseNote?: string
}

// prettier-ignore
const OPS: Record<string, WorkflowOps> = {
  wf_8k2m4p: { app: "supabase",    steps: 6 },
  wf_2h7c9d: { app: "gmail",       steps: 4 },
  wf_5n1q3r: { app: "linear",      steps: 7, failingSince: "2026-10-06T05:00:00Z",
    issue: "The Classify ticket step times out on the model call, so new tickets wait unrouted." },
  wf_9t4v6w: { app: "slack",       steps: 5 },
  wf_3b8x2y: { app: "googleDrive", steps: 5, pauseNote: "Paused while legal moves to a new drive" },
  wf_6k5m1n: { app: "stripe",      steps: 8 },
  wf_1p7r4s: { app: "notion",      steps: 5, failingSince: "2026-10-06T07:00:00Z",
    issue: "The CRM rejects the Write notes step: a required field was added upstream." },
  wf_4d2f8g: { app: "googleCloud", steps: 3 },
  wf_7h3j5k: { app: "resend",      steps: 4 },
  wf_8l6m9n: { app: "stripe",      steps: 6, pauseNote: "Waiting on the finance team's approval rules" },
  wf_2q9r6s: { app: "planetscale", steps: 6,
    issue: "Supplier lookups run past their 30s budget, so the morning order lands late." },
  wf_5t1u3v: { app: "slack",       steps: 4, failingSince: "2026-10-06T03:00:00Z",
    issue: "The Slack token was revoked, so the Post alert step fails on every mention." },
}

const DEFAULT_APPS: IntegrationId[] = ["slack", "notion", "gmail", "supabase"]

/** A workflow's operations, with defaults for one made in this session. */
export function opsOf(workflow: Pick<Workflow, "id">): WorkflowOps {
  return (
    OPS[workflow.id] ?? {
      app: DEFAULT_APPS[hashOf(workflow.id) % DEFAULT_APPS.length],
      steps: 4,
    }
  )
}

// ── Health ──

export type Health = "healthy" | "degraded" | "failing" | "paused"

/** Below this success rate an active workflow reads as degraded. */
const DEGRADED_BELOW = 90

/** As the grid reads it: off is Paused, a failed last run is Failing. */
export function healthOf(workflow: Workflow): Health {
  if (!workflow.enabled) return "paused"
  if (workflow.lastRun === "Failed") return "failing"
  if (workflow.runs > 0 && workflow.successRate < DEGRADED_BELOW)
    return "degraded"
  return "healthy"
}

const HEALTH_ORDER: Health[] = ["failing", "degraded", "paused", "healthy"]

/** Worst first, then the most runs: the order a person should look in. */
export function triageOrder(workflows: Workflow[]) {
  return [...workflows].sort(
    (a, b) =>
      HEALTH_ORDER.indexOf(healthOf(a)) - HEALTH_ORDER.indexOf(healthOf(b)) ||
      b.runs - a.runs
  )
}

export type AgentHealth = "live" | "attention" | "idle"

/** Live and within budget; erroring or over budget; draft or paused. */
export function agentHealthOf(agent: AgentRecord): AgentHealth {
  if (agent.status === "Error" || agent.spend > agent.monthlyBudget)
    return "attention"
  return agent.status === "Live" ? "live" : "idle"
}

// ── The last 24 hours ──

export type HourOutcome = "succeeded" | "partial" | "failed" | "none"

export type HourCell = {
  start: number
  outcome: HourOutcome
  runs: number
  failed: number
  /** Steps executed: a failed run stops halfway */
  steps: number
}

/** Small seeded PRNG: the same seed always yields the same demo. */
function prng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function hashOf(text: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

const hourOf = (ms: number) => ms - (ms % HOUR_MS)

function historyOf(workflow: Workflow): HourCell[] {
  const random = prng(hashOf(workflow.id))
  const ops = opsOf(workflow)
  const health = healthOf(workflow)
  const perDay = workflow.runs / 28
  const lastRunMs = workflow.lastRunAt ? Date.parse(workflow.lastRunAt) : null
  const failingFrom =
    health === "failing" && ops.failingSince
      ? hourOf(Date.parse(ops.failingSince))
      : null
  const baseFailure = Math.max(0, 1 - workflow.successRate / 100) * 0.2

  return Array.from({ length: HOURS }, (_, index) => {
    const start = CURRENT_HOUR_MS - (HOURS - 1 - index) * HOUR_MS
    const empty: HourCell = {
      start,
      outcome: "none",
      runs: 0,
      failed: 0,
      steps: 0,
    }
    // Nothing runs after the last run, so a paused workflow keeps its past.
    if (lastRunMs === null || start > hourOf(lastRunMs)) return empty

    let runs: number
    if (workflow.cadence === "Every hour") {
      runs = 1
    } else if (perDay < 3) {
      // A daily or weekly schedule: its one run in the window, if any.
      runs = start === hourOf(lastRunMs) ? 1 : 0
    } else {
      const share = start === CURRENT_HOUR_MS ? 50 / 60 : 1
      const expected = (perDay / 24) * share * (0.6 + random() * 0.8)
      runs = Math.floor(expected) + (random() < expected % 1 ? 1 : 0)
      if (start === hourOf(lastRunMs)) runs = Math.max(1, runs)
    }
    if (runs === 0) return empty

    let failed = 0
    if (failingFrom !== null && start >= failingFrom) {
      failed = Math.max(1, Math.round(runs * (0.45 + random() * 0.3)))
    } else {
      for (let run = 0; run < runs; run++)
        if (random() < baseFailure) failed += 1
    }
    const slow = health === "degraded" && random() < 0.6

    return {
      start,
      outcome: failed === runs ? "failed" : slow ? "partial" : "succeeded",
      runs,
      failed,
      steps: (runs - failed) * ops.steps + failed * Math.ceil(ops.steps / 2),
    }
  })
}

const histories = new Map<string, HourCell[]>()

/** The last day of a workflow, hour by hour; stable for the same state. */
export function hoursOf(workflow: Workflow): HourCell[] {
  const key = `${workflow.id}:${workflow.enabled}:${workflow.lastRun}:${workflow.lastRunAt}`
  let hours = histories.get(key)
  if (!hours) {
    hours = historyOf(workflow)
    histories.set(key, hours)
  }
  return hours
}

export const runsOf = (workflow: Workflow) =>
  hoursOf(workflow).reduce((sum, hour) => sum + hour.runs, 0)

export const failedRunsOf = (workflow: Workflow) =>
  hoursOf(workflow).reduce((sum, hour) => sum + hour.failed, 0)

// ── Formatting ──

const pad = (value: number) => String(value).padStart(2, "0")
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const countFormat = new Intl.NumberFormat("en-US")
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
})

export const formatCompact = (value: number) =>
  compactFormat.format(Math.round(value))

export const formatCount = (value: number) => countFormat.format(value)

/** "14:20" UTC */
export function formatClock(ms: number) {
  const date = new Date(ms)
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** "Oct 6" */
export const formatDay = (ms: number) => dayFormat.format(ms)

/** "in 9m", "2h 10m ago", "6d ago", "just now" */
export function formatRelative(ms: number) {
  const diff = ms - REFERENCE_MS
  const minutes = Math.floor(Math.abs(diff) / MINUTE_MS)
  if (minutes < 1) return "just now"
  let span: string
  if (minutes < 60) span = `${minutes}m`
  else if (minutes < 1440) {
    const rest = minutes % 60
    span = rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${minutes / 60}h`
  } else span = `${Math.floor(minutes / 1440)}d`
  return diff > 0 ? `in ${span}` : `${span} ago`
}

/** Change against a baseline: "6.1%", or null when there is no baseline. */
export function formatDelta(current: number, previous: number) {
  if (previous === 0) return null
  const change = Math.abs((current - previous) / previous) * 100
  return `${change >= 100 ? Math.round(change) : change.toFixed(1)}%`
}

export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${count} ${count === 1 ? noun : many}`
