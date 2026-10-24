"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { cn } from "cn"

// ── Context ──

type InnerSidebarContextType = {
  isOpen: boolean
  toggle: () => void
}

const InnerSidebarContext = createContext<InnerSidebarContextType>({
  isOpen: true,
  toggle: () => {},
})

// ── Provider ──

export function InnerSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <InnerSidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((o) => !o),
      }}
    >
      {children}
    </InnerSidebarContext.Provider>
  )
}

// ── Hook ──

export function useInnerSidebar() {
  return useContext(InnerSidebarContext)
}

// ── Inner Sidebar ──
// Desktop-only: on mobile the inner content is surfaced inside the app sidebar.

interface InnerSidebarProps {
  /** Accessible name of the sidebar region */
  label: string
  /**
   * The section has no panel at all (no INNER_NAV entry): the aside closes
   * the way a collapsed panel does, at every width, and takes no room.
   */
  absent?: boolean
  /** Composable content rendered inside the desktop aside */
  children: ReactNode
}

export function InnerSidebar({ label, absent, children }: InnerSidebarProps) {
  const { isOpen } = useInnerSidebar()
  // Only the rail toggle slides the panel. A route change that brings the
  // panel in or takes it away (`absent` flips) swaps it at once, with the
  // page. Read from the previous render, during render, so the class is
  // right in the same commit as the width.
  const [previous, setPrevious] = useState({ isOpen, absent })
  const [animated, setAnimated] = useState(false)
  if (previous.isOpen !== isOpen || previous.absent !== absent) {
    setPrevious({ isOpen, absent })
    setAnimated(previous.absent === absent)
  }

  return (
    <aside
      className={cn(
        "hidden w-(--sidebar-width-inner) shrink-0 overflow-hidden border-r border-border md:flex",
        animated &&
          "transition-[width,visibility] duration-200 ease-linear motion-reduce:transition-none",
        // Collapsed only from lg up, where the rail toggle that reopens the
        // panel exists. `invisible` takes the hidden controls out of the tab
        // order and the accessibility tree; its transition holds them on
        // screen until the width has closed.
        !isOpen && "lg:invisible lg:w-0 lg:border-r-0",
        absent && "md:invisible md:w-0 md:border-r-0"
      )}
      aria-label={label}
    >
      <div className="flex w-(--sidebar-width-inner) shrink-0 flex-col overflow-hidden">
        {children}
      </div>
    </aside>
  )
}
