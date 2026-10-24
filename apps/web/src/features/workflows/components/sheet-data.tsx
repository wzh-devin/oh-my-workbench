/**
 * The workflow sheet's data: each workflow's steps, run history and step
 * output. History derives from the seed record on one reference time, and
 * preview rows generate from each field's spec, so the demo reads the same on
 * every load.
 */
import { type ReactNode } from "react"
import {
  BanknoteIcon,
  CalendarClockIcon,
  CalendarIcon,
  CircleCheckIcon,
  DatabaseIcon,
  FileJson2Icon,
  GitBranchIcon,
  GlobeIcon,
  HashIcon,
  KeyRoundIcon,
  ListIcon,
  SendIcon,
  SparklesIcon,
  TimerIcon,
  TypeIcon,
  ZapIcon,
} from "lucide-react"

import { type BadgeProps } from "@/components/reui/badge"
import { Gmail } from "@/components/ui/svgs/gmail"
import { GoogleDrive } from "@/components/ui/svgs/googleDrive"
import { Linear } from "@/components/ui/svgs/linear"
import { Notion } from "@/components/ui/svgs/notion"
import { Openai } from "@/components/ui/svgs/openai"
import { OpenaiDark } from "@/components/ui/svgs/openaiDark"
import { Slack } from "@/components/ui/svgs/slack"
import { Stripe } from "@/components/ui/svgs/stripe"
import { Supabase } from "@/components/ui/svgs/supabase"
import { type TeamMemberId } from "@/lib/workspace/team"
import { WORKFLOWS } from "@/lib/workspace/workflows"

import { type WorkflowItem, type WorkflowTrigger } from "./data"

// customize: the channel failure alerts land in, and the webhook host.
export const ALERT_CHANNEL = "#ops-alerts"
const WEBHOOK_HOST = "https://hooks.flowly.dev"

const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** "Now" for the demo; the Dashboard reads the same instant. */
export const REFERENCE_MS = Date.parse("2026-10-06T09:50:00Z")
const CURRENT_HOUR_MS = REFERENCE_MS - (REFERENCE_MS % HOUR_MS)
const HOURS = 24

// ── Types ──

export type SheetTab = "overview" | "steps" | "preview" | "settings"
export type Environment = "production" | "staging" | "sandbox"
export type WorkflowStatus =
  "healthy" | "running" | "pending" | "degraded" | "failing" | "paused"
export type StepKind =
  "trigger" | "ai" | "record" | "message" | "logic" | "request" | "delay"
export type AppId =
  | "openai"
  | "stripe"
  | "slack"
  | "gmail"
  | "notion"
  | "linear"
  | "googleDrive"
  | "supabase"
export type ColumnType =
  | "id"
  | "text"
  | "enum"
  | "number"
  | "money"
  | "timestamp"
  | "date"
  | "boolean"
  | "json"
export type RunOutcome = "succeeded" | "partial" | "failed"
export type HourOutcome = RunOutcome | "skipped" | "none"

/** How a sample value generates; the view formats it by `type`. */
export type ColumnSpec = {
  name: string
  type: ColumnType
  /** The step output's key field. */
  key?: boolean
  /** Personal data: the preview masks it until the reader unmasks. */
  pii?: boolean
  /** Pool for text, enum and json fields. */
  values?: string[]
  /** Id prefix: "lead_", "msg_". */
  prefix?: string
  /** Inclusive range for numbers; money in minor units. */
  range?: [number, number]
  decimals?: number
  /** Timestamps after the reference instead of before it. */
  future?: boolean
}

export type WorkflowStep = {
  id: string
  /** The step's handle in logs: "ai.score_lead". */
  key: string
  kind: StepKind
  app: AppId | null
  enabled: boolean
  /** Added since the last publish; cleared once it has run. */
  added: boolean
  /** Why the step failed on the last run; cleared by a good run. */
  failure?: string
  /** Typical time the step takes, in seconds. */
  avgSec: number
  columns: ColumnSpec[]
}

export type WorkflowRun = {
  id: string
  startedAt: number
  durationSec: number
  items: number
  outcome: RunOutcome
  message?: string
  /** Manual runs carry who started them. */
  by?: TeamMemberId
}

export type HourCell = {
  start: number
  outcome: HourOutcome
  runs: number
  failed: number
  items: number
}

export type WorkflowSecret = {
  /** The redacted tail: never the secret. */
  hint: string
  rotatedAt: number
  rotatedBy: TeamMemberId
}

