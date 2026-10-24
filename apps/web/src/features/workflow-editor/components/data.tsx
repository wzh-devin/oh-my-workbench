/**
 * Every fact the canvas renders. A step's category picks its glyph; owner,
 * duration and status describe how that step ended on the last run.
 */
import type { BadgeProps } from "@/components/reui/badge"
import type { Edge, Node } from "@xyflow/react"
import {
  CheckIcon,
  TriangleAlertIcon,
  WebhookIcon,
  GitBranchIcon,
  DatabaseIcon,
  MailIcon,
  ClockIcon,
  ZapIcon,
  CircleCheckIcon,
  CircleXIcon,
  MinusIcon,
  CircleDotIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  BellRingIcon,
  DatabasePlusIcon,
  DatabaseSearchIcon,
  SheetIcon,
  BracesIcon,
  CalendarClockIcon,
  HourglassIcon,
  FilterIcon,
  RepeatIcon,
  OctagonXIcon,
} from "lucide-react"

/** Typed toast icons, so feedback carries semantic colour and not only text. */
export const TOAST_SUCCESS_ICON = (
  <CheckIcon className="size-4 text-success" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
)

export type StepKind = "trigger" | "condition" | "action"

export type StepCategory =
  | "email"
  | "sms"
  | "chat"
  | "push"
  | "create"
  | "data"
  | "lookup"
  | "webhook"
  | "sheet"
  | "transform"
  | "delay"
  | "schedule"
  | "event"
  | "condition"
  | "filter"
  | "loop"
  | "action"
  | "stop"

// In the order the step form's Type list shows them: the library's groups.
export const CATEGORY_LABEL: Record<StepCategory, string> = {
  email: "Email",
  sms: "SMS",
  chat: "Chat",
  push: "Push",
  create: "Create Record",
  data: "Data",
  lookup: "Find Record",
  webhook: "Webhook",
  sheet: "Spreadsheet",
  transform: "Transform",
  delay: "Delay",
  schedule: "Schedule",
  event: "Event",
  condition: "Condition",
  filter: "Filter",
  loop: "Loop",
  action: "Action",
  stop: "Stop",
}

/** One glyph per category, so picking a category is what sets the tile. */
export const CATEGORY_ICON: Record<StepCategory, React.ReactNode> = {
  email: <MailIcon aria-hidden="true" />,
  sms: <MessageSquareTextIcon aria-hidden="true" />,
  chat: <MessagesSquareIcon aria-hidden="true" />,
  push: <BellRingIcon aria-hidden="true" />,
  create: <DatabasePlusIcon aria-hidden="true" />,
  data: <DatabaseIcon aria-hidden="true" />,
  lookup: <DatabaseSearchIcon aria-hidden="true" />,
  webhook: <WebhookIcon aria-hidden="true" />,
  sheet: <SheetIcon aria-hidden="true" />,
  transform: <BracesIcon aria-hidden="true" />,
  delay: <ClockIcon aria-hidden="true" />,
  schedule: <CalendarClockIcon aria-hidden="true" />,
  event: <HourglassIcon aria-hidden="true" />,
  condition: <GitBranchIcon aria-hidden="true" />,
  filter: <FilterIcon aria-hidden="true" />,
  loop: <RepeatIcon aria-hidden="true" />,
  action: <ZapIcon aria-hidden="true" />,
  stop: <OctagonXIcon aria-hidden="true" />,
}

export const STEP_CATEGORIES = Object.keys(CATEGORY_LABEL) as StepCategory[]

/**
 * A step the library offers. `label` is its name in the list and `title` what
 * the new card is called; the category picks the glyph the two share, and
 * `detail` is the card's second line until the step is configured.
 */
export type StepTemplate = {
  id: string
  label: string
  title: string
  kind: StepKind
  category: StepCategory
  detail?: string
}

