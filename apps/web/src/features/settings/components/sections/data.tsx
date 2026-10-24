"use client"

import { type ReactNode } from "react"

import { BotIcon, CreditCardIcon, PuzzleIcon, WorkflowIcon } from "lucide-react"

import {
  CURRENT_USER,
  TEAM_MEMBERS,
  type TeamMemberId,
} from "@/lib/workspace/team"

// ── Types ──

export type SelectOption = {
  value: string
  label: string
  description: string
}

export type TimezoneGroup = {
  value: string
  items: string[]
}

export type MemberAccess = "Owner" | "Admin" | "Editor" | "Viewer"

export type MemberStatus = "Active" | "Invited" | "Needs review"

export type MemberRecord = {
  id: string
  name: string
  email: string
  role: string
  team: string
  access: MemberAccess
  status: MemberStatus
  lastActive: string
  src: string
  initials: string
  /** The parts of the workspace this member can open */
  areas: MemberArea[]
}

export type MemberArea = "workflows" | "agents" | "billing" | "integrations"

export type MemberAccessScopeOption = {
  id: MemberArea
  title: string
  description: string
  icon: ReactNode
  checked: boolean
}

// ── Constants ──

// ── Data ──

export const LANGUAGE_OPTIONS: SelectOption[] = [
  {
    value: "en",
    label: "English",
    description: "Shared UI language",
  },
  {
    value: "de",
    label: "German",
    description: "Localized workspace copy",
  },
  {
    value: "fr",
    label: "French",
    description: "Regional customer team view",
  },
]

export const DATE_FORMAT_OPTIONS: SelectOption[] = [
  {
    value: "mdy",
    label: "MM/DD/YYYY",
    description: "Month first format",
  },
  {
    value: "dmy",
    label: "DD/MM/YYYY",
    description: "Day first format",
  },
  {
    value: "ymd",
    label: "YYYY/MM/DD",
    description: "Year first format",
  },
]

export const LANDING_VIEW_OPTIONS: SelectOption[] = [
  {
    value: "dashboard",
    label: "Dashboard",
    description: "Runs, spend and what needs you",
  },
  {
    value: "workflows",
    label: "Workflows",
    description: "Jump into the workflows you own",
  },
  {
    value: "agents",
    label: "Agents",
    description: "Start with your AI agents",
  },
]

export const ROLE_OPTIONS: SelectOption[] = [
  {
    value: "workspace-admin",
    label: "Workspace Admin",
    description: "Owns access, billing and agents",
  },
  {
    value: "automation-lead",
    label: "Automation Lead",
    description: "Builds and publishes workflows",
  },
  {
    value: "ops-lead",
    label: "Ops Lead",
    description: "Watches runs and approvals",
  },
]

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    value: "Americas",
    items: [
      "(GMT-8) San Francisco",
      "(GMT-6) Chicago",
      "(GMT-5) New York",
      "(GMT-3) Sao Paulo",
    ],
  },
  {
    value: "Europe",
    items: [
      "(GMT+0) London",
      "(GMT+1) Berlin",
      "(GMT+1) Amsterdam",
      "(GMT+2) Helsinki",
    ],
  },
  {
    value: "Asia Pacific",
    items: [
      "(GMT+5:30) Bengaluru",
      "(GMT+8) Singapore",
      "(GMT+9) Tokyo",
      "(GMT+11) Sydney",
    ],
  },
]

export const WORKSPACE_IDENTITY = {
  name: "Flowly Labs",
  domainPrefix: "app.flowly.dev",
  domainValue: "flowly-labs",
  profileName: CURRENT_USER.name,
  email: CURRENT_USER.email,
  avatarSrc: CURRENT_USER.avatarSrc,
  username: "nickbold",
}

export const INVITE_DOMAINS = [
  "flowly.dev",
  "labs.flowly.dev",
  "partners.flowly.dev",
]

// The workspace's people come from the one team every page reads; only
// their access, status and team are Settings' own.
const MEMBER_ACCESS: Record<
  TeamMemberId,
  Pick<MemberRecord, "access" | "status" | "team" | "lastActive">
> = {
  nick: {
    access: "Owner",
    status: "Active",
    team: "Platform",
    lastActive: "Active now",
  },
  ines: {
    access: "Admin",
    status: "Active",
    team: "Operations",
    lastActive: "12 min ago",
  },
  tomas: {
    access: "Editor",
    status: "Active",
    team: "Engineering",
    lastActive: "1 hour ago",
  },
  hanna: {
    access: "Editor",
    status: "Needs review",
    team: "Support",
    lastActive: "Today",
  },
  omar: {
    access: "Editor",
    status: "Active",
    team: "Data",
    lastActive: "Yesterday",
  },
  lena: {
    access: "Viewer",
    status: "Invited",
    team: "Finance",
    lastActive: "Invited 2 days ago",
  },
}

/** Owners and admins reach every area; the others start where they work. */
export const ALL_MEMBER_AREAS: MemberArea[] = [
  "workflows",
  "agents",
  "billing",
  "integrations",
]

const DEFAULT_AREAS: Record<MemberAccess, MemberArea[]> = {
  Owner: ALL_MEMBER_AREAS,
  Admin: ALL_MEMBER_AREAS,
  Editor: ["workflows", "agents"],
  Viewer: ["workflows"],
}

export const MEMBER_ACCESS_OPTIONS: {
  value: MemberAccess
  description: string
}[] = [
  { value: "Owner", description: "Everything, including billing and owners." },
  { value: "Admin", description: "Members, integrations and every workflow." },
  {
    value: "Editor",
    description: "Builds, runs and publishes in their areas.",
  },
  { value: "Viewer", description: "Sees runs and results, changes nothing." },
]

export const MEMBER_REVIEW_ITEMS: MemberRecord[] = TEAM_MEMBERS.map(
  (member) => ({
    id: member.id,
    name: member.name,
    email:
      member.id === CURRENT_USER.id
        ? CURRENT_USER.email
        : `${member.name.split(" ")[0].toLowerCase()}@flowly.dev`,
    role: member.role,
    src: member.avatarSrc,
    initials: member.initials,
    ...MEMBER_ACCESS[member.id],
    areas: DEFAULT_AREAS[MEMBER_ACCESS[member.id].access],
  })
)

export const MEMBER_ACCESS_SCOPE_OPTIONS: MemberAccessScopeOption[] = [
  {
    id: "workflows",
    title: "Workflows",
    description: "Build and run",
    icon: <WorkflowIcon aria-hidden="true" />,
    checked: true,
  },
  {
    id: "agents",
    title: "Agents",
    description: "Configure AI agents",
    icon: <BotIcon aria-hidden="true" />,
    checked: true,
  },
  {
    id: "billing",
    title: "Billing",
    description: "Plans and invoices",
    icon: <CreditCardIcon aria-hidden="true" />,
    checked: false,
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Connected tools",
    icon: <PuzzleIcon aria-hidden="true" />,
    checked: false,
  },
]