/** What the sheet knows about a workflow beyond its list record. */
export type WorkflowDetails = {
  app: AppId
  environment: Environment
  alertOnFailure: boolean
  secret: WorkflowSecret
  /** The service account the steps sign in as. */
  principal: string
  steps: WorkflowStep[]
  /** Newest first. */
  runs: WorkflowRun[]
  /** Items one run moves, for manual runs. */
  itemsPerRun: number
  durationSec: number
  createdAt: number
}

export type SampleValue = string | number | boolean | null
export type SampleRow = Record<string, SampleValue>

// ── Catalogs ──

export const ENVIRONMENTS: Record<Environment, { label: string }> = {
  production: { label: "Production" },
  staging: { label: "Staging" },
  sandbox: { label: "Sandbox" },
}

export const ENVIRONMENT_OPTIONS = (
  ["production", "staging", "sandbox"] satisfies Environment[]
).map((value) => ({ value, label: ENVIRONMENTS[value].label }))

export const TRIGGER_OPTIONS: { value: WorkflowTrigger; label: string }[] = [
  { value: "Schedule", label: "Schedule" },
  { value: "Webhook", label: "Webhook" },
  { value: "Event", label: "Event" },
]

/** What the trigger's source fact is called, and what fills it. */
export const TRIGGER_SOURCE: Record<
  WorkflowTrigger,
  { label: string; secret: string; placeholder: string }
> = {
  Webhook: {
    label: "Webhook URL",
    secret: "Signing secret",
    placeholder: "On new lead",
  },
  Schedule: { label: "Cron", secret: "API key", placeholder: "Daily at 08:00" },
  Event: { label: "Event", secret: "API key", placeholder: "On new ticket" },
}

export const WORKFLOW_STATUS: Record<
  WorkflowStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  healthy: { label: "Healthy", variant: "success-light" },
  running: { label: "Running", variant: "primary-light" },
  pending: { label: "First Run", variant: "info-light" },
  degraded: { label: "Degraded", variant: "warning-light" },
  failing: { label: "Failing", variant: "destructive-light" },
  paused: { label: "Paused", variant: "outline" },
}

/** Worst first: the triage order Previous and Next step through. */
const STATUS_ORDER: WorkflowStatus[] = [
  "failing",
  "degraded",
  "paused",
  "pending",
  "running",
  "healthy",
]

export const OUTCOME_LABEL: Record<HourOutcome, string> = {
  succeeded: "Succeeded",
  partial: "Slow or partial",
  failed: "Failed",
  skipped: "Paused",
  none: "No run",
}

const ICON = { "aria-hidden": true } as const

export const STEP_KINDS: Record<StepKind, { label: string; icon: ReactNode }> =
  {
    trigger: { label: "Trigger", icon: <ZapIcon {...ICON} /> },
    ai: { label: "AI", icon: <SparklesIcon {...ICON} /> },
    record: { label: "Record", icon: <DatabaseIcon {...ICON} /> },
    message: { label: "Message", icon: <SendIcon {...ICON} /> },
    logic: { label: "Logic", icon: <GitBranchIcon {...ICON} /> },
    request: { label: "Request", icon: <GlobeIcon {...ICON} /> },
    delay: { label: "Delay", icon: <TimerIcon {...ICON} /> },
  }

export const COLUMN_TYPES: Record<
  ColumnType,
  { label: string; icon: ReactNode }
> = {
  id: { label: "ID", icon: <KeyRoundIcon {...ICON} /> },
  text: { label: "Text", icon: <TypeIcon {...ICON} /> },
  enum: { label: "Enum", icon: <ListIcon {...ICON} /> },
  number: { label: "Number", icon: <HashIcon {...ICON} /> },
  money: { label: "Money", icon: <BanknoteIcon {...ICON} /> },
  timestamp: { label: "Timestamp", icon: <CalendarClockIcon {...ICON} /> },
  date: { label: "Date", icon: <CalendarIcon {...ICON} /> },
  boolean: { label: "Boolean", icon: <CircleCheckIcon {...ICON} /> },
  json: { label: "JSON", icon: <FileJson2Icon {...ICON} /> },
}

export const APPS: Record<
  AppId,
  { label: string; detail: string; logo: ReactNode }
> = {
  openai: {
    label: "OpenAI",
    detail: "GPT-4.1",
    logo: (
      <>
        <Openai className="dark:hidden" />
        <OpenaiDark className="hidden dark:block" />
      </>
    ),
  },
  stripe: { label: "Stripe", detail: "Payments", logo: <Stripe /> },
  slack: { label: "Slack", detail: "Flowly Labs", logo: <Slack /> },
  gmail: { label: "Gmail", detail: "Workspace mail", logo: <Gmail /> },
  notion: { label: "Notion", detail: "Sales wiki", logo: <Notion /> },
  linear: { label: "Linear", detail: "Support team", logo: <Linear /> },
  googleDrive: {
    label: "Google Drive",
    detail: "Legal drive",
    logo: <GoogleDrive />,
  },
  supabase: { label: "Supabase", detail: "Postgres", logo: <Supabase /> },
}

