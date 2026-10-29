import { Outlet } from "react-router"

import { AppShell } from "@/components/app-shell/app-shell"
import { RequireAuth } from "@/features/auth/components/require-auth"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"

export function AppLayout() {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </WorkspaceProvider>
    </RequireAuth>
  )
}
