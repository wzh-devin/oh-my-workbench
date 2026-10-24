import type { ReactNode } from "react"
import {
  BookOpenIcon,
  BotIcon,
  FlaskConicalIcon,
  MailCheckIcon,
} from "lucide-react"

import { USER } from "@/components/app-shell/data"
import { AGENT, MODEL_OPTIONS } from "../data"

export const PAGE_NAME = AGENT.name
export const ASSISTANT_NAME = "Flowly Assistant"
export const LAUNCHER_LABEL = "Ask AI"
export const COMPOSER_PLACEHOLDER = "Ask about this agent"
export const FOOTNOTE = "Replies can be wrong. Check before acting."

export const GREETING = {
  title: `Hi ${USER.name.split(" ")[0]}`,
  lead: `I read the ${PAGE_NAME}, its last test run and anything you attach.`,
}

export type SourceRecord = {
  id: string
  /** The short name a chip and a menu row carry. */
  chip: string
  hint: string
  icon: ReactNode
}

// customize: what the assistant may read. The agent is attached on open; the
// plus menu in the composer adds or drops the rest.
export const SOURCES: SourceRecord[] = [
  {
    id: "agent",
    chip: PAGE_NAME,
    hint: "The agent you have open",
    icon: <BotIcon aria-hidden="true" />,
  },
  {
    id: "run",
    chip: "Last Test Run",
    hint: "Recorded input, invoice inv_9412",
    icon: <FlaskConicalIcon aria-hidden="true" />,
  },
  {
    id: "delivery",
    chip: "Resend Delivery",
    hint: "Terms delivered to maren@ostwind.de",
    icon: <MailCheckIcon aria-hidden="true" />,
  },
  {
    id: "playbook",
    chip: "Collections Playbook",
    hint: "Reminder timing and tone",
    icon: <BookOpenIcon aria-hidden="true" />,
  },
]

export const DEFAULT_SOURCES = ["agent"]

/** Starter rows on a fresh chat. Each one sends as typed. */
export const STARTERS = [
  "What did the last test run do?",
  "Which path does a promised payment take?",
  "How much does one run cost?",
  "Draft a reminder for an overdue invoice",
  "What should run after Slack?",
]

export type TableColumn = {
  key: string
  label: string
  /** End aligned in tabular figures; cellText adds the unit. */
  numeric?: boolean
  unit?: string
  /** Summed into the footer's Total row. */
  total?: boolean
  /** Step ids and other identifiers, set in mono. */
  mono?: boolean
  /** Renders the cell through STATUS_BADGE instead of as plain text. */
  badge?: boolean
}

export type AnswerTable = {
  /** Read to a screen reader; on screen the lead already says it. */
  caption: string
  columns: TableColumn[]
  rows: Record<string, string | number>[]
}

export type FigureRecord = { value: string; label: string }

/** The one state face a table cell can carry: a step's result on the last run. */
export const STATUS_BADGE: Record<
  string,
  {
    variant: "warning-light" | "success-light" | "destructive-light" | "outline"
    label: string
  }
> = {
  passed: { variant: "success-light", label: "Passed" },
  failed: { variant: "destructive-light", label: "Failed" },
  skipped: { variant: "outline", label: "Skipped" },
}

/** Answers carry `code` and **bold** inline; the view renders both. */
export type AnswerBody = {
  lead: string
  /** The numbers the answer rests on, in a row under the lead. */
  figures?: FigureRecord[]
  table?: AnswerTable
  points?: string[]
  /** Ordered actions, numbered in the view. */
  steps?: string[]
  code?: { language: string; filename: string; code: string }
  /** Text written for the reader to paste elsewhere, set apart from the prose. */
  draft?: { title: string; text: string }
  /** The one caveat or all clear that must not read as prose. */
  callout?: { tone: "warning" | "success"; title: string; detail: string }
  note?: string
  /** The next question, offered under the answer once it settles. */
  followUps?: string[]
}

export type Vote = "up" | "down"

