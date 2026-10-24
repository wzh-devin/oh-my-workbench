/**
 * Tree geometry. dagre places the graph, this converts its centres into the
 * top left positions React Flow wants, and places hand added steps until the
 * next Tidy. Positions and tree shape only, never sizes.
 */
import {
  Graph,
  layout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"

import type { AgentEdgeType } from "./data"

/**
 * Seeds the layout before the cards are measured, so nothing reflows. They
 * have to be the rendered card's size: a pass laid out from a seed that is
 * off shows for a frame, and the first view is framed from one.
 */
export const NODE_WIDTH = 256
export const NODE_HEIGHT = 79

/**
 * A leaf's stub (20px) and trailing plus (24px) hang this far below its card.
 * They sit outside the box React Flow measures, so a card is the same size
 * whether or not it is a leaf: cards in a rank share a top, every connector
 * is RANK_GAP tall, and a leaf that gains a child does not move.
 */
export const LEAF_TAIL = 44

// ranksep is the gap between rank edges, not a pitch, so the connector is this
// tall whatever the cards do. Five ranks have to clear 852px at scale 1.
const RANK_GAP = 64
const SIBLING_GAP = 64

function sizeOf(node: Node) {
  return {
    width:
      node.measured?.width ?? node.width ?? node.initialWidth ?? NODE_WIDTH,
    height:
      node.measured?.height ?? node.height ?? node.initialHeight ?? NODE_HEIGHT,
  }
}

/**
 * The box around the cards it is handed, read off their own positions. The
 * engine's getNodesBounds looks each card up in its store instead, where a
 * layout placed this tick has not landed yet.
 */
export function boundsOf(nodes: Node[]) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const node of nodes) {
    const box = sizeOf(node)

    left = Math.min(left, node.position.x)
    top = Math.min(top, node.position.y)
    right = Math.max(right, node.position.x + box.width)
    bottom = Math.max(bottom, node.position.y + box.height)
  }

  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Ids with no outgoing edge. A leaf renders the trailing plus. */
export function leafIdsOf(nodes: Node[], edges: Edge[]) {
  const parents = new Set(edges.map((edge) => edge.source))

  return new Set(nodes.map((node) => node.id).filter((id) => !parents.has(id)))
}

/** Every id below one node: the subtree an insert pushes down. */
function descendantsOf(edges: Edge[], nodeId: string) {
  const found = new Set<string>()
  const queue = [nodeId]

  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const edge of edges) {
      if (edge.source === id && !found.has(edge.target)) {
        found.add(edge.target)
        queue.push(edge.target)
      }
    }
  }

  return found
}

/** Walks parent edges up from a node; a step has one parent, so this is a line. */
function isAncestor(edges: Edge[], candidateId: string, nodeId: string) {
  const seen = new Set<string>()
  let parent = edges.find((edge) => edge.target === nodeId)

  while (parent && !seen.has(parent.source)) {
    if (parent.source === candidateId) {
      return true
    }

    const source = parent.source

    seen.add(source)
    parent = edges.find((edge) => edge.target === source)
  }

  return false
}

type ConnectionProblem = "self" | "linked" | "cycle"

/** Why a link would break the tree, or null when it keeps one. */
export function connectionProblem(
  edges: Edge[],
  source: string,
  target: string
): ConnectionProblem | null {
  if (source === target) {
    return "self"
  }

  if (edges.some((edge) => edge.source === source && edge.target === target)) {
    return "linked"
  }

  return isAncestor(edges, target, source) ? "cycle" : null
}

/** What a caption is compared by: case and outer spaces never tell paths apart. */
export function captionKey(label: string | undefined) {
  return (label ?? "").trim().toLowerCase()
}

/**
 * A run takes a path by caption, so every path out of a fork gets a unique one:
 * unnamed becomes Default, and a caption an earlier sibling reads is numbered.
 */
export function nameFork(
  edges: AgentEdgeType[],
  parentId: string
): AgentEdgeType[] {
  const taken = new Set<string>()
  const repeats = new Set<string>()

  for (const edge of edges) {
    const key =
      edge.source === parentId ? captionKey(edge.data?.branchLabel) : ""

    if (key && taken.has(key)) {
      repeats.add(edge.id)
    } else if (key) {
      taken.add(key)
    }
  }

  return edges.map((edge) => {
    const label = edge.data?.branchLabel?.trim()

    if (edge.source !== parentId || (label && !repeats.has(edge.id))) {
      return edge
    }

    const wanted = label || "Default"
    let unique = wanted

    for (let count = 2; taken.has(captionKey(unique)); count += 1) {
      unique = `${wanted} ${count}`
    }

    taken.add(captionKey(unique))

    return { ...edge, data: { ...edge.data, branchLabel: unique } }
  })
}

