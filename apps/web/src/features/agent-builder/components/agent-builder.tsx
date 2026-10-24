"use client"

/**
 * Collections Agent: a top to bottom tree dagre arranges until a step is moved
 * by hand; Tidy tree hands the layout back. Swap SEED in data.tsx for your own agent.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type EdgeTypes,
  type HandleType,
  type IsValidConnection,
  type NodeTypes,
  type OnBeforeDelete,
  type OnConnectEnd,
  type OnConnectStart,
  type OnDelete,
  type OnMoveEnd,
} from "@xyflow/react"
import { toast } from "sonner"

import { FlowCanvas } from "@/components/shared/flow-canvas"
import {
  isDockOpening,
  settledCanvasWidth,
} from "@/components/shared/inspector-dock"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import { Button } from "@/components/ui/button"
import { AgentChat } from "./agent-chat/agent-chat"
import { AgentLibrary } from "./agent-library"
import { AgentMenu } from "./agent-menu"
import { CanvasToolbar, type CanvasTool } from "./canvas-toolbar"
import {
  AGENT,
  INITIAL_EDGES,
  INITIAL_NODES,
  ROOT_ID,
  TOAST_ERROR_ICON,
  TOAST_SUCCESS_ICON,
  type AgentEdgeType,
  type AgentGraph,
  type AgentNodeType,
} from "./data"
import { useDeleteConfirmation } from "./delete-confirmation"
import { FlowKeys } from "./flow-keys"
import {
  boundsOf,
  connectionProblem,
  layoutTree,
  LEAF_TAIL,
  nameFork,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./flow-layout"
import {
  AddStepButton,
  AgentActionsProvider,
  type AgentActionsApi,
  NodeInspectorPanel,
} from "./node-actions"
import { clearResults, runTest } from "./test-run"
import { TreeEdge } from "./tree-edge"
import { TreeNode } from "./tree-node"
import { PlayIcon } from "lucide-react"

// The opening frame only, pinned to 1 both ways: a canvas you pan beats type
// rendered at a fraction of its size. The toolbar's Zoom to fit is free to shrink.
const INITIAL_FIT = { padding: 0.04, minZoom: 1, maxZoom: 1 }
/** The glide of a re-frame that follows the inspector dock closing: its 200ms. */
const REFRAME_MS = 200

// The canvas margin the framing leaves around the tree.
const VIEW_INSET = 32

// The toolbar floats over the bottom edge: a 24px inset, a bar up to 44px tall
// in the roomiest style, then the same margin, so a fitted tree clears it.
const TOOLBAR_RESERVE = 24 + 44 + VIEW_INSET

// One end of a link: the step and which of its two handles.
type LinkEnd = { nodeId: string; type: HandleType }

// Module scope: a new nodeTypes or edgeTypes object per render remounts
// every node and edge on the canvas.
const nodeTypes = { agent: TreeNode } satisfies NodeTypes
const edgeTypes = { tree: TreeEdge } satisfies EdgeTypes

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

// group/node lets the node paint a focus ring: the engine puts focus on its own
// wrapper and strips the outline, so the card below has to answer for it.
const SEEDED: AgentNodeType[] = INITIAL_NODES.map((node) => ({
  ...node,
  className: "group/node",
  deletable: node.id !== ROOT_ID,
  initialWidth: NODE_WIDTH,
  initialHeight: NODE_HEIGHT,
}))

export function AgentBuilder() {
  return (
    <ReactFlowProvider>
      <AgentEditor />
    </ReactFlowProvider>
  )
}