// ── Field specs ──

const id = (name: string, prefix: string, key = false): ColumnSpec => ({
  name,
  type: "id",
  prefix,
  key,
})
const text = (name: string, values: string[], pii = false): ColumnSpec => ({
  name,
  type: "text",
  values,
  pii,
})
const pick = (name: string, values: string[]): ColumnSpec => ({
  name,
  type: "enum",
  values,
})
const num = (
  name: string,
  range: [number, number],
  decimals = 0
): ColumnSpec => ({ name, type: "number", range, decimals })
const money = (name: string, range: [number, number]): ColumnSpec => ({
  name,
  type: "money",
  range,
})
const time = (name: string, future = false): ColumnSpec => ({
  name,
  type: "timestamp",
  future,
})
const flag = (name: string): ColumnSpec => ({ name, type: "boolean" })

// Demo pools: reserved example domains only.
const EMAILS = [
  "avery.brooks@example.com",
  "m.okafor@example.net",
  "jules.tan@example.org",
  "priya.shah@example.com",
  "lucas.moreau@example.net",
  "sofia.romero@example.org",
]
const NAMES = [
  "Avery Brooks",
  "Mina Okafor",
  "Jules Tan",
  "Priya Shah",
  "Lucas Moreau",
  "Sofia Romero",
]
const COMPANIES = ["Northwind", "Globex", "Initech", "Umbrella", "Hooli"]

/** The output each kind of step hands to the next one. */
const KIND_COLUMNS: Record<Exclude<StepKind, "trigger">, ColumnSpec[]> = {
  ai: [
    id("result_id", "res_", true),
    pick("label", ["high", "medium", "low"]),
    num("confidence", [62, 99], 2),
    text("reasoning", [
      "Matches the ideal customer profile",
      "Mentions a renewal date",
      "Asks for a refund",
      "Repeated complaint this week",
    ]),
  ],
  record: [
    id("record_id", "rec_", true),
    pick("object", ["contact", "deal", "account"]),
    pick("change", ["created", "updated"]),
    time("updated_at"),
  ],
  message: [
    id("message_id", "msg_", true),
    text("recipient", EMAILS, true),
    pick("status", ["sent", "delivered", "opened"]),
    time("sent_at"),
  ],
  logic: [
    id("eval_id", "ev_", true),
    pick("branch", ["True", "False"]),
    flag("matched"),
    time("evaluated_at"),
  ],
  request: [
    id("request_id", "req_", true),
    pick("status", ["200", "201", "202"]),
    num("duration_ms", [80, 900]),
    time("responded_at"),
  ],
  delay: [id("wait_id", "wt_", true), time("resume_at", true), flag("skipped")],
}

// ── Seeds ──

type StepSeed = {
  key: string
  kind: StepKind
  app?: AppId
  /** Share of the run's time this step takes. */
  weight?: number
  enabled?: boolean
  added?: boolean
  /** Set on the step a failing workflow fails at. */
  failure?: string
}

type DetailSeed = {
  app: AppId
  environment: Environment
  alertOnFailure: boolean
  secretHint: string
  rotatedBy: TeamMemberId
  rotatedDaysAgo: number
  itemsPerRun: number
  durationSec: number
  payload: ColumnSpec[]
  steps: StepSeed[]
  /** What a slow or failed run says. */
  issue?: string
  createdDaysAgo: number
}