/** Whether a card at x, y would cover another card. */
function occupied(nodes: Node[], x: number, y: number) {
  return nodes.some(
    (node) =>
      Math.abs(node.position.x - x) < NODE_WIDTH &&
      Math.abs(node.position.y - y) < NODE_HEIGHT
  )
}

/**
 * Left of the parent's leftmost child, or straight under a parent with none,
 * so a step added to a hand arranged tree lands next to where it belongs.
 * The left side is where Tidy usually puts a fork's newest path, so the next
 * Tidy tends to leave the step on the side it was added. A slot another card
 * holds is passed over for the nearest free one beside the siblings, left
 * first, so the new step never hides a card.
 */
export function childPosition(nodes: Node[], edges: Edge[], parentId: string) {
  const parent = nodes.find((node) => node.id === parentId)

  if (!parent) {
    return { x: 0, y: 0 }
  }

  let leftmost: Node | undefined
  let rightmost: Node | undefined

  for (const edge of edges) {
    const child =
      edge.source === parentId
        ? nodes.find((node) => node.id === edge.target)
        : undefined

    if (child && (!leftmost || child.position.x < leftmost.position.x)) {
      leftmost = child
    }

    if (child && (!rightmost || child.position.x > rightmost.position.x)) {
      rightmost = child
    }
  }

  const y = parent.position.y + sizeOf(parent).height + RANK_GAP

  if (!leftmost || !rightmost) {
    return { x: parent.position.x, y }
  }

  const slot = NODE_WIDTH + SIBLING_GAP

  for (let away = slot; ; away += slot) {
    const left = leftmost.position.x - away
    const right = rightmost.position.x + away

    if (!occupied(nodes, left, y)) {
      return { x: left, y }
    }

    if (!occupied(nodes, right, y)) {
      return { x: right, y }
    }
  }
}

/**
 * Leaving `align` unset is what centres a parent over its children, even when
 * the subtrees below it differ in depth.
 */
export function layoutTree<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[]
): N[] {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({
    directed: true,
    multigraph: false,
    compound: false,
  })

  graph.setGraph({
    rankdir: "TB",
    ranksep: RANK_GAP,
    nodesep: SIBLING_GAP,
    marginx: 0,
    marginy: 0,
  })
  graph.setDefaultEdgeLabel(() => ({}))

  const boxes = new Map<string, { width: number; height: number }>()

  for (const node of nodes) {
    const box = sizeOf(node)

    boxes.set(node.id, box)
    graph.setNode(node.id, { ...box })
  }

  for (const edge of edges) {
    // A branch caption rides the edge label layer, never dagre, because a sized
    // label grows only that rank and breaks the uniform pitch.
    graph.setEdge(edge.source, edge.target)
  }

  layout(graph)

  return nodes.map((node) => {
    const placed = graph.node(node.id)
    const box = boxes.get(node.id)

    if (!placed || placed.x === undefined || placed.y === undefined || !box) {
      return node
    }

    return {
      ...node,
      position: {
        x: Math.round(placed.x - box.width / 2),
        y: Math.round(placed.y - box.height / 2),
      },
    }
  })
}

/**
 * Splices a node into one edge so the tree reads parent, new node, child. The
 * new node takes the child's place and the child's subtree moves down a rank.
 */
export function insertOnEdge<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[],
  edgeId: string,
  inserted: N
): { nodes: N[]; edges: E[] } {
  const original = edges.find((edge) => edge.id === edgeId)

  if (!original) {
    return { nodes, edges }
  }

  const child = nodes.find((node) => node.id === original.target)
  const pushed = descendantsOf(edges, original.target).add(original.target)
  // One rank down, by the card that takes the rank.
  const rank = (child ? sizeOf(child).height : NODE_HEIGHT) + RANK_GAP
  const upper = {
    ...original,
    id: `${original.source}->${inserted.id}`,
    target: inserted.id,
  }
  // The branch caption stays on the upper half, where the fork it names is.
  const lower = {
    ...original,
    id: `${inserted.id}->${original.target}`,
    source: inserted.id,
    data: { ...original.data, branchLabel: undefined },
  }

  return {
    nodes: [
      ...nodes.map((node) =>
        pushed.has(node.id)
          ? {
              ...node,
              position: {
                x: node.position.x,
                y: node.position.y + rank,
              },
            }
          : node
      ),
      child ? { ...inserted, position: { ...child.position } } : inserted,
    ],
    // flatMap holds edge order. dagre orders a fork's children from it and a
    // run falls back on the first declared path, so a splice changes neither.
    edges: edges.flatMap((edge) =>
      edge.id === edgeId ? [upper, lower] : [edge]
    ),
  }
}
