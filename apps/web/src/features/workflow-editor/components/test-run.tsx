"use client"

/**
 * Run once: a test run that walks the graph on screen from the trigger, one
 * step at a time, and logs what each step would have done. It edits nothing.
 * The statuses it draws are an overlay the cards and edges read, so the
 * history, the saved version and the last live run never see them.
 *
 * A branch takes its True path (the first one when none is called that), so
 * a run reads the same every time it is played.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { Edge } from "@xyflow/react"
import { toast } from "sonner"

import { isPreferredPath, TOAST_SUCCESS_ICON, type StepNodeType } from "./data"

/** How long a step holds the run, start to result. */
const STEP_MS = 700

export type RunState = "running" | "succeeded" | "skipped"

type RunLog = {
  id: number
  /** Which run wrote it, counted from 1. */
  run: number
  nodeId: string
  tone: "info" | "success" | "warning"
  message: string
  time: string
}

type StepStats = { entered: number; completed: number; lastActivity: string }

type Visit = {
  nodeId: string
  /** The edge the run arrived by; the trigger has none. */
  via?: string
  result: string
  /** A branch whose path leads nowhere ends the run there. */
  deadEnd?: string
}

type Plan = { visits: Visit[]; path?: string }

/** The order a test run reaches the steps in, and the branch it takes. */
export function planRun(nodes: StepNodeType[], edges: Edge[]): Plan {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const triggers = nodes.filter((node) => node.data.kind === "trigger")
  const starts = (
    triggers.length > 0
      ? triggers
      : nodes.filter((node) => !edges.some((edge) => edge.target === node.id))
  ).map((node) => ({ nodeId: node.id, via: undefined as string | undefined }))
  const seen = new Set<string>()
  const visits: Visit[] = []
  let path: string | undefined

  for (let queue = starts; queue.length > 0;) {
    const next: typeof queue = []

    for (const { nodeId, via } of queue) {
      const node = byId.get(nodeId)

      if (!node || seen.has(nodeId)) {
        continue
      }

      seen.add(nodeId)
      const out = edges.filter(
        (edge) => edge.source === nodeId && byId.has(edge.target)
      )
      const isBranch = node.data.kind === "condition"
      const taken = isBranch
        ? (out.find((edge) => isPreferredPath(edge.label)) ?? out[0])
        : undefined
      const label = taken ? String(taken.label ?? "first") : undefined

      if (isBranch && label && !path) {
        path = label
      }

      visits.push({
        nodeId,
        via,
        result: resultOf(node, label),
        deadEnd:
          isBranch && !taken
            ? "No path leaves this branch, so the run ends here"
            : undefined,
      })

      // A Stop step ends its path, whatever is wired after it.
      const onward =
        node.data.category === "stop"
          ? []
          : isBranch
            ? taken
              ? [taken]
              : []
            : out

      for (const edge of onward) {
        next.push({ nodeId: edge.target, via: edge.id })
      }
    }

    queue = next
  }

  return { visits, path }
}

// customize: what each kind of step reports in a test run.
function resultOf(node: StepNodeType, path?: string) {
  const { category, detail, title } = node.data

  switch (category) {
    case "webhook":
      return `Received a test payload (${detail})`
    case "condition":
      return path
        ? `Condition checked: took the ${path} path`
        : "Condition checked"
    case "email":
    case "sms":
    case "chat":
    case "push":
      return `Would send "${title}", skipped in a test run`
    case "delay":
    case "schedule":
    case "event":
      return `Would wait (${detail}), skipped in a test run`
    case "data":
    case "sheet":
      return `${detail}: returned a test record`
    case "create":
      return `${title}: created a test record`
    case "lookup":
      return `${title}: found the test record`
    case "transform":
      return `${title}: mapped the test payload`
    case "filter":
      return `${title}: the test lead matched`
    case "loop":
      return `${title}: ran once for the one test item`
    case "stop":
      return `${title}: the run ends here`
    default:
      return `${title} ran in test mode`
  }
}

const clock = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

type TestRunApi = {
  /** How many runs have started; 0 before the first. */
  run: number
  /** How many steps the latest run set out to reach. */
  planned: number
  running: boolean
  states: Record<string, { state: RunState; duration?: string }>
  edges: Record<string, "active" | "taken">
  logs: RunLog[]
  stats: Record<string, StepStats>
  start: () => void
}

const EMPTY: TestRunApi = {
  run: 0,
  planned: 0,
  running: false,
  states: {},
  edges: {},
  logs: [],
  stats: {},
  start: () => {},
}

const TestRunContext = createContext<TestRunApi>(EMPTY)

export const useTestRun = () => useContext(TestRunContext)

interface TestRunProviderProps {
  nodes: StepNodeType[]
  edges: Edge[]
  /** Opens the logs of the step the run ended on, from the closing toast. */
  onViewLogs: (nodeId: string) => void
  children: React.ReactNode
}

