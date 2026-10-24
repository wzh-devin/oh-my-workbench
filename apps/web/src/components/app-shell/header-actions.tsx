"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

// ── Header Actions ──
// A section whose NAV_ITEMS entry sets `pageActions` hands the header's right
// side to its page: the header renders an empty slot in place of Publish, and
// the page portals its own controls into it. A portal rather than lifted
// state, so the controls keep the page's providers and state where they are.

type HeaderActionsContextType = {
  slot: HTMLElement | null
  setSlot: (slot: HTMLElement | null) => void
}

const HeaderActionsContext = createContext<HeaderActionsContextType>({
  slot: null,
  setSlot: () => {},
})

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  return (
    <HeaderActionsContext.Provider value={{ slot, setSlot }}>
      {children}
    </HeaderActionsContext.Provider>
  )
}

/**
 * The empty slot the header renders for a section that owns its actions.
 * The page portals its controls in; nothing fades on a route change, so the
 * header swaps with the page.
 */
export function HeaderActionsSlot() {
  const { setSlot } = useContext(HeaderActionsContext)

  return <div ref={setSlot} className="flex items-center gap-2" />
}

/**
 * Renders its children in the header's slot. Nothing renders on the server or
 * before the slot mounts, since a portal needs its target in the DOM.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { slot } = useContext(HeaderActionsContext)

  return slot ? createPortal(children, slot) : null
}
