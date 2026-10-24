"use client"

import { useState } from "react"
import { useLocation } from "react-router"

import { ScrollArea } from "@/components/ui/scroll-area"

import { type InnerNavData } from "./data"
import { InnerSidebarNav } from "./inner-sidebar-nav"

// ── Inner Sidebar Content ──

interface InnerSidebarContentProps {
  /** The section's panel data; undefined renders an empty panel */
  nav: InnerNavData | undefined
}

export function InnerSidebarContent({ nav }: InnerSidebarContentProps) {
  const sections = nav?.sections ?? []
  const footer = nav?.footer

  const allItems = sections.flatMap((s) => s.items)

  const [selectedItem, setSelectedItem] = useState<string>(() => {
    const defaultActive = allItems.find((i) => i.isActive)
    return defaultActive?.id ?? allItems[0]?.id ?? ""
  })

  // Items with a route of their own are active by the route, not by a click.
  const { pathname } = useLocation()
  const routed = allItems.find((i) => i.href === pathname)
  const activeItem = allItems.some((i) => i.href)
    ? (routed?.id ?? "")
    : selectedItem

  return (
    <>
      <div className="max-h-full min-h-0 grow">
        <ScrollArea className="scroll-fade-y h-full grow">
          <InnerSidebarNav
            sections={sections}
            activeItem={activeItem}
            onItemChange={setSelectedItem}
          />
        </ScrollArea>
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </>
  )
}