// customize: the steps your product can run, grouped as the panel lists them.
export const STEP_LIBRARY: {
  id: string
  title: string
  items: StepTemplate[]
}[] = [
  {
    id: "messages",
    title: "Messages",
    items: [
      {
        id: "send-email",
        label: "Send Email",
        title: "Send email",
        kind: "action",
        category: "email",
        detail: "Email to the lead",
      },
      {
        id: "send-sms",
        label: "Send SMS",
        title: "Send SMS",
        kind: "action",
        category: "sms",
        detail: "Text to the lead's phone",
      },
      {
        id: "post-channel",
        label: "Post to Channel",
        title: "Post to channel",
        kind: "action",
        category: "chat",
        detail: "Message in a team channel",
      },
      {
        id: "send-push",
        label: "Send Push",
        title: "Send push",
        kind: "action",
        category: "push",
        detail: "Notification in the mobile app",
      },
    ],
  },
  {
    id: "data",
    title: "Data",
    items: [
      {
        id: "create-record",
        label: "Create Record",
        title: "Create record",
        kind: "action",
        category: "create",
        detail: "New record in the CRM",
      },
      {
        id: "update-record",
        label: "Update Record",
        title: "Update record",
        kind: "action",
        category: "data",
        detail: "Set fields on a CRM record",
      },
      {
        id: "find-record",
        label: "Find Record",
        title: "Find record",
        kind: "action",
        category: "lookup",
        detail: "Look a record up by email",
      },
      {
        id: "send-webhook",
        label: "Send Webhook",
        title: "Send webhook",
        kind: "action",
        category: "webhook",
        detail: "POST the payload to a URL",
      },
      {
        id: "add-sheet-row",
        label: "Add Sheet Row",
        title: "Add sheet row",
        kind: "action",
        category: "sheet",
        detail: "Append a row to a spreadsheet",
      },
      {
        id: "format-data",
        label: "Format Data",
        title: "Format data",
        kind: "action",
        category: "transform",
        detail: "Map and rename fields",
      },
    ],
  },
  {
    id: "delays",
    title: "Delays",
    items: [
      {
        id: "time-delay",
        label: "Time Delay",
        title: "Time delay",
        kind: "action",
        category: "delay",
        detail: "Wait 1 hour",
      },
      {
        id: "wait-until",
        label: "Wait Until",
        title: "Wait until",
        kind: "action",
        category: "schedule",
        detail: "Monday at 9:00 AM",
      },
      {
        id: "wait-event",
        label: "Wait for Event",
        title: "Wait for event",
        kind: "action",
        category: "event",
        detail: "Until the lead replies",
      },
    ],
  },
  {
    id: "flow-control",
    title: "Flow Control",
    items: [
      {
        id: "branch",
        label: "If/Else Branch",
        title: "If/else branch",
        kind: "condition",
        category: "condition",
        detail: "Add a condition",
      },
      {
        id: "filter",
        label: "Filter",
        title: "Filter",
        kind: "action",
        category: "filter",
        detail: "Continue only when it matches",
      },
      {
        id: "loop",
        label: "Loop Over Items",
        title: "Loop over items",
        kind: "action",
        category: "loop",
        detail: "Run the next steps per item",
      },
      {
        id: "run-action",
        label: "Run Action",
        title: "Run action",
        kind: "action",
        category: "action",
        detail: "Run custom code",
      },
      {
        id: "stop",
        label: "Stop Workflow",
        title: "Stop workflow",
        kind: "action",
        category: "stop",
        detail: "End the run here",
      },
    ],
  },
]

type StepStatus = "succeeded" | "failed" | "skipped" | "idle"

type StepOwner = {
  id: string
  name: string
  initials: string
  avatar: string
}

export type StepNodeData = {
  kind: StepKind
  category: StepCategory
  title: string
  detail: string
  /** How this step ended on the last run. */
  status: StepStatus
  duration: string
  owner: StepOwner
}

export const KIND_LABEL: Record<StepKind, string> = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
}

export const STATUS_LABEL: Record<StepStatus, string> = {
  succeeded: "Success",
  failed: "Failed",
  skipped: "Skipped",
  idle: "Idle",
}

/** Semantic badge per status; the panel and the node read the same fact. */
export const STATUS_BADGE: Record<StepStatus, BadgeProps["variant"]> = {
  succeeded: "success-light",
  failed: "destructive-light",
  skipped: "outline",
  idle: "outline",
}

/** Shape carries the status too, so it never rests on colour alone. */
export const STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  succeeded: <CircleCheckIcon aria-hidden="true" />,
  failed: <CircleXIcon aria-hidden="true" />,
  skipped: <MinusIcon aria-hidden="true" />,
  idle: <CircleDotIcon aria-hidden="true" />,
}

const INES: StepOwner = {
  id: "ines",
  name: "Ines Marchetti",
  initials: "IM",
  avatar:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
}

const TOMAS: StepOwner = {
  id: "tomas",
  name: "Tomas Lindqvist",
  initials: "TL",
  avatar:
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&dpr=2&q=80",
}

const HANNA: StepOwner = {
  id: "hanna",
  name: "Hanna Berg",
  initials: "HB",
  avatar:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&h=96&dpr=2&q=80",
}

