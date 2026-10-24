"use client"

import { Suspense, useCallback, useState } from "react"
import { useNavigate } from "react-router"
import {
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { recordEditorHref } from "@/components/app-shell/record-link"
import {
  RecordRequestListener,
  useClearRecordRequest,
  type RecordRequest,
} from "@/components/workspace/record-request"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { toAgentFormValues } from "./agent-form-fields"
import { type AgentSheetFormValues } from "./agent-schema"
import {
  AgentSheet,
  type AgentSheetMode,
  type AgentSheetState,
} from "./agent-sheet"
import {
  agentsToCsv,
  createAgent,
  createAgentId,
  deleteAgent,
  duplicateAgent,
  recordAgentSession,
  setAgentStatus,
  todayIso,
  updateAgent,
} from "./agents-lib"
import { type AgentRowAction } from "./columns"
import { AgentsDataGridView } from "./data-grid-view"
import { type AgentRecord, type AgentStatus } from "./data"
import { TOAST_SUCCESS_ICON } from "./icons"
import { formatDuration, plural, type AgentSession } from "./sheet-data"

/**
 * Flowly Agents: every AI agent in the workspace, on the ReUI
 * solution-ai-ops-3 grid. Records are created, viewed and edited in the
 * sheet-22 drawer; tools and instructions are built in the Agent Builder.
 */
export function Agents() {
  const navigate = useNavigate()
  const { agents, setAgents } = useWorkspace()
  const [sheet, setSheet] = useState<AgentSheetState>({
    open: false,
    mode: "create",
    agent: null,
  })
  const [pendingDelete, setPendingDelete] = useState<{
    open: boolean
    agent: AgentRecord | null
  }>({ open: false, agent: null })

  const openSheet = useCallback(
    (mode: AgentSheetMode, agent: AgentRecord | null) =>
      setSheet({ open: true, mode, agent }),
    []
  )

  // A link from another page: a notification opens one agent, the
  // Dashboard's Add Agent opens the create sheet.
  const clearRequest = useClearRecordRequest()
  const closeSheet = useCallback(() => {
    setSheet((current) => ({ ...current, open: false }))
    clearRequest()
  }, [clearRequest])

  const handleRequest = useCallback(
    (request: RecordRequest) => {
      if (request.kind === "create") {
        openSheet("create", null)
        return
      }
      const agent = agents.find((item) => item.id === request.id)
      if (agent) {
        openSheet("view", agent)
        return
      }
      clearRequest()
      toast.error("Agent not found", {
        description: "It may have been deleted.",
        closeButton: true,
      })
    },
    [agents, clearRequest, openSheet]
  )

  const openInBuilder = useCallback(
    (agent: AgentRecord) => navigate(recordEditorHref("agent", agent)),
    [navigate]
  )

  const handleStatusChange = useCallback(
    (agent: AgentRecord, status: AgentStatus) => {
      setAgents((current) => setAgentStatus(current, agent.id, status))
      // Resume returns the status Pause interrupted, so it says which.
      const descriptions: Record<AgentStatus, string> = {
        Paused: `${agent.name} takes no sessions until you resume it.`,
        Live: `${agent.name} takes sessions again.`,
        Draft: `${agent.name} is a draft again and takes test runs only.`,
        Error: `${agent.name} takes sessions again; they hand off to a person until a test run passes.`,
      }
      toast.success(status === "Paused" ? "Agent paused" : "Agent resumed", {
        description: descriptions[status],
        icon: TOAST_SUCCESS_ICON,
        closeButton: true,
      })
    },
    [setAgents]
  )

  const handleDuplicate = useCallback(
    (agent: AgentRecord, { openCopy = false } = {}) => {
      const result = duplicateAgent(agents, agent.id, {
        id: createAgentId(),
        today: todayIso(),
      })
      if (!result.agent) return null
      setAgents(result.agents)
      // From the drawer, the copy opens on Settings to be renamed.
      if (openCopy) openSheet("edit", result.agent)
      toast.success("Agent duplicated", {
        description: `${result.agent.name} is saved as a draft.`,
        icon: TOAST_SUCCESS_ICON,
        closeButton: true,
      })
      return result.agent
    },
    [agents, openSheet, setAgents]
  )

  const requestDelete = useCallback((agent: AgentRecord) => {
    setPendingDelete({ open: true, agent })
  }, [])

  const handleAction = useCallback(
    (action: AgentRowAction, agent: AgentRecord) => {
      switch (action) {
        case "view":
        case "edit":
          openSheet(action, agent)
          return
        case "builder":
          openInBuilder(agent)
          return
        case "duplicate":
          handleDuplicate(agent)
          return
        case "copy":
          navigator.clipboard
            .writeText(agent.id)
            .then(() =>
              toast.success("Agent ID copied", {
                description: agent.id,
                icon: TOAST_SUCCESS_ICON,
                closeButton: true,
              })
            )
            .catch(() =>
              toast.error("Could not copy the ID", {
                description: "Your browser blocked clipboard access.",
                closeButton: true,
              })
            )
          return
        case "delete":
          requestDelete(agent)
          return
      }
    },
    [handleDuplicate, openInBuilder, openSheet, requestDelete]
  )

  function handleSubmit(
    values: AgentSheetFormValues,
    agent: AgentRecord | null
  ): AgentRecord | void {
    const today = todayIso()

    if (agent) {
      // The drawer stays open on the saved record, as the block keeps it.
      setAgents((current) =>
        updateAgent(current, agent.id, toAgentFormValues(values, agent), today)
      )
      toast.success("Agent saved", {
        description: `${values.name.trim()} is up to date.`,
        icon: TOAST_SUCCESS_ICON,
        closeButton: true,
      })
      return
    }

    const result = createAgent(agents, toAgentFormValues(values, null), {
      id: createAgentId(),
      today,
    })
    setAgents(result.agents)
    closeSheet()
    toast.success("Agent created", {
      description: `${result.agent.name} is saved as a draft.`,
      icon: TOAST_SUCCESS_ICON,
      closeButton: true,
      action: {
        label: "Open Builder",
        onClick: () => openInBuilder(result.agent),
      },
    })
    return result.agent
  }

  function handleRunComplete(agent: AgentRecord, session: AgentSession) {
    setAgents((current) => recordAgentSession(current, agent.id, session))
    toast.success("Test session finished", {
      description: `${agent.name} resolved the test session in ${plural(session.turns, "turn")} and ${formatDuration(session.durationSec)}.`,
      icon: TOAST_SUCCESS_ICON,
      closeButton: true,
    })
  }

  function handleConfirmDelete() {
    const agent = pendingDelete.agent
    if (!agent) return

    setAgents((current) => deleteAgent(current, agent.id))
    setPendingDelete((current) => ({ ...current, open: false }))
    // The sheet may be showing the agent that just went away.
    if (sheet.agent?.id === agent.id) closeSheet()
    toast.success("Agent deleted", {
      description: `${agent.name} no longer takes sessions.`,
      icon: TOAST_SUCCESS_ICON,
      closeButton: true,
    })
  }

  function handleExport() {
    const blob = new Blob([agentsToCsv(agents)], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "agents.csv"
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Agents exported", {
      description: `${agents.length} ${agents.length === 1 ? "agent" : "agents"} in agents.csv`,
      icon: TOAST_SUCCESS_ICON,
      closeButton: true,
    })
  }

  return (
    <div className="-m-4 flex flex-1 flex-col">
      <Suspense fallback={null}>
        <RecordRequestListener onRequest={handleRequest} />
      </Suspense>

      <HeaderActions>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" onClick={() => openSheet("create", null)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only md:not-sr-only">New agent</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="More options" />
              }
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={7} align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={handleExport}>
                  <DownloadIcon aria-hidden="true" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/settings/ai-models")}
                >
                  <SettingsIcon aria-hidden="true" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </HeaderActions>

      <section
        className="flex w-full flex-1 flex-col gap-4 p-4"
        aria-labelledby="page-heading"
      >
        <h1 id="page-heading" className="sr-only">
          Agents
        </h1>

        <AgentsDataGridView agents={agents} onAction={handleAction} />
      </section>

      <AgentSheet
        state={sheet}
        agents={agents}
        onOpenChange={(open) => {
          setSheet((current) => ({ ...current, open }))
          if (!open) clearRequest()
        }}
        onSubmit={handleSubmit}
        onStatusChange={handleStatusChange}
        onRunComplete={handleRunComplete}
        onOpenInBuilder={openInBuilder}
        onDuplicate={(agent) => handleDuplicate(agent, { openCopy: true })}
        onDelete={(agent) => {
          // The drawer closes first, then the confirm opens and owns focus.
          closeSheet()
          requestDelete(agent)
        }}
      />

      <AlertDialog
        open={pendingDelete.open}
        onOpenChange={(open) =>
          setPendingDelete((current) => ({ ...current, open }))
        }
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete.agent?.name ?? "This agent"} stops taking sessions
              and is removed from the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
