"use client"

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import {
  useNodesInitialized,
  useReactFlow,
  useStore,
  useStoreApi,
  type XYPosition,
} from "@xyflow/react"
import {
  Controller,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form"
import { cn } from "cn"

import { InspectorDock } from "@/components/shared/inspector-dock"
import { useHeldWhileClosing } from "@/hooks/use-held-while-closing"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AGENT_APPS,
  APP_ICON,
  APP_LABEL,
  createAgentNode,
  ROOT_ID,
  STATUS_BADGE,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TONE,
  type AgentApp,
  type AgentEdgeType,
  type AgentGraph,
  type AgentNodeData,
  type AgentNodeType,
  type AgentStatus,
} from "./data"
import {
  childPosition,
  insertOnEdge,
  leafIdsOf,
  nameFork,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./flow-layout"
import { nodeDefaultValues, nodeSchema, type NodeValues } from "./node-schema"
import { clearResults, pathTaken } from "./test-run"
import {
  InfoIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

// A select's list renders in a portal, outside the panel. React Flow's `nokey`
// keeps a key pressed in the open list (Backspace deletes the selection) from
// reaching the canvas behind it.
const LIST_KEYS = "nokey"

/**
 * What the panel shows. A step being created is already in the tree, so its
 * place reads on the canvas; `before` is the tree without it, which Cancel
 * puts back, and `edgesAfter` the links it was placed with: while they are
 * still the live ones, nothing else has changed the tree since.
 */
type InspectTarget =
  | { nodeId: string; mode: "view" | "edit" }
  | {
      nodeId: string
      mode: "create"
      before: AgentGraph
      edgesAfter: AgentEdgeType[]
    }
  | null

export type AgentActionsApi = {
  inspect: (nodeId: string, mode: "view" | "edit", seed?: NodeValues) => void
  addStep: () => void
  /**
   * The insert paths. `fromLibrary` adds a step of that app the way the step
   * library does: selected, with an Undo toast, and the form left shut.
   */
  insertOn: (edgeId: string, fromLibrary?: AgentApp) => void
  /** `at` places the new step there, for a hand arranged tree. */
  appendAfter: (nodeId: string, fromLibrary?: AgentApp, at?: XYPosition) => void
  branch: (nodeId: string, fromLibrary?: AgentApp, at?: XYPosition) => void
  /** A library step added with no aim, where the header's Add step would go. */
  addFromLibrary: (app: AgentApp) => void
  /** A library step dropped on empty canvas: loose, where it was let go. */
  addLoose: (app: AgentApp, position: XYPosition) => void
  remove: (nodeId: string) => void
  /** Cuts a connection; the step below is left loose, with its subtree. */
  removeEdge: (edgeId: string) => void
  /** Closes the panel; a step still being created leaves the tree. */
  close: () => void
  /** Leaves the form: a new step is discarded, an edit goes back to view. */
  cancel: () => void
  /** Commits the form's values, already checked against nodeSchema. */
  save: (values: NodeValues) => void
  runTest: () => void
  /** Opens a step's panel on Logs, every step's lines shown. */
  showLogs: (nodeId: string) => void
  tab: PanelTab
  setTab: (tab: PanelTab) => void
  logScope: LogScope
  setLogScope: (scope: LogScope) => void
  nodes: AgentNodeType[]
  edges: AgentEdgeType[]
  /** The step form. The provider owns it, so opening a step re-seeds it. */
  form: UseFormReturn<NodeValues>
  target: InspectTarget
  data: AgentNodeData | undefined
  leafIds: Set<string>
  branchLabel: string | undefined
  childCount: number
  hoveredEdge: string | null
}

const AgentActionsContext = createContext<AgentActionsApi | null>(null)

/** Nodes and edges reach their own actions here; the shell owns the state. */
export function useAgentActions() {
  const api = useContext(AgentActionsContext)

  if (!api) {
    throw new Error("useAgentActions must be used inside AgentActionsProvider")
  }

  return api
}

// Inserted ids are counted, never random, so a run reproduces exactly.
let nodeCount = 0

/**
 * Follows the path the test run takes at each fork, down to that path's last
 * step.
 */
function endOfRun(edges: AgentEdgeType[]) {
  const pathFrom = (id: string) =>
    pathTaken(edges.filter((edge) => edge.source === id))
  let id = ROOT_ID
  let next = pathFrom(id)

  while (next) {
    id = next.target
    next = pathFrom(id)
  }

  return id
}

interface AgentActionsProviderProps {
  nodes: AgentNodeType[]
  edges: AgentEdgeType[]
  commit: (nodes: AgentNodeType[], edges: AgentEdgeType[]) => void
  /** Shows the toast whose Undo puts `before` back, then runs `onUndone`. */
  offerUndo: (
    title: string,
    description: string,
    before: AgentGraph,
    onUndone?: () => void
  ) => void
  hoveredEdge: string | null
  /** Hands the layout over from dagre, as a card moved by hand does. */
  onArrangeByHand: () => void
  /** Runs the agent against the recorded input, as the header's Run test. */
  onRunTest: () => void
  /** Told the id of every step an add puts in the tree, so the view can show it. */
  onPlaced: (nodeId: string) => void
  /** Holds the latest actions for the editor, which renders this provider. */
  apiRef?: React.RefObject<AgentActionsApi | null>
  children: React.ReactNode
}

export function AgentActionsProvider({
  nodes,
  edges,
  commit,
  offerUndo,
  hoveredEdge,
  onArrangeByHand,
  onRunTest,
  onPlaced,
  apiRef,
  children,
}: AgentActionsProviderProps) {
  const { deleteElements } = useReactFlow()
  const store = useStoreApi()
  const [target, setTarget] = useState<InspectTarget>(null)
  // Held here, not in the panel, so the run's toast can open it on Logs. Every
  // other way in starts on Build, where the step is described and its form is.
  const [tab, setTab] = useState<PanelTab>("build")
  const [logScope, setLogScope] = useState<LogScope>("step")

  // A node can leave by a route the panel never hears about, so the panel
  // checks the graph rather than trusting its own close handler. Adjusting
  // state while rendering (not in an effect) clears it before anything
  // paints, and it stays cleared: an undo that restores the node does not
  // reopen the panel.
  if (target && !nodes.some((node) => node.id === target.nodeId)) {
    setTarget(null)
  }

  const leafIds = leafIdsOf(nodes, edges)
  const incoming = target
    ? edges.find((edge) => edge.target === target.nodeId)
    : undefined
  const branchLabel = incoming?.data?.branchLabel
  // A run takes a path by its caption, so the caption is checked against the
  // other paths out of the same parent: required on a fork, and a sibling's
  // name in any case is refused.
  const siblingPaths =
    incoming && branchLabel !== undefined
      ? edges
          .filter(
            (edge) => edge.source === incoming.source && edge.id !== incoming.id
          )
          .map((edge) => edge.data?.branchLabel)
      : []
  const form = useForm<NodeValues>({
    resolver: zodResolver(nodeSchema(siblingPaths)),
    defaultValues: nodeDefaultValues,
  })
  const childCount = target
    ? edges.filter((edge) => edge.source === target.nodeId).length
    : 0

  // A node created this tick is not in state yet, so its values arrive as a
  // seed rather than a lookup that would return nothing. This and openNew are
  // the ways into the form, so it opens on the step's own values, with no
  // message left from the last one.
  function inspect(nodeId: string, mode: "view" | "edit", seed?: NodeValues) {
    const found = nodes.find((node) => node.id === nodeId)?.data
    const label = edges.find((edge) => edge.target === nodeId)?.data
      ?.branchLabel

    form.reset(
      seed ?? {
        title: found?.title ?? "",
        detail: found?.detail ?? "",
        app: found?.app ?? "custom",
        branchLabel: label ?? "",
      }
    )
    setTarget({ nodeId, mode })
    setTab("build")
  }

  function showLogs(nodeId: string) {
    inspect(nodeId, "view")
    setTab("logs")
    setLogScope("all")
  }

  // group/node carries the focus ring, the same as every seeded step.
  function nextNode(position = { x: 0, y: 0 }, app?: AgentApp): AgentNodeType {
    nodeCount += 1
    return {
      ...createAgentNode(`step_${nodeCount}`, app),
      className: "group/node",
      position,
      initialWidth: NODE_WIDTH,
      initialHeight: NODE_HEIGHT,
    }
  }

  // Every insert path that is not the library opens the new step's form in
  // create mode: Add step confirms it, Cancel takes it back out of the tree.
  function openNew(
    node: AgentNodeType,
    label: string | undefined,
    before: AgentGraph,
    edgesAfter: AgentEdgeType[]
  ) {
    form.reset({
      title: node.data.title,
      detail: node.data.detail,
      app: node.data.app,
      branchLabel: label ?? "",
    })
    setTarget({ nodeId: node.id, mode: "create", before, edgesAfter })
    setTab("build")
  }

  // Every insert path ends here. Every change clears the last run so no
  // trace outlives its graph. A step from the library lands with its form
  // shut, as the selection, and the toast offers the builder's one undo; any
  // other opens straight into its form.
  function place(
    nextNodes: AgentNodeType[],
    nextEdges: AgentEdgeType[],
    node: AgentNodeType,
    label: string | undefined,
    fromLibrary: boolean,
    description?: string
  ) {
    const before = { nodes, edges }

    onPlaced(node.id)

    if (!fromLibrary) {
      commit(clearResults(nextNodes), nextEdges)
      openNew(node, label, before, nextEdges)
      return
    }

    commit(
      clearResults(
        nextNodes.map((it) =>
          it.id === node.id
            ? { ...it, selected: true }
            : it.selected
              ? { ...it, selected: false }
              : it
        )
      ),
      nextEdges.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge
      )
    )
    // A box selection leaves the engine drawing one rectangle around whatever
    // is selected; left on, it would close over the new step.
    store.setState({ nodesSelectionActive: false })
    offerUndo(
      "Step added",
      description ??
        (label ? `${node.data.title} on ${label}.` : node.data.title),
      before
    )
  }

  // The new step heads the path its edge named, so it opens on that caption.
  function insertOn(edgeId: string, fromLibrary?: AgentApp) {
    const node = nextNode(undefined, fromLibrary)
    const next = insertOnEdge(nodes, edges, edgeId, node)

    place(
      next.nodes,
      next.edges,
      node,
      next.edges.find((edge) => edge.target === node.id)?.data?.branchLabel,
      fromLibrary !== undefined
    )
  }

  // A fork's paths are all named, so the first branch also names the path the
  // node already had, and a second New path under one parent is numbered.
  function branch(nodeId: string, fromLibrary?: AgentApp, at?: XYPosition) {
    const node = nextNode(
      at ?? childPosition(nodes, edges, nodeId),
      fromLibrary
    )
    const id = `${nodeId}->${node.id}`
    const nextEdges = nameFork(
      [
        ...edges,
        {
          id,
          source: nodeId,
          target: node.id,
          type: "tree",
          data: { branchLabel: "New path" },
        },
      ],
      nodeId
    )

    place(
      [...nodes, node],
      nextEdges,
      node,
      nextEdges.find((edge) => edge.id === id)?.data?.branchLabel,
      fromLibrary !== undefined
    )
  }

  // A step that already has a child forks, so the new path is named the way
  // Add branch names one; a leaf simply extends its line.
  function appendAfter(
    nodeId: string,
    fromLibrary?: AgentApp,
    at?: XYPosition
  ) {
    if (edges.some((edge) => edge.source === nodeId)) {
      branch(nodeId, fromLibrary, at)
      return
    }

    const node = nextNode(
      at ?? childPosition(nodes, edges, nodeId),
      fromLibrary
    )

    place(
      [...nodes, node],
      [
        ...edges,
        {
          id: `${nodeId}->${node.id}`,
          source: nodeId,
          target: node.id,
          type: "tree",
          data: {},
        },
      ],
      node,
      undefined,
      fromLibrary !== undefined
    )
  }

  // Dropped on empty canvas a step lands where it was let go, with no parent,
  // as a card put down by hand: the tree hands its layout over, the way it
  // does when a card is dragged, and the step waits to be wired from above.
  function addLoose(app: AgentApp, position: XYPosition) {
    const node = nextNode(position, app)

    onArrangeByHand()
    place(
      [...nodes, node],
      edges,
      node,
      undefined,
      true,
      `${node.data.title}, not connected yet.`
    )
  }

  // The header adds where the eye is: onto the selected step, and with nothing
  // selected onto the step the run currently ends on.
  function addStep() {
    const selected = nodes.find((node) => node.selected)

    appendAfter(selected?.id ?? endOfRun(edges))
  }

  // The same place as the header's Add step, for a library step added with a
  // click or a key.
  function addFromLibrary(app: AgentApp) {
    const selected = nodes.find((node) => node.selected)

    appendAfter(selected?.id ?? endOfRun(edges), app)
  }

  // An Undo rewrites the step under an open form, whose draft would write the
  // undone values straight back on the next Save. The form steps back to the
  // view, and the next Edit seeds its draft from the restored step.
  function leaveEdit(nodeId: string) {
    setTarget((current) =>
      current?.nodeId === nodeId && current.mode === "edit"
        ? { nodeId, mode: "view" }
        : current
    )
  }

  // The one removal path, so the confirmation the canvas installs always runs.
  function remove(nodeId: string) {
    void deleteElements({ nodes: [{ id: nodeId }] })
  }

  // Through the engine too, so the run is cleared as for any delete.
  function removeEdge(edgeId: string) {
    void deleteElements({ edges: [{ id: edgeId }] })
  }

  // A step being created that nothing else has touched since goes back out
  // the way it came: the tree before it is restored. Once the tree has moved
  // on, it leaves through the one removal path instead.
  function discardNew() {
    if (target?.mode !== "create") {
      return
    }

    if (edges === target.edgesAfter) {
      commit(target.before.nodes, target.before.edges)
    } else {
      remove(target.nodeId)
    }
  }

  function close() {
    discardNew()
    setTarget(null)
  }

  function cancel() {
    if (target?.mode === "create") {
      close()
    } else if (target) {
      setTarget({ nodeId: target.nodeId, mode: "view" })
    }
  }

  // An edit is a change to the tree and clears the last run, since a title picks
  // the model result and a caption picks the path; an unchanged Save keeps it.
  // Confirming a new step always lands, and its Undo takes the step back out.
  function save(values: NodeValues) {
    if (!target) {
      return
    }

    const step = nodes.find((node) => node.id === target.nodeId)?.data
    const creating = target.mode === "create"
    const before =
      creating && edges === target.edgesAfter ? target.before : { nodes, edges }
    // The schema trims the caption, as a run reads it.
    const caption = values.branchLabel
    const changed =
      step?.title !== values.title ||
      step.detail !== values.detail ||
      step.app !== values.app ||
      (branchLabel !== undefined && branchLabel !== caption)

    if (creating && !changed) {
      offerUndo("Step added", values.title, before)
    }

    if (changed) {
      commit(
        clearResults(
          nodes.map((node) =>
            node.id === target.nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    title: values.title,
                    detail: values.detail,
                    app: values.app,
                  },
                }
              : node
          )
        ),
        edges.map((edge) =>
          edge.target === target.nodeId && edge.data?.branchLabel !== undefined
            ? { ...edge, data: { ...edge.data, branchLabel: caption } }
            : edge
        )
      )
      offerUndo(
        creating ? "Step added" : "Step updated",
        values.title,
        before,
        () => leaveEdit(target.nodeId)
      )
    }

    setTarget({ nodeId: target.nodeId, mode: "view" })
  }

  const data = target
    ? nodes.find((node) => node.id === target.nodeId)?.data
    : undefined

  const api: AgentActionsApi = {
    inspect,
    addStep,
    insertOn,
    appendAfter,
    branch,
    addFromLibrary,
    addLoose,
    remove,
    removeEdge,
    close,
    cancel,
    save,
    runTest: onRunTest,
    showLogs,
    tab,
    setTab,
    logScope,
    setLogScope,
    nodes,
    edges,
    form,
    target,
    data,
    leafIds,
    branchLabel,
    childCount,
    hoveredEdge,
  }

  useEffect(() => {
    if (apiRef) {
      apiRef.current = api
    }
  })

  return (
    <AgentActionsContext.Provider value={api}>
      {children}
    </AgentActionsContext.Provider>
  )
}