const DETAIL_SEEDS: Record<string, DetailSeed> = {
  wf_8k2m4p: {
    app: "openai",
    environment: "production",
    alertOnFailure: true,
    secretHint: "whsec_••••a71c",
    rotatedBy: "ines",
    rotatedDaysAgo: 24,
    itemsPerRun: 1,
    durationSec: 6,
    createdDaysAgo: 210,
    issue: "OpenAI answered slowly; the lead was routed late",
    payload: [
      id("lead_id", "lead_", true),
      text("email", EMAILS, true),
      text("company", COMPANIES),
      pick("source", ["website", "webinar", "referral"]),
      time("created_at"),
    ],
    steps: [
      { key: "webhook.new_lead", kind: "trigger" },
      { key: "ai.score_lead", kind: "ai", app: "openai", weight: 3 },
      { key: "crm.find_owner", kind: "record", app: "supabase" },
      { key: "crm.assign_rep", kind: "record", app: "supabase" },
      { key: "slack.notify_rep", kind: "message", app: "slack" },
    ],
  },
  wf_2h7c9d: {
    app: "stripe",
    environment: "production",
    alertOnFailure: true,
    secretHint: "sk_live_••••4e2b",
    rotatedBy: "tomas",
    rotatedDaysAgo: 61,
    itemsPerRun: 34,
    durationSec: 48,
    createdDaysAgo: 320,
    payload: [id("tick_id", "tick_", true), time("scheduled_for")],
    steps: [
      { key: "schedule.daily_0800", kind: "trigger" },
      { key: "stripe.list_due_invoices", kind: "record", app: "stripe" },
      { key: "logic.due_in_7_days", kind: "logic" },
      { key: "gmail.send_reminder", kind: "message", app: "gmail", weight: 4 },
    ],
  },
  wf_5n1q3r: {
    app: "openai",
    environment: "production",
    alertOnFailure: true,
    secretHint: "sk_••••9d10",
    rotatedBy: "hanna",
    rotatedDaysAgo: 12,
    itemsPerRun: 1,
    durationSec: 9,
    createdDaysAgo: 150,
    issue: "OpenAI returned 429 Too Many Requests at ai.classify_ticket",
    payload: [
      id("ticket_id", "tkt_", true),
      text("requester", EMAILS, true),
      text("subject", [
        "Cannot export my report",
        "Refund for a double charge",
        "SSO login loops",
        "Invoice shows the wrong VAT",
      ]),
      pick("channel", ["email", "chat", "form"]),
      time("created_at"),
    ],
    steps: [
      { key: "event.ticket_created", kind: "trigger" },
      {
        key: "ai.classify_ticket",
        kind: "ai",
        app: "openai",
        weight: 4,
        failure: "OpenAI returned 429 Too Many Requests",
      },
      { key: "logic.set_priority", kind: "logic" },
      { key: "linear.route_to_queue", kind: "record", app: "linear" },
      {
        key: "slack.alert_on_call",
        kind: "message",
        app: "slack",
        enabled: false,
        added: true,
      },
    ],
  },
  wf_9t4v6w: {
    app: "supabase",
    environment: "production",
    alertOnFailure: false,
    secretHint: "sb_••••77f0",
    rotatedBy: "omar",
    rotatedDaysAgo: 40,
    itemsPerRun: 120,
    durationSec: 94,
    createdDaysAgo: 98,
    payload: [id("tick_id", "tick_", true), time("scheduled_for")],
    steps: [
      { key: "schedule.monday_0700", kind: "trigger" },
      {
        key: "supabase.query_health_scores",
        kind: "record",
        app: "supabase",
        weight: 2,
      },
      { key: "ai.summarize_risk", kind: "ai", app: "openai", weight: 4 },
      { key: "gmail.send_digest", kind: "message", app: "gmail" },
    ],
  },
  wf_3b8x2y: {
    app: "googleDrive",
    environment: "production",
    alertOnFailure: true,
    secretHint: "whsec_••••c3e8",
    rotatedBy: "lena",
    rotatedDaysAgo: 88,
    itemsPerRun: 1,
    durationSec: 22,
    createdDaysAgo: 260,
    issue: "Google Drive upload timed out after 30s",
    payload: [
      id("envelope_id", "env_", true),
      text("signer_email", EMAILS, true),
      money("value", [120_000, 4_800_000]),
      pick("currency", ["usd", "eur"]),
      time("signed_at"),
    ],
    steps: [
      { key: "webhook.contract_signed", kind: "trigger" },
      { key: "request.fetch_pdf", kind: "request", weight: 2 },
      {
        key: "drive.store_contract",
        kind: "record",
        app: "googleDrive",
        weight: 3,
      },
      { key: "crm.update_deal", kind: "record", app: "supabase" },
    ],
  },
  wf_6k5m1n: {
    app: "stripe",
    environment: "production",
    alertOnFailure: true,
    secretHint: "sk_live_••••0b5d",
    rotatedBy: "tomas",
    rotatedDaysAgo: 18,
    itemsPerRun: 1,
    durationSec: 4,
    createdDaysAgo: 400,
    issue: "The shipping API answered slowly",
    payload: [
      id("order_id", "ord_", true),
      text("customer_email", EMAILS, true),
      money("total", [1_900, 48_000]),
      pick("currency", ["usd", "usd", "eur", "gbp"]),
      time("paid_at"),
    ],
    steps: [
      { key: "event.order_paid", kind: "trigger" },
      { key: "stripe.capture_payment", kind: "record", app: "stripe" },
      { key: "request.create_shipment", kind: "request", weight: 2 },
      { key: "record.update_stock", kind: "record", app: "supabase" },
      { key: "gmail.send_tracking", kind: "message", app: "gmail" },
    ],
  },
  wf_1p7r4s: {
    app: "notion",
    environment: "production",
    alertOnFailure: true,
    secretHint: "secret_••••5a21",
    rotatedBy: "nick",
    rotatedDaysAgo: 33,
    itemsPerRun: 1,
    durationSec: 41,
    createdDaysAgo: 75,
    issue: "Notion answered 502 Bad Gateway at notion.save_notes",
    payload: [
      id("call_id", "call_", true),
      text("attendee", NAMES, true),
      num("duration_min", [12, 64]),
      time("ended_at"),
    ],
    steps: [
      { key: "event.call_ended", kind: "trigger" },
      { key: "ai.transcribe_call", kind: "ai", app: "openai", weight: 5 },
      { key: "ai.summarize_notes", kind: "ai", app: "openai", weight: 3 },
      {
        key: "notion.save_notes",
        kind: "record",
        app: "notion",
        failure: "Notion answered 502 Bad Gateway",
      },
      { key: "crm.log_activity", kind: "record", app: "supabase" },
    ],
  },
  wf_4d2f8g: {
    app: "supabase",
    environment: "production",
    alertOnFailure: true,
    secretHint: "sb_••••e19a",
    rotatedBy: "omar",
    rotatedDaysAgo: 9,
    itemsPerRun: 12_400,
    durationSec: 132,
    createdDaysAgo: 180,
    issue: "The warehouse load retried after a lock timeout",
    payload: [id("tick_id", "tick_", true), time("scheduled_for")],
    steps: [
      { key: "schedule.every_hour", kind: "trigger" },
      {
        key: "supabase.read_changes",
        kind: "record",
        app: "supabase",
        weight: 2,
      },
      { key: "logic.transform_rows", kind: "logic" },
      { key: "request.load_warehouse", kind: "request", weight: 4 },
    ],
  },
  wf_7h3j5k: {
    app: "gmail",
    environment: "production",
    alertOnFailure: false,
    secretHint: "gm_••••62c4",
    rotatedBy: "hanna",
    rotatedDaysAgo: 51,
    itemsPerRun: 1,
    durationSec: 3,
    createdDaysAgo: 140,
    issue: "Gmail deferred one send",
    payload: [
      id("user_id", "usr_", true),
      text("email", EMAILS, true),
      pick("plan", ["free", "team", "business"]),
      time("signed_up_at"),
    ],
    steps: [
      { key: "event.user_signed_up", kind: "trigger" },
      { key: "gmail.send_welcome", kind: "message", app: "gmail" },
      { key: "delay.wait_1_day", kind: "delay" },
      { key: "logic.has_activated", kind: "logic" },
      {
        key: "gmail.send_tips",
        kind: "message",
        app: "gmail",
        enabled: false,
        added: true,
      },
    ],
  },
  wf_8l6m9n: {
    app: "slack",
    environment: "staging",
    alertOnFailure: false,
    secretHint: "whsec_••••d804",
    rotatedBy: "lena",
    rotatedDaysAgo: 3,
    itemsPerRun: 1,
    durationSec: 5,
    createdDaysAgo: 3,
    payload: [
      id("expense_id", "exp_", true),
      text("employee", NAMES, true),
      money("amount", [1_200, 240_000]),
      pick("currency", ["usd", "eur"]),
      time("filed_at"),
    ],
    steps: [
      { key: "webhook.expense_filed", kind: "trigger" },
      { key: "logic.over_limit", kind: "logic", added: true },
      { key: "slack.ask_approval", kind: "message", app: "slack", added: true },
      {
        key: "record.post_to_ledger",
        kind: "record",
        app: "supabase",
        added: true,
      },
    ],
  },
  wf_2q9r6s: {
    app: "supabase",
    environment: "production",
    alertOnFailure: true,
    secretHint: "sb_••••3fa7",
    rotatedBy: "tomas",
    rotatedDaysAgo: 70,
    itemsPerRun: 42,
    durationSec: 37,
    createdDaysAgo: 230,
    issue: "The supplier API returned 503 for some orders",
    payload: [id("tick_id", "tick_", true), time("scheduled_for")],
    steps: [
      { key: "schedule.daily_0600", kind: "trigger" },
      { key: "record.check_stock", kind: "record", app: "supabase" },
      { key: "logic.below_threshold", kind: "logic" },
      {
        key: "request.create_purchase_order",
        kind: "request",
        weight: 3,
      },
      { key: "slack.post_summary", kind: "message", app: "slack" },
    ],
  },
  wf_5t1u3v: {
    app: "slack",
    environment: "production",
    alertOnFailure: true,
    secretHint: "xoxb_••••8e3f",
    rotatedBy: "ines",
    rotatedDaysAgo: 27,
    itemsPerRun: 3,
    durationSec: 7,
    createdDaysAgo: 120,
    issue: "Slack returned 503 Service Unavailable at slack.post_alert",
    payload: [
      id("mention_id", "mnt_", true),
      text("author", NAMES, true),
      pick("platform", ["x", "reddit", "linkedin"]),
      text("text", [
        "Their onboarding is so smooth",
        "Still waiting on support",
        "Switched from Zapier last week",
      ]),
      time("posted_at"),
    ],
    steps: [
      { key: "event.brand_mentioned", kind: "trigger" },
      { key: "ai.score_sentiment", kind: "ai", app: "openai", weight: 3 },
      { key: "logic.is_negative", kind: "logic" },
      {
        key: "slack.post_alert",
        kind: "message",
        app: "slack",
        failure: "Slack returned 503 Service Unavailable",
      },
    ],
  },
}