/** The people a step can be handed to; the edit form picks from these. */
export const STEP_OWNERS: StepOwner[] = [INES, TOMAS, HANNA]

export type StepNodeType = Node<StepNodeData, "step">

export const WORKFLOW = {
  id: "wf_8k2m4p",
  name: "Lead Routing",
  lastRun: "run_3f9a1c",
}

// Mirrors the CanvasToolbar keydown handler and the canvas deleteKeyCode;
// "mod" and "shift" print the platform's own glyph.
export const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Select", keys: ["V"] },
  { label: "Pan", keys: ["H"] },
  { label: "Zoom in", keys: ["+"] },
  { label: "Zoom out", keys: ["-"] },
  { label: "Zoom to fit", keys: ["shift", "1"] },
  { label: "Actual size", keys: ["shift", "0"] },
  { label: "Undo", keys: ["mod", "Z"] },
  { label: "Redo", keys: ["mod", "shift", "Z"] },
  { label: "Delete step", keys: ["Backspace"] },
]

// customize: replace with your own automation steps.
export const INITIAL_NODES: StepNodeType[] = [
  {
    id: "trigger",
    type: "step",
    // The engine checks this before anything else, so no path drops the entry
    // point: not the toolbar, not Backspace, not Select all steps.
    deletable: false,
    position: { x: 0, y: 160 },
    data: {
      kind: "trigger",
      title: "Form submitted",
      detail: "Webhook: demo.request",
      category: "webhook",
      status: "succeeded",
      duration: "0.2s",
      owner: INES,
    },
  },
  {
    id: "filter",
    type: "step",
    position: { x: 300, y: 160 },
    data: {
      kind: "condition",
      title: "Plan is Enterprise",
      detail: "company.size > 200",
      category: "condition",
      status: "succeeded",
      duration: "0.1s",
      owner: INES,
    },
  },
  {
    id: "enrich",
    type: "step",
    position: { x: 600, y: 40 },
    data: {
      kind: "action",
      title: "Enrich company",
      detail: "Clearbit lookup",
      category: "data",
      status: "failed",
      duration: "8.0s",
      owner: TOMAS,
    },
  },
  {
    id: "notify",
    type: "step",
    position: { x: 600, y: 280 },
    data: {
      kind: "action",
      title: "Notify sales",
      detail: "Slack #inbound-leads",
      category: "chat",
      status: "skipped",
      duration: "Not run",
      owner: HANNA,
    },
  },
  {
    id: "deal",
    type: "step",
    position: { x: 900, y: 40 },
    data: {
      kind: "action",
      title: "Create deal",
      detail: "HubSpot pipeline: Inbound",
      category: "action",
      status: "idle",
      duration: "Not run",
      owner: TOMAS,
    },
  },
]

// A step made from a library template takes its kind, glyph and name; any
// other new step lands as a plain action. The buyer swaps the defaults here.
export function createStep(
  id: string,
  position: { x: number; y: number },
  template?: StepTemplate
): StepNodeType {
  return {
    id,
    type: "step",
    position,
    className: "group/node",
    data: {
      kind: template?.kind ?? "action",
      title: template?.title ?? "New step",
      detail: template?.detail ?? "Not configured yet",
      category: template?.category ?? "action",
      status: "idle",
      duration: "Not run",
      owner: INES,
    },
  }
}

/**
 * A branch's two ways out, in the order a test run prefers them. A wire drawn
 * from a branch takes the first one still free.
 */
export const BRANCH_PATHS = ["True", "False"] as const

/** Whether an edge's label names the path a run takes first. */
export const isPreferredPath = (label: unknown) =>
  String(label ?? "").toLowerCase() === BRANCH_PATHS[0].toLowerCase()

// Every edge takes the "labeled" type so one path style covers the graph. The
// animated ones trace the enterprise route, the branch nobody has to inspect.
export const INITIAL_EDGES: Edge[] = [
  {
    id: "trigger-filter",
    source: "trigger",
    target: "filter",
    type: "labeled",
    animated: true,
  },
  {
    id: "filter-enrich",
    source: "filter",
    target: "enrich",
    type: "labeled",
    animated: true,
    label: BRANCH_PATHS[0],
  },
  {
    id: "filter-notify",
    source: "filter",
    target: "notify",
    type: "labeled",
    label: BRANCH_PATHS[1],
  },
  {
    id: "enrich-deal",
    source: "enrich",
    target: "deal",
    type: "labeled",
    animated: true,
  },
]