export function TestRunProvider({
  nodes,
  edges,
  onViewLogs,
  children,
}: TestRunProviderProps) {
  const [run, setRun] = useState(0)
  const [planned, setPlanned] = useState(0)
  const [running, setRunning] = useState(false)
  const [states, setStates] = useState<TestRunApi["states"]>({})
  const [edgeStates, setEdgeStates] = useState<TestRunApi["edges"]>({})
  const [logs, setLogs] = useState<RunLog[]>([])
  const [stats, setStats] = useState<Record<string, StepStats>>({})
  const timers = useRef<number[]>([])
  const logCount = useRef(0)
  // The run reads the graph as it is when each step's turn comes, so a step
  // deleted mid run is passed over instead of logged.
  const graph = useRef({ nodes, edges, onViewLogs })

  useEffect(() => {
    graph.current = { nodes, edges, onViewLogs }
  }, [nodes, edges, onViewLogs])

  // The toaster belongs to the shell, so a run must not tick on after the
  // editor is gone.
  useEffect(() => {
    const pending = timers.current

    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const start = useCallback(() => {
    if (running) {
      return
    }

    const plan = planRun(graph.current.nodes, graph.current.edges)
    const number = run + 1
    const has = (id: string) =>
      graph.current.nodes.some((node) => node.id === id)
    const log = (
      nodeId: string,
      tone: RunLog["tone"],
      message: string,
      time: string
    ) => {
      logCount.current += 1
      const entry = { id: logCount.current, run: number, nodeId, tone, message }

      // Newest first, as the panel lists them.
      setLogs((current) => [{ ...entry, time }, ...current])
    }
    const later = (ms: number, task: () => void) => {
      timers.current.push(window.setTimeout(task, ms))
    }

    setRun(number)
    setPlanned(plan.visits.length)
    setRunning(true)
    setStates({})
    setEdgeStates({})

    plan.visits.forEach((visit, index) => {
      const at = index * STEP_MS

      later(at, () => {
        if (!has(visit.nodeId)) {
          return
        }

        const time = clock()
        const title =
          graph.current.nodes.find((node) => node.id === visit.nodeId)?.data
            .title ?? visit.nodeId

        setStates((current) => ({
          ...current,
          [visit.nodeId]: { state: "running" },
        }))

        if (visit.via) {
          setEdgeStates((current) => ({ ...current, [visit.via!]: "active" }))
        }

        setStats((current) => ({
          ...current,
          [visit.nodeId]: {
            entered: (current[visit.nodeId]?.entered ?? 0) + 1,
            completed: current[visit.nodeId]?.completed ?? 0,
            lastActivity: time,
          },
        }))
        log(visit.nodeId, "info", `${title} started`, time)
      })

      later(at + STEP_MS - 100, () => {
        if (!has(visit.nodeId)) {
          return
        }

        const time = clock()

        setStates((current) => ({
          ...current,
          [visit.nodeId]: {
            state: "succeeded",
            duration: `${((STEP_MS - 100) / 1000).toFixed(1)}s`,
          },
        }))

        if (visit.via) {
          setEdgeStates((current) => ({ ...current, [visit.via!]: "taken" }))
        }

        setStats((current) => ({
          ...current,
          [visit.nodeId]: {
            entered: current[visit.nodeId]?.entered ?? 1,
            completed: (current[visit.nodeId]?.completed ?? 0) + 1,
            lastActivity: time,
          },
        }))
        log(visit.nodeId, "success", visit.result, time)

        if (visit.deadEnd) {
          log(visit.nodeId, "warning", visit.deadEnd, time)
        }
      })
    })

    later(plan.visits.length * STEP_MS, () => {
      const reached = new Set(plan.visits.map((visit) => visit.nodeId))
      const last = plan.visits.at(-1)?.nodeId

      // Whatever the run never reached reads as skipped, so a glance at the
      // canvas tells the path taken from the one left alone.
      setStates((current) => {
        const next = { ...current }

        for (const node of graph.current.nodes) {
          if (!reached.has(node.id)) {
            next[node.id] = { state: "skipped" }
          }
        }

        return next
      })
      setRunning(false)
      timers.current = []

      const seconds = ((plan.visits.length * STEP_MS) / 1000).toFixed(1)

      toast.success("Test run finished", {
        description: `${plural(plan.visits.length, "step")} in ${seconds}s${
          plan.path ? `, took the ${plan.path} path` : ""
        }.`,
        icon: TOAST_SUCCESS_ICON,
        action:
          last !== undefined
            ? {
                label: "View logs",
                onClick: () => {
                  if (has(last)) {
                    graph.current.onViewLogs(last)
                  }
                },
              }
            : undefined,
      })
    })
  }, [run, running])

  return (
    <TestRunContext.Provider
      value={{
        run,
        planned,
        running,
        states,
        edges: edgeStates,
        logs,
        stats,
        start,
      }}
    >
      {children}
    </TestRunContext.Provider>
  )
}
