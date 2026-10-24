import { type ReactNode } from "react"
import {
  ActivityIcon,
  Building2Icon,
  CreditCardIcon,
  PlayIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react"

// ── Types ──

export type SettingsPanelValue =
  | "general"
  | "members"
  | "billing"
  | "execution"
  | "ai-models"
  | "integrations"
  | "webhooks"
  | "audit-log"
  | "profile"
  | "security"

export type SelectOption<TValue extends string = string> = {
  value: TValue
  label: string
  description: string
}

export type SettingsItem = {
  value: SettingsPanelValue
  label: string
  icon: ReactNode
}

export type SettingsSection = {
  id: string
  label: string
  items: SettingsItem[]
}

// ── Sections ──
// One route per item (/settings/<value>); the shell's section panel lists
// them, so the order here is the order there.

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        value: "general",
        label: "General",
        icon: <SettingsIcon aria-hidden="true" />,
      },
      {
        value: "members",
        label: "Members",
        icon: <UsersIcon aria-hidden="true" />,
      },
      {
        value: "billing",
        label: "Billing",
        icon: <CreditCardIcon aria-hidden="true" />,
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      {
        value: "execution",
        label: "Execution",
        icon: <PlayIcon aria-hidden="true" />,
      },
      {
        value: "ai-models",
        label: "AI Models",
        icon: <SparklesIcon aria-hidden="true" />,
      },
      {
        value: "integrations",
        label: "Integrations",
        icon: <PuzzleIcon aria-hidden="true" />,
      },
    ],
  },
  {
    id: "developers",
    label: "Developers",
    items: [
      {
        value: "webhooks",
        label: "Webhooks",
        icon: <WebhookIcon aria-hidden="true" />,
      },
      {
        value: "audit-log",
        label: "Audit Log",
        icon: <ScrollTextIcon aria-hidden="true" />,
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        value: "profile",
        label: "Profile",
        icon: <UserRoundIcon aria-hidden="true" />,
      },
      {
        value: "security",
        label: "Security",
        icon: <ShieldCheckIcon aria-hidden="true" />,
      },
    ],
  },
]

export const SETTINGS_ITEMS = SETTINGS_SECTIONS.flatMap((s) => s.items)

export function getSettingsItem(value: string) {
  return SETTINGS_ITEMS.find((item) => item.value === value)
}

// ── Section status ──
// The section panel's footer: one status card per section, swapped as the
// route changes. Execution has two, since its header action pauses runs.

export type SectionStatus = {
  icon: ReactNode
  /** Tints the icon, the badge and the meter alike */
  tone: "success" | "primary" | "warning" | "info"
  title: string
  badge: string
  text: string
  /** A usage meter, 0 to 100 */
  progress?: number
}

/** The cards with nothing live to count; Members, Integrations, Webhooks
 *  and Execution are worked out from their records (live-status.tsx). */
export const SECTION_STATUS: Record<
  Exclude<
    SettingsPanelValue,
    "execution" | "members" | "integrations" | "webhooks"
  >,
  SectionStatus
> = {
  general: {
    icon: <Building2Icon aria-hidden="true" />,
    tone: "primary",
    title: "Flowly Labs",
    badge: "Pro",
    text: "app.flowly.dev/flowly-labs. Schedules run on UTC.",
  },
  billing: {
    icon: <CreditCardIcon aria-hidden="true" />,
    tone: "info",
    title: "Next Invoice",
    badge: "Oct 31",
    text: "$249.00 charged to Visa ending 4242.",
  },
  "ai-models": {
    icon: <SparklesIcon aria-hidden="true" />,
    tone: "warning",
    title: "Model Budget",
    badge: "$40",
    text: "68% spent. Resets Nov 1, then agents fall back past the cap.",
    progress: 68,
  },
  "audit-log": {
    icon: <ScrollTextIcon aria-hidden="true" />,
    tone: "info",
    title: "Audit Trail",
    badge: "1,284",
    text: "Kept for 1 year. Last export on Sep 30.",
  },
  profile: {
    icon: <UserRoundIcon aria-hidden="true" />,
    tone: "success",
    title: "Profile",
    badge: "Complete",
    text: "Name, email, username and timezone are set.",
    progress: 100,
  },
  security: {
    icon: <ShieldCheckIcon aria-hidden="true" />,
    tone: "success",
    title: "Security Status",
    badge: "Healthy",
    text: "All checks passed. 2FA enabled, sessions reviewed.",
  },
}

