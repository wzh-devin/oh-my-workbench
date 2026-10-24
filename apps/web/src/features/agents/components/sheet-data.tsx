/**
 * The agent sheet's data: each agent's channel, tools, session history and
 * tool output. History derives from the seed record on one reference time, and
 * preview rows generate from each field's spec, so the demo reads the same on
 * every load.
 */
import { type ReactNode } from "react"
import {
  BanknoteIcon,
  CalendarClockIcon,
  CalendarIcon,
  CircleCheckIcon,
  FileJson2Icon,
  FileTextIcon,
  GlobeIcon,
  HashIcon,
  KeyRoundIcon,
  ListIcon,
  PencilLineIcon,
  SearchIcon,
  SendIcon,
  TypeIcon,
} from "lucide-react"

import { type BadgeProps } from "@/components/reui/badge"
import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon"
import { Gemini } from "@/components/ui/svgs/gemini"
import { GithubDark } from "@/components/ui/svgs/githubDark"
import { GithubLight } from "@/components/ui/svgs/githubLight"
import { Gmail } from "@/components/ui/svgs/gmail"
import { GoogleCalendar } from "@/components/ui/svgs/googleCalendar"
import { GoogleDrive } from "@/components/ui/svgs/googleDrive"
import { Linear } from "@/components/ui/svgs/linear"
import { Meta } from "@/components/ui/svgs/meta"
import { Neon } from "@/components/ui/svgs/neon"
import { Notion } from "@/components/ui/svgs/notion"
import { Openai } from "@/components/ui/svgs/openai"
import { OpenaiDark } from "@/components/ui/svgs/openaiDark"
import { Redis } from "@/components/ui/svgs/redis"
import { Slack } from "@/components/ui/svgs/slack"
import { Stripe } from "@/components/ui/svgs/stripe"
import { Supabase } from "@/components/ui/svgs/supabase"
import { Zoom } from "@/components/ui/svgs/zoom"
import { type TeamMemberId } from "@/lib/workspace/team"

import { AGENT_RECORDS, type AgentModel, type AgentRecord } from "./data"

// customize: the channel failure alerts land in, and the agents' API host.
export const ALERT_CHANNEL = "#ops-alerts"
const AGENT_HOST = "https://agents.flowly.dev/v1"

const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** "Now" for the demo; the Dashboard and Workflows read the same instant. */
export const REFERENCE_MS = Date.parse("2026-10-06T09:50:00Z")
export const CURRENT_HOUR_MS = REFERENCE_MS - (REFERENCE_MS % HOUR_MS)
export const HOURS = 24

// ── Types ──

export type SheetTab = "overview" | "tools" | "preview" | "settings"
export type Environment = "production" | "staging" | "sandbox"
export type AgentHealth =
  "healthy" | "running" | "draft" | "overBudget" | "failing" | "paused"
export type ToolKind =
  "read" | "search" | "write" | "message" | "schedule" | "request"
export type AppId =
  | "slack"
  | "gmail"
  | "linear"
  | "notion"
  | "googleDrive"
  | "googleCalendar"
  | "zoom"
  | "stripe"
  | "supabase"
  | "neon"
  | "redis"
  | "github"
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
export type SessionOutcome = "resolved" | "handedOff" | "failed"
export type HourOutcome = SessionOutcome | "paused" | "none"

/** How a sample value generates; the view formats it by `type`. */
export type ColumnSpec = {
  name: string
  type: ColumnType
  /** The tool output's key field. */
  key?: boolean
  /** Personal data: the preview masks it until the reader unmasks. */
  pii?: boolean
  /** Pool for text, enum and json fields. */
  values?: string[]
  /** Id prefix: "thr_", "iss_". */
  prefix?: string
  /** Inclusive range for numbers; money in minor units. */
  range?: [number, number]
  decimals?: number
  /** Timestamps after the reference instead of before it. */
  future?: boolean
}

export type AgentTool = {
  id: string
  /** The tool's handle in logs: "slack.post_message". */
  key: string
  kind: ToolKind
  /** The app the tool calls; null for a plain HTTP request. */
  app: AppId | null
  enabled: boolean
  /** Connected since the last session; cleared once a session calls it. */
  added: boolean
  /** Why the tool's last call failed; cleared by a good session. */
  failure?: string
  /** Typical call latency, in milliseconds. */
  avgMs: number
  /** Calls one session makes on average. */
  callsPerSession: number
  /** The fields one call returns, for the preview. */
  columns: ColumnSpec[]
}

export type AgentSession = {
  /** "ses_58494" */
  id: string
  startedAt: number
  durationSec: number
  /** Messages back and forth, the agent's replies included. */
  turns: number
  outcome: SessionOutcome
  /** Why the session was handed off or failed. */
  message?: string
  /** Test sessions carry who started them. */
  by?: TeamMemberId
}

export type HourCell = {
  start: number
  /** The hour at a glance: the worst outcome in it, or why it is empty. */
  outcome: HourOutcome
  sessions: number
  resolved: number
  handedOff: number
  failed: number
}

export type AgentSecret = {
  /** The redacted tail: never the key. */
  hint: string
  rotatedAt: number
  rotatedBy: TeamMemberId
}

/** What the sheet knows about an agent beyond its list record. */
export type AgentDetails = {
  /** The channel the agent takes sessions on. */
  app: AppId
  /** Where on that channel: "support@flowly.dev", "#data-alerts". */
  channel: string
  environment: Environment
  alertOnFailure: boolean
  secret: AgentSecret
  /** The service account the tools sign in as. */
  principal: string
  tools: AgentTool[]
  /** Newest first. */
  sessions: AgentSession[]
  /** Turns one session takes, for test sessions. */
  turnsPerSession: number
  durationSec: number
  /** Length of the agent's instructions; 0 until they are written. */
  instructionTokens: number
  createdAt: number
}

