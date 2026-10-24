import { PuzzleIcon, UsersIcon, WebhookIcon } from "lucide-react"

import { type SectionStatus } from "./data"
import { type MemberRecord } from "./sections/data"
import {
  catalogEntry,
  isConnected,
  type IntegrationRecord,
} from "./sections/integrations-data"
import { type WebhookEndpoint } from "./sections/webhooks-data"

// The section panel's cards that count something, worked out from the
// records the sections edit, so an invite, a new connection or a paused
// endpoint shows in the footer the moment it happens.

/** Seats on the Pro plan; an invite takes one as soon as it is sent. */
export const PLAN_SEATS = 10

/** "Slack", "Slack and n8n", "Slack, n8n and Gmail" */
function listOf(names: string[]) {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

export function membersStatus(members: MemberRecord[]): SectionStatus {
  const used = members.length
  const left = Math.max(PLAN_SEATS - used, 0)
  const invited = members.filter((member) => member.status === "Invited").length

  return {
    icon: <UsersIcon aria-hidden="true" />,
    tone: left === 0 ? "warning" : "primary",
    title: "Seats",
    badge: `${used} of ${PLAN_SEATS}`,
    text:
      left === 0
        ? "Every seat is taken. Remove someone or upgrade to invite more."
        : `${plural(left, "seat")} left on the Pro plan${invited > 0 ? `, ${invited} invited` : ""}.`,
    progress: Math.min(Math.round((used / PLAN_SEATS) * 100), 100),
  }
}

export function integrationsStatus(
  records: IntegrationRecord[]
): SectionStatus {
  const connected = records.filter((record) => isConnected(record.status))
  const waiting = records
    .filter((record) => !isConnected(record.status))
    .map((record) => catalogEntry(record.catalogId).name)
  const paused = records
    .filter((record) => record.status === "paused")
    .map((record) => catalogEntry(record.catalogId).name)

  const text =
    records.length === 0
      ? "Nothing connected yet. Add an integration to use it in runs."
      : waiting.length > 0
        ? `${listOf(waiting)} ${waiting.length === 1 ? "is" : "are"} not connected yet.`
        : paused.length > 0
          ? `${listOf(paused)} ${paused.length === 1 ? "is" : "are"} paused.`
          : "Every integration is connected and syncing."

  return {
    icon: <PuzzleIcon aria-hidden="true" />,
    tone: paused.length > 0 ? "warning" : "info",
    title: "Integrations",
    badge: `${connected.length} of ${records.length}`,
    text,
    progress:
      records.length > 0
        ? Math.round((connected.length / records.length) * 100)
        : 0,
  }
}

export function webhooksStatus(endpoints: WebhookEndpoint[]): SectionStatus {
  const active = endpoints.filter((endpoint) => endpoint.status !== "paused")
  const retrying = endpoints.filter(
    (endpoint) => endpoint.status === "retrying"
  )
  const paused = endpoints.length - active.length
  // Delivered share across the endpoints still taking events.
  const rate =
    active.length > 0
      ? Math.round(
          (active.reduce((sum, endpoint) => sum + endpoint.successRate, 0) /
            active.length) *
            10
        ) / 10
      : null

  const parts = [
    retrying.length > 0
      ? `${plural(retrying.length, "endpoint")} retrying`
      : `${active.length} of ${plural(endpoints.length, "endpoint")} delivering`,
    paused > 0 ? `${paused} paused` : null,
  ].filter(Boolean)

  return {
    icon: <WebhookIcon aria-hidden="true" />,
    tone: endpoints.length === 0 || retrying.length > 0 ? "warning" : "success",
    title: "Delivery Health",
    badge: rate === null ? "None" : `${rate}%`,
    text:
      endpoints.length === 0
        ? "No endpoints yet. Add one to receive run events."
        : `${parts.join(", ")}.`,
  }
}