export const EXECUTION_STATUS: Record<"running" | "paused", SectionStatus> = {
  running: {
    icon: <ActivityIcon aria-hidden="true" />,
    tone: "success",
    title: "Run Queue",
    badge: "Running",
    text: "38 of 50 run slots busy, 4 queued.",
    progress: 76,
  },
  paused: {
    icon: <ActivityIcon aria-hidden="true" />,
    tone: "warning",
    title: "Run Queue",
    badge: "Paused",
    text: "New runs wait in the queue until you resume.",
  },
}

// ── Defaults ──

export const DEFAULT_SETTINGS_VALUES = {
  workspaceSlug: "flowly-labs",
  email: "nick@reui.io",
  billingEmail: "billing@flowly.dev",
  taxId: "US-84-3921048",
  monthlyRunCap: "250000",
  tokenBudget: "40",
}

// ── Options ──

export const BILLING_CYCLE_OPTIONS: SelectOption[] = [
  { value: "monthly", label: "Monthly", description: "Charge every month." },
  { value: "annual", label: "Annual", description: "Charge once per year." },
  {
    value: "manual",
    label: "Manual Invoice",
    description: "Finance-owned invoice review.",
  },
]

export const STEP_TIMEOUT_OPTIONS: SelectOption[] = [
  {
    value: "30s",
    label: "30 Seconds",
    description: "Fast API and data steps.",
  },
  { value: "5m", label: "5 Minutes", description: "Room for agent reasoning." },
  {
    value: "30m",
    label: "30 Minutes",
    description: "Long exports and batch jobs.",
  },
]

export const RETRY_OPTIONS: SelectOption[] = [
  {
    value: "exponential",
    label: "Exponential Backoff",
    description: "3 retries, doubling the wait each time.",
  },
  {
    value: "fixed",
    label: "Fixed Interval",
    description: "3 retries, one minute apart.",
  },
  { value: "off", label: "No Retries", description: "Fail the run at once." },
]

export const CONCURRENCY_OPTIONS: SelectOption[] = [
  {
    value: "10",
    label: "10 Runs",
    description: "Gentle on rate-limited APIs.",
  },
  { value: "50", label: "50 Runs", description: "Recommended for most teams." },
  {
    value: "200",
    label: "200 Runs",
    description: "High-volume event processing.",
  },
]

export const MODEL_OPTIONS: SelectOption[] = [
  {
    value: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Balanced speed and quality for most agents.",
  },
  {
    value: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "Deep reasoning for complex, multi-step tasks.",
  },
  {
    value: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Fastest and cheapest for routing and extraction.",
  },
]

export const CREATIVITY_OPTIONS: SelectOption[] = [
  {
    value: "precise",
    label: "Precise",
    description: "Deterministic answers for data steps.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Default for writing and triage.",
  },
  {
    value: "creative",
    label: "Creative",
    description: "Varied drafts and brainstorming.",
  },
]

export const AUDIT_RETENTION_OPTIONS: SelectOption[] = [
  {
    value: "90",
    label: "90 Days",
    description: "Short retention for lean workspaces.",
  },
  {
    value: "365",
    label: "1 Year",
    description: "Recommended compliance baseline.",
  },
  {
    value: "forever",
    label: "Indefinite",
    description: "Keep every workspace audit event.",
  },
]

export const VERIFICATION_OPTIONS: SelectOption[] = [
  {
    value: "otp",
    label: "Verification Code",
    description: "Send a one-time code to the email address.",
  },
  {
    value: "magic-link",
    label: "Magic Link",
    description: "Verify by opening a secure email link.",
  },
  {
    value: "passwordless",
    label: "Passwordless First",
    description: "Prefer passkeys and code-based sign-in.",
  },
]

export const SESSION_DURATION_OPTIONS: SelectOption[] = [
  {
    value: "8h",
    label: "8 Hours",
    description: "Short-lived sessions for sensitive teams.",
  },
  {
    value: "24h",
    label: "24 Hours",
    description: "Standard session window for daily use.",
  },
  {
    value: "30d",
    label: "30 Days",
    description: "Trusted devices stay signed in longer.",
  },
]
