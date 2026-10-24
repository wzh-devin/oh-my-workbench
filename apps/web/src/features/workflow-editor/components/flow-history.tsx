"use client"

import { useCallback, useRef, useState } from "react"
import { useReactFlow, type Edge } from "@xyflow/react"

import type { StepNodeType } from "./data"

type Snapshot = { nodes: StepNodeType[]; edges: Edge[]; version: number }

// Deep enough for a working session, small enough to never matter in memory.
const HISTORY_LIMIT = 50

interface FlowHistoryOptions {
  setNodes: React.Dispatch<React.SetStateAction<StepNodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  /** Runs first in every record, undo and redo, while the old graph still shows. */
  onMove?: () => void
}

/**
 * Snapshots the graph right before each edit commits, so one undo reverses one
 * gesture: a drag, a connection, an insert, a save or a confirmed delete.
 */
export function useFlowHistory({
  setNodes,
  setEdges,
  onMove,
}: FlowHistoryOptions) {
  const { getNodes, getEdges } = useReactFlow<StepNodeType, Edge>()
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  // Every commit mints a version and undo or redo restores the one it brings
  // back, so returning to a saved graph reads clean again.
  const [version, setVersion] = useState(0)
  const minted = useRef(0)
  const onScreen = useRef(0)
  const staged = useRef<Snapshot | null>(null)

  // The engine store still holds the committed graph while a handler runs.
  // A drag flag caught mid gesture would pin the grabbing cursor on restore.
  const readGraph = useCallback(
    (): Snapshot => ({
      nodes: getNodes().map((node) => ({ ...node, dragging: false })),
      edges: getEdges(),
      version: onScreen.current,
    }),
    [getNodes, getEdges]
  )

  const show = useCallback((next: number) => {
    onScreen.current = next
    setVersion(next)
  }, [])

  // Returns the version it minted, the handle a caller keeps to its own edit.
  const push = useCallback(
    (snapshot: Snapshot) => {
      onMove?.()
      setPast((current) => [...current, snapshot].slice(-HISTORY_LIMIT))
      setFuture([])
      minted.current += 1
      show(minted.current)

      return minted.current
    },
    [onMove, show]
  )

  const takeSnapshot = useCallback(() => push(readGraph()), [push, readGraph])

  // The version on screen as of this instant, ahead of the render that
  // carries it: a handler asks while its own edit is still committing.
  const shownVersion = useCallback(() => onScreen.current, [])

  // A drag is staged when it starts and recorded when it ends only if a step
  // moved, so a press that snaps back to the same dot is never an edit.
  const stageDrag = useCallback(() => {
    staged.current = readGraph()
  }, [readGraph])

  const commitDrag = useCallback(() => {
    const snapshot = staged.current
    staged.current = null

    if (!snapshot) {
      return
    }

    const now = new Map(getNodes().map((node) => [node.id, node.position]))
    const moved = snapshot.nodes.some((node) => {
      const position = now.get(node.id)

      return (
        position !== undefined &&
        (position.x !== node.position.x || position.y !== node.position.y)
      )
    })

    if (moved) {
      push(snapshot)
    }
  }, [getNodes, push])

  const undo = useCallback(() => {
    const previous = past.at(-1)

    if (!previous) {
      return
    }

    onMove?.()
    setPast(past.slice(0, -1))
    setFuture([...future, readGraph()])
    setNodes(previous.nodes)
    setEdges(previous.edges)
    show(previous.version)
  }, [future, onMove, past, readGraph, setEdges, setNodes, show])

  const redo = useCallback(() => {
    const next = future.at(-1)

    if (!next) {
      return
    }

    onMove?.()
    setFuture(future.slice(0, -1))
    setPast([...past, readGraph()])
    setNodes(next.nodes)
    setEdges(next.edges)
    show(next.version)
  }, [future, onMove, past, readGraph, setEdges, setNodes, show])

  return {
    takeSnapshot,
    stageDrag,
    commitDrag,
    undo,
    redo,
    version,
    shownVersion,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
