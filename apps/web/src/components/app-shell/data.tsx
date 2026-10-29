import { type ReactNode } from "react"
import { SETTINGS_SECTIONS } from "@/features/settings/components/data"
import { CURRENT_USER } from "@/lib/workspace/team"
import {
  BotIcon,
  BrainCircuitIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  SplinePointerIcon,
  WorkflowIcon,
  ListTodoIcon,
  MailIcon,
  FilesIcon,
} from "lucide-react"

// ── Types ──

export type NavItem = {
  id: string
  label: string
  href: string
  icon: ReactNode
  /** The page puts its own actions in the header, in place of Publish */
  pageActions?: boolean
  hidden?: boolean
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
  action?: ReactNode
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
    id: "todos",
    label: "Todo",
    href: "/todos",
    icon: <ListTodoIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "mail",
    label: "邮箱",
    href: "/mail",
    icon: <MailIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "assets",
    label: "资产",
    href: "/assets",
    icon: <FilesIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "workflow-editor",
    hidden: true,
    label: "Workflow Editor",
    href: "/workflow-editor",
    icon: <SplinePointerIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "agent-builder",
    hidden: true,
    label: "AI Agent Builder",
    href: "/agent-builder",
    icon: <BotIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "workflows",
    label: "Workflow 总览",
    href: "/workflows",
    icon: <WorkflowIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "agents",
    hidden: true,
    label: "Agents",
    href: "/agents",
    icon: <BrainCircuitIcon aria-hidden="true" />,
    pageActions: true,
  },
  {
    id: "settings",
    label: "设置",
    href: "/settings",
    icon: <SettingsIcon aria-hidden="true" />,
    pageActions: true,
  },
]

// Each section uses the shared inner sidebar or supplies its own panel.
export const INNER_NAV: Record<string, InnerNavData> = {
  todos: { sections: [], pagePanel: "待办清单" },
  mail: { sections: [], pagePanel: "邮箱分类" },
  assets: { sections: [], pagePanel: "资产分类" },
  workflows: { sections: [], pagePanel: "资源分类" },
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
  },
}