export type TurnRecord =
  | {
      id: string
      kind: "asked"
      text: string
      /** SOURCES ids attached at send time, shown under the question. */
      sources: string[]
      /** Set when Stop dropped the reply this question was waiting on. */
      stopped?: boolean
    }
  | ({
      id: string
      kind: "answer"
      /** The reader's rating, set from the thumbs under the answer. */
      vote?: Vote
    } & AnswerBody)

export type ThreadRecord = {
  id: string
  /** Fixed label: a relative time needs a clock the demo does not have. */
  at: string
  /** The History section the chat is filed under. */
  recency: "today" | "yesterday" | "earlier"
  /** Starred from the header, which files the chat under Pinned. */
  pinned?: boolean
  turns: TurnRecord[]
}

/** A thread is named by its first question, so the history reads as asked. */
export function threadTitle(thread: ThreadRecord) {
  const first = thread.turns.find((turn) => turn.kind === "asked")
  return first?.kind === "asked" ? first.text : "New Chat"
}

/** Numbers are stored raw so a footer can total them; the comma arrives here. */
export function cellText(value: string | number, column: TableColumn) {
  if (column.badge) return STATUS_BADGE[String(value)]?.label ?? String(value)
  const text = typeof value === "number" ? value.toLocaleString("en-US") : value
  return column.unit ? `${text} ${column.unit}` : text
}

export function columnTotal(table: AnswerTable, key: string) {
  return table.rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)
}

/** Tab separated, so a pasted table lands in a spreadsheet as columns. */
function tableText(table: AnswerTable) {
  const lines = [
    table.columns.map((column) => column.label),
    ...table.rows.map((row) =>
      table.columns.map((column) => cellText(row[column.key], column))
    ),
  ]
  if (table.columns.some((column) => column.total))
    lines.push(
      table.columns.map((column, index) =>
        index === 0
          ? "Total"
          : column.total
            ? cellText(columnTotal(table, column.key), column)
            : ""
      )
    )
  return lines.map((cells) => cells.join("\t")).join("\n")
}

/** Plain text for the clipboard, in the order the answer reads: one blank line
    between parts, code fenced so it pastes into a chat as code. */
export function answerText(turn: AnswerBody) {
  return [
    turn.lead,
    turn.figures
      ?.map((figure) => `${figure.label}: ${figure.value}`)
      .join("\n"),
    turn.table ? tableText(turn.table) : undefined,
    turn.points?.map((point) => `- ${point}`).join("\n"),
    turn.steps?.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    turn.code
      ? `\`\`\`${turn.code.language}\n${turn.code.code}\n\`\`\``
      : undefined,
    turn.draft?.text,
    turn.callout ? `${turn.callout.title}: ${turn.callout.detail}` : undefined,
    turn.note,
  ]
    .filter(Boolean)
    .join("\n\n")
}

const RUN_ANSWER: AnswerBody = {
  lead: "The last test run passed: the recorded input took the **Promised** path, from the overdue invoice to the terms email.",
  table: {
    caption: "Steps the last test run reached",
    columns: [
      { key: "id", label: "Id", mono: true },
      { key: "step", label: "Step" },
      { key: "result", label: "Result", badge: true },
    ],
    rows: [
      { id: "overdue", step: "Stripe", result: "passed" },
      { id: "ledger", step: "Neon", result: "passed" },
      { id: "triage", step: "Claude Sonnet 5", result: "passed" },
      { id: "terms", step: "Stripe", result: "passed" },
      { id: "confirm", step: "Resend", result: "passed" },
    ],
  },
  points: [
    "Claude triaged the reply as Promised, so No reply and Disputed were skipped on purpose.",
    "Resend delivered the terms to `maren@ostwind.de` in 1.2s.",
  ],
  followUps: [
    "What if the email bounces?",
    "Draft a reminder for an overdue invoice",
  ],
}

const BOUNCE_ANSWER: AnswerBody = {
  lead: "Catch it before Resend writes: check the address first, and send a bounced one to Slack instead.",
  steps: [
    "Add a Neon step between Stripe and Resend that runs the query below.",
    "Branch on its result: a bounced address goes to Slack instead of Resend.",
    "Put a bounced address in the recorded input and run the test.",
  ],
  code: {
    language: "sql",
    filename: "check-email.sql",
    code: "select email, email_status\n  from customers\n where invoice_id = 'inv_9412';",
  },
  callout: {
    tone: "warning",
    title: "Why It Matters",
    detail:
      "Every bounce counts against the Resend sending domain, and the customer never sees the terms.",
  },
  followUps: ["Which path does a promised payment take?"],
}

