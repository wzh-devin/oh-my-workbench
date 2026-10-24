"use client"

import { Suspense, useCallback, useState } from "react"
import { useNavigate } from "react-router"
import {
  CircleCheckIcon,
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

import { type WorkflowRowAction } from "./columns"
import { type WorkflowItem } from "./data"
import { WorkflowsDataGridView } from "./data-grid-view"
import {
  WorkflowSheet,
  type WorkflowSheetMode,
  type WorkflowSheetState,
} from "./workflow-sheet"
import { type WorkflowRun } from "./sheet-data"
import { type WorkflowFormValues } from "./workflow-schema"
import {
  createWorkflow,
  duplicateWorkflow,
  recordRun,
  removeWorkflow,
  setWorkflowEnabled,
  updateWorkflow,
} from "./workflow-store"

const SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

function toCsv(workflows: WorkflowItem[]) {
  const header = [
    "ID",
    "Workflow",
    "Trigger",
    "Owner",
    "Status",
    "Tags",
    "Last run",
    "Runs",
  ]
  const rows = workflows.map((workflow) => [
    workflow.id,
    workflow.name,
    workflow.trigger,
    workflow.owner.name,
    workflow.enabled ? "On" : "Off",
    workflow.tags.join("; "),
    workflow.lastRunAt ?? "",
    String(workflow.runs),
  ])

  return [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
    )
    .join("\n")
}

/**
 * Workflows: every workflow in the workspace, from the ReUI
 * data-grid-columns-3 block. Records are created, viewed and edited in the
 * sheet-22 drawer; the steps themselves are built in the Workflow Editor.
 */
export function Workflows() {
  const navigate = useNavigate()
  const { workflows, setWorkflows } = useWorkspace()
  const [sheet, setSheet] = useState<WorkflowSheetState>({
    open: false,
    mode: "create",
    workflow: null,
  })
  const [pendingDelete, setPendingDelete] = useState<WorkflowItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const openSheet = useCallback(
    (mode: WorkflowSheetMode, workflow: WorkflowItem | null) =>
      setSheet({ open: true, mode, workflow }),
    []
  )

  // A link from another page: a notification opens one workflow, the
  // Dashboard's Add Workflow opens the create sheet.
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
      const workflow = workflows.find((item) => item.id === request.id)
      if (workflow) {
        openSheet("view", workflow)
        return
      }
      clearRequest()
      toast.error("Workflow not found", {
        description: "It may have been deleted.",
        closeButton: true,
      })
    },
    [clearRequest, openSheet, workflows]
  )

  const openInEditor = useCallback(
    (workflow: WorkflowItem) => {
      navigate(recordEditorHref("workflow", workflow))
      toast.message(`Opening ${workflow.name}`, {
        description: "The Workflow Editor shows its steps.",
        closeButton: true,
      })
    },
    [navigate]
  )

  const handleToggle = useCallback(
    (workflow: WorkflowItem, enabled: boolean) => {
      setWorkflows((current) =>
        setWorkflowEnabled(current, workflow.id, enabled)
      )
      toast.success(enabled ? "Workflow activated" : "Workflow paused", {
        description: enabled
          ? `${workflow.name} runs on its trigger again.`
          : `${workflow.name} ignores its trigger until you switch it on.`,
        icon: SUCCESS_ICON,
        closeButton: true,
      })
    },
    [setWorkflows]
  )

  const handleDuplicate = useCallback(
    (workflow: WorkflowItem, { openCopy = false } = {}) => {
      const result = duplicateWorkflow(workflows, workflow.id)
      if (!result.copy) return
      setWorkflows(result.workflows)
      // From the drawer, the copy opens on Settings to be renamed.
      if (openCopy) openSheet("edit", result.copy)
      toast.success("Workflow duplicated", {
        description: `${result.copy.name} is paused until you switch it on.`,
        icon: SUCCESS_ICON,
        closeButton: true,
      })
    },
    [openSheet, setWorkflows, workflows]
  )

  const requestDelete = useCallback((workflow: WorkflowItem) => {
    setPendingDelete(workflow)
    setDeleteOpen(true)
  }, [])

  const handleAction = useCallback(
    (action: WorkflowRowAction, workflow: WorkflowItem) => {
      switch (action) {
        case "view":
          openSheet("view", workflow)
          return
        case "edit":
          openSheet("edit", workflow)
          return
        case "delete":
          requestDelete(workflow)
          return
        case "open":
          openInEditor(workflow)
          return
        case "duplicate":
          handleDuplicate(workflow)
          return
        case "copy":
          void navigator.clipboard
            ?.writeText(workflow.id)
            .then(() =>
              toast.success("Workflow ID copied", {
                description: workflow.id,
                icon: SUCCESS_ICON,
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
      }
    },
    [handleDuplicate, openInEditor, openSheet, requestDelete]
  )

  function handleSubmit(
    values: WorkflowFormValues,
    workflow: WorkflowItem | null
  ): WorkflowItem | void {
    if (workflow) {
      // The drawer stays open on the saved record, as the block keeps it.
      setWorkflows((current) => updateWorkflow(current, workflow.id, values))
      toast.success("Workflow saved", {
        description: `${values.name.trim()} is up to date.`,
        icon: SUCCESS_ICON,
        closeButton: true,
      })
      return
    }

    const { workflows: next, created } = createWorkflow(workflows, values)
    setWorkflows(next)
    closeSheet()
    toast.success("Workflow created", {
      description: `${created.name} is ready for its first steps.`,
      icon: SUCCESS_ICON,
      closeButton: true,
      action: {
        label: "Open editor",
        onClick: () => navigate(recordEditorHref("workflow", created)),
      },
    })
    return created
  }

  function handleRunComplete(workflow: WorkflowItem, run: WorkflowRun) {
    setWorkflows((current) => recordRun(current, workflow.id, run))
    toast.success("Run finished", {
      description: `${workflow.name} processed ${run.items} ${run.items === 1 ? "item" : "items"} in ${run.durationSec}s.`,
      icon: SUCCESS_ICON,
      closeButton: true,
    })
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return

    setWorkflows((current) => removeWorkflow(current, pendingDelete.id))
    setDeleteOpen(false)
    if (sheet.workflow?.id === pendingDelete.id) {
      closeSheet()
    }
    toast.success("Workflow deleted", {
      description: `${pendingDelete.name} and its run history are gone.`,
      icon: SUCCESS_ICON,
      closeButton: true,
    })
  }

  function handleExport() {
    const blob = new Blob([toCsv(workflows)], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "workflows.csv"
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Workflows exported", {
      description: `${workflows.length} workflows in workflows.csv`,
      icon: SUCCESS_ICON,
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
            <span className="sr-only md:not-sr-only">New workflow</span>
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
                  onClick={() => navigate("/settings/execution")}
                >
                  <SettingsIcon aria-hidden="true" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </HeaderActions>

      <main
        className="flex w-full flex-1 flex-col gap-4 p-4"
        aria-labelledby="page-heading"
      >
        <h1 id="page-heading" className="sr-only">
          Workflows
        </h1>

        <WorkflowsDataGridView
          workflows={workflows}
          onAction={handleAction}
          onToggle={handleToggle}
        />
      </main>

      <WorkflowSheet
        state={sheet}
        workflows={workflows}
        onOpenChange={(open) => {
          setSheet((current) => ({ ...current, open }))
          if (!open) clearRequest()
        }}
        onSubmit={handleSubmit}
        onToggle={handleToggle}
        onRunComplete={handleRunComplete}
        onOpenInEditor={openInEditor}
        onDuplicate={(workflow) =>
          handleDuplicate(workflow, { openCopy: true })
        }
        onDelete={(workflow) => {
          // The drawer closes first, then the confirm opens and owns focus.
          closeSheet()
          requestDelete(workflow)
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name ?? "This workflow"} stops running and its run
              history is removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
