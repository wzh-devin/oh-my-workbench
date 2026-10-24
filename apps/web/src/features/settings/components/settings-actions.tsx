"use client"

import { useState, type ReactNode } from "react"
import {
  AlertCircleIcon,
  CircleCheckIcon,
  DownloadIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  LinkIcon,
  LogOutIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { DEFAULT_SETTINGS_VALUES, type SettingsPanelValue } from "./data"
import { membersStore, runsPausedStore, useStore } from "./settings-store"

// Each settings section puts its own action in the header, where every other
// section shows Publish. Members exports its table here, and Invite member
// stays on the table. Integrations and Webhooks put their Add buttons here
// themselves, since those open sheets their sections own.

const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

const TOAST_ERROR_ICON = (
  <AlertCircleIcon className="size-4 text-destructive" aria-hidden="true" />
)

/** A demo stand-in for the request a real backend would make. */
function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function copyToClipboard(text: string, onCopied: () => void) {
  const failed = () =>
    toast.error("Copy failed", {
      icon: TOAST_ERROR_ICON,
      description: "Clipboard access was blocked.",
    })

  // Clipboard access can be refused (an iframe, an insecure origin), so both paths answer.
  if (!navigator.clipboard) {
    failed()
    return
  }

  navigator.clipboard.writeText(text).then(onCopied, failed)
}

/**
 * The header's button, in the shape of the editors' Run once: an icon and a
 * label that steps out on a phone. While `onRun` is pending it shows a spinner.
 */
function HeaderActionButton({
  icon,
  label,
  busyLabel,
  onRun,
}: {
  icon: ReactNode
  label: string
  /** Shown while `onRun` is pending; actions that finish at once have none */
  busyLabel?: string
  onRun: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    const pending = onRun()

    if (!pending) {
      return
    }

    setBusy(true)
    await pending
    setBusy(false)
  }

  return (
    <Button type="button" disabled={busy} onClick={handleClick}>
      {busy ? <Spinner aria-hidden="true" /> : icon}
      <span className="sr-only sm:not-sr-only">
        {busy && busyLabel ? busyLabel : label}
      </span>
    </Button>
  )
}

// ── Actions ──

function ShareWorkspaceAction() {
  return (
    <HeaderActionButton
      icon={<LinkIcon aria-hidden="true" />}
      label="Share Workspace"
      onRun={() =>
        copyToClipboard(
          `https://app.flowly.dev/${DEFAULT_SETTINGS_VALUES.workspaceSlug}`,
          () =>
            toast.success("Workspace link copied", {
              icon: TOAST_SUCCESS_ICON,
              description: `app.flowly.dev/${DEFAULT_SETTINGS_VALUES.workspaceSlug}`,
            })
        )
      }
    />
  )
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

function ExportMembersAction() {
  return (
    <HeaderActionButton
      icon={<DownloadIcon aria-hidden="true" />}
      label="Export Members"
      onRun={() => {
        // The table's own records, so invites and access changes are in it.
        const members = membersStore.get()
        const rows = [
          ["Name", "Email", "Role", "Team", "Access", "Areas", "Status"],
          ...members.map((member) => [
            member.name,
            member.email,
            member.role,
            member.team,
            member.access,
            member.areas.join(" "),
            member.status,
          ]),
        ]
        const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n")
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" })
        )
        const link = document.createElement("a")
        link.href = url
        link.download = "flowly-labs-members.csv"
        link.click()
        URL.revokeObjectURL(url)
        toast.success("Members exported", {
          closeButton: true,
          icon: TOAST_SUCCESS_ICON,
          description: `${members.length} members in flowly-labs-members.csv.`,
        })
      }}
    />
  )
}

function DownloadInvoicesAction() {
  return (
    <HeaderActionButton
      icon={<DownloadIcon aria-hidden="true" />}
      label="Download Invoices"
      busyLabel="Preparing"
      onRun={async () => {
        await wait(900)
        toast.success("Invoices downloaded", {
          icon: TOAST_SUCCESS_ICON,
          description: "12 PDFs for the last 12 months.",
        })
      }}
    />
  )
}

function PauseRunsAction() {
  const paused = useStore(runsPausedStore)

  function setRuns(nextPaused: boolean) {
    runsPausedStore.set(nextPaused)
    toast.success(nextPaused ? "All runs paused" : "Runs resumed", {
      icon: TOAST_SUCCESS_ICON,
      description: nextPaused
        ? "New runs wait in the queue until you resume."
        : "Queued runs are starting now.",
      action: nextPaused
        ? { label: "Undo", onClick: () => runsPausedStore.set(false) }
        : undefined,
    })
  }

  return (
    <HeaderActionButton
      icon={
        paused ? (
          <PlayIcon aria-hidden="true" />
        ) : (
          <PauseIcon aria-hidden="true" />
        )
      }
      label={paused ? "Resume Runs" : "Pause All Runs"}
      onRun={() => setRuns(!paused)}
    />
  )
}

function TestModelAction() {
  return (
    <HeaderActionButton
      icon={<FlaskConicalIcon aria-hidden="true" />}
      label="Test Model"
      busyLabel="Testing"
      onRun={async () => {
        await wait(1200)
        toast.success("Model responded", {
          icon: TOAST_SUCCESS_ICON,
          description: "Claude Sonnet 5.5 replied in 412 ms, 38 tokens.",
        })
      }}
    />
  )
}

function ExportAuditLogAction() {
  return (
    <HeaderActionButton
      icon={<DownloadIcon aria-hidden="true" />}
      label="Export CSV"
      busyLabel="Exporting"
      onRun={async () => {
        await wait(900)
        toast.success("Audit log exported", {
          icon: TOAST_SUCCESS_ICON,
          description: "1,284 events from the last 90 days.",
        })
      }}
    />
  )
}

function ResetPasswordAction() {
  return (
    <HeaderActionButton
      icon={<KeyRoundIcon aria-hidden="true" />}
      label="Reset Password"
      busyLabel="Sending"
      onRun={async () => {
        await wait(900)
        toast.success("Reset link sent", {
          icon: TOAST_SUCCESS_ICON,
          description: `Check ${DEFAULT_SETTINGS_VALUES.email} to choose a new password.`,
        })
      }}
    />
  )
}

function SignOutEverywhereAction() {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" />}>
        <LogOutIcon aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Sign Out Everywhere</span>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign Out Everywhere?</AlertDialogTitle>
          <AlertDialogDescription>
            Every other browser and device signed in as you is signed out. This
            one stays signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              toast.success("Signed out everywhere else", {
                icon: TOAST_SUCCESS_ICON,
                description: "3 other sessions ended.",
              })
            }
          >
            Sign Out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const ACTIONS: Partial<Record<SettingsPanelValue, () => ReactNode>> = {
  general: ShareWorkspaceAction,
  members: ExportMembersAction,
  billing: DownloadInvoicesAction,
  execution: PauseRunsAction,
  "ai-models": TestModelAction,
  "audit-log": ExportAuditLogAction,
  profile: ResetPasswordAction,
  security: SignOutEverywhereAction,
}

export function SettingsHeaderActions({
  section,
}: {
  section: SettingsPanelValue
}) {
  const Action = ACTIONS[section]

  return Action ? (
    <HeaderActions>
      <Action />
    </HeaderActions>
  ) : null
}
