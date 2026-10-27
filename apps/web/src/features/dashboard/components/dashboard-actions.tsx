"use client"

import { useNavigate } from "react-router"
import {
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  Share2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { type WorkflowRecord } from "./data"

const SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

function toCsv(workflows: WorkflowRecord[]) {
  const header = ["Workflow", "Trigger", "Owner", "Success %", "Runs", "Status"]
  const rows = workflows.map((workflow) => [
    workflow.name,
    workflow.trigger,
    workflow.owner.name,
    String(workflow.successRate),
    String(workflow.runsTotal),
    workflow.status,
  ])

  return [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
    )
    .join("\n")
}

// The block navbar's actions, now in the shell header: a primary that opens
// the new workflow sheet on Workflows, and an overflow menu.

export function DashboardActions({
  workflows,
}: {
  workflows: WorkflowRecord[]
}) {
  const navigate = useNavigate()

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied", { icon: SUCCESS_ICON, closeButton: true })
    } catch {
      toast.error("Could not copy the link", {
        description: "Your browser blocked clipboard access.",
        closeButton: true,
      })
    }
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
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" onClick={() => navigate("/workflows?new=1")}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        <span className="sr-only md:not-sr-only">Add Workflow</span>
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
            <DropdownMenuItem onClick={handleCopyLink}>
              <CopyIcon aria-hidden="true" />
              Copy link
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleCopyLink}>
              <Share2Icon aria-hidden="true" />
              Share
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleExport}>
              <DownloadIcon aria-hidden="true" />
              Export
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => navigate("/settings/general")}>
              <SettingsIcon aria-hidden="true" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