/** A workflow made on this page: its trigger and nothing after it yet. */
function genericSeed(workflow: WorkflowItem): DetailSeed {
  const prefix =
    workflow.trigger === "Schedule"
      ? "schedule"
      : workflow.trigger === "Webhook"
        ? "webhook"
        : "event"
  return {
    app: "slack",
    environment: "production",
    alertOnFailure: true,
    secretHint: "whsec_••••0000",
    rotatedBy: workflow.owner.id,
    rotatedDaysAgo: 0,
    itemsPerRun: 1,
    durationSec: 2,
    createdDaysAgo: 0,
    payload: [id("event_id", "evt_", true), time("received_at")],
    steps: [{ key: `${prefix}.start`, kind: "trigger", added: true }],
  }
}

/** A seeded workflow's seed, or the seed its copy came from. */
function seedOf(workflow: WorkflowItem) {
  const own = DETAIL_SEEDS[workflow.id]
  if (own) return { seed: own, seeded: true }
  const source = WORKFLOWS.find(
    (item) =>
      workflow.slug.startsWith(`${item.slug}-copy`) && item.id in DETAIL_SEEDS
  )
  return source
    ? { seed: DETAIL_SEEDS[source.id], seeded: false }
    : { seed: genericSeed(workflow), seeded: false }
}

