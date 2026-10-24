"use client"

/**
 * The AI Agent Builder's step library (components/shared/flow-library.tsx has
 * the list and the drag). The agent is a tree, so where a step lands depends
 * on what it is dropped on:
 *
 * - on a card: it goes under that card, as the card's plus would put it (a
 *   card that already has a child forks);
 * - on a connector: it goes into that connector, as its plus would;
 * - on empty canvas: it lands loose where it was let go, waiting to be wired
 *   from a step above, and the tree hands its layout over as it does when a
 *   card is dragged (Tidy hands it back).
 *
 * The card or connector a drop would take is lit while the step is held over
 * it. Added with a click or a key a step goes where the header's Add step
 * would: under the selected step, or at the end of the run.
 *
 * Above the list a heading says what the panel is, since a bare list of
 * services does not. Under it, the panel's footer is a status card for the
 * last test run, in the shape of the shell's status card (the Settings panel
 * has one too).
 */
import { Badge, type BadgeProps } from "@/components/reui/badge"
import { useReactFlow, useStoreApi } from "@xyflow/react"
import { cn } from "cn"

import {
  canvasElementAt,
  FlowLibrary,
  type FlowLibrarySection,
} from "@/components/shared/flow-library"
import { Progress } from "@/components/ui/progress"
import { useSidebar } from "@/components/ui/sidebar"
import {
  AGENT_LIBRARY,
  APP_ICON,
  APP_LABEL,
  STATUS_ICON,
  type AgentApp,
  type AgentStatus,
} from "./data"
import { NODE_HEIGHT, NODE_WIDTH } from "./flow-layout"
import { useAgentActions } from "./node-actions"

type LibraryApp = { id: AgentApp; label: string; icon: React.ReactNode }

const SECTIONS: FlowLibrarySection<LibraryApp>[] = AGENT_LIBRARY.map(
  (section) => ({
    id: section.id,
    title: section.title,
    items: section.apps.map((app) => ({
      id: app,
      label: APP_LABEL[app],
      icon: APP_ICON[app],
    })),
  })
)

// The attribute the canvas styles a lit card or connector by (tree-node.tsx,
// tree-edge.tsx).
const DROP_TARGET = "data-drop-target"

/** The elements that draw a target: a card, or a connector and its plus. */
function targetElements(target: string) {
  const [kind, id] = splitTarget(target)
  const value = CSS.escape(id)

  if (kind === "node") {
    return document.querySelectorAll(`.react-flow__node[data-id="${value}"]`)
  }

  return document.querySelectorAll(
    `.react-flow__edge[data-id="${value}"], [data-edge-id="${value}"]`
  )
}

function splitTarget(target: string): [string, string] {
  const at = target.indexOf(":")

  return at < 0 ? [target, ""] : [target.slice(0, at), target.slice(at + 1)]
}

export function AgentLibrary() {
  const actions = useAgentActions()
  const { screenToFlowPosition } = useReactFlow()
  const store = useStoreApi()

  return (
    <>
      <LibraryHeading />
      <FlowLibrary
        sections={SECTIONS}
        brandIcons
        hint={{
          desktop:
            "Adds this step under the selected step, or at the end of the run. Drag it onto a step or a connector to put it there.",
          phone:
            "Adds this step under the selected step, or at the end of the run.",
        }}
        targetAt={(point) => {
          const element = canvasElementAt(store.getState().domNode, point)

          if (!element) {
            return null
          }

          const node = element
            .closest(".react-flow__node")
            ?.getAttribute("data-id")

          if (node) {
            return `node:${node}`
          }

          const edge = element.closest(".react-flow__edge, [data-edge-id]")
          const edgeId =
            edge?.getAttribute("data-edge-id") ?? edge?.getAttribute("data-id")

          return edgeId ? `edge:${edgeId}` : "canvas"
        }}
        onTargetChange={(target) => {
          for (const element of document.querySelectorAll(`[${DROP_TARGET}]`)) {
            element.removeAttribute(DROP_TARGET)
          }

          if (target && target !== "canvas") {
            for (const element of targetElements(target)) {
              element.setAttribute(DROP_TARGET, "")
            }
          }
        }}
        onDrop={(item, target, point) => {
          const [kind, id] = splitTarget(target)

          if (kind === "node") {
            actions.appendAfter(id, item.id)
          } else if (kind === "edge") {
            actions.insertOn(id, item.id)
          } else {
            // The card's middle under the pointer.
            const flow = screenToFlowPosition(point)

            actions.addLoose(item.id, {
              x: flow.x - NODE_WIDTH / 2,
              y: flow.y - NODE_HEIGHT / 2,
            })
          }
        }}
        onAdd={(item) => actions.addFromLibrary(item.id)}
      />
      <LastRunCard />
    </>
  )
}

/**
 * Names the panel and how it is used. The services below it are steps to add
 * to the agent, which a list of brand names alone does not say.
 */
function LibraryHeading() {
  const { isMobile } = useSidebar()

  return (
    // The Workflow Editor's heading, word for word, so the two panels match.
    <div className="shrink-0 space-y-0.5 border-b border-border p-3">
      <h2 className="text-sm font-medium text-foreground">Step Library</h2>
      <p className="text-xs leading-snug text-muted-foreground">
        {isMobile
          ? "Tap a step to add it to the agent."
          : "Drag a step onto the canvas, or click it to add one."}
      </p>
    </div>
  )
}

type RunTone = "passed" | "failed" | "idle"

// The tone tints the icon and the meter's fill alike.
const RUN_TONE: Record<RunTone, string> = {
  passed: "text-success **:data-[slot=progress-indicator]:bg-success",
  failed: "text-destructive **:data-[slot=progress-indicator]:bg-destructive",
  idle: "text-muted-foreground",
}

const RUN_BADGE: Record<
  RunTone,
  { variant: BadgeProps["variant"]; label: string }
> = {
  passed: { variant: "success-light", label: "Passed" },
  failed: { variant: "destructive-light", label: "Failed" },
  idle: { variant: "outline", label: "Not run" },
}

/**
 * The last test run, read off the steps on the canvas, so it follows every
 * run and every edit that clears one. The text takes only the lines it
 * needs, so the meter sits right under it.
 */
function LastRunCard() {
  const { nodes } = useAgentActions()
  const count = (status: AgentStatus) =>
    nodes.filter((node) => node.data.status === status).length
  const passed = count("passed")
  const failed = count("failed")
  const firstFailed = nodes.find((node) => node.data.status === "failed")
  const tone: RunTone = failed > 0 ? "failed" : passed > 0 ? "passed" : "idle"
  const share = nodes.length ? Math.round((passed / nodes.length) * 100) : 0
  const text =
    tone === "idle"
      ? "Run a test to see each step's result."
      : tone === "failed"
        ? `Stopped at ${firstFailed?.data.title}.`
        : `${passed} of ${nodes.length} steps passed.`

  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className={cn("space-y-1.5", RUN_TONE[tone])}>
        <div className="flex items-center gap-1">
          <span className="size-4 shrink-0 [&_svg]:size-4">
            {STATUS_ICON[tone]}
          </span>
          <p className="truncate text-xs font-medium text-foreground">
            Last Test Run
          </p>
          <Badge variant={RUN_BADGE[tone].variant} className="ml-auto shrink-0">
            {RUN_BADGE[tone].label}
          </Badge>
        </div>
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {text}
        </p>
        {tone === "idle" ? (
          <div aria-hidden="true" className="h-2" />
        ) : (
          <Progress
            value={share}
            aria-label={`Steps passed: ${share}%`}
            className="py-0.5"
          />
        )}
      </div>
    </div>
  )
}
