import type { ReactNode } from "react"
import {
  BookOpenIcon,
  HistoryIcon,
  LibraryIcon,
  WorkflowIcon,
} from "lucide-react"

import { USER } from "@/components/app-shell/data"
import { WORKFLOW } from "../data"

export const PAGE_NAME = WORKFLOW.name
export const ASSISTANT_NAME = "Flowly AI"
export const LAUNCHER_LABEL = "Ask AI"
export const COMPOSER_PLACEHOLDER = "Ask about this workflow"
export const FOOTNOTE = "Replies can be wrong. Check before you publish."

export const GREETING = {
  title: `Hi ${USER.name.split(" ")[0]}`,
  lead: `I read ${PAGE_NAME}, its last run and anything you attach.`,
}

export type SourceRecord = {
  id: string
  /** The short name a chip and a menu row carry. */
  chip: string
  hint: string
  icon: ReactNode
}

// customize: what the assistant may read. The workflow is attached on open;
// the plus menu in the composer adds or drops the rest.
export const SOURCES: SourceRecord[] = [
  {
    id: "page",
    chip: PAGE_NAME,
    hint: "The workflow you have open",
    icon: <WorkflowIcon aria-hidden="true" />,
  },
  {
    id: "run",
    chip: WORKFLOW.lastRun,
    hint: "The last live run, step by step",
    icon: <HistoryIcon aria-hidden="true" />,
  },
  {
    id: "library",
    chip: "Step Library",
    hint: "Every step this workspace can run",
    icon: <LibraryIcon aria-hidden="true" />,
  },
  {
    id: "docs",
    chip: "Clearbit Docs",
    hint: "Limits and timeouts of the lookup",
    icon: <BookOpenIcon aria-hidden="true" />,
  },
]

export const DEFAULT_SOURCES = ["page"]

/** Starter rows on a fresh chat. Each one sends as typed. */
export const STARTERS = [
  "Why did Enrich company fail?",
  "Which steps were skipped?",
  "How do I fix the timeout?",
  "Notify sales when a deal is created",
  "Draft a run summary for the team",
]

