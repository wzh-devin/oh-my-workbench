"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

// ── Inner Panel ──
// A section whose INNER_NAV entry sets `pagePanel` hands the secondary panel
// to its page, the way `pageActions` hands it the header's right side: the
// shell renders an empty slot where the section's navigation would be, and
// the page portals its own content into it. A portal rather than lifted
// state, so the content keeps the page's providers and state where they are.
//
// The panel is mounted twice on a phone (the aside, hidden there, and the
// drawer's copy), so there can be more than one slot at a time, and the
// page's content is rendered into each of them.

type Slot = { id: number; node: HTMLElement }

type InnerPanelContextType = {
  slots: Slot[]
  /** Adds a slot; the returned function removes it again. */
  register: (node: HTMLElement) => () => void
}

const InnerPanelContext = createContext<InnerPanelContextType>({
  slots: [],
  register: () => () => {},
})

export function InnerPanelProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const nextId = useRef(0)

  const register = useCallback((node: HTMLElement) => {
    nextId.current += 1
    const slot = { id: nextId.current, node }

    setSlots((current) => [...current, slot])
    return () => setSlots((current) => current.filter((it) => it !== slot))
  }, [])

  return (
    <InnerPanelContext.Provider value={{ slots, register }}>
      {children}
    </InnerPanelContext.Provider>
  )
}

/**
 * The empty slot the shell renders in the secondary panel of a section that
 * owns it. The page portals its content in; nothing fades on a route
 * change, so the panel swaps with the page.
 *
 * `label` names the slot where nothing around it does (the drawer's copy;
 * the aside carries the name itself).
 */
export function InnerPanelSlot({ label }: { label?: string }) {
  const { register } = useContext(InnerPanelContext)
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return
      }

      const unregister = register(node)

      // The page can unmount while this slot is still on screen: a rail tap
      // in the phone drawer closes it and changes the route at once, and the
      // drawer holds its panel while it fades out. There the slot keeps a
      // lifeless copy of what the page had put in it, so the drawer leaves
      // showing what it showed; the copy goes when content arrives again, or
      // with the slot.
      let copy: HTMLElement | null = null
      const observer = new MutationObserver((records) => {
        const added = records.flatMap((record) => [...record.addedNodes])
        const removed = records.flatMap((record) => [...record.removedNodes])

        if (copy) {
          if (added.some((it) => it !== copy && it.isConnected)) {
            copy.remove()
            copy = null
          }
        } else if (
          removed.length > 0 &&
          node.childElementCount === 0 &&
          node.closest('[data-mobile="true"]')
        ) {
          copy = document.createElement("div")
          copy.className = "contents"
          copy.inert = true
          copy.append(...removed.map((it) => it.cloneNode(true)))
          node.append(copy)
        }
      })

      observer.observe(node, { childList: true })

      return () => {
        observer.disconnect()
        unregister()
      }
    },
    [register]
  )

  return (
    <div
      ref={ref}
      role={label ? "group" : undefined}
      aria-label={label}
      className="flex min-h-0 grow flex-col"
    />
  )
}

/**
 * Renders its children in the secondary panel's slot (in each one, where the
 * panel is mounted twice). Nothing renders on the server or before a slot
 * mounts, since a portal needs its target in the DOM.
 */
export function InnerPanel({ children }: { children: ReactNode }) {
  const { slots } = useContext(InnerPanelContext)

  return slots.map((slot) => createPortal(children, slot.node, slot.id))
}
