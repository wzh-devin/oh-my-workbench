import {
  AGENT_OWNERS,
  AGENT_RECORDS,
  type AgentModel,
  type AgentOwner,
  type AgentOwnerId,
  type AgentRecord,
  type AgentStatus,
} from "@/lib/workspace/agents"

export {
  AGENT_OWNERS,
  AGENT_RECORDS,
  type AgentModel,
  type AgentOwner,
  type AgentOwnerId,
  type AgentRecord,
  type AgentStatus,
}

export type AgentTabId = "all" | "live" | "drafts" | "paused" | "attention"

export type AgentDisplayProperty =
  "owner" | "model" | "status" | "sessions" | "spend" | "lastActiveAt"

// Each tab is a predicate over status, so moving an agent between statuses
// moves it between tabs with no bookkeeping on the record.
export const AGENT_TABS: {
  value: AgentTabId
  label: string
  statuses: AgentStatus[] | null
}[] = [
  { value: "all", label: "All", statuses: null },
  { value: "live", label: "Live", statuses: ["Live"] },
  { value: "drafts", label: "Drafts", statuses: ["Draft"] },
  { value: "paused", label: "Paused", statuses: ["Paused"] },
  { value: "attention", label: "Needs attention", statuses: ["Error"] },
]

export const AGENT_STATUS_OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: "Live", label: "Live" },
  { value: "Draft", label: "Draft" },
  { value: "Paused", label: "Paused" },
  { value: "Error", label: "Error" },
]

export const AGENT_MODEL_OPTIONS: { value: AgentModel; label: string }[] = [
  { value: "GPT-5", label: "GPT-5" },
  { value: "Claude Opus 5.5", label: "Claude Opus 5.5" },
  { value: "Claude Sonnet 5.5", label: "Claude Sonnet 5.5" },
  { value: "Gemini 3 Pro", label: "Gemini 3 Pro" },
  { value: "Llama 4", label: "Llama 4" },
]

export const AGENT_DISPLAY_PROPERTIES: {
  key: AgentDisplayProperty
  label: string
}[] = [
  { key: "owner", label: "Owner" },
  { key: "model", label: "Model" },
  { key: "status", label: "Status" },
  { key: "sessions", label: "Sessions" },
  { key: "spend", label: "Spend" },
  { key: "lastActiveAt", label: "Last active" },
]

// The same people and photos as the Dashboard, so an owner reads the same
// across pages.
export const AGENT_OWNER_OPTIONS = Object.values(AGENT_OWNERS).map((owner) => ({
  value: owner.id,
  label: owner.name,
}))
