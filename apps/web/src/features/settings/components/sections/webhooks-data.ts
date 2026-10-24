import { type BadgeProps } from "@/components/reui/badge"

// The workspace's webhook endpoints: where Flowly posts run and agent
// events as they happen. The list on Webhooks, Add Endpoint (sheet-21) and
// each endpoint's drawer (sheet-22) read this.

export type WebhookEvent =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "agent.approval_requested"
  | "workflow.published"

export const WEBHOOK_EVENTS: { value: WebhookEvent; description: string }[] = [
  { value: "run.started", description: "A workflow run begins." },
  { value: "run.completed", description: "A run finishes every step." },
  { value: "run.failed", description: "A step fails after its retries." },
  {
    value: "agent.approval_requested",
    description: "An agent waits for a person.",
  },
  { value: "workflow.published", description: "A new version goes live." },
]

export type WebhookRetry = "standard" | "extended" | "off"

export const RETRY_LABEL: Record<WebhookRetry, string> = {
  standard: "24 hours",
  extended: "72 hours",
  off: "No retries",
}

export type WebhookStatus = "delivering" | "retrying" | "paused"

export const WEBHOOK_STATUS_FACE: Record<
  WebhookStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  delivering: { label: "Delivering", variant: "success-light" },
  retrying: { label: "Retrying", variant: "warning-light" },
  paused: { label: "Paused", variant: "outline" },
}

export type WebhookDelivery = {
  id: string
  event: WebhookEvent
  /** HTTP status the endpoint answered with */
  code: number
  ms: number
  at: string
}

export type WebhookEndpoint = {
  id: string
  url: string
  description: string
  events: WebhookEvent[]
  retry: WebhookRetry
  signing: boolean
  status: WebhookStatus
  /** Share of deliveries answered 2xx in the last 24 hours */
  successRate: number
  lastDelivery: string
  secretTail: string
  deliveries: WebhookDelivery[]
}

/** The fields Add Endpoint and the Settings tab edit. */
export type WebhookDraft = Pick<
  WebhookEndpoint,
  "url" | "description" | "events" | "retry" | "signing"
>

export const SEED_ENDPOINTS: WebhookEndpoint[] = [
  {
    id: "whk-runs",
    url: "https://api.flowly.dev/hooks/runs",
    description: "Run results for the ops dashboard.",
    events: ["run.started", "run.completed", "run.failed"],
    retry: "standard",
    signing: true,
    status: "delivering",
    successRate: 99.8,
    lastDelivery: "12 s ago",
    secretTail: "9f2c",
    deliveries: [
      {
        id: "dlv-1",
        event: "run.completed",
        code: 200,
        ms: 182,
        at: "12 s ago",
      },
      {
        id: "dlv-2",
        event: "run.started",
        code: 200,
        ms: 164,
        at: "1 min ago",
      },
      { id: "dlv-3", event: "run.failed", code: 200, ms: 201, at: "8 min ago" },
    ],
  },
  {
    id: "whk-approvals",
    url: "https://hooks.acme.dev/flowly/approvals",
    description: "Approval requests into the support desk.",
    events: ["agent.approval_requested"],
    retry: "extended",
    signing: true,
    status: "retrying",
    successRate: 92.4,
    lastDelivery: "4 min ago",
    secretTail: "a71c",
    deliveries: [
      {
        id: "dlv-4",
        event: "agent.approval_requested",
        code: 503,
        ms: 3010,
        at: "4 min ago",
      },
      {
        id: "dlv-5",
        event: "agent.approval_requested",
        code: 503,
        ms: 3004,
        at: "6 min ago",
      },
      {
        id: "dlv-6",
        event: "agent.approval_requested",
        code: 200,
        ms: 240,
        at: "1 hour ago",
      },
    ],
  },
  {
    id: "whk-releases",
    url: "https://releases.flowly.dev/webhooks/publish",
    description: "Posts release notes when a workflow ships.",
    events: ["workflow.published"],
    retry: "off",
    signing: false,
    status: "paused",
    successRate: 100,
    lastDelivery: "3 days ago",
    secretTail: "0b4e",
    deliveries: [
      {
        id: "dlv-7",
        event: "workflow.published",
        code: 200,
        ms: 133,
        at: "3 days ago",
      },
    ],
  },
]
