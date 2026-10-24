"use client"

import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { recordEditorHref } from "@/components/app-shell/record-link"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { type Workflow } from "@/lib/workspace/workflows"

import { AttentionList } from "./attention-list"
import { DashboardActions } from "./dashboard-actions"
import { WorkflowsDataGridView } from "./data-grid-view"
import {
  applyWorkflowRecords,
  toWorkflowRecord,
  type WorkflowRecord,
} from "./data"
import { TOAST_SUCCESS_ICON } from "./icons"
import { NavbarPresence } from "./navbar-presence"
import { plural, triageOrder } from "./ops-data"
import { RunActivity } from "./run-activity"
import { StatCards } from "./stat-cards"

/**
 * Flowly Dashboard. On top, the stat cards, Run Activity and Needs Attention,
 * all on Card and read from the workspace's workflows and agents; below, the
 * workflow grid. The shell header stands in for the grid's own navbar, so its
 * right side (presence and actions) is portalled there; the section has no
 * secondary panel, so the page runs full width.
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { workflows: shared, setWorkflows: setShared, agents } = useWorkspace()

  // The grid edits its own record shape; the workspace store holds the
  // workflows every page shares, so edits are mapped back into it.
  const workflows = useMemo(() => shared.map(toWorkflowRecord), [shared])
  const setWorkflows = useCallback(
    (update: (current: WorkflowRecord[]) => WorkflowRecord[]) =>
      setShared((current) =>
        applyWorkflowRecords(current, update(current.map(toWorkflowRecord)))
      ),
    [setShared]
  )
  const triaged = useMemo(() => triageOrder(shared), [shared])

  const setEnabled = useCallback(
    (ids: string[], enabled: boolean) =>
      setShared((current) =>
        current.map((workflow) =>
          ids.includes(workflow.id) ? { ...workflow, enabled } : workflow
        )
      ),
    [setShared]
  )

  function handleResume(ids: string[]) {
    const names = shared
      .filter((workflow) => ids.includes(workflow.id))
      .map((workflow) => workflow.name)
    setEnabled(ids, true)
    toast.success(
      ids.length === 1 ? "Workflow resumed" : `${ids.length} workflows resumed`,
      {
        icon: TOAST_SUCCESS_ICON,
        description: names.join(", "),
        closeButton: true,
        action: { label: "Undo", onClick: () => setEnabled(ids, false) },
      }
    )
  }

  function handleRerun(ids: string[]) {
    const names = shared
      .filter((workflow) => ids.includes(workflow.id))
      .map((workflow) => workflow.name)
    toast.success(`${plural(ids.length, "run")} started`, {
      icon: TOAST_SUCCESS_ICON,
      description: names.join(", "),
      closeButton: true,
    })
  }

  return (
    <div className="-m-4 flex flex-1 flex-col">
      <HeaderActions>
        <div className="flex shrink-0 items-center gap-2">
          <NavbarPresence />
          <DashboardActions workflows={workflows} />
        </div>
      </HeaderActions>

      <div
        className="flex w-full flex-1 flex-col gap-4 p-4"
        aria-labelledby="page-heading"
      >
        <h1 id="page-heading" className="sr-only">
          Dashboard
        </h1>

        <TooltipProvider>
          <StatCards
            workflows={shared}
            agents={agents}
            onNavigate={(href) => navigate(href)}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RunActivity workflows={shared} className="lg:col-span-2" />
            <AttentionList
              workflows={triaged}
              onOpenWorkflow={(workflow: Workflow) =>
                navigate(`/workflows?open=${workflow.id}`)
              }
              onEditWorkflow={(workflow: Workflow) =>
                navigate(recordEditorHref("workflow", workflow))
              }
              onResume={handleResume}
              onRerun={handleRerun}
              className="min-w-0"
            />
          </div>
        </TooltipProvider>

        {/* Workflow Grid */}
        <WorkflowsDataGridView
          workflows={workflows}
          onWorkflowsChange={setWorkflows}
        />
      </div>
    </div>
  )
}
