import { TEAM, type TeamMember } from "./team"

// ── Workflows ──
// The workspace's workflows, one seed for the Dashboard grid, the Workflows
// list and the editor links. Pages hold it in the workspace store
// (components/workspace/workspace-provider.tsx), so a change on one page shows
// on the others.

export type WorkflowTrigger = "Schedule" | "Webhook" | "Event"

export type WorkflowLastRun = "Succeeded" | "Failed" | "Never"

export type Workflow = {
  id: string
  name: string
  description: string
  /** The workflow's handle in logs and API calls */
  slug: string
  trigger: WorkflowTrigger
  /** How often the trigger fires, in words */
  cadence: string
  owner: TeamMember
  /** Off means the trigger is ignored until the workflow is switched on */
  enabled: boolean
  tags: string[]
  lastRun: WorkflowLastRun
  /** ISO time of the last run, null when it has never run */
  lastRunAt: string | null
  /** Runs over the last 28 days */
  runs: number
  runsSucceeded: number
  /** Share of those runs that succeeded, 0 to 100 */
  successRate: number
  /** ISO date of the last edit */
  updatedAt: string
  /** Starred on the Dashboard */
  favorite: boolean
}

type Seed = Omit<Workflow, "successRate" | "lastRun"> & { failing?: boolean }

function seed({ failing, ...workflow }: Seed): Workflow {
  return {
    ...workflow,
    successRate:
      workflow.runs === 0
        ? 0
        : Math.round((workflow.runsSucceeded / workflow.runs) * 100),
    lastRun:
      workflow.runs === 0 || !workflow.lastRunAt
        ? "Never"
        : failing
          ? "Failed"
          : "Succeeded",
  }
}

