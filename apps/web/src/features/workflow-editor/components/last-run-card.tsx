"use client"

/**
 * The step library's footer: how the workflow last ran, in the shape of the
 * shell's status card (the one Settings keeps in its panel). It reads the
 * last live run from the steps' own facts until Run once is used, then
 * follows the test run step by step. A click opens what it is about: the
 * step that failed, on its Status tab, or the test run's logs.
 */
import { useNodes } from "@xyflow/react"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import { Progress } from "@/components/ui/progress"
import { type StepNodeType } from "./data"
import { useStepActions } from "./step-actions"
import { useTestRun } from "./test-run"
import { FlaskConicalIcon, HistoryIcon } from "lucide-react"

type Tone = "success" | "destructive" | "info"

// The tone tints the icon and the meter's fill alike, as in Settings.
const TONE: Record<Tone, string> = {
  success: "text-success **:data-[slot=progress-indicator]:bg-success",
  destructive:
    "text-destructive **:data-[slot=progress-indicator]:bg-destructive",
  info: "text-info **:data-[slot=progress-indicator]:bg-info",
}

const BADGE: Record<
  Tone,
  "success-light" | "destructive-light" | "info-light"
> = {
  success: "success-light",
  destructive: "destructive-light",
  info: "info-light",
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

export function LastRunCard() {
  const nodes = useNodes<StepNodeType>()
  const { inspect, setTab, showLogs } = useStepActions()
  const { run, planned, running, states, logs } = useTestRun()

  const total = nodes.length
  let card: {
    icon: React.ReactNode
    title: string
    tone: Tone
    badge: string
    text: string
    progress: number
    open?: () => void
  }

  if (run > 0) {
    const passed = Object.values(states).filter(
      (step) => step.state === "succeeded"
    ).length
    const current = nodes.find((node) => states[node.id]?.state === "running")
    const last = logs[0]?.nodeId

    card = {
      icon: <FlaskConicalIcon aria-hidden="true" />,
      title: `Test Run ${run}`,
      tone: running ? "info" : "success",
      badge: running ? "Running" : "Passed",
      text: running
        ? `Step ${Math.min(passed + 1, planned)} of ${planned}${
            current ? `: ${current.data.title}` : ""
          }.`
        : `${passed} of ${plural(total, "step")} passed.`,
      progress: planned > 0 ? Math.round((passed / planned) * 100) : 0,
      open: last && !running ? () => showLogs(last) : undefined,
    }
  } else {
    const passed = nodes.filter(
      (node) => node.data.status === "succeeded"
    ).length
    const failed = nodes.find((node) => node.data.status === "failed")

    card = {
      icon: <HistoryIcon aria-hidden="true" />,
      title: "Last Run",
      tone: failed ? "destructive" : "success",
      badge: failed ? "Failed" : "Success",
      text: failed ? `${failed.data.title} failed.` : "Every step passed.",
      progress: total > 0 ? Math.round((passed / total) * 100) : 0,
      open: failed
        ? () => {
            inspect(failed.id, "view")
            setTab("status")
          }
        : undefined,
    }
  }

  const body = (
    <>
      <div className="flex items-center gap-1">
        <span className="size-4 shrink-0 [&_svg]:size-4">{card.icon}</span>
        <p className="truncate text-xs font-medium text-foreground">
          {card.title}
        </p>
        <Badge variant={BADGE[card.tone]} className="ml-auto shrink-0">
          {card.badge}
        </Badge>
      </div>
      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
        {card.text}
      </p>
      <Progress
        value={card.progress}
        aria-label={`${card.title}: ${card.progress}%`}
        className="py-0.5"
      />
    </>
  )

  return (
    <div className="border-t border-border p-3">
      {/* A card with somewhere to go is a button; the padding it takes on
          is given back, so the text sits where Settings' card has it. Block,
          or the inline button sits on a line box and the footer grows by
          its descender. */}
      {card.open ? (
        <button
          type="button"
          onClick={card.open}
          className={cn(
            "-m-1.5 block w-[calc(100%+--spacing(3))] space-y-1.5 rounded-md p-1.5 text-start transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
            TONE[card.tone]
          )}
        >
          {body}
        </button>
      ) : (
        <div className={cn("space-y-1.5", TONE[card.tone])}>{body}</div>
      )}
    </div>
  )
}
