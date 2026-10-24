import { TEAM_MEMBERS, type TeamMember } from "@/lib/workspace/team"
import {
  WORKFLOWS,
  type Workflow,
  type WorkflowLastRun,
  type WorkflowTrigger,
} from "@/lib/workspace/workflows"

export type { WorkflowLastRun, WorkflowTrigger }

export type WorkflowTabId = "all" | "active" | "paused" | "failing"

export type WorkflowOwnerName = string

export type WorkflowDisplayProperty =
  "owner" | "enabled" | "tags" | "lastRun" | "runs" | "updatedAt"

export type WorkflowFilterValue = WorkflowLastRun | string

export type WorkflowOwner = TeamMember

/** The workspace store's workflow; the list shows every field of it. */
export type WorkflowItem = Workflow

export const WORKFLOW_TABS: { value: WorkflowTabId; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "failing", label: "Failing" },
]

export const WORKFLOW_TRIGGER_OPTIONS: {
  value: WorkflowTrigger
  label: string
}[] = [
  { value: "Schedule", label: "Schedule" },
  { value: "Webhook", label: "Webhook" },
  { value: "Event", label: "Event" },
]

export const WORKFLOW_LAST_RUN_OPTIONS: {
  value: WorkflowLastRun
  label: string
}[] = [
  { value: "Succeeded", label: "Succeeded" },
  { value: "Failed", label: "Failed" },
  { value: "Never", label: "Never run" },
]

export const WORKFLOW_ENABLED_OPTIONS: { value: string; label: string }[] = [
  { value: "On", label: "On" },
  { value: "Off", label: "Off" },
]

export const WORKFLOW_TAG_OPTIONS = [
  "Sales",
  "Support",
  "Finance",
  "Operations",
  "Marketing",
  "Growth",
  "Legal",
  "Data",
  "AI",
  "Critical",
] as const

export const WORKFLOW_DISPLAY_PROPERTIES: {
  key: WorkflowDisplayProperty
  label: string
}[] = [
  { key: "owner", label: "Owner" },
  { key: "enabled", label: "Status" },
  { key: "tags", label: "Tags" },
  { key: "lastRun", label: "Last run" },
  { key: "runs", label: "Runs" },
  { key: "updatedAt", label: "Updated" },
]

export const WORKFLOW_OWNERS: WorkflowOwner[] = TEAM_MEMBERS

/** The seed, for tests; pages read the workspace store instead. */
export const WORKFLOW_ITEMS: WorkflowItem[] = WORKFLOWS

export function isInWorkflowTab(item: WorkflowItem, tab: WorkflowTabId) {
  switch (tab) {
    case "active":
      return item.enabled
    case "paused":
      return !item.enabled
    case "failing":
      return item.lastRun === "Failed"
    default:
      return true
  }
}

export function getWorkflowSearchBlob(item: WorkflowItem) {
  return [
    item.name,
    item.id,
    item.description,
    item.trigger,
    item.cadence,
    item.owner.name,
    item.owner.role,
    item.lastRun,
    ...item.tags,
  ]
    .join(" ")
    .toLowerCase()
}
