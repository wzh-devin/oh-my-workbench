"use client"

import { useState, type ReactNode } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { Logo } from "@/components/shared/logo"

import { NAV_ITEMS } from "./data"
import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import { NotificationsPopover } from "./notifications-popover"

// ── App Sidebar ──

interface AppSidebarProps {
  activeNav: string
  /** Inner sidebar content, shown in the mobile drawer beside the nav icons */
  innerContent?: ReactNode
}

export function AppSidebar({ activeNav, innerContent }: AppSidebarProps) {
  const { isMobile, openMobile } = useSidebar()

  // A tap on a rail item can close the drawer and change the route at once,
  // and the new section's panel may be empty. The drawer keeps the panel it
  // showed while it fades out, instead of blanking under the user's eyes; it
  // picks up the current one the next time it opens.
  const [held, setHeld] = useState(innerContent)

  if (openMobile && held !== innerContent) {
    setHeld(innerContent)
  }

  const drawerContent = openMobile ? innerContent : held

  return (
    <Sidebar className="top-0 bottom-0" variant="inset">
      <div className="flex h-full grow">
        <nav aria-label="Main" className="flex h-full flex-col">
          {/* In the mobile drawer the logo moves to the header instead. */}
          <SidebarHeader className="flex items-center justify-center py-3 in-data-[mobile=true]:hidden">
            <Logo />
          </SidebarHeader>

          <SidebarContent className="flex-row md:flex-col">
            <NavMain items={NAV_ITEMS} activeNav={activeNav} />
          </SidebarContent>

          {/* Notifications sit just above the user, as in app-shell-3. */}
          <SidebarFooter>
            <NotificationsPopover />
            <NavUser />
          </SidebarFooter>
        </nav>

        {/* The section panel's copy for the mobile drawer. On desktop the
            panel is the aside beside the content, so this one is not mounted
            there at all. */}
        {isMobile && drawerContent && (
          <div className="flex w-(--sidebar-width-inner) shrink-0 flex-col overflow-hidden border-l border-border/60">
            {drawerContent}
          </div>
        )}
      </div>
    </Sidebar>
  )
}
