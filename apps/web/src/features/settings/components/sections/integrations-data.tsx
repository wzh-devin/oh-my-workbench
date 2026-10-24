import { type ReactNode } from "react"
import { type BadgeProps } from "@/components/reui/badge"

import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon"
import { Gemini } from "@/components/ui/svgs/gemini"
import { GithubDark } from "@/components/ui/svgs/githubDark"
import { GithubLight } from "@/components/ui/svgs/githubLight"
import { Gmail } from "@/components/ui/svgs/gmail"
import { GoogleCalendar } from "@/components/ui/svgs/googleCalendar"
import { GoogleDrive } from "@/components/ui/svgs/googleDrive"
import { Linear } from "@/components/ui/svgs/linear"
import { MicrosoftTeams } from "@/components/ui/svgs/microsoftTeams"
import { N8n } from "@/components/ui/svgs/n8n"
import { Notion } from "@/components/ui/svgs/notion"
import { Openai } from "@/components/ui/svgs/openai"
import { OpenaiDark } from "@/components/ui/svgs/openaiDark"
import { Slack } from "@/components/ui/svgs/slack"
import { Stripe } from "@/components/ui/svgs/stripe"

// The services Flowly connects to, and the workspace's connections to them.
// The catalog feeds New Integration (sheet-23); the records are the two
// lists on Integrations and the drawer each one opens (sheet-22).

export type IntegrationGroup = "tools" | "automation"

export type CatalogId =
  | "slack"
  | "microsoft-teams"
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "notion"
  | "linear"
  | "github"
  | "stripe"
  | "openai"
  | "claude"
  | "gemini"
  | "n8n"

export type CatalogEntry = {
  id: CatalogId
  name: string
  /** One word under the name in the catalog */
  kind: string
  group: IntegrationGroup
  logo: ReactNode
  /** How Flowly signs in: an OAuth grant or a pasted key */
  auth: "oauth" | "key"
  /** What a run posts to or reads from, as the form asks for it */
  targetLabel: string
  targetPlaceholder: string
  /** Who Flowly acts as once connected */
  principal: string
}

const logo = (node: ReactNode) => node

/** Two-tone marks get a light and a dark face. */
const themed = (light: ReactNode, dark: ReactNode) => (
  <>
    <span aria-hidden="true" className="dark:hidden">
      {light}
    </span>
    <span aria-hidden="true" className="hidden dark:block">
      {dark}
    </span>
  </>
)

