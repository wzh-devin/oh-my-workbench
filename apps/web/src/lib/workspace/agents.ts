import { TEAM, type TeamMember, type TeamMemberId } from "./team"

// ── Agents ──
// The workspace's AI agents, one seed for the Agents list, the editor links
// and the notifications. Pages hold it in the workspace store
// (components/workspace/workspace-provider.tsx).

export type AgentStatus = "Live" | "Draft" | "Paused" | "Error"

export type AgentModel =
  "GPT-5" | "Claude Opus 5.5" | "Claude Sonnet 5.5" | "Gemini 3 Pro" | "Llama 4"

export type AgentOwnerId = TeamMemberId

export type AgentOwner = TeamMember

export type AgentRecord = {
  id: string
  name: string
  description: string
  owner: AgentOwner
  model: AgentModel
  status: AgentStatus
  /** Sessions in the last 28 days. */
  sessions: number
  /** Spend in USD over the last 28 days. */
  spend: number
  /** Monthly budget cap in USD. */
  monthlyBudget: number
  /** Connected tools the agent can call. */
  tools: number
  updatedAt: string
  /** Last session date, null for an agent that has never run. */
  lastActiveAt: string | null
}

export const AGENT_OWNERS: Record<AgentOwnerId, AgentOwner> = TEAM

export const AGENT_RECORDS: AgentRecord[] = [
  {
    id: "agt_7f2k9q",
    name: "Support Triage Agent",
    description:
      "Reads new tickets, tags intent and urgency, and routes them to the right queue.",
    owner: AGENT_OWNERS.hanna,
    model: "Claude Sonnet 5.5",
    status: "Live",
    sessions: 4820,
    spend: 612.4,
    monthlyBudget: 900,
    tools: 5,
    updatedAt: "2026-10-03",
    lastActiveAt: "2026-10-06",
  },
  {
    id: "agt_3m8w1z",
    name: "Lead Qualifier",
    description:
      "Scores inbound leads against the ICP and books qualified ones with sales.",
    owner: AGENT_OWNERS.omar,
    model: "GPT-5",
    status: "Live",
    sessions: 2156,
    spend: 388.9,
    monthlyBudget: 500,
    tools: 4,
    updatedAt: "2026-10-01",
    lastActiveAt: "2026-10-06",
  },
  {
    id: "agt_9k4p2r",
    name: "Invoice Reconciler",
    description:
      "Matches incoming invoices to purchase orders and flags amount mismatches.",
    owner: AGENT_OWNERS.lena,
    model: "Claude Opus 5.5",
    status: "Error",
    sessions: 734,
    spend: 455.2,
    monthlyBudget: 450,
    tools: 3,
    updatedAt: "2026-09-29",
    lastActiveAt: "2026-10-05",
  },
  {
    id: "agt_5c6t8n",
    name: "Churn Analyst",
    description:
      "Watches usage drops and drafts a weekly at-risk accounts digest.",
    owner: AGENT_OWNERS.ines,
    model: "Gemini 3 Pro",
    status: "Live",
    sessions: 412,
    spend: 96.3,
    monthlyBudget: 200,
    tools: 3,
    updatedAt: "2026-09-27",
    lastActiveAt: "2026-10-04",
  },
  {
    id: "agt_2h7v5k",
    name: "Meeting Summarizer",
    description:
      "Turns call transcripts into notes, action items and CRM updates.",
    owner: AGENT_OWNERS.nick,
    model: "Claude Sonnet 5.5",
    status: "Live",
    sessions: 1388,
    spend: 174.6,
    monthlyBudget: 300,
    tools: 4,
    updatedAt: "2026-10-02",
    lastActiveAt: "2026-10-06",
  },
  {
    id: "agt_8b1q4d",
    name: "Code Review Bot",
    description:
      "Reviews pull requests in the integrations repo and comments on risky diffs.",
    owner: AGENT_OWNERS.tomas,
    model: "Claude Opus 5.5",
    status: "Paused",
    sessions: 268,
    spend: 142.8,
    monthlyBudget: 250,
    tools: 2,
    updatedAt: "2026-09-18",
    lastActiveAt: "2026-09-22",
  },
  {
    id: "agt_4n9s3e",
    name: "Contract Reviewer",
    description:
      "Highlights non-standard clauses in vendor contracts before legal review.",
    owner: AGENT_OWNERS.ines,
    model: "Claude Opus 5.5",
    status: "Draft",
    sessions: 0,
    spend: 0,
    monthlyBudget: 300,
    tools: 2,
    updatedAt: "2026-10-04",
    lastActiveAt: null,
  },
  {
    id: "agt_6r2j7m",
    name: "Onboarding Guide",
    description:
      "Walks new workspace admins through setup and answers first-week questions.",
    owner: AGENT_OWNERS.hanna,
    model: "GPT-5",
    status: "Live",
    sessions: 965,
    spend: 88.1,
    monthlyBudget: 150,
    tools: 3,
    updatedAt: "2026-09-30",
    lastActiveAt: "2026-10-05",
  },
  {
    id: "agt_1k5y8w",
    name: "Expense Auditor",
    description:
      "Checks expense reports against policy and asks for missing receipts.",
    owner: AGENT_OWNERS.lena,
    model: "Llama 4",
    status: "Paused",
    sessions: 190,
    spend: 21.4,
    monthlyBudget: 100,
    tools: 2,
    updatedAt: "2026-09-14",
    lastActiveAt: "2026-09-20",
  },
  {
    id: "agt_7d3u6f",
    name: "Renewal Forecaster",
    description:
      "Projects renewal likelihood from usage, tickets and contract terms.",
    owner: AGENT_OWNERS.omar,
    model: "Gemini 3 Pro",
    status: "Draft",
    sessions: 12,
    spend: 3.6,
    monthlyBudget: 120,
    tools: 3,
    updatedAt: "2026-10-05",
    lastActiveAt: "2026-10-05",
  },
  {
    id: "agt_0p8g2c",
    name: "Data Sync Monitor",
    description:
      "Watches warehouse syncs and opens an incident when a job fails twice.",
    owner: AGENT_OWNERS.tomas,
    model: "Llama 4",
    status: "Error",
    sessions: 1620,
    spend: 64.9,
    monthlyBudget: 120,
    tools: 6,
    updatedAt: "2026-09-24",
    lastActiveAt: "2026-10-06",
  },
  {
    id: "agt_3w9a1h",
    name: "Knowledge Base Writer",
    description:
      "Drafts help center articles from resolved tickets for the support team.",
    owner: AGENT_OWNERS.hanna,
    model: "Claude Sonnet 5.5",
    status: "Live",
    sessions: 342,
    spend: 57.2,
    monthlyBudget: 120,
    tools: 2,
    updatedAt: "2026-09-26",
    lastActiveAt: "2026-10-03",
  },
]
