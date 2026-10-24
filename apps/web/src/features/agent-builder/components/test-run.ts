/**
 * Tests the draft against the recorded input. The walk follows the live edges,
 * so every status it writes is one the graph on screen can actually produce.
 */
import {
  AGENT,
  MODEL_OPTIONS,
  RECORDED_RUN,
  ROOT_ID,
  type AgentEdgeType,
  type AgentNodeType,
  type AgentStatus,
} from "./data"
import { captionKey } from "./flow-layout"

type Outcome = { status: AgentStatus; facts: string[]; ms?: number }

/** A step the recorded input has nothing for still runs, as a simulation. */
const SIMULATED_MS = 400

type TestRun = {
  nodes: AgentNodeType[]
  passed: number
  failed: number
  skipped: number
  unconnected: number
  /** The steps the run reached, in the order it reached them. */
  reached: string[]
  /** The caption of the first path the run chose at a fork. */
  path?: string
  /** What the reached steps took together. */
  ms: number
}

/** Every step back to not run, which is the state an edited agent is in. */
export function clearResults(nodes: AgentNodeType[]): AgentNodeType[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, facts: ["No test run yet"], status: "idle" },
  }))
}

/**
 * The path a run takes out of a step: the one captioned for the recorded
 * outcome, and the first declared path when no caption names it.
 */
export function pathTaken(out: AgentEdgeType[]): AgentEdgeType | undefined {
  return (
    out.find(
      (edge) =>
        captionKey(edge.data?.branchLabel) === captionKey(AGENT.testPath)
    ) ?? out[0]
  )
}

// A model step costs what its model costs, so switching models changes the
// numbers; any other step replays what the recorded input did there.
function outcomeOf(node: AgentNodeType): Outcome {
  const model =
    node.data.app === "claude"
      ? MODEL_OPTIONS.find((option) => option.value === node.data.title)
      : undefined
  const recording = RECORDED_RUN.get(node.id)

  if (model) {
    return {
      status: "passed",
      facts: model.facts,
      ms: recording?.ms ?? SIMULATED_MS,
    }
  }

  if (
    recording &&
    (node.data.app !== "claude" || recording.title === node.data.title)
  ) {
    return { ...recording }
  }

  // Nothing recorded for this step yet (a step added since): the run passes
  // through it as a simulation, the way the Workflow Editor's run does, and
  // says so on the card.
  return { status: "passed", facts: ["Simulated"], ms: SIMULATED_MS }
}

export function runTest(
  nodes: AgentNodeType[],
  edges: AgentEdgeType[]
): TestRun {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outcomes = new Map<string, Outcome>()
  const reached: string[] = []
  let path: string | undefined
  const childrenOf = (id: string) =>
    edges.filter((edge) => edge.source === id && byId.has(edge.target))

  const skipBelow = (id: string, facts: string[]) => {
    for (const edge of childrenOf(id)) {
      if (!outcomes.has(edge.target)) {
        outcomes.set(edge.target, { status: "skipped", facts })
        skipBelow(edge.target, facts)
      }
    }
  }

  const visit = (id: string) => {
    const node = byId.get(id)

    if (!node || outcomes.has(id)) {
      return
    }

    const outcome = outcomeOf(node)

    outcomes.set(id, outcome)
    reached.push(id)

    if (outcome.status === "failed") {
      skipBelow(id, ["Upstream failed"])
      return
    }

    const out = childrenOf(id)
    const taken = pathTaken(out)

    if (out.length > 1 && path === undefined) {
      path = taken?.data?.branchLabel
    }

    for (const edge of out) {
      if (edge === taken) {
        visit(edge.target)
      } else if (!outcomes.has(edge.target)) {
        outcomes.set(edge.target, {
          status: "skipped",
          facts: ["Branch not taken"],
        })
        skipBelow(edge.target, ["Upstream skipped"])
      }
    }
  }

  visit(ROOT_ID)

  const run: TestRun = {
    nodes: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    unconnected: 0,
    reached,
    path,
    ms: reached.reduce((sum, id) => sum + (outcomes.get(id)?.ms ?? 0), 0),
  }

  run.nodes = nodes.map((node) => {
    const outcome = outcomes.get(node.id)

    if (!outcome) {
      run.unconnected += 1
    } else if (outcome.status === "passed") {
      run.passed += 1
    } else if (outcome.status === "skipped") {
      run.skipped += 1
    } else if (outcome.status === "failed") {
      run.failed += 1
    }

    // A step no path reaches never ran, and says so rather than looking idle.
    return {
      ...node,
      data: {
        ...node.data,
        status: outcome?.status ?? "idle",
        facts: outcome?.facts ?? ["Not connected"],
      },
    }
  })

  return run
}
