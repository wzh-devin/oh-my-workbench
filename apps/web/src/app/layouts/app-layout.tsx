import { Outlet } from "react-router"

import { AppShell } from "@/components/app-shell/app-shell"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"

export function AppLayout() {
  return (
    <WorkspaceProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  )
}
