"use client"

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

import { AGENT_RECORDS, type AgentRecord } from "@/lib/workspace/agents"
import { WORKFLOWS, type Workflow } from "@/lib/workspace/workflows"

// ── Workspace Store ──
// The workflows and agents every signed-in page reads and edits. It mounts
// once in app/layouts/app-layout.tsx, beside the shell, so it outlives navigation:
// a workflow created on Workflows is on the Dashboard grid, paused in one
// place is paused everywhere. There is no backend, so a full reload returns
// to the seed (lib/workspace/).

type WorkspaceContextValue = {
  workflows: Workflow[]
  setWorkflows: Dispatch<SetStateAction<Workflow[]>>
  agents: AgentRecord[]
  setAgents: Dispatch<SetStateAction<AgentRecord[]>>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workflows, setWorkflows] = useState(WORKFLOWS)
  const [agents, setAgents] = useState(AGENT_RECORDS)

  const value = useMemo(
    () => ({ workflows, setWorkflows, agents, setAgents }),
    [workflows, agents]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>")
  }
  return context
}