export const CATALOG: CatalogEntry[] = [
  {
    id: "slack",
    name: "Slack",
    kind: "Messaging",
    group: "tools",
    logo: logo(<Slack className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Channel",
    targetPlaceholder: "#ops-alerts",
    principal: "Flowly bot",
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    kind: "Messaging",
    group: "tools",
    logo: logo(<MicrosoftTeams className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Channel",
    targetPlaceholder: "Ops / Alerts",
    principal: "Flowly app",
  },
  {
    id: "gmail",
    name: "Gmail",
    kind: "Email",
    group: "tools",
    logo: logo(<Gmail className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Mailbox",
    targetPlaceholder: "support@flowly.dev",
    principal: "support@flowly.dev",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    kind: "Calendar",
    group: "automation",
    logo: logo(<GoogleCalendar className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Calendar",
    targetPlaceholder: "Shared workspace calendar",
    principal: "nick@reui.io",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    kind: "Files",
    group: "automation",
    logo: logo(<GoogleDrive className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Folder",
    targetPlaceholder: "Run exports",
    principal: "nick@reui.io",
  },
  {
    id: "notion",
    name: "Notion",
    kind: "Docs",
    group: "automation",
    logo: logo(<Notion className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Database",
    targetPlaceholder: "Support knowledge base",
    principal: "Flowly integration",
  },
  {
    id: "linear",
    name: "Linear",
    kind: "Issues",
    group: "automation",
    logo: logo(<Linear className="size-4" aria-hidden="true" />),
    auth: "oauth",
    targetLabel: "Team",
    targetPlaceholder: "Support",
    principal: "Flowly app",
  },
  {
    id: "github",
    name: "GitHub",
    kind: "Code",
    group: "automation",
    logo: themed(
      <GithubLight className="size-4" />,
      <GithubDark className="size-4" />
    ),
    auth: "oauth",
    targetLabel: "Repository",
    targetPlaceholder: "flowly-labs/workflows",
    principal: "flowly-bot",
  },
  {
    id: "stripe",
    name: "Stripe",
    kind: "Payments",
    group: "automation",
    logo: logo(<Stripe className="size-4" aria-hidden="true" />),
    auth: "key",
    targetLabel: "Account",
    targetPlaceholder: "acct_1Flowly",
    principal: "Restricted key",
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "AI model",
    group: "automation",
    logo: themed(
      <Openai className="size-4" />,
      <OpenaiDark className="size-4" />
    ),
    auth: "key",
    targetLabel: "Project",
    targetPlaceholder: "flowly-agents",
    principal: "Service key",
  },
  {
    id: "claude",
    name: "Claude",
    kind: "AI model",
    group: "automation",
    logo: logo(<ClaudeAiIcon className="size-4" aria-hidden="true" />),
    auth: "key",
    targetLabel: "Workspace",
    targetPlaceholder: "Flowly agents",
    principal: "Service key",
  },
  {
    id: "gemini",
    name: "Gemini",
    kind: "AI model",
    group: "automation",
    logo: logo(<Gemini className="size-4" aria-hidden="true" />),
    auth: "key",
    targetLabel: "Project",
    targetPlaceholder: "flowly-agents",
    principal: "Service key",
  },
  {
    id: "n8n",
    name: "n8n",
    kind: "Automation",
    group: "automation",
    logo: logo(<N8n className="size-4" aria-hidden="true" />),
    auth: "key",
    targetLabel: "Instance",
    targetPlaceholder: "n8n.flowly.dev",
    principal: "API key",
  },
]

export const catalogEntry = (id: CatalogId) =>
  CATALOG.find((entry) => entry.id === id) ?? CATALOG[0]

export type IntegrationStatus =
  "connected" | "live" | "paused" | "setup" | "available"

export type IntegrationUse = "steps" | "tools" | "alerts"

export const INTEGRATION_USES: {
  value: IntegrationUse
  label: string
  description: string
}[] = [
  {
    value: "steps",
    label: "Workflow steps",
    description: "Workflows can call it as a step.",
  },
  {
    value: "tools",
    label: "Agent tools",
    description: "Agents can use it while they work.",
  },
  {
    value: "alerts",
    label: "Run alerts",
    description: "Failed and slow runs report here.",
  },
]

export type IntegrationRecord = {
  id: string
  catalogId: CatalogId
  /** What it is for here, under the name in the list */
  description: string
  status: IntegrationStatus
  /** Where runs post or read, in the catalog entry's terms */
  target: string
  uses: IntegrationUse[]
  alertOnFailure: boolean
  lastSync: string
  /** Calls in the last 24 hours */
  calls: number
}

/** The fields New Integration and the Settings tab edit. */
export type IntegrationDraft = Pick<
  IntegrationRecord,
  "description" | "target" | "uses" | "alertOnFailure"
>

export const SEED_INTEGRATIONS: IntegrationRecord[] = [
  {
    id: "int-slack",
    catalogId: "slack",
    description: "Post run alerts and approval requests.",
    status: "connected",
    target: "#ops-alerts",
    uses: ["steps", "alerts"],
    alertOnFailure: true,
    lastSync: "2 min ago",
    calls: 1284,
  },
  {
    id: "int-openai",
    catalogId: "openai",
    description: "Fallback model for agent steps.",
    status: "connected",
    target: "flowly-agents",
    uses: ["tools"],
    alertOnFailure: true,
    lastSync: "4 min ago",
    calls: 9310,
  },
  {
    id: "int-n8n",
    catalogId: "n8n",
    description: "Import and sync existing flows.",
    status: "live",
    target: "n8n.flowly.dev",
    uses: ["steps"],
    alertOnFailure: true,
    lastSync: "12 min ago",
    calls: 214,
  },
  {
    id: "int-google-calendar",
    catalogId: "google-calendar",
    description: "Start scheduled runs from calendar events.",
    status: "setup",
    target: "Shared workspace calendar",
    uses: ["steps"],
    alertOnFailure: false,
    lastSync: "Never",
    calls: 0,
  },
]

export const STATUS_FACE: Record<
  IntegrationStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  connected: { label: "Connected", variant: "success-light" },
  live: { label: "Live", variant: "info-light" },
  paused: { label: "Paused", variant: "warning-light" },
  setup: { label: "Needs setup", variant: "warning-light" },
  available: { label: "Available", variant: "outline" },
}

/** Connected in any form: it has a drawer to manage, not a setup to run. */
export const isConnected = (status: IntegrationStatus) =>
  status !== "available" && status !== "setup"
