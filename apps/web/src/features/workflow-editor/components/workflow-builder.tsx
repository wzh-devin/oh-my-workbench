"use client"

/**
 * Lead Routing: a React Flow canvas whose steps carry their last run.
 * Swap INITIAL_NODES and INITIAL_EDGES in data.tsx for your own workflow.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  addEdge,
  Panel,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type IsValidConnection,
  type NodeTypes,
  type OnBeforeDelete,
  type OnDelete,
  type OnMoveEnd,
} from "@xyflow/react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import { FIT_VIEW_OPTIONS, FlowCanvas } from "@/components/shared/flow-canvas"
import { Button } from "@/components/ui/button"
import { CanvasToolbar, type CanvasTool } from "./canvas-toolbar"
import {
  BRANCH_PATHS,
  INITIAL_EDGES,
  INITIAL_NODES,
  TOAST_ERROR_ICON,
  TOAST_SUCCESS_ICON,
  WORKFLOW,
  type StepNodeType,
} from "./data"
import { useDeleteConfirmation } from "./delete-confirmation"
import { EdgeHoverProvider, LabeledEdge, useEdgeHover } from "./flow-edge"
import { useFlowHistory } from "./flow-history"
import { FlowKeys } from "./flow-keys"
import {
  AddStepButton,
  StepActionsProvider,
  StepInspectorPanel,
  useStepActions,
} from "./step-actions"
import { StepLibrary } from "./step-library"
import { AiChat, type AiChatHandle, type AiChatStatus } from "./ai-chat/ai-chat"
import { LAUNCHER_LABEL } from "./ai-chat/data"
import { StepNode } from "./step-node"
import { TestRunProvider, useTestRun } from "./test-run"
import { WorkflowMenu } from "./workflow-menu"
import { PlayIcon, SparklesIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

// Module scope: a new nodeTypes or edgeTypes object per render remounts
// every node and edge on the canvas.
const nodeTypes = { step: StepNode } satisfies NodeTypes
const edgeTypes = { labeled: LabeledEdge } satisfies EdgeTypes

// A step feeding itself is the one wiring the runtime can never satisfy.
const isValidConnection: IsValidConnection<Edge> = (connection) =>
  connection.source !== connection.target

// The engine reads a missing handle id and a null one as the same end, and
// refuses to add a pair twice; this is that test, asked before an edit records.
const sameWiring = (edge: Edge, connection: Connection) =>
  edge.source === connection.source &&
  edge.target === connection.target &&
  (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
  (edge.targetHandle ?? null) === (connection.targetHandle ?? null)

// Matches the canvas dot spacing, so a snapped node lands on a visible dot.
const SNAP_GRID: [number, number] = [20, 20]

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

// A drag updates node objects in place, so the canvas gets its own copies and
// these positions stay the pristine target Reset layout restores.
const HOME_POSITIONS = new Map(
  INITIAL_NODES.map((node) => [node.id, node.position])
)
// group/node lets the node paint a focus ring: the engine puts focus on its own
// wrapper and strips the outline, so the card below has to answer for it.
const INITIAL_LAYOUT: StepNodeType[] = INITIAL_NODES.map((node) => ({
  ...node,
  className: "group/node",
  position: { ...node.position },
}))

/** Sends a test through the workflow, step by step, from the trigger. */
function RunOnceButton() {
  const { running, start } = useTestRun()

  return (
    <Button disabled={running} onClick={start}>
      {running ? <Spinner /> : <PlayIcon aria-hidden="true" />}
      <span className="sr-only sm:not-sr-only">
        {running ? "Running" : "Run once"}
      </span>
    </Button>
  )
}

/**
 * Opens the assistant, which keeps the block's corner window; the label says
 * when a reply is on its way or has landed while it was shut.
 */
function AskAiButton({
  ref,
  status,
  onClick,
}: {
  ref: React.Ref<HTMLButtonElement>
  status: AiChatStatus
  onClick: () => void
}) {
  return (
    <Button
      ref={ref}
      variant="outline"
      aria-haspopup="dialog"
      aria-expanded={status.open}
      onClick={onClick}
    >
      {status.replying ? <Spinner /> : <SparklesIcon aria-hidden="true" />}
      <span className="sr-only sm:not-sr-only">
        {status.replying
          ? "Replying"
          : status.unread
            ? "New Reply"
            : LAUNCHER_LABEL}
      </span>
    </Button>
  )
}

