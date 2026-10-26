"use client"

import { type ReactNode } from "react"
import { useLocation } from "react-router"

import { SidebarInset } from "@/components/ui/sidebar"

import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { HeaderActionsProvider } from "./header-actions"
import { INNER_NAV, NAV_ITEMS } from "./data"
import { InnerPanelProvider, InnerPanelSlot } from "./inner-panel"
import { InnerSidebar, InnerSidebarProvider } from "./inner-sidebar"
import { InnerSidebarContent } from "./inner-sidebar-content"
import { InnerSidebarRailToggle } from "./inner-sidebar-rail-toggle"

// ── App Shell ──

// The rail section is the route, not local state: "/" matches only itself, any
// other section also owns its nested routes ("/workflow-editor" is active on "/workflow-editor/42").
function isSectionActive(href: string, pathname: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShellContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  const activeItem = NAV_ITEMS.find((n) => isSectionActive(n.href, pathname))
  const activeNav = activeItem?.id ?? ""
  const activeLabel = activeItem?.label ?? ""

  const nav = INNER_NAV[activeNav]
  // A section with no INNER_NAV entry has no secondary panel at all
  // (Connections): no aside, no rail toggle, no copy in the phone drawer.
  const hasPanel = nav !== undefined
  // The panel item the route opens, where items are routes (Settings).
  const activePage = nav?.sections
    .flatMap((s) => s.items)
    .find((item) => item.href === pathname)

  // Keyed by section so the panel resets to that section's default item. A
  // section that owns its panel (pagePanel in INNER_NAV) gets an empty slot
  // for its page to fill instead.
  const innerContent = !hasPanel ? null : nav.pagePanel ? (
    <InnerPanelSlot key={activeNav} />
  ) : (
    <InnerSidebarContent key={activeNav} nav={nav} />
  )

  // The drawer has no aside around its copy of the panel, so a page's panel
  // carries its name itself there.
  const drawerContent = nav?.pagePanel ? (
    <InnerPanelSlot key={activeNav} label={nav.pagePanel} />
  ) : (
    innerContent
  )

  return (
    <InnerSidebarProvider>
      <HeaderActionsProvider>
        <InnerPanelProvider>
          {/* Sidebar */}
          <AppSidebar activeNav={activeNav} innerContent={drawerContent} />
          <InnerSidebarRailToggle absent={!hasPanel} />

          <SidebarInset className="overflow-hidden border border-border shadow-none md:peer-data-[variant=inset]:shadow-none">
            <AppHeader section={activeItem} page={activePage} />

            <div className="flex flex-1 grow flex-col overflow-hidden md:flex-row">
              <InnerSidebar
                label={nav?.pagePanel ?? `${activeLabel} navigation`}
                absent={!hasPanel}
              >
                {innerContent}
              </InnerSidebar>

              <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                {children}
              </div>
            </div>
          </SidebarInset>
        </InnerPanelProvider>
      </HeaderActionsProvider>
    </InnerSidebarProvider>
  )
}
