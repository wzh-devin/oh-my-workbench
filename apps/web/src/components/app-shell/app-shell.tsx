import { type CSSProperties, type ReactNode } from "react"
import { cn } from "cn"

import { SidebarProvider } from "@/components/ui/sidebar"

import { AppShellContent } from "./app-shell-content"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    // `open` pins the rail: the primitive binds Ctrl/Cmd+B to its collapsed
    // state, which this fixed 63px rail does not have. The phone drawer has
    // its own state and still toggles.
    <SidebarProvider
      open
      className={cn(
        "h-screen",
        "[--header-height:50px]",
        "[--sidebar-accent:color-mix(in_oklab,var(--color-primary)_5%,transparent)]",
        "[--sidebar-accent-foreground:var(--color-primary)]"
      )}
      style={
        {
          "--sidebar-width": "63px",
        } as CSSProperties
      }
    >
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  )
}