/** The mark beside its name, the row the trigger and the list both take. */
function AppLine({ app }: { app: AgentApp }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <IconTile size="xs" variant="outline">
        {APP_ICON[app]}
      </IconTile>
      {APP_LABEL[app]}
    </span>
  )
}

/**
 * Guidance sits behind an icon, so each field stays a label and a control.
 * The tooltip is drawn for sighted users only (the kit gives it no role and
 * ties it to nothing), so the same text also describes the button.
 */
function FieldHint({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const hintId = useId()

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="-my-1 text-muted-foreground hover:text-foreground"
              aria-label={label}
              aria-describedby={hintId}
            />
          }
        >
          <InfoIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56">
          {children}
        </TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {children}
      </span>
    </>
  )
}

/** Label left, value right: a narrow panel reads better than stacked rows. */
function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words tabular-nums">
        {value}
      </dd>
    </div>
  )
}

type PanelTab = "build" | "status" | "logs"

type LogScope = "step" | "all"

/** One line of the last run, in the order the run reached the steps. */
type LogEntry = { id: string; data: AgentNodeData; label?: string }

/** Every step the last run touched, walked from the trigger down. */
function runLog(nodes: AgentNodeType[], edges: AgentEdgeType[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const entries: LogEntry[] = []
  const seen = new Set<string>()
  const walk = (id: string, label?: string) => {
    const node = byId.get(id)

    if (!node || seen.has(id)) {
      return
    }

    seen.add(id)

    if (node.data.status !== "idle") {
      entries.push({ id, data: node.data, label })
    }

    for (const edge of edges.filter((it) => it.source === id)) {
      walk(edge.target, edge.data?.branchLabel)
    }
  }

  walk(ROOT_ID)

  return entries
}

const RUN_HEADLINE: Record<AgentStatus, string> = {
  passed: "Passed on the last test run",
  failed: "Failed on the last test run",
  skipped: "Skipped on the last test run",
  idle: "Waiting for its first run",
}

/** A number and what it counts, the reference's Entered / Completed / Drop-off. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Said where a tab has nothing to show yet, with the one way to fill it. */
function RunPrompt({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const { runTest } = useAgentActions()

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-balance text-muted-foreground">
          {description}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={runTest}>
        <PlayIcon aria-hidden="true" />
        Run test
      </Button>
    </div>
  )
}

function StatusTab() {
  const { data } = useAgentActions()
  const status = data?.status ?? "idle"
  const entered = status === "passed" || status === "failed" ? 1 : 0
  const completed = status === "passed" ? 1 : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <span
          className={cn("mt-0.5 shrink-0 [&_svg]:size-4", STATUS_TONE[status])}
        >
          {STATUS_ICON[status]}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{RUN_HEADLINE[status]}</p>
          <p className="text-sm text-muted-foreground">
            {status === "idle"
              ? "Run a test to see what this step returns."
              : data?.facts.join(", ")}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <StatTile label="Entered" value={String(entered)} />
        <StatTile label="Completed" value={String(completed)} />
        <StatTile
          label="Drop-off"
          value={`${entered ? Math.round(((entered - completed) / entered) * 100) : 0}%`}
        />
      </dl>
      {status === "idle" ? null : (
        <p className="text-xs text-muted-foreground">
          Counted over the last test run, which sends the recorded input through
          the agent once.
        </p>
      )}
    </div>
  )
}