// ── Deterministic generation ──

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

/** How long a schedule waits between runs; events spread their 28 days. */
function intervalOf(
  workflow: Pick<WorkflowItem, "trigger" | "cadence" | "runs">
) {
  const cadence = workflow.cadence.toLowerCase()
  if (workflow.trigger === "Schedule") {
    if (cadence.includes("hour")) return HOUR_MS
    if (cadence.startsWith("mondays") || cadence.includes("week"))
      return 7 * DAY_MS
    return DAY_MS
  }
  return workflow.runs > 0 ? (28 * DAY_MS) / workflow.runs : null
}

/** History older than this is never drawn: the chart shows a day. */
const HISTORY_MS = 2 * DAY_MS

/** The seed's runs, newest first, anchored on its last run. */
function seedRuns(workflow: WorkflowItem, seed: DetailSeed): WorkflowRun[] {
  if (!workflow.lastRunAt || workflow.runs === 0) return []
  const every = intervalOf(workflow)
  if (every === null) return []
  const random = prng(hashOf(workflow.id))
  const last = Date.parse(workflow.lastRunAt)
  const failShare = 1 - workflow.successRate / 100
  const runs: WorkflowRun[] = []
  let seq = 58_000 + (hashOf(workflow.id) % 900) * 40
  for (
    let at = last, index = 0;
    at > REFERENCE_MS - HISTORY_MS && index < 400;
    index++
  ) {
    // The newest run is the record's last run; older ones follow its rate.
    const outcome: RunOutcome =
      index === 0
        ? workflow.lastRun === "Failed"
          ? "failed"
          : "succeeded"
        : random() < failShare * 0.6
          ? "failed"
          : random() < failShare * 0.5
            ? "partial"
            : "succeeded"
    const items =
      outcome === "failed"
        ? 0
        : Math.max(
            1,
            Math.round(
              seed.itemsPerRun *
                (0.7 + random() * 0.6) *
                (outcome === "partial" ? 0.55 : 1)
            )
          )
    runs.push({
      id: `run_${++seq}`,
      startedAt: at,
      durationSec: Math.max(
        1,
        Math.round(
          seed.durationSec *
            (0.8 + random() * 0.4) *
            (outcome === "partial" ? 1.6 : 1)
        )
      ),
      items,
      outcome,
      message:
        outcome === "succeeded"
          ? undefined
          : (seed.issue ?? "A step answered slowly"),
    })
    const jitter = workflow.trigger === "Schedule" ? 0 : 0.4 + random() * 1.2
    at -= workflow.trigger === "Schedule" ? every : Math.round(every * jitter)
  }
  return runs
}

