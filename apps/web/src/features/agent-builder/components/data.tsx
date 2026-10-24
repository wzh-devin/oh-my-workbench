/**
 * Every fact the agent tree renders. A node's app picks its mark; the edge
 * carries the branch caption; the strip carries what the last run measured.
 */
import type { BadgeProps } from "@/components/reui/badge"
import type { Edge, Node } from "@xyflow/react"

import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon"
import { Clickup } from "@/components/ui/svgs/clickup"
import { Discord } from "@/components/ui/svgs/discord"
import { Gemini } from "@/components/ui/svgs/gemini"
import { GithubDark } from "@/components/ui/svgs/githubDark"
import { GithubLight } from "@/components/ui/svgs/githubLight"
import { Gmail } from "@/components/ui/svgs/gmail"
import { GoogleDrive } from "@/components/ui/svgs/googleDrive"
import { Linear } from "@/components/ui/svgs/linear"
import { MicrosoftTeams } from "@/components/ui/svgs/microsoftTeams"
import { MistralAiLogo } from "@/components/ui/svgs/mistralAiLogo"
import { Neon } from "@/components/ui/svgs/neon"
import { Notion } from "@/components/ui/svgs/notion"
import { Openai } from "@/components/ui/svgs/openai"
import { OpenaiDark } from "@/components/ui/svgs/openaiDark"
import { Planetscale } from "@/components/ui/svgs/planetscale"
import { PlanetscaleDark } from "@/components/ui/svgs/planetscaleDark"
import { Redis } from "@/components/ui/svgs/redis"
import { ResendIconBlack } from "@/components/ui/svgs/resendIconBlack"
import { ResendIconWhite } from "@/components/ui/svgs/resendIconWhite"
import { Slack } from "@/components/ui/svgs/slack"
import { Stripe } from "@/components/ui/svgs/stripe"
import { Supabase } from "@/components/ui/svgs/supabase"
import { Twilio } from "@/components/ui/svgs/twilio"
import {
  CheckIcon,
  TriangleAlertIcon,
  CodeIcon,
  GlobeIcon,
  CircleCheckIcon,
  CircleXIcon,
  MinusIcon,
  CircleDotIcon,
} from "lucide-react"

/** Typed toast icons, so feedback carries semantic colour and not only text. */
export const TOAST_SUCCESS_ICON = (
  <CheckIcon className="size-4 text-success" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
)

/** The services this agent can call. Picking one is what sets a node's mark. */
export type AgentApp =
  | "claude"
  | "openai"
  | "gemini"
  | "mistral"
  | "neon"
  | "stripe"
  | "supabase"
  | "planetscale"
  | "redis"
  | "gdrive"
  | "resend"
  | "slack"
  | "gmail"
  | "discord"
  | "teams"
  | "twilio"
  | "clickup"
  | "linear"
  | "github"
  | "notion"
  | "http"
  | "custom"

export const APP_LABEL: Record<AgentApp, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  mistral: "Mistral",
  neon: "Neon",
  stripe: "Stripe",
  supabase: "Supabase",
  planetscale: "PlanetScale",
  redis: "Redis",
  gdrive: "Google Drive",
  resend: "Resend",
  slack: "Slack",
  gmail: "Gmail",
  discord: "Discord",
  teams: "Microsoft Teams",
  twilio: "Twilio",
  clickup: "ClickUp",
  linear: "Linear",
  github: "GitHub",
  notion: "Notion",
  http: "HTTP Request",
  custom: "Custom Code",
}

// customize: swap these for the services your own agent calls.
// The marks with no colour of their own ship as a light and a dark pair.
export const APP_ICON: Record<AgentApp, React.ReactNode> = {
  claude: <ClaudeAiIcon />,
  openai: (
    <>
      <Openai className="dark:hidden" />
      <OpenaiDark className="hidden dark:block" />
    </>
  ),
  gemini: <Gemini />,
  mistral: <MistralAiLogo />,
  neon: <Neon />,
  stripe: <Stripe />,
  supabase: <Supabase />,
  planetscale: (
    <>
      <Planetscale className="dark:hidden" />
      <PlanetscaleDark className="hidden dark:block" />
    </>
  ),
  redis: <Redis />,
  gdrive: <GoogleDrive />,
  resend: (
    <>
      <ResendIconBlack className="dark:hidden" />
      <ResendIconWhite className="hidden dark:block" />
    </>
  ),
  slack: <Slack />,
  gmail: <Gmail />,
  discord: <Discord />,
  teams: <MicrosoftTeams />,
  twilio: <Twilio />,
  clickup: <Clickup />,
  linear: <Linear />,
  github: (
    <>
      <GithubLight className="dark:hidden" />
      <GithubDark className="hidden dark:block" />
    </>
  ),
  notion: <Notion />,
  http: <GlobeIcon aria-hidden="true" />,
  custom: <CodeIcon aria-hidden="true" />,
}