export const WORKFLOWS: Workflow[] = [
  seed({
    id: "wf_8k2m4p",
    name: "Lead Routing",
    description:
      "Scores each new lead and assigns it to the right rep in the CRM.",
    slug: "crm/lead-routing",
    trigger: "Webhook",
    cadence: "On new lead",
    owner: TEAM.ines,
    enabled: true,
    tags: ["Sales", "AI"],
    lastRunAt: "2026-10-06T09:42:00Z",
    runs: 1208,
    runsSucceeded: 1184,
    updatedAt: "2026-10-02",
    favorite: true,
  }),
  seed({
    id: "wf_2h7c9d",
    name: "Invoice Reminders",
    description: "Emails customers about invoices due in the next 7 days.",
    slug: "billing/invoice-reminders",
    trigger: "Schedule",
    cadence: "Daily at 08:00",
    owner: TEAM.tomas,
    enabled: true,
    tags: ["Finance"],
    lastRunAt: "2026-10-06T08:00:00Z",
    runs: 28,
    runsSucceeded: 28,
    updatedAt: "2026-09-24",
    favorite: false,
  }),
  seed({
    id: "wf_5n1q3r",
    name: "Support Triage",
    description:
      "Classifies new tickets, sets priority and routes them to a queue.",
    slug: "support/triage",
    trigger: "Event",
    cadence: "On new ticket",
    owner: TEAM.hanna,
    enabled: true,
    tags: ["Support", "AI", "Critical"],
    lastRunAt: "2026-10-06T09:37:00Z",
    runs: 904,
    runsSucceeded: 642,
    updatedAt: "2026-10-05",
    favorite: true,
    failing: true,
  }),
  seed({
    id: "wf_9t4v6w",
    name: "Churn Risk Digest",
    description: "Sends account managers a weekly list of accounts at risk.",
    slug: "success/churn-digest",
    trigger: "Schedule",
    cadence: "Mondays at 07:00",
    owner: TEAM.omar,
    enabled: true,
    tags: ["Growth", "Data"],
    lastRunAt: "2026-10-05T07:00:00Z",
    runs: 4,
    runsSucceeded: 4,
    updatedAt: "2026-09-18",
    favorite: false,
  }),
  seed({
    id: "wf_3b8x2y",
    name: "Contract Sync",
    description: "Copies signed contracts into the CRM and the legal drive.",
    slug: "legal/contract-sync",
    trigger: "Webhook",
    cadence: "On signed contract",
    owner: TEAM.lena,
    enabled: false,
    tags: ["Legal", "Sales"],
    lastRunAt: "2026-10-04T16:21:00Z",
    runs: 240,
    runsSucceeded: 211,
    updatedAt: "2026-09-30",
    favorite: false,
  }),
  seed({
    id: "wf_6k5m1n",
    name: "Order Fulfillment",
    description:
      "Creates the shipment, updates stock and emails the tracking link.",
    slug: "ops/order-fulfillment",
    trigger: "Event",
    cadence: "On paid order",
    owner: TEAM.tomas,
    enabled: true,
    tags: ["Operations", "Critical"],
    lastRunAt: "2026-10-06T09:44:00Z",
    runs: 3946,
    runsSucceeded: 3912,
    updatedAt: "2026-10-01",
    favorite: true,
  }),
  seed({
    id: "wf_1p7r4s",
    name: "Meeting Notes to CRM",
    description: "Summarises call transcripts and logs them on the deal.",
    slug: "sales/meeting-notes",
    trigger: "Event",
    cadence: "On call ended",
    owner: TEAM.nick,
    enabled: true,
    tags: ["Sales", "AI"],
    lastRunAt: "2026-10-06T09:10:00Z",
    runs: 184,
    runsSucceeded: 118,
    updatedAt: "2026-10-04",
    favorite: false,
    failing: true,
  }),
  seed({
    id: "wf_4d2f8g",
    name: "Data Warehouse Export",
    description: "Exports product events to the warehouse every hour.",
    slug: "data/warehouse-export",
    trigger: "Schedule",
    cadence: "Every hour",
    owner: TEAM.omar,
    enabled: true,
    tags: ["Data"],
    lastRunAt: "2026-10-06T09:00:00Z",
    runs: 672,
    runsSucceeded: 626,
    updatedAt: "2026-09-12",
    favorite: false,
  }),
  seed({
    id: "wf_7h3j5k",
    name: "Onboarding Emails",
    description: "Sends the five-email welcome sequence after signup.",
    slug: "growth/onboarding-emails",
    trigger: "Event",
    cadence: "On signup",
    owner: TEAM.hanna,
    enabled: true,
    tags: ["Marketing", "Growth"],
    lastRunAt: "2026-10-06T09:28:00Z",
    runs: 465,
    runsSucceeded: 451,
    updatedAt: "2026-09-27",
    favorite: false,
  }),
  seed({
    id: "wf_8l6m9n",
    name: "Expense Approvals",
    description: "Asks the budget owner to approve expenses over $500.",
    slug: "finance/expense-approvals",
    trigger: "Webhook",
    cadence: "On expense filed",
    owner: TEAM.lena,
    enabled: false,
    tags: ["Finance"],
    lastRunAt: null,
    runs: 0,
    runsSucceeded: 0,
    updatedAt: "2026-09-28",
    favorite: false,
  }),
  seed({
    id: "wf_2q9r6s",
    name: "Inventory Restock",
    description: "Reorders stock when a product falls below its threshold.",
    slug: "ops/inventory-restock",
    trigger: "Schedule",
    cadence: "Daily at 06:00",
    owner: TEAM.tomas,
    enabled: true,
    tags: ["Operations"],
    lastRunAt: "2026-10-06T06:00:00Z",
    runs: 28,
    runsSucceeded: 23,
    updatedAt: "2026-09-21",
    favorite: false,
  }),
  seed({
    id: "wf_5t1u3v",
    name: "Social Mentions Alert",
    description: "Posts brand mentions with negative sentiment to Slack.",
    slug: "marketing/mentions-alert",
    trigger: "Event",
    cadence: "On brand mention",
    owner: TEAM.ines,
    enabled: true,
    tags: ["Marketing", "AI"],
    lastRunAt: "2026-10-06T09:31:00Z",
    runs: 397,
    runsSucceeded: 302,
    updatedAt: "2026-10-03",
    favorite: false,
    failing: true,
  }),
]