export type TableColumn = {
  key: string
  label: string
  /** End aligned in tabular figures; cellText adds the unit. */
  numeric?: boolean
  unit?: string
  /** Summed into the footer's Total row. */
  total?: boolean
  /** Endpoints and other identifiers, set in mono. */
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

/** The one state face a table cell can carry. */
export const STATUS_BADGE: Record<
  string,
  {
    variant: "warning-light" | "success-light" | "destructive-light" | "outline"
    label: string
  }
> = {
  succeeded: { variant: "success-light", label: "Success" },
  failed: { variant: "destructive-light", label: "Failed" },
  skipped: { variant: "outline", label: "Skipped" },
  idle: { variant: "outline", label: "Idle" },
  slow: { variant: "warning-light", label: "Over limit" },
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

const FAILURE_ANSWER: AnswerBody = {
  lead: "**Enrich company** timed out: the Clearbit lookup took 8.0s against its 5s limit, so the run stopped there and **Create deal** never ran.",
  table: {
    caption: `Steps of ${WORKFLOW.lastRun}, in the order they ran`,
    columns: [
      { key: "step", label: "Step" },
      { key: "duration", label: "Duration", numeric: true },
      { key: "status", label: "Status", badge: true },
    ],
    rows: [
      { step: "Form submitted", duration: "0.2s", status: "succeeded" },
      { step: "Plan is Enterprise", duration: "0.1s", status: "succeeded" },
      { step: "Enrich company", duration: "8.0s", status: "failed" },
      { step: "Create deal", duration: "Not run", status: "idle" },
    ],
  },
  points: [
    "The lead's domain resolved, but Clearbit answered after the step's `timeout` of 5s.",
    "Nothing upstream was slow: the trigger and the branch together took **0.3s**.",
  ],
  followUps: ["How do I fix the timeout?", "Which steps were skipped?"],
}

const SKIPPED_ANSWER: AnswerBody = {
  lead: "Two steps did not run on the last live run, for two different reasons.",
  figures: [
    { value: "2", label: "Ran" },
    { value: "1", label: "Failed" },
    { value: "2", label: "Did not run" },
  ],
  points: [
    "**Notify sales** was skipped on purpose: the lead is on Enterprise, so the branch took its **True** path.",
    "**Create deal** sits after **Enrich company**, which failed, so it never started.",
  ],
  note: "Run once walks the True path in test mode, so it is a quick way to see the route a lead takes.",
  followUps: ["Why did Enrich company fail?"],
}

const FIX_ANSWER: AnswerBody = {
  lead: "Give the lookup more time and let it retry once, so a slow answer from Clearbit no longer stops the run.",
  steps: [
    "Select **Enrich company** on the canvas and open it with Edit step.",
    "Raise its timeout to 10s and allow one retry, as below.",
    "Use **Run once** to send a test lead through the workflow.",
    "Publish once the test run reaches **Create deal**.",
  ],
  code: {
    language: "json",
    filename: "enrich-company.json",
    code: '{\n  "step": "enrich",\n  "service": "clearbit.lookup",\n  "timeout": "10s",\n  "retries": 1\n}',
  },
  callout: {
    tone: "warning",
    title: "Mind the Rate Limit",
    detail:
      "Each retry is another Clearbit call. At 600 leads a day one retry stays well inside the plan, but more than two can hit `429`.",
  },
  followUps: ["Draft a run summary for the team"],
}

const NOTIFY_ANSWER: AnswerBody = {
  lead: "Add a message step after **Create deal**, so sales hears about a deal the moment it is made.",
  steps: [
    "Select **Create deal** and choose **Add next step** in its panel.",
    "Pick **Send Email** from Messages; it lands wired after the deal.",
    "Name it, then point it at the sales inbox in its description.",
  ],
  callout: {
    tone: "success",
    title: "No Rewiring Needed",
    detail:
      "Create deal has nothing after it yet, so the new step is the end of the True path and nothing else moves.",
  },
  note: "I can explain and suggest, but every change to the canvas is yours to make.",
}

const SUMMARY_ANSWER: AnswerBody = {
  lead: "Here is a summary you can paste into the team channel.",
  draft: {
    title: "Run Summary",
    text: `${WORKFLOW.name}, ${WORKFLOW.lastRun}: the form submission arrived and was routed as Enterprise, then Enrich company timed out after 8.0s on the Clearbit lookup, so no deal was created. Notify sales was skipped by design. Fix in progress: a 10s timeout with one retry, to be tested with Run once before publishing.`,
  },
  note: "Nothing is sent from here. Edit it, then post it yourself.",
}

const EXPLAIN_ANSWER: AnswerBody = {
  lead: `${WORKFLOW.name} takes a demo request and sends it one of two ways.`,
  steps: [
    "**Form submitted** starts the run on the `demo.request` webhook.",
    "**Plan is Enterprise** checks `company.size > 200`.",
    "On **True** the lead is enriched with Clearbit, then a HubSpot deal is created.",
    "On **False** sales is notified in Slack instead.",
  ],
  followUps: ["Why did Enrich company fail?", "Which steps were skipped?"],
}

/** Sent with nothing attached: say so instead of answering from nowhere. */
const NO_SOURCES_ANSWER: AnswerBody = {
  lead: `Nothing is attached, so I can only search the workspace. Add ${PAGE_NAME} with the plus button to ask about its steps.`,
}

const FALLBACK_ANSWERS: AnswerBody[] = [
  {
    lead: `I could not match that to ${PAGE_NAME} or the attached sources. Try naming a step, a run or a path.`,
  },
  {
    lead: "That is outside what I can see here. Ask about a step, why a run failed or what to add next.",
  },
]

// customize: keyword routing stands in for your model call. The first entry
// with a matching word wins, so keep the narrow ones on top.
const REPLY_LIBRARY: { match: string[]; body: AnswerBody }[] = [
  { match: ["summary", "draft", "team", "post"], body: SUMMARY_ANSWER },
  { match: ["notify", "alert", "add", "slack"], body: NOTIFY_ANSWER },
  { match: ["fix", "timeout", "retry", "resolve"], body: FIX_ANSWER },
  { match: ["skip", "did not run", "missed"], body: SKIPPED_ANSWER },
  { match: ["fail", "error", "enrich", "clearbit"], body: FAILURE_ANSWER },
  {
    match: ["explain", "what does", "how does", "overview"],
    body: EXPLAIN_ANSWER,
  },
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
        text: "How many leads took the False path this week?",
        sources: ["page"],
      },
      {
        id: "t_4be7d2_2",
        kind: "answer",
        lead: "142 of 389 leads took **False** this week, about 37%, and each one reached Notify sales.",
        points: [
          "The share is steady: 35% to 39% on every day of the week.",
          "None of them failed, since the False path has a single step.",
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
        text: "Why did the webhook fire twice?",
        sources: ["run"],
      },
      {
        id: "t_7f21c4_2",
        kind: "answer",
        lead: "The form retried after a slow response, so `demo.request` arrived twice within 3 seconds.",
        note: "The second run stopped at the branch: the lead was already routed, so no duplicate deal was made.",
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
        text: "What counts as Enterprise here?",
        sources: ["page"],
      },
      {
        id: "t_31a9e0_2",
        kind: "answer",
        lead: "A company with more than 200 people, read from `company.size` on the form.",
        points: [
          "Leads without a size go down the False path.",
          "Change the threshold in the branch's description to move the line.",
        ],
      },
    ],
  },
  {
    id: "th_c58b12",
    at: "Sep 18",
    recency: "earlier",
    turns: [
      {
        id: "t_c58b12_1",
        kind: "asked",
        text: "Can a step have two owners?",
        sources: ["library"],
      },
      {
        id: "t_c58b12_2",
        kind: "answer",
        lead: "No. A step has one owner, the person paged when it fails on a live run.",
        steps: [
          "Open the step and choose Edit step.",
          "Pick the owner from the list.",
          "Save, and the card shows their portrait.",
        ],
      },
    ],
  },
]
