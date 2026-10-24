import {
  WORKFLOW_OWNERS,
  type WorkflowItem,
  type WorkflowOwnerName,
} from "./data"
import { type WorkflowRun } from "./sheet-data"
import { type WorkflowFormValues } from "./workflow-schema"

export function toFormValues(
  item: WorkflowItem,
  settings: Pick<WorkflowFormValues, "environment" | "alertOnFailure"> = {
    environment: "production",
    alertOnFailure: true,
  }
): WorkflowFormValues {
  return {
    name: item.name,
    environment: settings.environment,
    trigger: item.trigger,
    cadence: item.cadence,
    owner: item.owner.name,
    alertOnFailure: settings.alertOnFailure,
  }
}

function findOwner(name: WorkflowOwnerName | "") {
  return (
    WORKFLOW_OWNERS.find((owner) => owner.name === name) ?? WORKFLOW_OWNERS[0]
  )
}

/** "Refund Requests" becomes "flows/refund-requests". */
function toSlug(name: string) {
  const handle = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `flows/${handle || "untitled"}`
}

function newId() {
  return `wf_${Math.random().toString(36).slice(2, 8)}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function createWorkflow(
  workflows: WorkflowItem[],
  values: WorkflowFormValues,
  id = newId()
): { workflows: WorkflowItem[]; created: WorkflowItem } {
  const created: WorkflowItem = {
    id,
    name: values.name.trim(),
    description: "",
    trigger: values.trigger || "Event",
    cadence: values.cadence.trim(),
    slug: toSlug(values.name),
    owner: findOwner(values.owner),
    // Paused until it has steps; the editor switches it on.
    enabled: false,
    tags: [],
    lastRun: "Never",
    lastRunAt: null,
    runs: 0,
    runsSucceeded: 0,
    successRate: 0,
    updatedAt: today(),
    favorite: false,
  }

  return { workflows: [created, ...workflows], created }
}

export function updateWorkflow(
  workflows: WorkflowItem[],
  id: string,
  values: WorkflowFormValues
) {
  return workflows.map((workflow) =>
    workflow.id === id
      ? {
          ...workflow,
          name: values.name.trim(),
          trigger: values.trigger || workflow.trigger,
          cadence: values.cadence.trim(),
          owner: findOwner(values.owner),
          updatedAt: today(),
        }
      : workflow
  )
}

export function setWorkflowEnabled(
  workflows: WorkflowItem[],
  id: string,
  enabled: boolean
) {
  return workflows.map((workflow) =>
    workflow.id === id ? { ...workflow, enabled } : workflow
  )
}

/** A copy lands right below its source, switched off and never run. */
export function duplicateWorkflow(
  workflows: WorkflowItem[],
  id: string,
  copyId = newId()
): { workflows: WorkflowItem[]; copy: WorkflowItem | null } {
  const index = workflows.findIndex((workflow) => workflow.id === id)
  if (index === -1) return { workflows, copy: null }

  const source = workflows[index]
  const taken = new Set(workflows.map((workflow) => workflow.name))
  let name = `${source.name} copy`
  for (let n = 2; taken.has(name); n++) name = `${source.name} copy ${n}`

  const copy: WorkflowItem = {
    ...source,
    id: copyId,
    name,
    tags: [...source.tags],
    slug: `${source.slug}-copy`,
    enabled: false,
    lastRun: "Never",
    lastRunAt: null,
    runs: 0,
    runsSucceeded: 0,
    successRate: 0,
    favorite: false,
    updatedAt: today(),
  }

  return {
    workflows: [
      ...workflows.slice(0, index + 1),
      copy,
      ...workflows.slice(index + 1),
    ],
    copy,
  }
}

export function removeWorkflow(workflows: WorkflowItem[], id: string) {
  return workflows.filter((workflow) => workflow.id !== id)
}

/** A finished manual run lands on the record: count, rate and last run. */
export function recordRun(
  workflows: WorkflowItem[],
  id: string,
  run: WorkflowRun
) {
  return workflows.map((workflow) => {
    if (workflow.id !== id) return workflow
    const runs = workflow.runs + 1
    const runsSucceeded =
      workflow.runsSucceeded + (run.outcome === "failed" ? 0 : 1)
    return {
      ...workflow,
      runs,
      runsSucceeded,
      successRate: Math.round((runsSucceeded / runs) * 100),
      lastRun:
        run.outcome === "failed" ? ("Failed" as const) : ("Succeeded" as const),
      lastRunAt: new Date(run.startedAt).toISOString(),
    }
  })
}
