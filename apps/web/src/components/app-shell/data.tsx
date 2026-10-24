import { type ReactNode } from "react"
import { SETTINGS_SECTIONS } from "@/features/settings/components/data"
import { CURRENT_USER, TEAM } from "@/lib/workspace/team"
import { SettingsSidebarFooter } from "@/features/settings/components/settings-sidebar-footer"
import {
  BotIcon,
  BrainCircuitIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  SplinePointerIcon,
  WorkflowIcon,
} from "lucide-react"

import { recordEditorHref } from "./record-link"

// ── Types ──

export type NavItem = {
  id: string
  label: string
  href: string
  icon: ReactNode
  /** The page puts its own actions in the header, in place of Publish */
  pageActions?: boolean
}

export type InnerNavItem = {
  id: string
  label: string
  icon: ReactNode
  /** A route of its own; the route then decides which item is active */
  href?: string
  isActive?: boolean
  badge?: number
}

export type InnerNavSection = {
  id: string
  title: string
  items: InnerNavItem[]
}

export type InnerNavData = {
  sections: InnerNavSection[]
  footer?: ReactNode
  /**
   * The page puts its own content in the panel, in place of `sections`. The
   * value is the panel's accessible name.
   */
  pagePanel?: string
}

export type NotificationType =
  | "mention"
  | "comment"
  | "share"
  | "invite"
  | "billing"
  | "security"
  | "feature"
  | "deployment"
  | "usage"
  | "system"
  | "task"
  | "approval"
  | "integration"
  | "achievement"
  | "feedback"
  | "team_join"
  | "reaction"
  | "review"
  | "event"

export type NotificationVariant = "info" | "success" | "warning" | "destructive"

type NotificationAction = {
  label: string
  variant?: "default" | "outline"
  /** Opens a page */
  href?: string
  /** Settles the notification: its actions give way to this badge, and a
   * toast with this title confirms it */
  resolve?: { badge: string; toast: string }
}

type NotificationAttachment = {
  name: string
  size: string
}

export type NotificationAvatar = {
  src: string
  fallback: string
}

type NotificationMeta = {
  label: string
  value: string
  color?: string
}

export type Notification = {
  id: string
  type: NotificationType
  variant?: NotificationVariant
  title: string
  body?: string
  time: string
  unread?: boolean
  /** The page a click on the notification opens */
  href?: string
  /** Set once an action settles it (Approved, Retried) */
  resolved?: string
  avatar?: NotificationAvatar
  username?: string
  link?: string
  badge?: string
  actions?: NotificationAction[]
  attachment?: NotificationAttachment
  meta?: NotificationMeta
  progress?: number
  progressVariant?: "default" | "success"
  avatarGroup?: NotificationAvatar[]
  avatarGroupCount?: number
  rating?: number
  eventDate?: string
  eventTime?: string
}

// ── Data ──

// The signed-in user, from the workspace team (lib/workspace/team.ts).
export const USER = {
  name: CURRENT_USER.name,
  email: CURRENT_USER.email,
  initials: CURRENT_USER.initials,
  avatar: CURRENT_USER.avatarSrc,
} as const

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboardIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "workflow-editor",
    label: "Workflow Editor",
    href: "/workflow-editor",
    icon: <SplinePointerIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "agent-builder",
    label: "AI Agent Builder",
    href: "/agent-builder",
    icon: <BotIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "workflows",
    label: "Workflows",
    href: "/workflows",
    icon: <WorkflowIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "agents",
    label: "Agents",
    href: "/agents",
    icon: <BrainCircuitIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: <SettingsIcon aria-hidden="true" />,
    pageActions: true,
  },
]

// Placeholder navigation for each section until its sub-pages exist: the
// items switch the inner sidebar's active state but do not route anywhere.
export const INNER_NAV: Record<string, InnerNavData> = {
  // The editor owns its panel: the page portals its step library into the
  // slot the shell renders here (see inner-panel.tsx), so the list can reach
  // the canvas it drops onto.
  "workflow-editor": {
    sections: [],
    pagePanel: "Step library",
  },
  // The builder owns its panel too, for its step library.
  "agent-builder": {
    sections: [],
    pagePanel: "Step library",
  },
  // Each item is a route of its own (/settings/<section>).
  settings: {
    sections: SETTINGS_SECTIONS.map((section) => ({
      id: section.id,
      title: section.label,
      items: section.items.map((item) => ({
        id: item.value,
        label: item.label,
        icon: item.icon,
        href: `/settings/${item.value}`,
      })),
    })),
    // A status card for the open section, swapped as the route changes.
    footer: <SettingsSidebarFooter />,
  },
}