const PATH_ANSWER: AnswerBody = {
  lead: "A promised payment takes the **Promised** path: Stripe offers a payment plan, then Resend emails the terms.",
  table: {
    caption: "Paths out of the Claude triage step",
    columns: [
      { key: "path", label: "Path" },
      { key: "steps", label: "Steps" },
      { key: "result", label: "Last Run", badge: true },
    ],
    rows: [
      { path: "No reply", steps: "PII Guardrail, Slack", result: "skipped" },
      { path: "Promised", steps: "Stripe, Resend", result: "passed" },
      { path: "Disputed", steps: "Stripe, ClickUp", result: "skipped" },
    ],
  },
  note: `Claude picks the path from its triage reply. The recorded input says "${AGENT.testPath}", so the other two paths are skipped on purpose.`,
  followUps: ["What did the last test run do?"],
}

const COST_ANSWER: AnswerBody = {
  lead: "One run costs **USD 0.031**, and all of it is the Claude step.",
  figures: [
    { value: "1,842", label: "Tokens per run" },
    { value: "USD 0.031", label: "Per run" },
    { value: "USD 31", label: "Per 1,000 runs" },
  ],
  points: [
    "Stripe, Neon, Resend, Slack and ClickUp calls are billed by those services, not per token.",
    "Haiku 4.5 would bring a run down to about USD 0.011.",
  ],
  followUps: ["Which model should this agent use?"],
}

const MODEL_ANSWER: AnswerBody = {
  lead: "Sonnet 5 is the right default here; Haiku 4.5 is worth a test run if volume grows.",
  table: {
    caption: "What the recorded input costs on each model",
    columns: [
      { key: "model", label: "Model" },
      { key: "tokens", label: "Tokens", numeric: true },
      { key: "cost", label: "USD per Run", numeric: true },
    ],
    rows: MODEL_OPTIONS.map((option) => ({
      model: option.label,
      tokens: Number(option.facts[0].replace(/[^0-9]/g, "")),
      cost: option.facts[1].replace("USD ", ""),
    })),
  },
  callout: {
    tone: "success",
    title: "Same Path on Every Model",
    detail:
      "All three models triage the recorded input as Promised, so switching does not change which steps run.",
  },
  note: "Change the model in the Claude step's form.",
}

const DRAFT_ANSWER: AnswerBody = {
  lead: "Here is a reminder in the playbook's tone.",
  draft: {
    title: "Reminder Email",
    text: "Hi Maren, invoice INV-9412 for EUR 4,180 was due three days ago. If paying it in one go is hard right now, reply to this email and we can split it into three monthly instalments of EUR 1,393. Thank you, the Collections team",
  },
  note: "Nothing is sent from here. Paste it into the Resend step's template.",
}

const NEXT_ANSWER: AnswerBody = {
  lead: "After Slack, add a **ClickUp** step that assigns the account to someone, so a customer who never replies does not just sit in a channel.",
  steps: [
    "Drag ClickUp from the step library onto the Slack card.",
    "Name it Assign follow-up and say who picks it up.",
    "Run test with a No reply input to check the path.",
  ],
  followUps: ["How much does one run cost?"],
}

/** Sent with nothing attached: say so instead of answering from nowhere. */
const NO_SOURCES_ANSWER: AnswerBody = {
  lead: `Nothing is attached, so I cannot see the agent. Add ${PAGE_NAME} with the plus button and ask again.`,
}

const FALLBACK_ANSWERS: AnswerBody[] = [
  {
    lead: `I could not match that to the ${PAGE_NAME} or the attached sources. Try naming a step, a path or the last run.`,
  },
  {
    lead: "That is outside what I can see here. Ask about a step, a failed run, the cost of a run or what to add next.",
  },
]

