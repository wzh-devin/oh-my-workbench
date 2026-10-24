import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { type AgentRecord } from "./data"
import { UI_ICONS } from "./icons"
import { HintHeader } from "./section-header"
import {
  budgetOf,
  enabledOf,
  formatCount,
  MODEL_PROVIDER,
  money,
  plural,
  type AgentDetails,
} from "./sheet-data"

export type TestCheck = {
  label: string
  passed: string
  /** Set when this check fails in the demo. */
  failure?: string
}

/** The card's hint: what a test run reads, and that it stays dry. */
const AGENT_TEST_HINT =
  "Runs against the saved model, tools and budget, and sends nothing"

const STEP_MS = 700

/** The four checks a test run makes, worded for the agent's model and tools. */
export function checksForAgent(
  agent: AgentRecord,
  details: AgentDetails
): TestCheck[] {
  const enabled = enabledOf(details)
  const failing = enabled.find((tool) => tool.failure)
  const budget = budgetOf(agent)
  const tokens = details.instructionTokens
  return [
    {
      label: `Reach ${MODEL_PROVIDER[agent.model]}`,
      passed: `${agent.model} answered in 182 ms`,
    },
    {
      label: "Authorize tools",
      passed:
        enabled.length > 0
          ? `${plural(enabled.length, "tool")} signed in as ${details.principal}`
          : `Signed in as ${details.principal}, no tools switched on`,
      failure: failing ? `${failing.failure} at ${failing.key}` : undefined,
    },
    // A soft cap, as the Overview says: sessions keep running over it.
    {
      label: "Check the budget",
      passed: `${money(budget.headroom)} of ${money(budget.budget)} left this month`,
      failure:
        budget.headroom > 0
          ? undefined
          : budget.budget > 0
            ? `Spent ${money(budget.spend)} of ${money(budget.budget)}; sessions keep running over it until you raise the budget`
            : `The budget is ${money(0)}, so every session runs over it`,
    },
    {
      label: "Load instructions",
      passed: `${formatCount(tokens)} tokens of instructions loaded`,
      failure:
        tokens > 0
          ? undefined
          : "No instructions yet, write them in the Builder",
    },
  ]
}

type Run = { seq: number; done: number }

/** A Test Agent button over the checks it runs, one after another;
 *  the first failure stops the run. */
export function AgentTest({ checks }: { checks: TestCheck[] }) {
  const [run, setRun] = useState<Run | null>(null)
  const failedAt =
    run === null
      ? -1
      : checks.findIndex(
          (check, index) => index < run.done && check.failure !== undefined
        )
  const finished = run !== null && (failedAt >= 0 || run.done >= checks.length)
  const running = run !== null && !finished

  useEffect(() => {
    if (!running || !run) return
    const timer = window.setTimeout(() => {
      setRun({ seq: run.seq, done: run.done + 1 })
    }, STEP_MS)
    return () => window.clearTimeout(timer)
  }, [running, run])

  function start() {
    setRun({ seq: (run?.seq ?? 0) + 1, done: 0 })
  }

  const passed = finished && failedAt < 0

  return (
    <Card className="min-w-0 gap-0 py-0">
      <HintHeader title="Test Run" hint={AGENT_TEST_HINT}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={running}
          onClick={start}
        >
          {running ? (
            <Spinner
              role="presentation"
              aria-label={undefined}
              aria-hidden="true"
            />
          ) : (
            UI_ICONS.plug
          )}
          {running ? "Testing" : run ? "Test Again" : "Test Agent"}
        </Button>
      </HintHeader>
      <CardContent className="py-4">
        <ol className="flex flex-col gap-2">
          {checks.map((check, index) => {
            const state =
              run === null
                ? "idle"
                : failedAt >= 0 && index > failedAt
                  ? "skipped"
                  : index < run.done
                    ? check.failure
                      ? "failed"
                      : "passed"
                    : index === run.done && running
                      ? "running"
                      : "idle"
            return (
              <li
                key={check.label}
                className="flex min-w-0 items-start gap-2.5"
              >
                <span
                  className={cn(
                    "flex h-5 w-4 shrink-0 items-center justify-center [&_svg:not([class*=size-])]:size-4",
                    state === "passed" && "text-success",
                    state === "failed" && "text-destructive",
                    (state === "idle" || state === "skipped") &&
                      "text-muted-foreground/60"
                  )}
                >
                  {state === "running" ? (
                    <Spinner
                      role="presentation"
                      aria-label={undefined}
                      aria-hidden="true"
                    />
                  ) : state === "passed" ? (
                    UI_ICONS.passed
                  ) : state === "failed" ? (
                    UI_ICONS.failed
                  ) : (
                    UI_ICONS.pending
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      state === "skipped" && "text-muted-foreground"
                    )}
                  >
                    {check.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs text-pretty",
                      state === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {state === "passed"
                      ? check.passed
                      : state === "failed"
                        ? check.failure
                        : state === "skipped"
                          ? "Skipped after the failure above"
                          : state === "running"
                            ? "Checking..."
                            : "Not run yet"}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        <p role="status" className="sr-only">
          {running
            ? "Testing the agent"
            : finished
              ? passed
                ? "Test run passed"
                : "Test run failed"
              : ""}
        </p>
      </CardContent>
    </Card>
  )
}