const daysAgo = (days: number) => REFERENCE_MS - days * DAY_MS

export function detailsOf(workflow: WorkflowItem): WorkflowDetails {
  const { seed, seeded } = seedOf(workflow)
  // History reads the seed record, so a manual run adds to it, not reshapes it.
  const record = WORKFLOWS.find((item) => item.id === workflow.id) ?? workflow
  const ran = seeded && record.runs > 0
  const total = seed.steps.reduce((sum, step) => sum + (step.weight ?? 1), 0)
  return {
    app: seed.app,
    environment: seed.environment,
    alertOnFailure: seed.alertOnFailure,
    secret: {
      hint: seed.secretHint,
      rotatedAt: daysAgo(seed.rotatedDaysAgo),
      rotatedBy: seed.rotatedBy,
    },
    principal: `svc-${workflow.slug.split("/").pop() ?? "flow"}`,
    steps: seed.steps.map((step, index) => ({
      id: `${workflow.id}-step-${index + 1}`,
      key: step.key,
      kind: step.kind,
      app: step.app ?? null,
      enabled: step.enabled ?? true,
      added: ran ? (step.added ?? false) : true,
      failure: ran && record.lastRun === "Failed" ? step.failure : undefined,
      avgSec:
        Math.round(((seed.durationSec * (step.weight ?? 1)) / total) * 10) / 10,
      columns: step.kind === "trigger" ? seed.payload : KIND_COLUMNS[step.kind],
    })),
    runs: seeded ? seedRuns(record, seed) : [],
    itemsPerRun: seed.itemsPerRun,
    durationSec: seed.durationSec,
    createdAt: daysAgo(seed.createdDaysAgo),
  }
}

// ── Derived state ──

export function statusOf(
  workflow: WorkflowItem,
  running: boolean
): WorkflowStatus {
  if (running) return "running"
  if (!workflow.enabled) return "paused"
  if (workflow.lastRun === "Failed") return "failing"
  if (workflow.runs === 0) return "pending"
  if (workflow.successRate < 90) return "degraded"
  return "healthy"
}

/** Failing first, then degraded, paused and the rest, each by name. */
export function triageOrder(workflows: WorkflowItem[]) {
  return [...workflows].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(statusOf(a, false)) -
        STATUS_ORDER.indexOf(statusOf(b, false)) || a.name.localeCompare(b.name)
  )
}

export const enabledOf = (details: WorkflowDetails) =>
  details.steps.filter((step) => step.enabled)

/** 24 hourly cells, oldest first; the last is the current, partial hour. */
export function hoursOf(
  workflow: WorkflowItem,
  runs: WorkflowRun[]
): HourCell[] {
  return Array.from({ length: HOURS }, (_, index) => {
    const start = CURRENT_HOUR_MS - (HOURS - 1 - index) * HOUR_MS
    const inHour = runs.filter(
      (run) => run.startedAt >= start && run.startedAt < start + HOUR_MS
    )
    const failed = inHour.filter((run) => run.outcome === "failed").length
    const partial = inHour.some((run) => run.outcome === "partial")
    const outcome: HourOutcome =
      inHour.length === 0
        ? workflow.enabled
          ? "none"
          : "skipped"
        : failed > 0
          ? "failed"
          : partial
            ? "partial"
            : "succeeded"
    return {
      start,
      outcome,
      runs: inHour.length,
      failed,
      items: inHour.reduce((sum, run) => sum + run.items, 0),
    }
  })
}

export const itemsOf = (hours: HourCell[]) =>
  hours.reduce((sum, hour) => sum + hour.items, 0)

/** The next scheduled run, or null for events and paused workflows. */
export function nextRunAt(workflow: WorkflowItem, runs: WorkflowRun[]) {
  if (!workflow.enabled || workflow.trigger !== "Schedule") return null
  const every = intervalOf(workflow)
  if (every === null) return null
  const last = runs[0]?.startedAt ?? REFERENCE_MS
  let next = last + every
  while (next <= REFERENCE_MS) next += every
  return next
}

/** The trigger's source: a URL, a cron line or an event name. */
export function sourceOf(workflow: WorkflowItem) {
  const cadence = workflow.cadence.toLowerCase()
  if (workflow.trigger === "Webhook") return `${WEBHOOK_HOST}/${workflow.slug}`
  if (workflow.trigger === "Event") {
    const noun = cadence.replace(/^on\s+/, "").replace(/\s+/g, "_")
    return `${workflow.slug.split("/")[0]}.${noun || "event"}`
  }
  const at = cadence.match(/(\d{1,2}):(\d{2})/)
  const minute = at ? Number(at[2]) : 0
  const hour = at ? Number(at[1]) : 0
  if (cadence.includes("hour")) return `${minute} * * * *`
  if (cadence.startsWith("mondays")) return `${minute} ${hour} * * 1`
  return `${minute} ${hour} * * *`
}