/** The closing toast's View logs, a consumer so it reaches the panel. */
function EditorTestRun({
  nodes,
  edges,
  children,
}: {
  nodes: StepNodeType[]
  edges: Edge[]
  children: React.ReactNode
}) {
  const { showLogs } = useStepActions()

  return (
    <TestRunProvider nodes={nodes} edges={edges} onViewLogs={showLogs}>
      {children}
    </TestRunProvider>
  )
}

export function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  )
}

function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<StepNodeType>(INITIAL_LAYOUT)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [locked, setLocked] = useState(false)
  // Opens in Select, as the reference does: a step drags, a handle wires, and
  // a drag on the empty canvas still moves the view. Pan (H) holds every step.
  const [tool, setTool] = useState<CanvasTool>("select")
  const [resetCount, setResetCount] = useState(0)
  const { fitView, setViewport } = useReactFlow()
  const { onBeforeDelete, dialog } = useDeleteConfirmation()
  const edgeHover = useEdgeHover()
  const chat = useRef<AiChatHandle>(null)
  const askAi = useRef<HTMLButtonElement>(null)
  const [chatStatus, setChatStatus] = useState<AiChatStatus>({
    open: false,
    replying: false,
    unread: false,
  })
  // The one toast on screen that offers Undo. It names a single edit, so it
  // is retired as soon as the history moves on from that edit.
  const undoToast = useRef<string | number | null>(null)

  // Handed no id, sonner dismisses every toast, so only a held one is passed.
  const retireUndoToast = useCallback(() => {
    if (undoToast.current !== null) {
      toast.dismiss(undoToast.current)
      undoToast.current = null
    }
  }, [])

  // The toaster belongs to the shell, so the toast would outlive this editor
  // on another page, where its Undo has nothing to restore.
  useEffect(() => retireUndoToast, [retireUndoToast])

  const {
    takeSnapshot,
    stageDrag,
    commitDrag,
    undo,
    redo,
    canUndo,
    canRedo,
    shownVersion,
  } = useFlowHistory({
    setNodes,
    setEdges,
    onMove: retireUndoToast,
  })
  // Pan holds every step still, so a drag anywhere moves the view, never the graph.
  const editable = !locked && tool === "select"

  // Locking drops the selection and the Undo toast, so no node toolbar,
  // Backspace or toast edits the graph.
  const changeLocked = useCallback(
    (next: boolean) => {
      if (next) {
        setNodes((current) =>
          current.map((node) => ({ ...node, selected: false }))
        )
        setEdges((current) =>
          current.map((edge) => ({ ...edge, selected: false }))
        )
        retireUndoToast()
      }

      setLocked(next)
    },
    [retireUndoToast, setEdges, setNodes]
  )

  // Fit centres the graph on half pixels, which smears every 1px horizontal
  // rule; each move lands on whole pixels so hairlines stay as crisp as borders.
  const snapViewport = useCallback<OnMoveEnd>(
    (_, viewport) => {
      const x = Math.round(viewport.x)
      const y = Math.round(viewport.y)

      if (x !== viewport.x || y !== viewport.y) {
        void setViewport({ x, y, zoom: viewport.zoom })
      }
    },
    [setViewport]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      // A pair that is already wired adds nothing, so it is not an edit.
      if (edges.some((edge) => sameWiring(edge, connection))) {
        return
      }

      // A branch has two ways out, so a wire drawn from one takes the way
      // still free, and the canvas reads which path it is.
      const source = nodes.find((node) => node.id === connection.source)
      const used = new Set(
        edges
          .filter((edge) => edge.source === connection.source)
          .map((edge) => String(edge.label ?? "").toLowerCase())
      )
      const label =
        source?.data.kind === "condition"
          ? BRANCH_PATHS.find((path) => !used.has(path.toLowerCase()))
          : undefined

      takeSnapshot()
      setEdges((current) =>
        addEdge(
          { ...connection, type: "labeled", ...(label ? { label } : {}) },
          current
        )
      )
    },
    [edges, nodes, setEdges, takeSnapshot]
  )

  const selectAllSteps = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })))
  }, [setNodes])

  const copyAsJson = useCallback(() => {
    const graph = JSON.stringify({ nodes, edges }, null, 2)
    const summary = `${plural(nodes.length, "step")} and ${plural(edges.length, "connection")}.`

    // The toast waits for the write rather than claiming a copy that never
    // happened. A denied permission rejects it; a page served over plain http
    // has no clipboard at all, and that throws. The executor runs inside the
    // click and turns the throw into the same rejection.
    void new Promise<void>((resolve) =>
      resolve(navigator.clipboard.writeText(graph))
    )
      .then(() =>
        toast.success("Workflow copied as JSON", {
          description: summary,
          icon: TOAST_SUCCESS_ICON,
        })
      )
      .catch(() =>
        toast.error("Clipboard blocked", {
          description: "Allow clipboard access, then copy again.",
          icon: TOAST_ERROR_ICON,
        })
      )
  }, [edges, nodes])

  // An edge end can be dragged onto another step, so wiring stays editable.
  // Dropped back where it came from it is the same edge, and dropped on a pair
  // another edge already wires it would double that edge: neither is an edit.
  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (edges.some((edge) => sameWiring(edge, connection))) {
        return
      }

      takeSnapshot()
      setEdges((current) => reconnectEdge(oldEdge, connection, current))
    },
    [edges, setEdges, takeSnapshot]
  )

  // The prompt settles before the engine removes anything, so a confirmed
  // delete is recorded while the graph still holds what it removes.
  const confirmDelete = useCallback<OnBeforeDelete<StepNodeType, Edge>>(
    async (elements) => {
      // Backspace on an empty selection still asks; it must not cost the redo stack.
      if (elements.nodes.length === 0 && elements.edges.length === 0) {
        return false
      }

      const allowed = await onBeforeDelete(elements)

      if (allowed) {
        takeSnapshot()
      }

      return allowed
    },
    [onBeforeDelete, takeSnapshot]
  )

  // A toast keeps the handler it was built with, while undo is a new function
  // on every snapshot and the lock changes under it, so it reads both here.
  const latest = useRef({ undo, locked })

  useEffect(() => {
    latest.current = { undo, locked }
  }, [undo, locked])

  // Every toast that offers Undo is raised here, tied to the version its edit
  // minted. A retired toast still takes a click while it leaves the screen, so
  // the handler checks for itself that the canvas is unlocked and that its
  // edit is still the one on screen.
  const offerUndo = useCallback(
    (title: string, description: string, edit: number) => {
      undoToast.current = toast.success(title, {
        description,
        icon: TOAST_SUCCESS_ICON,
        action: {
          label: "Undo",
          onClick: () => {
            if (!latest.current.locked && shownVersion() === edit) {
              latest.current.undo()
            }
          },
        },
        duration: 8000,
      })
    },
    [shownVersion]
  )

  // Runs after the engine removed the elements, so the count it reports is what
  // actually left. Undo replays the snapshot confirmDelete just recorded, and
  // the version that delete minted is the one on screen.
  const announceDelete = useCallback<OnDelete<StepNodeType, Edge>>(
    ({ nodes: removed, edges: cut }) => {
      // A wire cut on its own, from its Delete or with Backspace, asks
      // nothing, so its toast is the way back.
      if (removed.length === 0 && cut.length > 0) {
        const title = (id: string) =>
          nodes.find((node) => node.id === id)?.data.title ?? id

        offerUndo(
          cut.length > 1 ? "Connections deleted" : "Connection deleted",
          cut.length > 1
            ? plural(cut.length, "connection")
            : `${title(cut[0].source)} to ${title(cut[0].target)}`,
          shownVersion()
        )
        return
      }

      if (removed.length === 0) {
        return
      }

      offerUndo(
        removed.length > 1 ? "Steps deleted" : "Step deleted",
        removed.length > 1
          ? `${plural(removed.length, "step")} and ${plural(cut.length, "connection")}.`
          : removed[0].data.title,
        shownVersion()
      )
    },
    [nodes, offerUndo, shownVersion]
  )

  const resetLayout = useCallback(() => {
    // Every step already home means nothing to restore, so no edit is recorded.
    const moved = nodes.some((node) => {
      const home = HOME_POSITIONS.get(node.id)

      return (
        home !== undefined &&
        (home.x !== node.position.x || home.y !== node.position.y)
      )
    })

    if (moved) {
      takeSnapshot()
    }

    setNodes((current) =>
      current.map((node) => ({
        ...node,
        position: { ...(HOME_POSITIONS.get(node.id) ?? node.position) },
      }))
    )
    setResetCount((count) => count + 1)
  }, [nodes, setNodes, takeSnapshot])

  // Arrow keys move a selected step without a drag, so the move records here;
  // a held key repeats and counts once.
  const recordKeyMove = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        editable &&
        !event.repeat &&
        event.key.startsWith("Arrow") &&
        event.target instanceof Element &&
        event.target.closest(
          ".react-flow__node.selected, .react-flow__nodesselection-rect"
        )
      ) {
        takeSnapshot()
      }
    },
    [editable, takeSnapshot]
  )

  // fitView reads the store, so it has to run after the restored positions
  // commit rather than in the same handler that sets them.
  useEffect(() => {
    if (resetCount === 0) {
      return
    }

    fitView(FIT_VIEW_OPTIONS)
  }, [resetCount, fitView])

  return (
    <StepActionsProvider
      locked={locked}
      onBeforeEdit={takeSnapshot}
      offerUndo={offerUndo}
      nodes={nodes}
      edges={edges}
      setNodes={setNodes}
      setEdges={setEdges}
    >
      <EditorTestRun nodes={nodes} edges={edges}>
        <EdgeHoverProvider value={{ ...edgeHover, editable }}>
          {/* Fills the shell's content area rather than the viewport (h-svh in the
          block), so the canvas sits under the app header, beside the section panel. */}
          <div className="flex min-h-0 w-full flex-1 flex-col bg-background">
            <h1 className="sr-only">{WORKFLOW.name}</h1>
            {/* The editor's actions sit in the app header, in place of Publish;
            the route's breadcrumb there already names the page. */}
            <HeaderActions>
              <FlowKeys />
              <AskAiButton
                ref={askAi}
                status={chatStatus}
                onClick={() => chat.current?.toggle()}
              />
              <AddStepButton />
              <RunOnceButton />
              <WorkflowMenu
                snapToGrid={snapToGrid}
                onSnapToGridChange={setSnapToGrid}
                onResetLayout={resetLayout}
                onSelectAll={selectAllSteps}
                onCopyJson={copyAsJson}
                locked={locked}
              />
            </HeaderActions>
            {/* The step library sits in the shell's secondary panel, which this
            section owns; it is rendered from here so a step dragged out of
            it can reach the canvas and the history. */}
            <InnerPanel>
              <StepLibrary />
            </InnerPanel>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <FlowCanvas
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onBeforeDelete={confirmDelete}
                onDelete={announceDelete}
                onReconnect={onReconnect}
                onNodeDragStart={stageDrag}
                onNodeDragStop={commitDrag}
                onSelectionDragStop={commitDrag}
                onKeyDownCapture={recordKeyMove}
                onEdgeMouseEnter={(_, edge) => edgeHover.enter(edge.id)}
                onEdgeMouseLeave={edgeHover.leave}
                // A wire dropped near a handle takes it, not only one dropped on it.
                connectionRadius={36}
                onMoveEnd={snapViewport}
                deleteKeyCode={locked ? null : "Backspace"}
                reconnectRadius={16}
                snapToGrid={snapToGrid}
                snapGrid={SNAP_GRID}
                isValidConnection={isValidConnection}
                nodesDraggable={editable}
                nodesConnectable={editable}
                elementsSelectable={!locked}
                edgesReconnectable={editable}
                edgesFocusable={!locked}
              >
                {/* The engine ships its own panel margin unlayered, so this has to win. */}
                <Panel position="bottom-left" className="m-6!">
                  <CanvasToolbar
                    tool={tool}
                    onToolChange={setTool}
                    locked={locked}
                    onLockedChange={changeLocked}
                    canUndo={!locked && canUndo}
                    canRedo={!locked && canRedo}
                    onUndo={undo}
                    onRedo={redo}
                  />
                </Panel>
              </FlowCanvas>
              <StepInspectorPanel />
              {dialog}
              <AiChat
                ref={chat}
                triggerRef={askAi}
                onStatusChange={setChatStatus}
              />
            </div>
          </div>
        </EdgeHoverProvider>
      </EditorTestRun>
    </StepActionsProvider>
  )
}
