import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  PlugIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { HintCard } from "./sheet-parts"

// The connection test, on Card: a Test button over the checks it runs one
// after another; the first failure stops it.

export type TestCheck = {
  label: string
  passed: string
  /** Set when this check fails in the demo */
  failure?: string
}

const STEP_MS = 700

type Run = { seq: number; done: number }

export function ConnectionTest({
  checks,
  onResult,
  disabled = false,
  title = "Connection Test",
  description = "Network, sign in and access",
}: {
  checks: TestCheck[]
  onResult?: (passed: boolean) => void
  disabled?: boolean
  title?: string
  description?: string
}) {
  const [run, setRun] = useState<Run | null>(null)
  // Read by the step timer, so a parent re-render never restarts a step.
  const latest = useRef({ checks, onResult })
  useEffect(() => {
    latest.current = { checks, onResult }
  })
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
      const { checks: current, onResult: report } = latest.current
      const done = run.done + 1
      setRun({ seq: run.seq, done })
      const failed = current
        .slice(0, done)
        .some((check) => check.failure !== undefined)
      if (failed || done >= current.length) report?.(!failed)
    }, STEP_MS)
    return () => window.clearTimeout(timer)
  }, [running, run])

  const passed = finished && failedAt < 0

  return (
    <HintCard
      title={title}
      hint={description}
      action={
        <Button
          type="button"
          variant="outline"
          disabled={disabled || running}
          onClick={() => setRun({ seq: (run?.seq ?? 0) + 1, done: 0 })}
        >
          {running ? (
            <Spinner aria-hidden="true" />
          ) : (
            <PlugIcon aria-hidden="true" />
          )}
          {running ? "Testing" : run ? "Test Again" : "Test Connection"}
        </Button>
      }
    >
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
            <li key={check.label} className="flex min-w-0 items-start gap-2.5">
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
                  <Spinner aria-hidden="true" />
                ) : state === "passed" ? (
                  <CircleCheckIcon aria-hidden="true" />
                ) : state === "failed" ? (
                  <CircleXIcon aria-hidden="true" />
                ) : (
                  <CircleDashedIcon aria-hidden="true" />
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
          ? "Testing connection"
          : finished
            ? passed
              ? "Connection test passed"
              : "Connection test failed"
            : ""}
      </p>
    </HintCard>
  )
}