// customize: keyword routing stands in for your model call. The first entry
// with a matching word wins, so keep the narrow ones on top.
const REPLY_LIBRARY: { match: string[]; body: AnswerBody }[] = [
  { match: ["bounce", "fix", "fail", "error"], body: BOUNCE_ANSWER },
  { match: ["draft", "reminder", "write", "email"], body: DRAFT_ANSWER },
  { match: ["model", "sonnet", "opus", "haiku"], body: MODEL_ANSWER },
  { match: ["cost", "price", "token", "spend", "usd"], body: COST_ANSWER },
  { match: ["after", "next", "add", "suggest"], body: NEXT_ANSWER },
  { match: ["path", "branch", "promised", "route"], body: PATH_ANSWER },
  { match: ["last", "run", "result", "resend"], body: RUN_ANSWER },
]

/** replyIndex counts replies in the session, so the fallback lines take turns. */
export function composeReply(
  prompt: string,
  sources: string[],
  replyIndex: number
) {
  if (sources.length === 0) return NO_SOURCES_ANSWER
  const text = prompt.toLowerCase()
  const entry = REPLY_LIBRARY.find((candidate) =>
    candidate.match.some((word) => text.includes(word))
  )
  return entry?.body ?? FALLBACK_ANSWERS[replyIndex % FALLBACK_ANSWERS.length]
}

/** The line the thinking marker shows, named after what is being read. */
export function readingLabel(sources: string[]) {
  const first = SOURCES.find((source) => sources.includes(source.id))
  return first ? `Reading ${first.chip}` : "Searching the workspace"
}

export const NEW_THREAD_ID = "th_new"

// customize: the signed in user's earlier conversations, newest first.
export const THREADS: ThreadRecord[] = [
  { id: NEW_THREAD_ID, at: "Now", recency: "today", turns: [] },
  {
    id: "th_4be7d2",
    at: "09:42",
    recency: "today",
    turns: [
      {
        id: "t_4be7d2_1",
        kind: "asked",
        text: "Why was the Disputed path skipped?",
        sources: ["agent", "run"],
      },
      {
        id: "t_4be7d2_2",
        kind: "answer",
        lead: "The recorded input promises to pay, so Claude triaged it as **Promised** and the run never entered Disputed.",
        points: [
          "Skipped is the expected result for a path the input does not take.",
          "Test a dispute by changing the recorded reply, not the agent.",
        ],
      },
    ],
  },
  {
    id: "th_7f21c4",
    at: "Yesterday",
    recency: "yesterday",
    turns: [
      {
        id: "t_7f21c4_1",
        kind: "asked",
        text: "Can Slack post to a private channel?",
        sources: ["agent"],
      },
      {
        id: "t_7f21c4_2",
        kind: "answer",
        lead: "Yes, once the Flowly app is a member of that channel.",
        steps: [
          "In Slack, open the channel and add the Flowly app.",
          "Edit the Slack step and change its description to the new channel.",
          "Run test with a No reply input.",
        ],
      },
    ],
  },
  {
    id: "th_31a9e0",
    at: "Mon",
    recency: "earlier",
    pinned: true,
    turns: [
      {
        id: "t_31a9e0_1",
        kind: "asked",
        text: "What does the PII Guardrail check?",
        sources: ["agent", "playbook"],
      },
      {
        id: "t_31a9e0_2",
        kind: "answer",
        lead: "It scans every outbound message before Slack sees it and masks what should not leave the ledger.",
        points: [
          "IBANs and card numbers are masked to their last four digits.",
          "Personal email addresses and phone numbers are removed.",
        ],
      },
    ],
  },
  {
    id: "th_c58b12",
    at: "Sep 28",
    recency: "earlier",
    turns: [
      {
        id: "t_c58b12_1",
        kind: "asked",
        text: "How long after the due date does the agent start?",
        sources: ["playbook"],
      },
      {
        id: "t_c58b12_2",
        kind: "answer",
        lead: "Three days. Stripe fires the trigger when an invoice is three days overdue.",
        note: "The playbook allows anything from one to seven days; change it on the Stripe step.",
      },
    ],
  },
]
