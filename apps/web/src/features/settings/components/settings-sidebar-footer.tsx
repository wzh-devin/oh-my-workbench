"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { useLocation } from "react-router"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import { Progress } from "@/components/ui/progress"

import {
  EXECUTION_STATUS,
  getSettingsItem,
  SECTION_STATUS,
  type SectionStatus,
} from "./data"
import {
  integrationsStatus,
  membersStatus,
  webhooksStatus,
} from "./live-status"
import {
  integrationsStore,
  membersStore,
  runsPausedStore,
  useStore,
  webhooksStore,
} from "./settings-store"

// The settings panel's footer: a status card for the open section, in the
// shape of the shell's Security Status card it replaces.
//
// A card without a meter reserves two lines of text and the meter's row, so
// those cards share one height. A card with a meter keeps it right under its
// text, with no spare line between them, so it is a line shorter.

// The tone tints the icon, the badge and the meter's fill alike, as the
// editors' Last Run card does.
const TONE: Record<SectionStatus["tone"], string> = {
  success: "text-success **:data-[slot=progress-indicator]:bg-success",
  primary: "text-primary **:data-[slot=progress-indicator]:bg-primary",
  warning: "text-warning **:data-[slot=progress-indicator]:bg-warning",
  info: "text-info **:data-[slot=progress-indicator]:bg-info",
}

const BADGE = {
  success: "success-light",
  primary: "primary-light",
  warning: "warning-light",
  info: "info-light",
} as const satisfies Record<SectionStatus["tone"], string>

/** The outgoing card's fade, animation-duration-150 below. */
const LEAVE_MS = 150

function StatusCard({
  status,
  className,
  ...props
}: { status: SectionStatus } & ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 space-y-1.5",
        TONE[status.tone],
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1">
        <span className="size-4 shrink-0 [&_svg]:size-4">{status.icon}</span>
        <p className="truncate text-xs font-medium text-foreground">
          {status.title}
        </p>
        <Badge variant={BADGE[status.tone]} className="ml-auto shrink-0">
          {status.badge}
        </Badge>
      </div>
      <p
        className={cn(
          "line-clamp-2 text-xs leading-snug text-muted-foreground",
          status.progress === undefined && "min-h-[2lh]"
        )}
      >
        {status.text}
      </p>
      {/* The meter's row stays when there is no meter, so heights match;
          it sits last, where the spare room reads as the panel's edge. */}
      {status.progress !== undefined ? (
        <Progress
          value={status.progress}
          aria-label={`${status.title}: ${status.progress}%`}
          className="py-0.5"
        />
      ) : (
        <div aria-hidden="true" className="h-2" />
      )}
    </div>
  )
}

export function SettingsSidebarFooter() {
  const { pathname } = useLocation()
  const paused = useStore(runsPausedStore)
  const members = useStore(membersStore)
  const integrations = useStore(integrationsStore)
  const webhooks = useStore(webhooksStore)

  /** One id per card: a section, or Execution with its run state. The
   *  counting cards follow their records as they change. */
  function statusFor(cardId: string): SectionStatus | undefined {
    if (cardId === "execution:running") return EXECUTION_STATUS.running
    if (cardId === "execution:paused") return EXECUTION_STATUS.paused
    if (cardId === "members") return membersStatus(members)
    if (cardId === "integrations") return integrationsStatus(integrations)
    if (cardId === "webhooks") return webhooksStatus(webhooks)
    return SECTION_STATUS[cardId as keyof typeof SECTION_STATUS]
  }
  const section = getSettingsItem(pathname.split("/")[2] ?? "")?.value
  const id =
    section === "execution"
      ? `execution:${paused ? "paused" : "running"}`
      : (section ?? "")

  const [shown, setShown] = useState(id)
  const [leaving, setLeaving] = useState<string | null>(null)
  // The card the page loads on is simply there; only a switch animates.
  const [switched, setSwitched] = useState(false)

  // A new card arrives. Moving to another section is a route change, and
  // the card swaps at once like the rest of the page; only a change on the
  // same page (Execution paused or resumed) fades the old card out. Set
  // during render, so the two never miss a frame together.
  if (id !== shown) {
    const samePage = id.split(":")[0] === shown.split(":")[0]
    setLeaving(samePage ? shown : null)
    setShown(id)
    setSwitched(samePage)
  }

  // The outgoing card goes once its fade is over. A timer, not
  // animationend: a hidden tab never fires that, and the old card would stay.
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const status = statusFor(shown)
  const leavingStatus = leaving ? statusFor(leaving) : undefined

  if (!status) {
    return null
  }

  return (
    <div className="grid border-t border-border p-3">
      {leavingStatus ? (
        <StatusCard
          key={leaving}
          status={leavingStatus}
          aria-hidden="true"
          inert
          // Under reduced motion nothing fades: the old card is just gone.
          className="pointer-events-none ease-[cubic-bezier(0.22,1,0.36,1)] animation-duration-150 fill-mode-forwards motion-safe:animate-out motion-safe:fade-out-0 motion-reduce:hidden"
        />
      ) : null}
      <StatusCard
        key={shown}
        status={status}
        className={cn(
          switched &&
            "ease-[cubic-bezier(0.22,1,0.36,1)] animation-duration-200 motion-safe:animate-in motion-safe:fade-in-0"
        )}
      />
    </div>
  )
}