// ── Sample rows ──

export const PREVIEW_ROWS = 8

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

function sampleValue(
  spec: ColumnSpec,
  random: () => number,
  rowIndex: number,
  gapMs: number
): SampleValue {
  const from = (values: string[]) =>
    values[Math.floor(random() * values.length)]
  switch (spec.type) {
    case "id":
      return `${spec.prefix ?? ""}${Array.from({ length: 10 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("")}`
    case "text":
    case "enum":
    case "json":
      return from(spec.values ?? [spec.name])
    case "number": {
      const [min, max] = spec.range ?? [0, 100]
      const raw = min + Math.floor(random() * (max - min + 1))
      return spec.decimals ? raw / 10 ** spec.decimals : raw
    }
    case "money": {
      const [min, max] = spec.range ?? [0, 100_000]
      return min + Math.floor(random() * (max - min + 1))
    }
    case "timestamp":
    case "date": {
      const offset = (rowIndex + random()) * gapMs
      return spec.future ? REFERENCE_MS + offset : REFERENCE_MS - offset
    }
    case "boolean":
      return random() < 0.78
  }
}

/** Sample items, newest first; `draw` re-rolls the sample. */
export function sampleRows(
  step: Pick<WorkflowStep, "id" | "columns">,
  every: number,
  draw = 0
): SampleRow[] {
  const random = prng(hashOf(`${step.id}#${draw}`))
  const gapMs = Math.min(7 * DAY_MS, Math.max(1_000, Math.round(every)))
  return Array.from({ length: PREVIEW_ROWS }, (_, rowIndex) =>
    Object.fromEntries(
      step.columns.map((spec) => [
        spec.name,
        sampleValue(spec, random, rowIndex, gapMs),
      ])
    )
  )
}

/** How far apart the sample's items sit, from the workflow's pace. */
export function sampleGapOf(workflow: WorkflowItem) {
  return intervalOf(workflow) ?? HOUR_MS
}

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

/** Seconds as a span: "41s", "2m 14s", "1h 03m"; tenths under ten seconds. */
export function formatDuration(seconds: number) {
  if (seconds < 10 && !Number.isInteger(seconds)) return `${seconds}s`
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${pad(total % 60)}s`
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m`
}

/** "14:20" UTC */
export function formatClock(ms: number) {
  const date = new Date(ms)
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** "Sep 29" */
export const formatDay = (ms: number) => dayFormat.format(ms)

/** "Sep 29, 14:20 UTC" */
export const formatDateTime = (ms: number) =>
  `${formatDay(ms)}, ${formatClock(ms)} UTC`

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

/** The cell text of a sample value, by field type. */
export function formatSample(
  spec: ColumnSpec,
  value: SampleValue,
  row: SampleRow
) {
  if (value === null) return "NULL"
  switch (spec.type) {
    case "money": {
      const currency = String(row.currency ?? "usd").toUpperCase()
      return `${(Number(value) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    }
    case "number":
      return Number(value).toLocaleString("en-US", {
        minimumFractionDigits: spec.decimals ?? 0,
        maximumFractionDigits: spec.decimals ?? 0,
      })
    case "timestamp": {
      const date = new Date(Number(value))
      return `${date.toISOString().slice(0, 10)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    }
    case "date":
      return new Date(Number(value)).toISOString().slice(0, 10)
    case "boolean":
      return value ? "true" : "false"
    default:
      return String(value)
  }
}

/** Personal data keeps its shape and loses its content. */
export function maskSample(value: string) {
  if (value.includes("@")) {
    const [local, domain] = value.split("@")
    return `${local.slice(0, 1)}${"•".repeat(5)}@${domain}`
  }
  return value
    .split(" ")
    .map(
      (word) => `${word.slice(0, 1)}${"•".repeat(Math.max(3, word.length - 1))}`
    )
    .join(" ")
}

export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${count} ${count === 1 ? noun : many}`

/** "1 item", "1.2K items": a compact count with its noun. */
export const formatItems = (count: number) =>
  `${formatCompact(count)} ${Math.round(count) === 1 ? "item" : "items"}`

/** A fresh redacted secret tail after a rotation. */
export function rotatedHint(hint: string, salt: number) {
  const head = hint.split("••••")[0] ?? ""
  const tail = (hashOf(`${hint}#${salt}`) % 65_536)
    .toString(16)
    .padStart(4, "0")
  return `${head}••••${tail}`
}
