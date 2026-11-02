"use client"

import { requestListRefresh } from "@/lib/requests/invalidation"
import { Link } from "react-router"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

import { INNER_NAV, type NavItem } from "./data"

// ── Nav Main ──

interface NavMainProps {
  items: NavItem[]
  activeNav: string
}

export function NavMain({ items, activeNav }: NavMainProps) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      {/* Sidebar */}
      <SidebarGroupContent className="justify-center">
        <SidebarMenu className="gap-0.5">
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                render={<Link to={item.href} />}
                tooltip={{ children: item.label, hidden: false }}
                isActive={activeNav === item.id}
                aria-label={item.label}
                aria-current={activeNav === item.id ? "page" : undefined}
                // In the phone drawer a section with an empty panel has
                // nothing more to show beside the rail, so the tap that
                // opens it also closes the drawer. A section with its own
                // navigation, or with a panel its page fills, keeps the
                // drawer open on that content.
                onClick={() => {
                  requestListRefresh(item.id)
                  const panel = INNER_NAV[item.id]

                  if (
                    isMobile &&
                    !panel?.sections.length &&
                    !panel?.pagePanel
                  ) {
                    setOpenMobile(false)
                  }
                }}
                className="justify-center"
              >
                {item.icon}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