export const AGENT_APPS = Object.keys(APP_LABEL) as AgentApp[]

// customize: the services your agent can call, grouped as the step library
// in the secondary panel lists them. Every app appears once.
export const AGENT_LIBRARY: { id: string; title: string; apps: AgentApp[] }[] =
  [
    {
      id: "models",
      title: "Models",
      apps: ["claude", "openai", "gemini", "mistral"],
    },
    {
      id: "data",
      title: "Data",
      apps: ["neon", "stripe", "supabase", "planetscale", "redis", "gdrive"],
    },
    {
      id: "messages",
      title: "Messages",
      apps: ["resend", "slack", "gmail", "discord", "teams", "twilio"],
    },
    {
      id: "tools",
      title: "Tools",
      apps: ["clickup", "linear", "github", "notion", "http", "custom"],
    },
  ]

export type AgentStatus = "passed" | "failed" | "skipped" | "idle"

export const STATUS_LABEL: Record<AgentStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  idle: "Not run",
}

/** Semantic badge per status; the node and the panel read the same fact. */
export const STATUS_BADGE: Record<AgentStatus, BadgeProps["variant"]> = {
  passed: "success-light",
  failed: "destructive-light",
  skipped: "outline",
  idle: "outline",
}

/** Inline tone for the node's run line, where there is no tinted surface. */
export const STATUS_TONE: Record<AgentStatus, string> = {
  passed: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  idle: "text-muted-foreground",
}

/** Shape carries the status too, so it never rests on colour alone. */
export const STATUS_ICON: Record<AgentStatus, React.ReactNode> = {
  passed: <CircleCheckIcon aria-hidden="true" />,
  failed: <CircleXIcon aria-hidden="true" />,
  skipped: <MinusIcon aria-hidden="true" />,
  idle: <CircleDotIcon aria-hidden="true" />,
}

export type AgentNodeData = {
  app: AgentApp
  /** The step name, usually the service or the in house function. */
  title: string
  detail: string
  /** What this node type measures: tokens, latency, rows, matches. One
   *  segment per fact, so the strip separates them rather than the string. */
  facts: string[]
  status: AgentStatus
}

export type AgentNodeType = Node<AgentNodeData, "agent">

type AgentEdgeData = {
  /** Names which outcome of a branching parent this path is. */
  branchLabel?: string
}

export type AgentEdgeType = Edge<AgentEdgeData, "tree">

/** The whole tree at one moment: what an Undo keeps and puts back. */
export type AgentGraph = { nodes: AgentNodeType[]; edges: AgentEdgeType[] }

export const AGENT = {
  name: "Collections Agent",
  // The branch the recorded test input takes at every fork it reaches.
  testPath: "Promised",
}