function LogsTab() {
  const {
    edges,
    logScope: scope,
    nodes,
    setLogScope: setScope,
    target,
  } = useAgentActions()
  const all = runLog(nodes, edges)
  const entries =
    scope === "all" ? all : all.filter((entry) => entry.id === target?.nodeId)

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[scope]}
        onValueChange={(value) =>
          value[0] && setScope(value[0] as "step" | "all")
        }
        aria-label="Which logs"
      >
        <ToggleGroupItem value="step">This step</ToggleGroupItem>
        <ToggleGroupItem value="all">All steps</ToggleGroupItem>
      </ToggleGroup>
      {entries.length === 0 ? (
        all.length === 0 ? (
          <RunPrompt
            title="No logs yet"
            description="Run a test to send the recorded input through the agent and log every step it reaches."
          />
        ) : (
          <RunPrompt
            title="This step did not run"
            description="The last test run never reached it. Connect it under a step, then run the test again."
          />
        )
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex items-start gap-2.5 p-3">
              <span
                className={cn(
                  "mt-0.5 shrink-0 [&_svg]:size-4",
                  STATUS_TONE[entry.data.status]
                )}
              >
                {STATUS_ICON[entry.data.status]}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {entry.data.title}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                    #{all.indexOf(entry) + 1}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[entry.data.status]}
                  {entry.label ? ` on ${entry.label}` : ""}:{" "}
                  {entry.data.facts.join(", ")}
                </p>
              </div>
              <span className="sr-only">
                Entry {index + 1} of {entries.length}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// The Add and Save buttons sit in the footer, outside the form, and submit it
// by id.
const NODE_FORM = "node-form"

function StepForm({ onSubmit }: { onSubmit: (values: NodeValues) => void }) {
  const { branchLabel, form } = useAgentActions()
  const onBranch = branchLabel !== undefined

  return (
    <TooltipProvider delay={300}>
      {/* Bound at submit, not in render: onSubmit marks the footer's swap
          through a ref. */}
      <form
        id={NODE_FORM}
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        {/* reui.io sets a field label at leading-none, the Label rule landing
            after FieldLabel's leading-snug; the kit merges them the other
            way, so each label restates it. */}
        <FieldGroup>
          <Controller
            name="app"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor="node-app" className="leading-none">
                    Type
                  </FieldLabel>
                  <FieldHint label="About the type">
                    The service this step calls. Its mark is what the node
                    shows.
                  </FieldHint>
                </div>
                <Select
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) =>
                    value && field.onChange(value as AgentApp)
                  }
                >
                  <SelectTrigger
                    id="node-app"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue>
                      <AppLine app={field.value} />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    className={LIST_KEYS}
                  >
                    <SelectGroup>
                      {AGENT_APPS.map((app) => (
                        <SelectItem key={app} value={app}>
                          <AppLine app={app} />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor="node-title" className="leading-none">
                    Name
                  </FieldLabel>
                  <FieldHint label="About the name">
                    What the canvas calls this step, usually the service or the
                    in house function.
                  </FieldHint>
                </div>
                <Input
                  {...field}
                  id="node-title"
                  placeholder="Enter node title"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "node-title-error" : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="node-title-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
          <Controller
            name="detail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor="node-detail" className="leading-none">
                    Description
                  </FieldLabel>
                  <FieldHint label="About the description">
                    What the step does, in one short clause. The card shows it
                    under the name.
                  </FieldHint>
                </div>
                <Textarea
                  {...field}
                  id="node-detail"
                  rows={3}
                  placeholder="Describe what this step does"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "node-detail-error" : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="node-detail-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
          {onBranch ? (
            <Controller
              name="branchLabel"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-1.5">
                    <FieldLabel htmlFor="node-path" className="leading-none">
                      Path
                    </FieldLabel>
                    <FieldHint label="About the path">
                      The caption on the connector above, naming this outcome.
                    </FieldHint>
                  </div>
                  <Input
                    {...field}
                    id="node-path"
                    placeholder="e.g. Approved"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "node-path-error" : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError
                      id="node-path-error"
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
          ) : null}
        </FieldGroup>
      </form>
    </TooltipProvider>
  )
}

function StepDetails() {
  const { branchLabel, childCount, data, target } = useAgentActions()

  return (
    <section className="flex flex-col gap-3" aria-labelledby="node-facts">
      <h3 id="node-facts" className="text-sm font-semibold">
        Details
      </h3>
      <dl className="flex flex-col gap-3">
        <FactRow
          label="Type"
          value={data ? <AppLine app={data.app} /> : null}
        />
        <FactRow label="Name" value={data?.title} />
        <FactRow label="Description" value={data?.detail || "None"} />
        {branchLabel !== undefined ? (
          <FactRow label="Path" value={branchLabel || "Unnamed"} />
        ) : null}
        <FactRow label="Next steps" value={childCount} />
        <FactRow
          label="Last run"
          value={
            data ? (
              <Badge variant={STATUS_BADGE[data.status]}>
                {STATUS_ICON[data.status]}
                {STATUS_LABEL[data.status]}
              </Badge>
            ) : null
          }
        />
        <FactRow
          label="Step ID"
          value={<code className="font-mono text-xs">{target?.nodeId}</code>}
        />
      </dl>
    </section>
  )
}

function NodePanel() {
  const {
    appendAfter,
    cancel,
    close,
    data,
    form,
    inspect,
    remove,
    save,
    setTab,
    tab,
    target,
  } = useAgentActions()
  const mode = target?.mode ?? "view"
  const creating = mode === "create"
  const editing = mode === "edit" || creating
  const isRoot = target?.nodeId === ROOT_ID
  // The header follows the form's type as it is picked.
  const [app, title] = useWatch({
    control: form.control,
    name: ["app", "title"],
  })
  const editRef = useRef<HTMLButtonElement>(null)
  const swapping = useRef(false)

  // The footer swaps its buttons with the mode, which unmounts the one just
  // pressed. Focus follows that swap, into the form or back to Edit step,
  // instead of dropping to the page; a mode set from the canvas moves nothing.
  useEffect(() => {
    if (!swapping.current) {
      return
    }

    swapping.current = false

    if (editing) {
      form.setFocus("title")
    } else {
      editRef.current?.focus()
    }
  }, [editing, form])

  // Only a valid form gets here: an invalid submit shows each field's message
  // and moves focus to the first, and the footer keeps its buttons.
  function onSubmit(values: NodeValues) {
    swapping.current = true
    save(values)
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3">
        <IconTile size="sm">
          {APP_ICON[(editing ? app : data?.app) ?? "custom"]}
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-sm font-semibold">
            {creating ? "New step" : (data?.title ?? title)}
          </h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">
              {APP_LABEL[(editing ? app : data?.app) ?? "custom"]}
            </Badge>
            <span
              aria-hidden="true"
              className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <span className="truncate">
              {creating ? "Not added yet" : editing ? "Editing" : "Viewing"}
            </span>
          </div>
        </div>
        {/* The header's one button size; the offsets keep the X where the
            block's 28px button drew it. */}
        <Button
          variant="ghost"
          size="icon"
          className="-me-2 -mt-1.5"
          aria-label={creating ? "Discard new step" : "Close step panel"}
          onClick={close}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PanelTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="shrink-0 px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="build">Build</TabsTrigger>
            {/* A step that is not added yet has never run. */}
            <TabsTrigger value="status" disabled={creating}>
              Status
            </TabsTrigger>
            <TabsTrigger value="logs" disabled={creating}>
              Logs
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="build"
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          {/* Every tab scrolls with its scrollbar hidden and fades at the
              edge that has more to show (scroll-fade-y, app/styles/globals.css). */}
          <ScrollArea className="scroll-fade-y min-h-0 flex-1">
            <div className="flex flex-col gap-5 p-4">
              {editing ? <StepForm onSubmit={onSubmit} /> : <StepDetails />}
            </div>
          </ScrollArea>
          <footer className="flex shrink-0 flex-col gap-3 border-t p-4">
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" form={NODE_FORM}>
                  {creating ? "Add step" : "Save step"}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("grid gap-3", isRoot ? "" : "grid-cols-2")}>
                  <Button
                    ref={editRef}
                    variant="outline"
                    onClick={() => {
                      if (target) {
                        swapping.current = true
                        inspect(target.nodeId, "edit")
                      }
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                    Edit step
                  </Button>
                  {/* The trigger opens the run, so it is the one step you cannot drop. */}
                  {isRoot ? null : (
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => target && remove(target.nodeId)}
                    >
                      <Trash2Icon aria-hidden="true" />
                      Delete
                    </Button>
                  )}
                </div>
                <Button onClick={() => target && appendAfter(target.nodeId)}>
                  <PlusIcon aria-hidden="true" />
                  Next step
                </Button>
              </>
            )}
          </footer>
        </TabsContent>
        <TabsContent
          value="status"
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <ScrollArea className="scroll-fade-y min-h-0 flex-1">
            <div className="p-4">
              <StatusTab />
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="logs"
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <ScrollArea className="scroll-fade-y min-h-0 flex-1">
            <div className="p-4">
              <LogsTab />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** The header's create action; every other add starts from a node or a connector. */
export function AddStepButton() {
  const { addStep } = useAgentActions()

  return (
    <Button variant="outline" onClick={addStep}>
      <PlusIcon aria-hidden="true" />
      {/* In the app header on a phone the label goes sr-only, as Publish's
          does, so the breadcrumb keeps room to read. */}
      <span className="sr-only sm:not-sr-only">Add step</span>
    </Button>
  )
}

/**
 * The panel in the builder's dock (or its sheet, on a narrow screen). It holds
 * the last open context value while closing, so the dock leaves showing the
 * node it showed instead of the panel's empty state.
 */
export function NodeInspectorPanel({
  onOpenChange,
}: {
  /** Told when the inspector opens or closes, after the commit that did it. */
  onOpenChange?: (open: boolean) => void
}) {
  const live = useAgentActions()
  const shown = useHeldWhileClosing(live)
  const open = live.target !== null

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  // Every step measured (or none left): the canvas has digested whatever
  // opened or closed the dock, and the dock may move.
  const measured = useNodesInitialized()
  const empty = useStore((state) => state.nodeLookup.size === 0)

  return (
    <InspectorDock
      label="Step panel"
      title="Step panel"
      description="Add, view or edit this agent step."
      open={open}
      onClose={live.close}
      ready={measured || empty}
    >
      <AgentActionsContext.Provider value={shown}>
        <NodePanel />
      </AgentActionsContext.Provider>
    </InspectorDock>
  )
}
