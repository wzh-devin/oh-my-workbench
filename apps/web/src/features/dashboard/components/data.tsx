import {
  CURRENT_USER,
  TEAM_MEMBERS as TEAM_MEMBERS_ALL,
} from "@/lib/workspace/team"
import { WORKFLOWS, type Workflow } from "@/lib/workspace/workflows"

export type WorkflowStatus = "Active" | "Paused" | "Failing"

export type WorkflowTrigger = "Schedule" | "Webhook" | "Event"

export interface WorkflowOwner {
  name: string
  initials: string
  avatar?: string
}

export interface WorkflowRecord {
  id: string
  name: string
  trigger: WorkflowTrigger
  owner: WorkflowOwner
  /** The workflow's handle in logs and API calls */
  slug: string
  /** Share of the last 28 days' runs that succeeded, 0 to 100 */
  successRate: number
  runsSucceeded: number
  runsTotal: number
  /** ISO time of the last run, for sorting */
  lastRunAt: string
  /** The same time as shown in the grid */
  lastRun: string
  /** How often the trigger fires */
  cadence: string
  status: WorkflowStatus
  favorite: boolean
}

export type TeamMember = {
  src: string
  name: string
  initials: string
}

// Who else is in the workspace right now: three teammates, never the
// signed-in user, who is in the account menu.
export const TEAM_MEMBERS: TeamMember[] = TEAM_MEMBERS_ALL.filter(
  (member) => member.id !== CURRENT_USER.id
)
  .slice(0, 3)
  .map((member) => ({
    src: member.avatarSrc,
    name: member.name,
    initials: member.initials,
  }))

export const TEAM_EXTRA_COUNT = 8

export const WORKFLOW_STATUS_OPTIONS: WorkflowStatus[] = [
  "Active",
  "Paused",
  "Failing",
]

const lastRunFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})

const NEVER_RUN_AT = "1970-01-01T00:00:00Z"

/** The grid's view of a workspace workflow. */
export function toWorkflowRecord(workflow: Workflow): WorkflowRecord {
  return {
    id: workflow.id,
    name: workflow.name,
    trigger: workflow.trigger,
    owner: {
      name: workflow.owner.name,
      initials: workflow.owner.initials,
      avatar: workflow.owner.avatarSrc,
    },
    slug: workflow.slug,
    successRate: workflow.successRate,
    runsSucceeded: workflow.runsSucceeded,
    runsTotal: workflow.runs,
    lastRunAt: workflow.lastRunAt ?? NEVER_RUN_AT,
    lastRun: workflow.lastRunAt
      ? lastRunFormatter.format(new Date(workflow.lastRunAt))
      : "Not run yet",
    cadence: workflow.cadence,
    status: !workflow.enabled
      ? "Paused"
      : workflow.lastRun === "Failed"
        ? "Failing"
        : "Active",
    favorite: workflow.favorite,
  }
}

/**
 * Writes the grid's edits back to the workspace: stars, pauses, removals and
 * order. A row the grid made itself (a duplicate, id `<source>_<suffix>`)
 * takes its source's copy and tags and starts with no runs.
 */
export function applyWorkflowRecords(
  workflows: Workflow[],
  records: WorkflowRecord[]
): Workflow[] {
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]))

  return records.flatMap((record) => {
    const existing = byId.get(record.id)
    if (existing) {
      return {
        ...existing,
        name: record.name,
        favorite: record.favorite,
        enabled: record.status !== "Paused",
      }
    }

    const source = workflows.find((workflow) =>
      record.id.startsWith(`${workflow.id}_`)
    )
    if (!source) return []

    return {
      ...source,
      id: record.id,
      name: record.name,
      slug: record.slug,
      enabled: record.status !== "Paused",
      favorite: record.favorite,
      tags: [...source.tags],
      lastRun: "Never" as const,
      lastRunAt: null,
      runs: 0,
      runsSucceeded: 0,
      successRate: 0,
    }
  })
}

/** The seed as the grid sees it, for tests; the page reads the store. */
export const WORKFLOW_RECORDS: WorkflowRecord[] =
  WORKFLOWS.map(toWorkflowRecord)