// customize: replace with your own agent steps.
const SEED: {
  id: string
  parent?: string
  branchLabel?: string
  data: AgentNodeData
}[] = [
  {
    id: "overdue",
    data: {
      app: "stripe",
      title: "Stripe",
      detail: "Invoice 3 days overdue",
      facts: ["inv_9412", "EUR 4,180"],
      status: "passed",
    },
  },
  {
    id: "ledger",
    parent: "overdue",
    data: {
      app: "neon",
      title: "Neon",
      detail: "Runs query_db on invoices",
      facts: ["1 row", "42ms"],
      status: "passed",
    },
  },
  {
    id: "triage",
    parent: "ledger",
    data: {
      app: "claude",
      title: "Claude Sonnet 5",
      detail: "Triages the account",
      facts: ["1,842 tokens", "USD 0.031"],
      status: "passed",
    },
  },
  {
    id: "charges",
    parent: "triage",
    branchLabel: "Disputed",
    data: {
      app: "stripe",
      title: "Stripe",
      detail: "Pulls the dispute evidence",
      facts: ["Branch not taken"],
      status: "skipped",
    },
  },
  {
    id: "assign",
    parent: "charges",
    data: {
      app: "clickup",
      title: "ClickUp",
      detail: "Assigns Hanna Berg",
      facts: ["Upstream skipped"],
      status: "skipped",
    },
  },
  {
    id: "terms",
    parent: "triage",
    branchLabel: "Promised",
    data: {
      app: "stripe",
      title: "Stripe",
      detail: "Offers a payment plan",
      facts: ["3 instalments", "EUR 1,393"],
      status: "passed",
    },
  },
  {
    id: "confirm",
    parent: "terms",
    data: {
      app: "resend",
      title: "Resend",
      detail: "Emails the terms to Maren",
      facts: ["Delivered", "1 email"],
      status: "passed",
    },
  },
  {
    id: "redact",
    parent: "triage",
    branchLabel: "No reply",
    data: {
      app: "custom",
      title: "PII Guardrail",
      detail: "Scans outbound text",
      facts: ["Branch not taken"],
      status: "skipped",
    },
  },
  {
    id: "callback",
    parent: "redact",
    data: {
      app: "slack",
      title: "Slack",
      detail: "Posts to #collections",
      facts: ["Upstream skipped"],
      status: "skipped",
    },
  },
]

export const INITIAL_NODES: AgentNodeType[] = SEED.map((entry) => ({
  id: entry.id,
  type: "agent",
  position: { x: 0, y: 0 },
  data: entry.data,
}))

export const INITIAL_EDGES: AgentEdgeType[] = SEED.filter(
  (entry) => entry.parent
).map((entry) => ({
  id: `${entry.parent}->${entry.id}`,
  source: entry.parent as string,
  target: entry.id,
  type: "tree",
  data: { branchLabel: entry.branchLabel },
}))

type RecordedStep = {
  status: AgentStatus
  facts: string[]
  title: string
  /** How long the step took on the recorded input. */
  ms: number
}

// customize: how long each step took on the recorded input, which the run's
// closing toast adds up.
const RECORDED_MS: Record<string, number> = {
  overdue: 310,
  ledger: 42,
  triage: 2140,
  terms: 380,
  confirm: 1210,
}

/** What the recorded test input did at each step it reached, read off the seed. */
export const RECORDED_RUN = new Map(
  SEED.filter(
    (entry) => entry.data.status === "passed" || entry.data.status === "failed"
  ).map((entry): [string, RecordedStep] => [
    entry.id,
    {
      status: entry.data.status,
      facts: entry.data.facts,
      title: entry.data.title,
      ms: RECORDED_MS[entry.id] ?? 0,
    },
  ])
)

/** Values are model step titles; each carries what the test input costs there. */
export const MODEL_OPTIONS: {
  value: string
  label: string
  facts: string[]
}[] = [
  {
    value: "Claude Opus 5",
    label: "Opus 5",
    facts: ["1,768 tokens", "USD 0.050"],
  },
  {
    value: "Claude Sonnet 5",
    label: "Sonnet 5",
    facts: ["1,842 tokens", "USD 0.031"],
  },
  {
    value: "Claude Haiku 4.5",
    label: "Haiku 4.5",
    facts: ["1,905 tokens", "USD 0.011"],
  },
]

// Mirrors the CanvasToolbar key handler and the canvas delete key.
export const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Select", keys: ["V"] },
  { label: "Pan", keys: ["H"] },
  { label: "Zoom in", keys: ["+"] },
  { label: "Zoom out", keys: ["-"] },
  { label: "Zoom to fit", keys: ["shift", "1"] },
  { label: "Actual size", keys: ["shift", "0"] },
  { label: "Run test", keys: ["mod", "Enter"] },
  { label: "Delete step", keys: ["Backspace"] },
]

/** The trigger starts the run, so no path can delete it. */
export const ROOT_ID = "overdue"

// New steps land as custom code until they are pointed at a service; one
// taken from the step library is that service, named after it.
export function createAgentNode(id: string, app?: AgentApp): AgentNodeType {
  return {
    id,
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      app: app ?? "custom",
      title: app ? APP_LABEL[app] : "New step",
      detail: "Not configured yet",
      facts: ["No test run yet"],
      status: "idle",
    },
  }
}