/** What the drawer changed on an agent beyond its list record. */
export type DetailPatch = Partial<
  Pick<AgentDetails, "environment" | "alertOnFailure" | "secret" | "tools">
> & {
  /** Test sessions started from the drawer, newest first. */
  manualSessions?: AgentSession[]
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

export const AGENT_HEALTH: Record<
  AgentHealth,
  { label: string; variant: BadgeProps["variant"] }
> = {
  healthy: { label: "Healthy", variant: "success-light" },
  running: { label: "Running", variant: "primary-light" },
  draft: { label: "Draft", variant: "info-light" },
  overBudget: { label: "Over Budget", variant: "warning-light" },
  failing: { label: "Failing", variant: "destructive-light" },
  paused: { label: "Paused", variant: "outline" },
}

/** Worst first: the triage order Previous and Next step through. */
const HEALTH_ORDER: AgentHealth[] = [
  "failing",
  "overBudget",
  "paused",
  "draft",
  "running",
  "healthy",
]

/** Stack order of the hourly chart, bottom to top. */
export const SESSION_OUTCOMES = ["resolved", "handedOff", "failed"] as const

export const OUTCOME_LABEL: Record<HourOutcome, string> = {
  resolved: "Resolved",
  handedOff: "Handed off",
  failed: "Failed",
  paused: "Paused",
  none: "No sessions",
}

const ICON = { "aria-hidden": true } as const

export const TOOL_KINDS: Record<ToolKind, { label: string; icon: ReactNode }> =
  {
    read: { label: "Read", icon: <FileTextIcon {...ICON} /> },
    search: { label: "Search", icon: <SearchIcon {...ICON} /> },
    write: { label: "Write", icon: <PencilLineIcon {...ICON} /> },
    message: { label: "Message", icon: <SendIcon {...ICON} /> },
    schedule: { label: "Schedule", icon: <CalendarClockIcon {...ICON} /> },
    request: { label: "Request", icon: <GlobeIcon {...ICON} /> },
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

export const APPS: Record<AppId, { label: string; logo: ReactNode }> = {
  slack: { label: "Slack", logo: <Slack /> },
  gmail: { label: "Gmail", logo: <Gmail /> },
  linear: { label: "Linear", logo: <Linear /> },
  notion: { label: "Notion", logo: <Notion /> },
  googleDrive: {
    label: "Google Drive",

    logo: <GoogleDrive />,
  },
  googleCalendar: {
    label: "Google Calendar",

    logo: <GoogleCalendar />,
  },
  zoom: { label: "Zoom", logo: <Zoom /> },
  stripe: { label: "Stripe", logo: <Stripe /> },
  supabase: { label: "Supabase", logo: <Supabase /> },
  neon: { label: "Neon", logo: <Neon /> },
  redis: { label: "Redis", logo: <Redis /> },
  github: {
    label: "GitHub",

    logo: (
      <>
        <GithubLight className="dark:hidden" />
        <GithubDark className="hidden dark:block" />
      </>
    ),
  },
}

/** Who makes each model; the title row's tile wears the maker's mark. */
export const MODEL_PROVIDER: Record<AgentModel, string> = {
  "GPT-5": "OpenAI",
  "Claude Opus 5.5": "Anthropic",
  "Claude Sonnet 5.5": "Anthropic",
  "Gemini 3 Pro": "Google",
  "Llama 4": "Meta",
}

export const MODEL_LOGO: Record<AgentModel, ReactNode> = {
  "GPT-5": (
    <>
      <Openai className="dark:hidden" />
      <OpenaiDark className="hidden dark:block" />
    </>
  ),
  "Claude Opus 5.5": <ClaudeAiIcon />,
  "Claude Sonnet 5.5": <ClaudeAiIcon />,
  "Gemini 3 Pro": <Gemini />,
  "Llama 4": <Meta />,
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
const cash = (name: string, range: [number, number]): ColumnSpec => ({
  name,
  type: "money",
  range,
})
const time = (name: string, future = false): ColumnSpec => ({
  name,
  type: "timestamp",
  future,
})
const day = (name: string): ColumnSpec => ({ name, type: "date" })
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
const SUBJECTS = [
  "Cannot export my report",
  "Refund for a double charge",
  "SSO login loops",
  "Invoice shows the wrong VAT",
]
const ARTICLES = [
  "Export a report as CSV",
  "Request a refund",
  "Troubleshoot SSO sign-in",
  "Change your billing details",
]
const PRIORITIES = ["Urgent", "High", "Medium", "Low"]
const CURRENCIES = ["usd", "usd", "eur", "gbp"]

/** What each kind of tool returns, when the seed names nothing closer. */
const KIND_COLUMNS: Record<ToolKind, ColumnSpec[]> = {
  read: [
    id("record_id", "rec_", true),
    pick("source", ["api", "database", "file"]),
    num("fields", [3, 24]),
    time("fetched_at"),
  ],
  search: [
    id("result_id", "res_", true),
    text("title", ARTICLES),
    num("score", [62, 99], 2),
    time("updated_at"),
  ],
  write: [
    id("change_id", "chg_", true),
    pick("object", ["contact", "deal", "ticket"]),
    pick("action", ["created", "updated"]),
    time("written_at"),
  ],
  message: [
    id("message_id", "msg_", true),
    text("recipient", EMAILS, true),
    pick("status", ["sent", "delivered", "read"]),
    time("sent_at"),
  ],
  schedule: [
    id("event_id", "evt_", true),
    text("attendee", EMAILS, true),
    time("starts_at", true),
    pick("status", ["confirmed", "tentative"]),
  ],
  request: [
    id("request_id", "req_", true),
    pick("status", ["200", "201", "202"]),
    num("duration_ms", [80, 900]),
    time("responded_at"),
  ],
}

const USAGE_COLUMNS = [
  id("account_id", "acc_", true),
  text("company", COMPANIES),
  num("active_seats", [3, 420]),
  num("usage_change_pct", [-64, 18]),
]

const CONTRACT_COLUMNS = [
  id("file_id", "file_", true),
  text("vendor", COMPANIES),
  pick("type", ["MSA", "DPA", "Order form"]),
  num("pages", [3, 48]),
]

// ── Seeds ──

type ToolSeed = {
  key: string
  kind: ToolKind
  app?: AppId
  avgMs: number
  /** Calls one session makes; 1 when unset. */
  calls?: number
  enabled?: boolean
  added?: boolean
  /** Set on the tool an Error agent fails at. */
  failure?: string
  columns?: ColumnSpec[]
}

type DetailSeed = {
  app: AppId
  channel: string
  environment: Environment
  alertOnFailure: boolean
  secretHint: string
  rotatedBy: TeamMemberId
  rotatedDaysAgo: number
  principal: string
  turnsPerSession: number
  durationSec: number
  instructionTokens: number
  createdDaysAgo: number
  /** Minutes before the reference the newest session started; unset reads
   *  the record's last active day at 17:30 UTC. */
  lastMinutesAgo?: number
  /** Shares of sessions handed to a person and failing. */
  handoffShare: number
  failShare: number
  /** What a handed-off session says. */
  handoff: string
  /** What a failed session says. */
  issue: string
  /** Error agents: how long the failure has lasted; sessions since fail. */
  failingHours?: number
  tools: ToolSeed[]
}

const DETAIL_SEEDS: Record<string, DetailSeed> = {
  agt_7f2k9q: {
    app: "gmail",
    channel: "support@flowly.dev",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••a71c",
    rotatedBy: "hanna",
    rotatedDaysAgo: 24,
    principal: "svc-support-triage",
    turnsPerSession: 6,
    durationSec: 38,
    instructionTokens: 1840,
    createdDaysAgo: 210,
    lastMinutesAgo: 2,
    handoffShare: 0.16,
    failShare: 0.01,
    handoff: "Asked for a person: the refund is over the agent's limit",
    issue: "Linear answered 429 Too Many Requests; the ticket stayed untagged",
    tools: [
      {
        key: "gmail.read_thread",
        kind: "read",
        app: "gmail",
        avgMs: 320,
        columns: [
          id("thread_id", "thr_", true),
          text("from", EMAILS, true),
          text("subject", SUBJECTS),
          time("received_at"),
        ],
      },
      {
        key: "notion.search_help_center",
        kind: "search",
        app: "notion",
        avgMs: 540,
        calls: 1.4,
        columns: [
          id("page_id", "pg_", true),
          text("title", ARTICLES),
          num("score", [62, 99], 2),
          time("updated_at"),
        ],
      },
      {
        key: "linear.create_ticket",
        kind: "write",
        app: "linear",
        avgMs: 410,
        calls: 0.9,
        columns: [
          id("issue_id", "iss_", true),
          pick("queue", ["Billing", "Technical", "Account"]),
          pick("priority", PRIORITIES),
          time("created_at"),
        ],
      },
      {
        key: "linear.set_priority",
        kind: "write",
        app: "linear",
        avgMs: 260,
        calls: 0.9,
        columns: [
          id("issue_id", "iss_", true),
          pick("priority", PRIORITIES),
          text("reason", [
            "Mentions an outage",
            "Enterprise plan",
            "Repeat contact",
            "Billing dispute",
          ]),
          time("updated_at"),
        ],
      },
      {
        key: "slack.page_on_call",
        kind: "message",
        app: "slack",
        avgMs: 380,
        calls: 0.05,
        enabled: false,
        added: true,
      },
    ],
  },
  agt_3m8w1z: {
    app: "gmail",
    channel: "sales@flowly.dev",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••4e2b",
    rotatedBy: "omar",
    rotatedDaysAgo: 61,
    principal: "svc-lead-qualifier",
    turnsPerSession: 4,
    durationSec: 22,
    instructionTokens: 1260,
    createdDaysAgo: 320,
    lastMinutesAgo: 11,
    handoffShare: 0.22,
    failShare: 0.02,
    handoff: "Handed to sales: an enterprise lead over 500 seats",
    issue: "Google Calendar had no free slot in the next 5 days",
    tools: [
      {
        key: "supabase.find_account",
        kind: "read",
        app: "supabase",
        avgMs: 180,
        columns: [
          id("account_id", "acc_", true),
          text("company", COMPANIES),
          num("employees", [12, 4800]),
          pick("plan", ["free", "team", "business"]),
        ],
      },
      {
        key: "notion.read_icp",
        kind: "search",
        app: "notion",
        avgMs: 460,
        columns: [
          id("section_id", "sec_", true),
          text("criterion", [
            "50 to 500 employees",
            "Uses a CRM",
            "EU or US based",
            "Ops team of 3 or more",
          ]),
          flag("matched"),
        ],
      },
      {
        key: "calendar.book_meeting",
        kind: "schedule",
        app: "googleCalendar",
        avgMs: 720,
        calls: 0.35,
      },
      {
        key: "slack.notify_rep",
        kind: "message",
        app: "slack",
        avgMs: 300,
        calls: 0.35,
        columns: [
          id("message_id", "msg_", true),
          pick("channel", ["#sales-emea", "#sales-na"]),
          pick("status", ["sent", "delivered"]),
          time("sent_at"),
        ],
      },
    ],
  },
  agt_9k4p2r: {
    app: "gmail",
    channel: "ap@flowly.dev",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••9d10",
    rotatedBy: "lena",
    rotatedDaysAgo: 12,
    principal: "svc-invoice-reconciler",
    turnsPerSession: 5,
    durationSec: 64,
    instructionTokens: 2210,
    createdDaysAgo: 150,
    lastMinutesAgo: 968,
    handoffShare: 0.12,
    failShare: 0.03,
    handoff: "Sent to finance: the amount is more than 2% off the PO",
    issue: "Supabase refused the connection: too many clients",
    failingHours: 4,
    tools: [
      {
        key: "drive.read_invoice_pdf",
        kind: "read",
        app: "googleDrive",
        avgMs: 880,
        columns: [
          id("invoice_id", "inv_", true),
          text("vendor", COMPANIES),
          cash("amount", [12_000, 2_400_000]),
          pick("currency", ["usd", "eur"]),
          day("issued_on"),
        ],
      },
      {
        key: "supabase.match_purchase_order",
        kind: "search",
        app: "supabase",
        avgMs: 240,
        failure: "Supabase refused the connection: too many clients",
        columns: [
          id("po_id", "po_", true),
          cash("po_amount", [12_000, 2_400_000]),
          pick("currency", ["usd", "eur"]),
          pick("match", ["exact", "within 2%", "mismatch"]),
        ],
      },
      {
        key: "slack.flag_mismatch",
        kind: "message",
        app: "slack",
        avgMs: 330,
        calls: 0.15,
      },
    ],
  },
  agt_5c6t8n: {
    app: "slack",
    channel: "#cs-leads",
    environment: "production",
    alertOnFailure: false,
    secretHint: "••••77f0",
    rotatedBy: "omar",
    rotatedDaysAgo: 40,
    principal: "svc-churn-analyst",
    turnsPerSession: 3,
    durationSec: 48,
    instructionTokens: 980,
    createdDaysAgo: 98,
    lastMinutesAgo: 2490,
    handoffShare: 0.05,
    failShare: 0.03,
    handoff: "Flagged for a CSM: usage fell more than 40%",
    issue: "The Supabase query timed out after 30s",
    tools: [
      {
        key: "supabase.query_usage",
        kind: "read",
        app: "supabase",
        avgMs: 1200,
        calls: 2,
        columns: USAGE_COLUMNS,
      },
      {
        key: "stripe.list_subscriptions",
        kind: "read",
        app: "stripe",
        avgMs: 420,
        columns: [
          id("subscription_id", "sub_", true),
          cash("mrr", [4_900, 480_000]),
          pick("currency", CURRENCIES),
          time("renews_at", true),
        ],
      },
      {
        key: "gmail.send_digest",
        kind: "message",
        app: "gmail",
        avgMs: 510,
        calls: 0.1,
      },
    ],
  },
  agt_2h7v5k: {
    app: "zoom",
    channel: "Sales calls",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••c3e8",
    rotatedBy: "nick",
    rotatedDaysAgo: 33,
    principal: "svc-meeting-summarizer",
    turnsPerSession: 3,
    durationSec: 74,
    instructionTokens: 1420,
    createdDaysAgo: 75,
    lastMinutesAgo: 26,
    handoffShare: 0.04,
    failShare: 0.02,
    handoff: "Left for the rep: the call ended without a next step",
    issue: "Zoom sent the transcript late; the notes were not saved",
    tools: [
      {
        key: "zoom.fetch_transcript",
        kind: "read",
        app: "zoom",
        avgMs: 1600,
        columns: [
          id("meeting_id", "mtg_", true),
          text("host", NAMES, true),
          num("duration_min", [12, 64]),
          time("ended_at"),
        ],
      },
      {
        key: "notion.save_notes",
        kind: "write",
        app: "notion",
        avgMs: 520,
        columns: [
          id("page_id", "pg_", true),
          text("title", [
            "Northwind renewal call",
            "Globex onboarding sync",
            "Initech pricing review",
            "Hooli quarterly review",
          ]),
          num("action_items", [0, 7]),
          time("saved_at"),
        ],
      },
      {
        key: "linear.create_action_items",
        kind: "write",
        app: "linear",
        avgMs: 380,
        calls: 1.8,
        columns: [
          id("issue_id", "iss_", true),
          text("title", [
            "Send the revised quote",
            "Share the SSO guide",
            "Book a follow-up",
            "Loop in legal",
          ]),
          text("assignee", NAMES, true),
          time("due_at", true),
        ],
      },
      {
        key: "supabase.log_activity",
        kind: "write",
        app: "supabase",
        avgMs: 160,
        columns: [
          id("activity_id", "act_", true),
          pick("object", ["deal", "contact"]),
          pick("change", ["created", "updated"]),
          time("logged_at"),
        ],
      },
    ],
  },
  agt_8b1q4d: {
    app: "github",
    channel: "flowly/integrations",
    environment: "production",
    alertOnFailure: false,
    secretHint: "••••0b5d",
    rotatedBy: "tomas",
    rotatedDaysAgo: 18,
    principal: "svc-code-review",
    turnsPerSession: 2,
    durationSec: 96,
    instructionTokens: 2640,
    createdDaysAgo: 400,
    handoffShare: 0.3,
    failShare: 0.04,
    handoff: "Asked for a maintainer: the diff touches auth",
    issue: "GitHub answered 422 on a review comment",
    tools: [
      {
        key: "github.read_diff",
        kind: "read",
        app: "github",
        avgMs: 640,
        columns: [
          id("pull_id", "pr_", true),
          text("title", [
            "Retry Stripe webhooks on 5xx",
            "Bump the Slack SDK",
            "Add a Notion page cache",
            "Fix the OAuth refresh race",
          ]),
          num("files_changed", [1, 24]),
          num("lines_changed", [6, 840]),
        ],
      },
      {
        key: "github.post_review",
        kind: "write",
        app: "github",
        avgMs: 520,
        columns: [
          id("review_id", "rev_", true),
          pick("verdict", ["comment", "approve", "request_changes"]),
          num("comments", [0, 9]),
          time("posted_at"),
        ],
      },
    ],
  },
  agt_4n9s3e: {
    app: "googleDrive",
    channel: "Legal drive",
    environment: "staging",
    alertOnFailure: true,
    secretHint: "••••5a21",
    rotatedBy: "ines",
    rotatedDaysAgo: 2,
    principal: "svc-contract-reviewer",
    turnsPerSession: 4,
    durationSec: 120,
    instructionTokens: 3120,
    createdDaysAgo: 2,
    handoffShare: 0.5,
    failShare: 0.02,
    handoff: "Sent to legal: an unlimited liability clause",
    issue: "Google Drive could not open a scanned PDF",
    tools: [
      {
        key: "drive.read_contract",
        kind: "read",
        app: "googleDrive",
        avgMs: 900,
        columns: CONTRACT_COLUMNS,
      },
      {
        key: "notion.search_playbook",
        kind: "search",
        app: "notion",
        avgMs: 480,
        calls: 3,
        columns: [
          id("clause_id", "cl_", true),
          text("clause", [
            "Unlimited liability",
            "Auto renewal",
            "Data residency",
            "Termination for convenience",
          ]),
          pick("risk", ["high", "medium", "low"]),
          num("score", [62, 99], 2),
        ],
      },
    ],
  },
  agt_6r2j7m: {
    app: "slack",
    channel: "#customer-onboarding",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••e19a",
    rotatedBy: "hanna",
    rotatedDaysAgo: 9,
    principal: "svc-onboarding-guide",
    turnsPerSession: 7,
    durationSec: 140,
    instructionTokens: 1960,
    createdDaysAgo: 180,
    lastMinutesAgo: 756,
    handoffShare: 0.09,
    failShare: 0.01,
    handoff: "Handed to support: an SSO setup question",
    issue: "Notion search returned no pages",
    tools: [
      {
        key: "notion.search_docs",
        kind: "search",
        app: "notion",
        avgMs: 430,
        calls: 2.2,
        columns: [
          id("page_id", "pg_", true),
          text("title", [
            "Invite your team",
            "Connect Slack",
            "Set up SSO",
            "Create your first workflow",
          ]),
          num("score", [62, 99], 2),
          time("updated_at"),
        ],
      },
      {
        key: "supabase.read_workspace",
        kind: "read",
        app: "supabase",
        avgMs: 150,
        columns: [
          id("workspace_id", "ws_", true),
          text("admin", EMAILS, true),
          num("members", [2, 140]),
          pick("plan", ["free", "team", "business"]),
        ],
      },
      {
        key: "linear.open_ticket",
        kind: "write",
        app: "linear",
        avgMs: 400,
        calls: 0.1,
        columns: [
          id("issue_id", "iss_", true),
          pick("queue", ["Onboarding", "Technical"]),
          pick("priority", PRIORITIES),
          time("created_at"),
        ],
      },
    ],
  },
  agt_1k5y8w: {
    app: "slack",
    channel: "#expenses",
    environment: "production",
    alertOnFailure: false,
    secretHint: "••••62c4",
    rotatedBy: "lena",
    rotatedDaysAgo: 51,
    principal: "svc-expense-auditor",
    turnsPerSession: 3,
    durationSec: 18,
    instructionTokens: 760,
    createdDaysAgo: 140,
    handoffShare: 0.2,
    failShare: 0.02,
    handoff: "Sent to finance: over the per diem",
    issue: "Google Drive could not read a blurred receipt",
    tools: [
      {
        key: "drive.read_receipt",
        kind: "read",
        app: "googleDrive",
        avgMs: 700,
        columns: [
          id("receipt_id", "rcp_", true),
          text("employee", NAMES, true),
          cash("amount", [800, 96_000]),
          pick("currency", CURRENCIES),
          pick("category", ["Travel", "Meals", "Software", "Hardware"]),
        ],
      },
      {
        key: "slack.ask_for_receipt",
        kind: "message",
        app: "slack",
        avgMs: 290,
        calls: 0.3,
      },
    ],
  },
  agt_7d3u6f: {
    app: "slack",
    channel: "#renewals",
    environment: "staging",
    alertOnFailure: false,
    secretHint: "••••d804",
    rotatedBy: "omar",
    rotatedDaysAgo: 3,
    principal: "svc-renewal-forecaster",
    turnsPerSession: 4,
    durationSec: 56,
    instructionTokens: 1180,
    createdDaysAgo: 3,
    lastMinutesAgo: 1125,
    handoffShare: 0.1,
    failShare: 0.08,
    handoff: "Left for the account owner: no usage data yet",
    issue: "Linear search returned too many tickets to read",
    tools: [
      {
        key: "supabase.query_usage",
        kind: "read",
        app: "supabase",
        avgMs: 1100,
        columns: USAGE_COLUMNS,
      },
      {
        key: "linear.search_tickets",
        kind: "search",
        app: "linear",
        avgMs: 520,
        columns: [
          id("issue_id", "iss_", true),
          text("title", SUBJECTS),
          pick("state", ["Done", "In Progress", "Todo"]),
          time("updated_at"),
        ],
      },
      {
        key: "drive.read_contract",
        kind: "read",
        app: "googleDrive",
        avgMs: 860,
        added: true,
        columns: CONTRACT_COLUMNS,
      },
    ],
  },
  agt_0p8g2c: {
    app: "slack",
    channel: "#data-alerts",
    environment: "production",
    alertOnFailure: true,
    secretHint: "••••3fa7",
    rotatedBy: "tomas",
    rotatedDaysAgo: 70,
    principal: "svc-sync-monitor",
    turnsPerSession: 2,
    durationSec: 9,
    instructionTokens: 640,
    createdDaysAgo: 230,
    lastMinutesAgo: 7,
    handoffShare: 0.06,
    failShare: 0.02,
    handoff: "Paged on call: the job failed twice",
    issue: "Linear answered 401 Unauthorized at linear.open_incident",
    failingHours: 3,
    tools: [
      {
        key: "supabase.read_sync_log",
        kind: "read",
        app: "supabase",
        avgMs: 140,
        columns: [
          id("job_id", "job_", true),
          pick("source", ["stripe", "hubspot", "zendesk", "postgres"]),
          pick("status", ["succeeded", "succeeded", "failed", "running"]),
          num("rows", [0, 48_000]),
          time("finished_at"),
        ],
      },
      {
        key: "neon.check_warehouse",
        kind: "read",
        app: "neon",
        avgMs: 260,
        columns: [
          id("check_id", "chk_", true),
          pick("table", ["fct_orders", "dim_accounts", "fct_events"]),
          num("lag_min", [0, 95]),
          flag("fresh"),
        ],
      },
      {
        key: "redis.read_job_lock",
        kind: "read",
        app: "redis",
        avgMs: 40,
        columns: [
          id("lock_id", "lck_", true),
          pick("job", ["sync_stripe", "sync_hubspot", "load_warehouse"]),
          flag("held"),
          time("expires_at", true),
        ],
      },
      {
        key: "request.retry_sync",
        kind: "request",
        avgMs: 900,
        calls: 0.2,
      },
      {
        key: "linear.open_incident",
        kind: "write",
        app: "linear",
        avgMs: 380,
        calls: 0.06,
        failure: "Linear answered 401 Unauthorized",
        columns: [
          id("issue_id", "iss_", true),
          pick("severity", ["SEV-2", "SEV-3"]),
          text("title", [
            "Stripe sync failed twice",
            "Warehouse load stalled",
            "HubSpot sync is 2h behind",
          ]),
          time("opened_at"),
        ],
      },
      {
        key: "slack.post_alert",
        kind: "message",
        app: "slack",
        avgMs: 310,
        calls: 0.1,
        columns: [
          id("message_id", "msg_", true),
          pick("channel", ["#data-alerts", "#on-call"]),
          pick("status", ["sent", "delivered"]),
          time("sent_at"),
        ],
      },
    ],
  },
  agt_3w9a1h: {
    app: "linear",
    channel: "Support team",
    environment: "production",
    alertOnFailure: false,
    secretHint: "••••8e3f",
    rotatedBy: "hanna",
    rotatedDaysAgo: 27,
    principal: "svc-kb-writer",
    turnsPerSession: 5,
    durationSec: 92,
    instructionTokens: 1540,
    createdDaysAgo: 120,
    handoffShare: 0.25,
    failShare: 0.02,
    handoff: "Left as a draft for review: it cites an internal doc",
    issue: "Notion rejected the page: the title already exists",
    tools: [
      {
        key: "linear.read_resolved",
        kind: "read",
        app: "linear",
        avgMs: 330,
        columns: [
          id("issue_id", "iss_", true),
          text("title", SUBJECTS),
          pick("queue", ["Billing", "Technical", "Account"]),
          time("resolved_at"),
        ],
      },
      {
        key: "notion.draft_article",
        kind: "write",
        app: "notion",
        avgMs: 640,
        columns: [
          id("page_id", "pg_", true),
          text("title", ARTICLES),
          num("words", [320, 1400]),
          pick("state", ["draft", "in review"]),
        ],
      },
    ],
  },
}

/** The tools a new agent's count draws from, in order. */
const GENERIC_TOOLS: ToolSeed[] = [
  { key: "slack.post_message", kind: "message", app: "slack", avgMs: 300 },
  { key: "notion.search_docs", kind: "search", app: "notion", avgMs: 450 },
  { key: "gmail.send_email", kind: "message", app: "gmail", avgMs: 480 },
  { key: "supabase.read_record", kind: "read", app: "supabase", avgMs: 160 },
  { key: "linear.create_issue", kind: "write", app: "linear", avgMs: 400 },
  { key: "drive.read_file", kind: "read", app: "googleDrive", avgMs: 800 },
  { key: "request.http_get", kind: "request", avgMs: 600 },
]

/** "Support Triage Agent" -> "support-triage-agent" */
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "agent"

/** An agent made on this page: a staging draft with no instructions yet. */
function genericSeed(agent: AgentRecord): DetailSeed {
  const tail = (hashOf(agent.id) % 65_536).toString(16).padStart(4, "0")
  return {
    app: "slack",
    channel: "#agents",
    environment: "staging",
    alertOnFailure: true,
    secretHint: `••••${tail}`,
    rotatedBy: agent.owner.id,
    rotatedDaysAgo: 0,
    principal: `svc-${slugOf(agent.name)}`,
    turnsPerSession: 4,
    durationSec: 24,
    instructionTokens: 0,
    createdDaysAgo: 0,
    handoffShare: 0.1,
    failShare: 0.02,
    handoff: "Asked for a person",
    issue: "A tool answered with an error",
    tools: GENERIC_TOOLS.slice(0, Math.max(0, agent.tools)).map((tool) => ({
      ...tool,
      added: true,
    })),
  }
}

/** A copy: its source's channel and tools, but its own API key, service
 *  account and start day, as a new agent gets them. */
function copySeed(agent: AgentRecord, source: DetailSeed): DetailSeed {
  const own = genericSeed(agent)
  return {
    ...source,
    secretHint: own.secretHint,
    rotatedBy: own.rotatedBy,
    rotatedDaysAgo: own.rotatedDaysAgo,
    principal: own.principal,
    createdDaysAgo: own.createdDaysAgo,
  }
}

/** A seeded agent's seed, or the seed its copy came from. */
function seedOf(agent: AgentRecord) {
  const own = DETAIL_SEEDS[agent.id]
  if (own) return { seed: own, seeded: true }
  // A copy keeps its source's description (the drawer never edits it), so
  // the name is free to move on; a new agent starts undescribed.
  const source = AGENT_RECORDS.find(
    (item) =>
      item.id in DETAIL_SEEDS &&
      agent.description !== "" &&
      agent.description === item.description
  )
  return source
    ? { seed: copySeed(agent, DETAIL_SEEDS[source.id]), seeded: false }
    : { seed: genericSeed(agent), seeded: false }
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

/** History older than this is never charted; the list keeps 8 at least. */
const HISTORY_MS = 2 * DAY_MS
const MIN_SESSIONS = 8

/** Average time between sessions over the record's 28 days. */
function intervalOf(agent: Pick<AgentRecord, "sessions">) {
  return agent.sessions > 0 ? (28 * DAY_MS) / agent.sessions : null
}

/** Office hours are busier: sessions bunch up between 07:00 and 19:00 UTC. */
function paceAt(ms: number) {
  const hour = new Date(ms).getUTCHours()
  return hour >= 7 && hour < 19 ? 0.7 : 1.9
}

/** When the newest session started, from the record's last active day. */
function lastSessionAt(agent: AgentRecord, seed: DetailSeed) {
  if (seed.lastMinutesAgo !== undefined)
    return REFERENCE_MS - seed.lastMinutesAgo * MINUTE_MS
  const at = Date.parse(`${agent.lastActiveAt}T17:30:00Z`)
  return Math.min(at, REFERENCE_MS - 4 * MINUTE_MS)
}

/** The seed's sessions, newest first, anchored on the last active day. */
function seedSessions(agent: AgentRecord, seed: DetailSeed): AgentSession[] {
  const every = intervalOf(agent)
  if (!agent.lastActiveAt || every === null) return []
  const random = prng(hashOf(agent.id))
  const last = lastSessionAt(agent, seed)
  const failingSince =
    agent.status === "Error" && seed.failingHours !== undefined
      ? last - seed.failingHours * HOUR_MS
      : null
  // A draft only runs when its owner tests it.
  const by = agent.status === "Draft" ? agent.owner.id : undefined
  const drafts: Omit<AgentSession, "id">[] = []
  for (
    let at = last, index = 0;
    (at > REFERENCE_MS - HISTORY_MS || index < MIN_SESSIONS) &&
    index < agent.sessions &&
    index < 600;
    index++
  ) {
    const outcome: SessionOutcome =
      index === 0 && agent.status === "Error"
        ? "failed"
        : failingSince !== null && at > failingSince
          ? random() < 0.85
            ? "failed"
            : "resolved"
          : random() < seed.failShare
            ? "failed"
            : random() < seed.handoffShare
              ? "handedOff"
              : "resolved"
    const spread = 0.6 + random() * 0.8
    drafts.push({
      startedAt: at,
      durationSec: Math.max(
        2,
        Math.round(seed.durationSec * spread * (outcome === "failed" ? 0.4 : 1))
      ),
      turns: Math.max(
        1,
        Math.round(
          seed.turnsPerSession * spread * (outcome === "failed" ? 0.4 : 1)
        )
      ),
      outcome,
      message:
        outcome === "failed"
          ? seed.issue
          : outcome === "handedOff"
            ? seed.handoff
            : undefined,
      by,
    })
    at -= Math.round(every * (0.4 + random() * 1.2) * paceAt(at))
  }
  // Newest carries the highest number, as ids count up over time.
  const base = 58_000 + (hashOf(agent.id) % 900) * 40
  return drafts.map((session, index) => ({
    id: `ses_${base + drafts.length - index}`,
    ...session,
  }))
}

const daysAgo = (days: number) => REFERENCE_MS - days * DAY_MS

export function detailsOf(agent: AgentRecord): AgentDetails {
  const { seed, seeded } = seedOf(agent)
  // History reads the seed record, so a test session adds to it, not reshapes it.
  const record = AGENT_RECORDS.find((item) => item.id === agent.id) ?? agent
  const ran = seeded && record.sessions > 0
  // The failure follows the live status: a paused or recovered agent drops it.
  const failing = ran && agent.status === "Error"
  return {
    app: seed.app,
    channel: seed.channel,
    environment: seed.environment,
    alertOnFailure: seed.alertOnFailure,
    secret: {
      hint: seed.secretHint,
      rotatedAt: daysAgo(seed.rotatedDaysAgo),
      rotatedBy: seed.rotatedBy,
    },
    principal: seed.principal,
    // Never more tools than the record counts, so the header and list agree.
    tools: seed.tools.slice(0, Math.max(0, agent.tools)).map((tool, index) => ({
      id: `${agent.id}-tool-${index + 1}`,
      key: tool.key,
      kind: tool.kind,
      app: tool.app ?? null,
      enabled: tool.enabled ?? true,
      added: ran ? (tool.added ?? false) : true,
      failure: failing ? tool.failure : undefined,
      avgMs: tool.avgMs,
      callsPerSession: tool.calls ?? 1,
      columns: tool.columns ?? KIND_COLUMNS[tool.kind],
    })),
    sessions: seeded ? seedSessions(record, seed) : [],
    turnsPerSession: seed.turnsPerSession,
    durationSec: seed.durationSec,
    instructionTokens: seed.instructionTokens,
    createdAt: daysAgo(seed.createdDaysAgo),
  }
}

/** The seeded details with what the drawer changed laid over them. */
export function withPatch(
  base: AgentDetails,
  patch: DetailPatch | undefined
): AgentDetails {
  const { manualSessions = [], ...rest } = patch ?? {}
  return { ...base, ...rest, sessions: [...manualSessions, ...base.sessions] }
}

/** A passing test session started from the drawer, at the reference time. */
export function testSessionOf(
  details: AgentDetails,
  seq: number,
  by: TeamMemberId
): AgentSession {
  return {
    id: `ses_${seq}`,
    startedAt: REFERENCE_MS,
    durationSec: details.durationSec,
    turns: details.turnsPerSession,
    outcome: "resolved",
    by,
  }
}

// ── Derived state ──

export function healthOf(agent: AgentRecord, running = false): AgentHealth {
  if (running) return "running"
  if (agent.status === "Error") return "failing"
  if (agent.status === "Paused") return "paused"
  if (agent.status === "Draft") return "draft"
  return agent.spend > agent.monthlyBudget ? "overBudget" : "healthy"
}

/** Failing first, then over budget, paused, drafts and healthy, each by name. */
export function triageOrder(agents: AgentRecord[]) {
  return [...agents].sort(
    (a, b) =>
      HEALTH_ORDER.indexOf(healthOf(a)) - HEALTH_ORDER.indexOf(healthOf(b)) ||
      a.name.localeCompare(b.name)
  )
}

export const enabledOf = (details: AgentDetails) =>
  details.tools.filter((tool) => tool.enabled)

/** 24 hourly cells, oldest first; the last is the current, partial hour. */
export function hoursOf(
  agent: AgentRecord,
  sessions: AgentSession[]
): HourCell[] {
  return Array.from({ length: HOURS }, (_, index) => {
    const start = CURRENT_HOUR_MS - (HOURS - 1 - index) * HOUR_MS
    const inHour = sessions.filter(
      (session) =>
        session.startedAt >= start && session.startedAt < start + HOUR_MS
    )
    const count = (outcome: SessionOutcome) =>
      inHour.filter((session) => session.outcome === outcome).length
    const resolved = count("resolved")
    const handedOff = count("handedOff")
    const failed = count("failed")
    const outcome: HourOutcome =
      inHour.length === 0
        ? agent.status === "Paused"
          ? "paused"
          : "none"
        : failed > 0
          ? "failed"
          : handedOff > 0
            ? "handedOff"
            : "resolved"
    return {
      start,
      outcome,
      sessions: inHour.length,
      resolved,
      handedOff,
      failed,
    }
  })
}

export const sessionCountOf = (hours: HourCell[]) =>
  hours.reduce((sum, hour) => sum + hour.sessions, 0)

/** A tool's calls over the sessions given; off and new tools made none. */
export function callsOf(tool: AgentTool, sessions: number) {
  if (!tool.enabled || tool.added) return 0
  return Math.round(sessions * tool.callsPerSession)
}

/** Spend against the monthly cap; `ratio` is 1 at the cap. */
export function budgetOf(agent: AgentRecord) {
  const ratio = agent.monthlyBudget > 0 ? agent.spend / agent.monthlyBudget : 1
  return {
    spend: agent.spend,
    budget: agent.monthlyBudget,
    ratio,
    over: agent.spend > agent.monthlyBudget,
    headroom: Math.max(0, agent.monthlyBudget - agent.spend),
  }
}

/** The agent's API endpoint. */
export const endpointOf = (agent: Pick<AgentRecord, "id">) =>
  `${AGENT_HOST}/${agent.id}`

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

/** Sample calls, newest first; `draw` re-rolls the sample. */
export function sampleRows(
  tool: Pick<AgentTool, "id" | "columns">,
  every: number,
  draw = 0
): SampleRow[] {
  const random = prng(hashOf(`${tool.id}#${draw}`))
  const gapMs = Math.min(7 * DAY_MS, Math.max(1_000, Math.round(every)))
  return Array.from({ length: PREVIEW_ROWS }, (_, rowIndex) =>
    Object.fromEntries(
      tool.columns.map((spec) => [
        spec.name,
        sampleValue(spec, random, rowIndex, gapMs),
      ])
    )
  )
}

/** How far apart a tool's calls sit, from the agent's pace. */
export function sampleGapOf(
  agent: Pick<AgentRecord, "sessions">,
  tool: Pick<AgentTool, "callsPerSession">
) {
  const every = intervalOf(agent)
  return every === null ? HOUR_MS : every / Math.max(0.05, tool.callsPerSession)
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
const dollarFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const centsFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatCompact = (value: number) =>
  compactFormat.format(Math.round(value))

export const formatCount = (value: number) => countFormat.format(value)

/** USD: "$612", or "$612.40" with cents. */
export const money = (value: number, cents = false) =>
  (cents ? centsFormat : dollarFormat).format(value)

/** Seconds as a span: "41s", "2m 14s", "1h 03m"; tenths under ten seconds. */
export function formatDuration(seconds: number) {
  if (seconds < 10 && !Number.isInteger(seconds)) return `${seconds}s`
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${pad(total % 60)}s`
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m`
}

/** A call's latency: "40 ms", "1.6s". */
export function formatLatency(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${Math.round(ms / 100) / 10}s`
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

/** "1 session", "4.8K sessions": a compact count with its noun. */
export const formatSessions = (count: number) =>
  `${formatCompact(count)} ${Math.round(count) === 1 ? "session" : "sessions"}`

/** "1 call", "1.2K calls". */
export const formatCalls = (count: number) =>
  `${formatCompact(count)} ${Math.round(count) === 1 ? "call" : "calls"}`

/** A fresh redacted key tail after a rotation. */
export function rotatedHint(hint: string, salt: number) {
  const head = hint.split("••••")[0] ?? ""
  const tail = (hashOf(`${hint}#${salt}`) % 65_536)
    .toString(16)
    .padStart(4, "0")
  return `${head}••••${tail}`
}