function AgentEditor() {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  // Every fit waits for the relayout to land. It starts armed so the first
  // view is fitted; Tidy and Restore sample arm it again. Nothing else does:
  // a step added or deleted holds the view instead (holdView).
  const pendingFit = useRef(true)
  // The view the last framing set, carried along by every hold, and whether
  // it was made beside the open inspector dock: a later close can then tell
  // whether the view is still that one and whether it needs re-centring.
  const lastFrame = useRef<{ x: number; y: number; docked: boolean } | null>(
    null
  )
  // Where the last layout pass put each card: what is on screen. A commit can
  // carry positions of its own (Undo restores a snapshot), so the next pass
  // is compared with this, never with the nodes it is handed.
  const lastPlaced = useRef(new Map<string, { x: number; y: number }>())
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeType>(SEEDED)
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<AgentEdgeType>(INITIAL_EDGES)
  const [layoutVersion, setLayoutVersion] = useState(0)
  // Opens in Select, as the reference does: a card drags, a handle links,
  // and a drag on empty canvas still pans. Pan locks the steps in place.
  const [tool, setTool] = useState<CanvasTool>("select")
  // dagre owns every position until a step is moved by hand.
  const [arranged, setArranged] = useState(true)
  const { getEdges, getNodes, screenToFlowPosition, setViewport } =
    useReactFlow<AgentNodeType, AgentEdgeType>()
  const { onBeforeDelete, dialog } = useDeleteConfirmation()
  // Holds the tree the confirmation approved, so the delete toast can put it back.
  const graphBeforeDelete = useRef<AgentGraph | null>(null)
  const nodesInitialized = useNodesInitialized()
  // Pan holds every step still, so a drag anywhere moves the view, never the tree.
  const editable = tool === "select"

  // Whether the pane has a size yet, not the size itself: subscribing to the
  // width would re-render the builder, and re-run the layout below, on every
  // frame of a resize such as the inspector dock opening. The framing reads
  // the height from the store and the width from settledCanvasWidth() at the
  // moment it runs.
  const paneMeasured = useStore((state) => state.width > 0 && state.height > 0)
  const store = useStoreApi()

  // Changes only when a card is measured, never when one moves, which is what
  // keeps the layout effect below from feeding itself.
  const sizeKey = useStore((state) => {
    let key = ""

    for (const [id, node] of state.nodeLookup) {
      key += `${id}:${node.measured.width ?? 0}x${node.measured.height ?? 0};`
    }

    return key
  })

  // One Undo is on offer at a time. Its snapshot is the whole graph, so it is
  // right only until the graph changes again: every change drops it first.
  const undoToast = useRef<string | number | null>(null)
  const dropUndo = useCallback(() => {
    // Guarded, because sonner reads a missing id as "dismiss every toast".
    if (undoToast.current !== null) {
      toast.dismiss(undoToast.current)
      undoToast.current = null
    }
  }, [])

  // The toaster belongs to the shell, so the toast would outlive this editor
  // on another page, where its Undo has nothing to restore.
  useEffect(() => dropUndo, [dropUndo])

  // Every edit the builder makes lands here, so one place bumps the layout. A
  // delete is the engine's own change and answers in clearRunOnDelete.
  const commit = useCallback(
    (nextNodes: AgentNodeType[], nextEdges: AgentEdgeType[]) => {
      dropUndo()
      setNodes(nextNodes)
      setEdges(nextEdges)
      setLayoutVersion((version) => version + 1)
    },
    [dropUndo, setEdges, setNodes]
  )

  // The one toast that offers Undo. It puts back the graph from before the
  // change; `onUndone` is for what the caller has to settle after that.
  const offerUndo = useCallback(
    (
      title: string,
      description: string,
      before: AgentGraph,
      onUndone?: () => void
    ) => {
      dropUndo()
      undoToast.current = toast.success(title, {
        description,
        icon: TOAST_SUCCESS_ICON,
        action: {
          label: "Undo",
          onClick: () => {
            commit(before.nodes, before.edges)
            onUndone?.()
          },
        },
        duration: 8000,
      })
    },
    [commit, dropUndo]
  )

  /**
   * Frames the placed tree at scale 1. A run reads downward, so a tree taller
   * than the canvas anchors at the top rather than cutting off its trigger.
   */
  const frameTree = useCallback(
    (placed: AgentNodeType[], duration?: number) => {
      const bounds = boundsOf(placed)
      const { width, height: paneHeight, domNode } = store.getState()
      // A framing can land in the same tick as the inspector dock opens or
      // closes (Restore sample removing the inspected step); the frame is
      // for the canvas that will remain.
      const paneWidth = settledCanvasWidth(domNode) ?? width

      // The pane reports zero until it is measured, so the caller retries.
      if (!paneWidth || !paneHeight || !bounds.width || !bounds.height) {
        return false
      }

      // The lowest cards are leaves, and a leaf's stub and plus hang below
      // its card, outside the measured box: the tree is that much taller.
      const treeHeight = bounds.height + LEAF_TAIL
      // The band a fitted tree centres in stops above the toolbar.
      const fits = treeHeight + VIEW_INSET + TOOLBAR_RESERVE <= paneHeight

      const x = Math.round((paneWidth - bounds.width) / 2 - bounds.x)
      const y = Math.round(
        fits
          ? (paneHeight - TOOLBAR_RESERVE + VIEW_INSET - treeHeight) / 2 -
              bounds.y
          : VIEW_INSET - bounds.y
      )

      void setViewport(
        { x, y, zoom: 1 },
        // A straight pan, in step with the dock: the default interpolation
        // arcs through a zoom-out, which shrinks every card on the way.
        duration
          ? { duration, interpolate: "linear", ease: (t) => t }
          : undefined
      )
      lastFrame.current = { x, y, docked: isDockOpening(domNode) }

      return true
    },
    [setViewport, store]
  )

  /**
   * Holds the view through a layout pass. The layout may move cards: a fork
   * shifts a parent over its children, an Undo brings a subtree back. The
   * view takes back the displacement most cards share, so the largest group
   * of cards stays exactly where it was on screen and only the rest move.
   * On a tie the group of the first card stays.
   */
  const holdView = useCallback(
    (placed: AgentNodeType[]) => {
      const tally = new Map<string, { dx: number; dy: number; count: number }>()

      for (const node of placed) {
        const was = lastPlaced.current.get(node.id)

        if (!was) continue

        const dx = was.x - node.position.x
        const dy = was.y - node.position.y
        const key = `${dx},${dy}`
        const entry = tally.get(key) ?? { dx, dy, count: 0 }

        entry.count += 1
        tally.set(key, entry)
      }

      let shared: { dx: number; dy: number; count: number } | undefined

      // Insertion order is card order, so the first card's group wins a tie.
      for (const entry of tally.values()) {
        if (!shared || entry.count > shared.count) shared = entry
      }

      if (!shared || (!shared.dx && !shared.dy)) return

      const [x, y, zoom] = store.getState().transform
      const dx = shared.dx * zoom
      const dy = shared.dy * zoom

      void setViewport({ x: x + dx, y: y + dy, zoom })

      // A hold is not the user moving the view: the framed view moves with it.
      if (lastFrame.current) {
        lastFrame.current = {
          ...lastFrame.current,
          x: lastFrame.current.x + dx,
          y: lastFrame.current.y + dy,
        }
      }
    },
    [setViewport, store]
  )

  // A step just added can land outside the view: a fork grows sideways, the
  // run's end can sit below the fold. Once it is placed and measured the view
  // pans just far enough to show it, beside the dock if that is opening.
  const revealNext = useRef<string | null>(null)
  const markPlaced = useCallback((nodeId: string) => {
    revealNext.current = nodeId
  }, [])

  const revealPlaced = useCallback(
    (placed: AgentNodeType[]) => {
      const node = placed.find((it) => it.id === revealNext.current)

      if (!node?.measured?.width || !node.measured.height) {
        return
      }

      revealNext.current = null

      const { width, height, domNode, transform } = store.getState()
      const paneWidth = settledCanvasWidth(domNode) ?? width
      const [x, y, zoom] = transform

      if (!paneWidth || !height) {
        return
      }

      const left = node.position.x * zoom + x
      const top = node.position.y * zoom + y
      const right = left + node.measured.width * zoom
      // A leaf's stub and plus hang below its card.
      const lower = top + (node.measured.height + LEAF_TAIL) * zoom
      const bottom = height - TOOLBAR_RESERVE
      const dx =
        left < VIEW_INSET
          ? VIEW_INSET - left
          : right > paneWidth - VIEW_INSET
            ? paneWidth - VIEW_INSET - right
            : 0
      const dy =
        top < VIEW_INSET
          ? VIEW_INSET - top
          : lower > bottom
            ? bottom - lower
            : 0

      if (dx || dy) {
        // A straight pan, as frameTree glides: the default interpolation
        // arcs through a zoom-out.
        void setViewport(
          { x: Math.round(x + dx), y: Math.round(y + dy), zoom },
          { duration: REFRAME_MS, interpolate: "linear", ease: (t) => t }
        )
      }
    },
    [setViewport, store]
  )

  // The layout frames from what it just placed, so the view is never computed
  // from the previous pass's geometry. A hand arrangement is left alone.
  useEffect(() => {
    if (!nodesInitialized) {
      return
    }

    if (!arranged) {
      revealPlaced(getNodes())
      return
    }

    const placed = layoutTree(getNodes(), getEdges())

    setNodes(placed)

    if (pendingFit.current) {
      // The first view, Tidy and Restore sample frame the whole tree. Held
      // armed until a framing lands on measured cards: a pane measured a
      // tick late (`paneMeasured` re-runs this) or a pass laid out from the
      // seeds still gets a view of the tree as it really is.
      if (frameTree(placed) && placed.every((node) => node.measured)) {
        pendingFit.current = false
      }
    } else {
      // Any other pass is a step added, deleted, restored or resized, and
      // the view is not re-framed for it: what was on screen stays where it
      // was, and a new step, which opens the inspector dock beside the
      // canvas, does not send the tree across it.
      holdView(placed)
      revealPlaced(placed)
    }

    lastPlaced.current = new Map(
      placed.map((node) => [node.id, { ...node.position }])
    )
  }, [
    arranged,
    layoutVersion,
    sizeKey,
    nodesInitialized,
    paneMeasured,
    frameTree,
    holdView,
    revealPlaced,
    getEdges,
    getNodes,
    setNodes,
  ])

  // A framing made beside the open inspector (Tidy with it open) is centred
  // for the canvas beside it. When the dock then closes, the tree would stay
  // 170px off centre in the canvas that comes back, so it is framed again,
  // gliding with the dock. Only a view framed docked, and only while it is
  // still that view: one the user has panned or zoomed is theirs. A plain
  // open, the close of a view framed for the full canvas, and a row that
  // changed width for another reason (the secondary panel) move nothing.
  const reframeOnClose = useCallback(
    (open: boolean) => {
      const frame = lastFrame.current

      if (open || !frame?.docked) return

      const [x, y, zoom] = store.getState().transform

      if (x === frame.x && y === frame.y && zoom === 1) {
        frameTree(getNodes(), REFRAME_MS)
      }
    },
    [frameTree, getNodes, store]
  )

  // Fit centres the tree on half pixels, which smears every 1px rule; each move
  // lands on whole pixels so connectors stay as crisp as the card borders.
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

  // Why dagre gave the layout up. A card moved by hand keeps it handed over
  // until Tidy; a library step dropped loose only until every loose step is
  // wired into the tree, when the tree lays itself out again.
  const handOver = useRef<"none" | "loose" | "hand">("none")
  // The builder's actions, for a link let go on empty canvas (see
  // finishConnection), which starts a new step through them.
  const actionsRef = useRef<AgentActionsApi | null>(null)

  // Hands the layout back to dagre and brings the whole tree into view.
  const tidy = useCallback(() => {
    handOver.current = "none"
    setArranged(true)
    pendingFit.current = true
    setLayoutVersion((version) => version + 1)
  }, [])

  // The engine reports a drag stop only past its threshold, so a click never
  // lands here. A drag moves cards without a commit, and a pending Undo would
  // put them back, so it is dropped here as well.
  const markMoved = useCallback(() => {
    dropUndo()
    handOver.current = "hand"
    setArranged(false)
  }, [dropUndo])

  // A library step dropped on empty canvas lands where it was let go, so the
  // layout is handed over for as long as it stays loose.
  const markLoose = useCallback(() => {
    if (handOver.current === "none") {
      handOver.current = "loose"
    }

    setArranged(false)
  }, [])

  // Arrow keys move a selected step without a drag, so they hand over the
  // layout, and drop a pending Undo, too.
  const markKeyMove = useCallback(
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
        dropUndo()
        handOver.current = "hand"
        setArranged(false)
      }
    },
    [dropUndo, editable]
  )

  // Reads the live edges, so the guard never judges a link against a stale tree.
  const isValidConnection = useCallback<IsValidConnection<AgentEdgeType>>(
    (connection) =>
      connection.target !== ROOT_ID &&
      connectionProblem(getEdges(), connection.source, connection.target) ===
        null,
    [getEdges]
  )

  // The id of the link the engine last committed, so a click can tell whether
  // its connection went through.
  const lastLink = useRef<string | null>(null)

  // A step has one parent, so a new link re-hangs the step and its subtree
  // under the new parent, and the last run no longer describes the tree.
  const onConnect = useCallback(
    ({ source, target }: Connection) => {
      const current = getEdges()
      const previous = current.find((edge) => edge.target === target)
      const kept = current.filter((edge) => edge.target !== target)
      const fork = kept.some((edge) => edge.source === source)
      const stranded = previous
        ? kept.filter((edge) => edge.source === previous.source)
        : []

      // One child left is a straight line, not a fork, so it drops its caption.
      const settled = kept.map((edge): AgentEdgeType =>
        stranded.length === 1 && edge.id === stranded[0].id
          ? { ...edge, data: { ...edge.data, branchLabel: undefined } }
          : edge
      )
      const link: AgentEdgeType = {
        id: `${source}->${target}`,
        source,
        target,
        type: "tree",
        data: {
          branchLabel: fork
            ? previous?.data?.branchLabel || "New path"
            : undefined,
        },
      }

      lastLink.current = link.id
      // A fork's paths are all named, the same rule Add branch follows, and a
      // caption one of the new siblings already reads is numbered.
      const nextEdges = fork
        ? nameFork([...settled, link], source)
        : [...settled, link]
      const nodesNow = getNodes()

      commit(clearResults(nodesNow), nextEdges)
      // A step that moves under a new parent can move out of view.
      revealNext.current = target

      // The last loose step is wired in: the tree takes its layout back.
      const parented = new Set(nextEdges.map((edge) => edge.target))

      if (
        handOver.current === "loose" &&
        nodesNow.every((node) => node.id === ROOT_ID || parented.has(node.id))
      ) {
        handOver.current = "none"
        setArranged(true)
      }
    },
    [commit, getEdges, getNodes]
  )

  // The engine only greys a refused link, so the reason arrives as a toast.
  // A drag and a click-to-connect both explain themselves here.
  const explainRefusal = useCallback(
    (from: LinkEnd, to: LinkEnd) => {
      const fromSource = from.type === "source"
      const source = fromSource ? from.nodeId : to.nodeId
      const target = fromSource ? to.nodeId : from.nodeId
      const titleOf = (id: string) =>
        getNodes().find((node) => node.id === id)?.data.title ?? "This step"
      const problem =
        from.type === to.type
          ? "direction"
          : target === ROOT_ID
            ? "root"
            : connectionProblem(getEdges(), source, target)
      const reason =
        problem === "direction"
          ? "Link a step's bottom to another step's top."
          : problem === "root"
            ? `${titleOf(ROOT_ID)} starts the run, so nothing comes before it.`
            : problem === "self"
              ? "A step cannot follow itself."
              : problem === "linked"
                ? `${titleOf(target)} already follows ${titleOf(source)}.`
                : problem === "cycle"
                  ? `${titleOf(target)} runs before ${titleOf(source)}.`
                  : null

      if (reason) {
        toast.error("Cannot connect", {
          description: reason,
          icon: TOAST_ERROR_ICON,
        })
      }
    },
    [getEdges, getNodes]
  )

  /**
   * Where a link drag ends. On a handle the engine has already linked it, or
   * refused it, which is explained here. Let go anywhere else on a card, it
   * links to that card as if dropped on its handle: a card is a far bigger
   * target than a dot. Let go on empty canvas from a step's bottom, it starts
   * a new step there, under that step.
   */
  const finishConnection = useCallback<OnConnectEnd>(
    (event, { fromHandle, fromNode, isValid, toHandle, toNode }) => {
      if (!fromHandle || !fromNode) {
        return
      }

      const from = { nodeId: fromNode.id, type: fromHandle.type }

      if (toHandle && toNode) {
        if (isValid === false) {
          explainRefusal(from, { nodeId: toNode.id, type: toHandle.type })
        }

        return
      }

      const point = "changedTouches" in event ? event.changedTouches[0] : event

      if (!point) {
        return
      }

      const element = document.elementFromPoint(point.clientX, point.clientY)
      const card = element
        ?.closest(".react-flow__node")
        ?.getAttribute("data-id")
      const fromSource = fromHandle.type === "source"

      if (card) {
        if (card === fromNode.id) {
          return
        }

        const source = fromSource ? fromNode.id : card
        const target = fromSource ? card : fromNode.id

        const link = { source, target, sourceHandle: null, targetHandle: null }

        if (isValidConnection(link)) {
          onConnect(link)
        } else {
          explainRefusal(from, {
            nodeId: card,
            type: fromSource ? "target" : "source",
          })
        }

        return
      }

      if (fromSource && element?.closest(".react-flow__pane")) {
        const flow = screenToFlowPosition({
          x: point.clientX,
          y: point.clientY,
        })

        actionsRef.current?.appendAfter(fromNode.id, undefined, {
          x: flow.x - NODE_WIDTH / 2,
          y: flow.y,
        })
      }
    },
    [explainRefusal, isValidConnection, onConnect, screenToFlowPosition]
  )

  // A click-to-connect never enters the engine's connection state, so the
  // first handle is held here and the second is read off the handle clicked.
  const clickFrom = useRef<LinkEnd | null>(null)

  const holdClickStart = useCallback<OnConnectStart>(
    (_, { handleType, nodeId }) => {
      clickFrom.current =
        nodeId && handleType ? { nodeId, type: handleType } : null
      lastLink.current = null
    },
    []
  )

  const explainClickRejection = useCallback<OnConnectEnd>(
    (event) => {
      const from = clickFrom.current
      const handle =
        event.target instanceof Element
          ? event.target.closest(".react-flow__handle")
          : null
      const nodeId = handle?.getAttribute("data-nodeid")
      const type: HandleType = handle?.classList.contains("target")
        ? "target"
        : "source"

      clickFrom.current = null

      // A second click on the first handle only cancels the pending link.
      if (!from || !nodeId || (from.nodeId === nodeId && from.type === type)) {
        return
      }

      const link =
        from.type === "source"
          ? `${from.nodeId}->${nodeId}`
          : `${nodeId}->${from.nodeId}`

      if (lastLink.current !== link) {
        explainRefusal(from, { nodeId, type })
      }
    },
    [explainRefusal]
  )

  // Cards, inspector and toast read one committed run. The tally sums to the
  // step count and names no step, since a title is user text of any length.
  const runAgentTest = useCallback(() => {
    const run = runTest(getNodes(), getEdges())
    const last = run.reached.at(-1)
    const failedStep = run.nodes.find((node) => node.data.status === "failed")
    // The Workflow Editor's closing toast: what ran, how long it took and
    // which path it chose, with the way into the logs it wrote.
    const viewLogs = last
      ? {
          label: "View logs",
          onClick: () => actionsRef.current?.showLogs(failedStep?.id ?? last),
        }
      : undefined

    commit(run.nodes, getEdges())

    if (failedStep) {
      toast.error("Test run failed", {
        description: `Stopped at ${failedStep.data.title}: ${failedStep.data.facts.join(", ")}.`,
        icon: TOAST_ERROR_ICON,
        action: viewLogs,
      })
      return
    }

    toast.success("Test run finished", {
      description: `${plural(run.reached.length, "step")} in ${(run.ms / 1000).toFixed(1)}s${
        run.path ? `, took the ${run.path} path` : ""
      }.`,
      icon: TOAST_SUCCESS_ICON,
      action: viewLogs,
    })
  }, [commit, getEdges, getNodes])

  const clearRun = useCallback(() => {
    commit(clearResults(nodes), edges)
  }, [commit, edges, nodes])

  // The prompt settles before the engine removes anything, so the tree it
  // captures still holds every step the confirmed delete is about to take.
  const confirmDelete = useCallback<
    OnBeforeDelete<AgentNodeType, AgentEdgeType>
  >(
    async (elements) => {
      const allowed = await onBeforeDelete(elements)

      if (allowed) {
        graphBeforeDelete.current = { nodes, edges }
      }

      return allowed
    },
    [edges, nodes, onBeforeDelete]
  )

  // The engine queues its own changes first, so this clear lands on the tree
  // without the removed steps; Undo replays the graph the confirmation captured.
  const clearRunOnDelete = useCallback<OnDelete<AgentNodeType, AgentEdgeType>>(
    ({ nodes: removed, edges: cut }) => {
      // Dropped here, not only by the toast below: a removed connection
      // changes the graph too.
      dropUndo()
      setNodes(clearResults)
      setLayoutVersion((version) => version + 1)

      // A step left without a parent stays where it is, loose, to be linked
      // again: laid out on its own it would jump away from where it was.
      const gone = new Set([
        ...removed.map((node) => node.id),
        ...cut.map((edge) => edge.id),
      ])
      const parented = new Set(
        getEdges()
          .filter((edge) => !gone.has(edge.id))
          .map((edge) => edge.target)
      )
      const loose = getNodes().filter(
        (node) =>
          !gone.has(node.id) && node.id !== ROOT_ID && !parented.has(node.id)
      )

      if (loose.length > 0) {
        markLoose()
      }

      const previous = graphBeforeDelete.current

      if (!previous) {
        return
      }

      if (removed.length === 0) {
        if (cut.length > 0) {
          offerUndo(
            cut.length > 1 ? "Connections removed" : "Connection removed",
            loose.length === 1
              ? `${loose[0].data.title} is not connected now.`
              : plural(loose.length, "step") + " not connected now.",
            previous
          )
        }

        return
      }

      offerUndo(
        removed.length > 1 ? "Steps deleted" : "Step deleted",
        removed.length > 1
          ? plural(removed.length, "step") + " left the tree."
          : removed[0].data.title,
        previous
      )
    },
    [dropUndo, getEdges, getNodes, markLoose, offerUndo, setNodes]
  )

  // Seed positions are all at the origin, so the sample always comes back tidy.
  const restoreSample = useCallback(() => {
    handOver.current = "none"
    setArranged(true)
    pendingFit.current = true
    commit(SEEDED, INITIAL_EDGES)
  }, [commit])

  const copyAsJson = useCallback(() => {
    const graph = JSON.stringify({ nodes, edges }, null, 2)
    const summary = `${plural(nodes.length, "step")} and ${plural(edges.length, "connection")}.`

    // A denied clipboard permission is the common case, so the toast waits
    // for the write rather than claiming a copy that never happened. Outside
    // a secure context (plain http on anything but localhost) there is no
    // navigator.clipboard at all, and that throws. The executor still runs
    // inside the click and turns the throw into the same rejection.
    void new Promise<void>((resolve) =>
      resolve(navigator.clipboard.writeText(graph))
    )
      .then(() =>
        toast.success("Agent copied as JSON", {
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

  return (
    <AgentActionsProvider
      nodes={nodes}
      edges={edges}
      commit={commit}
      offerUndo={offerUndo}
      hoveredEdge={hoveredEdge}
      onArrangeByHand={markLoose}
      apiRef={actionsRef}
      onRunTest={runAgentTest}
      onPlaced={markPlaced}
    >
      {/* Fills the shell's content area rather than the viewport (h-svh in the
          block), so the canvas sits under the app header, beside the section panel. */}
      <div className="flex min-h-0 w-full flex-1 flex-col bg-background">
        {/* The route's breadcrumb in the app header names the page; the
            agent keeps its name as the page heading for assistive tech. */}
        <h1 className="sr-only">{AGENT.name}</h1>
        {/* The builder's actions sit in the app header, in place of Publish. */}
        <HeaderActions>
          <FlowKeys />
          <AgentChat />
          <AddStepButton />
          <Button onClick={runAgentTest}>
            <PlayIcon aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Run test</span>
          </Button>
          <AgentMenu
            onClearRun={clearRun}
            onRestoreSample={restoreSample}
            onCopyJson={copyAsJson}
          />
        </HeaderActions>
        {/* The step library sits in the shell's secondary panel, which this
            section owns; it is rendered from here so a step dragged out of
            it can reach the tree. */}
        <InnerPanel>
          <AgentLibrary />
        </InnerPanel>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <FlowCanvas<AgentNodeType, AgentEdgeType>
            showMiniMap={false}
            fitViewOptions={INITIAL_FIT}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={finishConnection}
            onClickConnectStart={holdClickStart}
            onClickConnectEnd={explainClickRejection}
            onBeforeDelete={confirmDelete}
            onDelete={clearRunOnDelete}
            onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
            onEdgeMouseLeave={() => setHoveredEdge(null)}
            onNodeDragStop={markMoved}
            onSelectionDragStop={markMoved}
            onKeyDownCapture={markKeyMove}
            onMoveEnd={snapViewport}
            isValidConnection={isValidConnection}
            connectionRadius={24}
            nodesConnectable={editable}
            nodesDraggable={editable}
          >
            {/* The engine ships its own panel margin unlayered, so this has to win. */}
            <Panel position="bottom-left" className="m-6!">
              <CanvasToolbar
                tool={tool}
                onToolChange={setTool}
                onTidy={tidy}
                onRunTest={runAgentTest}
              />
            </Panel>
          </FlowCanvas>
          <NodeInspectorPanel onOpenChange={reframeOnClose} />
          {dialog}
        </div>
      </div>
    </AgentActionsProvider>
  )
}