// ── Notifications Data ──
// What a Flowly workspace hears about: runs, agents waiting on a person,
// spend, deliveries and the team. Every row opens the page it is about.

const AVATARS = {
  ines: { src: TEAM.ines.avatarSrc, fallback: TEAM.ines.initials },
  omar: { src: TEAM.omar.avatarSrc, fallback: TEAM.omar.initials },
  emma: {
    src: "https://images.unsplash.com/photo-1485893086445-ed75865251e0?w=96&h=96&dpr=2&q=80",
    fallback: "EW",
  },
  mike: {
    src: "https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=96&h=96&dpr=2&q=80",
    fallback: "MR",
  },
  james: {
    src: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=96&h=96&dpr=2&q=80",
    fallback: "JP",
  },
} satisfies Record<string, NotificationAvatar>

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n-approval",
    type: "approval",
    variant: "warning",
    title: "Agent needs approval",
    body: "Support Triage Agent wants to refund $120 on order #4821.",
    time: "2m ago",
    unread: true,
    href: "/agents?open=agt_7f2k9q",
    actions: [
      {
        label: "Approve",
        variant: "default",
        resolve: { badge: "Approved", toast: "Refund approved" },
      },
      { label: "Review", variant: "outline", href: "/agents?open=agt_7f2k9q" },
    ],
    meta: { label: "Priority", value: "High", color: "text-warning" },
  },
  {
    id: "n-run-failed",
    type: "system",
    variant: "destructive",
    title: "Run failed",
    body: "Support Triage: the Zendesk step timed out after 30 s.",
    time: "8m ago",
    unread: true,
    href: "/workflows?open=wf_5n1q3r",
    actions: [
      {
        label: "Retry Run",
        variant: "default",
        resolve: { badge: "Retried", toast: "Run restarted" },
      },
      {
        label: "Open Workflow",
        variant: "outline",
        href: recordEditorHref("workflow", {
          id: "wf_5n1q3r",
          name: "Support Triage",
        }),
      },
    ],
    meta: { label: "Attempt", value: "3 of 3", color: "text-destructive" },
  },
  {
    id: "n-budget",
    type: "usage",
    variant: "warning",
    title: "Model budget at 80%",
    body: "$32 of $40 spent this month. Agents fall back past the cap.",
    time: "25m ago",
    unread: true,
    href: "/settings/ai-models",
    progress: 80,
  },
  {
    id: "n-mention",
    type: "mention",
    title: "mentioned you in",
    body: '"Can you check the Slack step before we publish?"',
    time: "40m ago",
    unread: true,
    avatar: AVATARS.ines,
    username: "@ines",
    link: "Meeting Notes to CRM",
    href: "/workflows?open=wf_1p7r4s",
  },
  {
    id: "n-published",
    type: "deployment",
    variant: "success",
    title: "Workflow published",
    body: "Order Fulfillment v12 is live with 3 changed steps.",
    time: "1h ago",
    href: "/workflows?open=wf_6k5m1n",
    meta: { label: "Runs today", value: "214" },
  },
  {
    id: "n-export",
    type: "share",
    title: "shared a run export",
    time: "2h ago",
    avatar: AVATARS.omar,
    username: "@omar",
    href: "/workflows?open=wf_4d2f8g",
    attachment: { name: "warehouse-export-runs.csv", size: "184 KB" },
  },
  {
    id: "n-webhook",
    type: "integration",
    variant: "warning",
    title: "Webhook retrying",
    body: "hooks.acme.dev answered 503 twice. Next retry in 4 min.",
    time: "3h ago",
    href: "/settings/webhooks",
  },
  {
    id: "n-team",
    type: "team_join",
    variant: "success",
    title: "3 people joined Flowly Labs",
    body: "Emma, Mike and James can now build and run workflows.",
    time: "5h ago",
    href: "/settings/members",
    avatarGroup: [AVATARS.emma, AVATARS.mike, AVATARS.james],
  },
  {
    id: "n-sign-in",
    type: "security",
    variant: "info",
    title: "New sign-in",
    body: "Chrome on macOS in Tashkent. Not you? Sign out everywhere.",
    time: "Yesterday",
    href: "/settings/security",
  },
  {
    id: "n-feature",
    type: "feature",
    variant: "info",
    title: "New: agent memory",
    body: "Agents can now keep context between runs. Turn it on per agent.",
    time: "2 days ago",
    href: "/agents",
  },
]
