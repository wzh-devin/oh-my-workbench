import type { FilterCondition } from "@/components/reui/filters/filters-query"

import {
  AGENT_OWNERS,
  AGENT_TABS,
  type AgentModel,
  type AgentOwnerId,
  type AgentRecord,
  type AgentStatus,
  type AgentTabId,
} from "./data"
import type { AgentSession } from "./sheet-data"

// ── Filtering ──

function getAgentSearchBlob(agent: AgentRecord) {
  return [
    agent.id,
    agent.name,
    agent.description,
    agent.owner.name,
    agent.owner.role,
    agent.model,
    agent.status,
  ]
    .join(" ")
    .toLowerCase()
}

export function filterAgentsByTab(agents: AgentRecord[], tab: AgentTabId) {
  const statuses = AGENT_TABS.find((it) => it.value === tab)?.statuses

  if (!statuses) return agents

  return agents.filter((agent) => statuses.includes(agent.status))
}

export function getActiveFilters(filters: FilterCondition[]) {
  return filters.filter((filter) => {
    const { operator, values } = filter

    if (operator === "empty" || operator === "not_empty") return true
    if (!values || values.length === 0) return false

    if (
      values.every((value) => typeof value === "string" && value.trim() === "")
    ) {
      return false
    }

    return true
  })
}

function filterFieldValue(agent: AgentRecord, field: string) {
  switch (field) {
    case "keyword":
      return getAgentSearchBlob(agent)
    case "owner":
      return agent.owner.name
    case "model":
      return agent.model
    case "status":
      return agent.status
    default:
      return ""
  }
}

function matchesFilter(
  fieldValue: string,
  operator: string,
  values: unknown[]
) {
  switch (operator) {
    case "is":
      return values.includes(fieldValue)
    case "is_not":
      return !values.includes(fieldValue)
    case "is_any_of":
      return values.some((value) => fieldValue === value)
    case "is_none_of":
      return !values.some((value) => fieldValue === value)
    case "contains": {
      const tokens = values.map((value) => String(value).trim()).filter(Boolean)

      if (tokens.length === 0) return true

      return tokens.some((token) =>
        fieldValue.toLowerCase().includes(token.toLowerCase())
      )
    }
    case "not_contains":
      return !values.some((value) =>
        fieldValue.toLowerCase().includes(String(value).toLowerCase())
      )
    case "starts_with":
      return values.some((value) =>
        fieldValue.toLowerCase().startsWith(String(value).toLowerCase())
      )
    case "ends_with":
      return values.some((value) =>
        fieldValue.toLowerCase().endsWith(String(value).toLowerCase())
      )
    case "empty":
      return fieldValue.length === 0
    case "not_empty":
      return fieldValue.length > 0
    default:
      return true
  }
}

export function applyAgentFilters(
  agents: AgentRecord[],
  filters: FilterCondition[]
) {
  return getActiveFilters(filters).reduce((result, filter) => {
    const { field, operator, values, negated } = filter

    return result.filter((agent) => {
      const matches = matchesFilter(
        filterFieldValue(agent, field),
        operator,
        values
      )

      // The chip menu's Negate swaps to the operator's declared inverse when it
      // has one and raises this flag when it does not.
      return negated ? !matches : matches
    })
  }, agents)
}

// ── Form ──

export type AgentFormValues = {
  name: string
  description: string
  model: AgentModel | ""
  ownerId: AgentOwnerId
  status: AgentStatus
  monthlyBudget: string
}

// ── CRUD ──

export function createAgentId(random: () => number = Math.random) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  let suffix = ""

  for (let index = 0; index < 6; index++) {
    suffix += alphabet[Math.floor(random() * alphabet.length)]
  }

  return `agt_${suffix}`
}

export function todayIso(now: Date = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")

  return `${now.getFullYear()}-${month}-${day}`
}

function applyForm(values: AgentFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    model: values.model as AgentModel,
    owner: AGENT_OWNERS[values.ownerId],
    status: values.status,
    monthlyBudget: Number(values.monthlyBudget.trim()),
  }
}

/** A new agent goes to the top of the list. Expects validated values. */
export function createAgent(
  agents: AgentRecord[],
  values: AgentFormValues,
  { id, today }: { id: string; today: string }
): { agents: AgentRecord[]; agent: AgentRecord } {
  const agent: AgentRecord = {
    id,
    ...applyForm(values),
    sessions: 0,
    spend: 0,
    tools: 0,
    updatedAt: today,
    lastActiveAt: null,
  }

  return { agents: [agent, ...agents], agent }
}

/** Updates the agent in place, keeping its position and usage. */
export function updateAgent(
  agents: AgentRecord[],
  id: string,
  values: AgentFormValues,
  today: string
) {
  return agents.map((agent) =>
    agent.id === id
      ? { ...agent, ...applyForm(values), updatedAt: today }
      : agent
  )
}

export function deleteAgent(agents: AgentRecord[], id: string) {
  return agents.filter((agent) => agent.id !== id)
}

/**
 * Inserts a copy right after the original. The copy is a fresh draft: it has
 * not run, so it carries no usage.
 */
export function duplicateAgent(
  agents: AgentRecord[],
  id: string,
  { id: copyId, today }: { id: string; today: string }
): { agents: AgentRecord[]; agent: AgentRecord | null } {
  const index = agents.findIndex((agent) => agent.id === id)

  if (index === -1) return { agents, agent: null }

  const source = agents[index]
  const agent: AgentRecord = {
    ...source,
    id: copyId,
    name: `${source.name} copy`,
    status: "Draft",
    sessions: 0,
    spend: 0,
    updatedAt: today,
    lastActiveAt: null,
  }

  return {
    agents: [...agents.slice(0, index + 1), agent, ...agents.slice(index + 1)],
    agent,
  }
}

// ── Status and sessions ──

/** Pause and Resume: only the status moves; usage stays as it was. */
export function setAgentStatus(
  agents: AgentRecord[],
  id: string,
  status: AgentStatus
) {
  return agents.map((agent) => (agent.id === id ? { ...agent, status } : agent))
}

/**
 * A finished session from the sheet counts toward the 28 days and marks the
 * agent active that day (UTC). One that did not fail clears an Error, so the
 * agent reads Live again; a draft stays a draft.
 */
export function recordAgentSession(
  agents: AgentRecord[],
  id: string,
  session: Pick<AgentSession, "startedAt" | "outcome">
) {
  const day = new Date(session.startedAt).toISOString().slice(0, 10)

  return agents.map((agent) => {
    if (agent.id !== id) return agent

    return {
      ...agent,
      sessions: agent.sessions + 1,
      lastActiveAt:
        agent.lastActiveAt && agent.lastActiveAt > day
          ? agent.lastActiveAt
          : day,
      status:
        agent.status === "Error" && session.outcome !== "failed"
          ? ("Live" as const)
          : agent.status,
    }
  })
}

// ── Export ──

export function agentsToCsv(agents: AgentRecord[]) {
  const header = [
    "Agent",
    "ID",
    "Owner",
    "Model",
    "Status",
    "Sessions (28d)",
    "Spend USD (28d)",
    "Monthly budget USD",
    "Last active",
  ]
  const rows = agents.map((agent) => [
    agent.name,
    agent.id,
    agent.owner.name,
    agent.model,
    agent.status,
    String(agent.sessions),
    agent.spend.toFixed(2),
    String(agent.monthlyBudget),
    agent.lastActiveAt ?? "",
  ])

  return [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
    )
    .join("\n")
}
