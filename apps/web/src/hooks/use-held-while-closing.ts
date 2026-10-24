import { useState } from "react"

/**
 * Holds the last value that had a target for as long as the live one has
 * none. A panel that reads its subject from context loses it the moment it
 * is closed, and would fall back to its empty state while it is still on
 * screen, sliding shut. With this it leaves showing what it showed.
 *
 * State is adjusted during render, not in an effect, so the held value is
 * in place for the very render in which the target clears.
 */
export function useHeldWhileClosing<T extends { target: unknown }>(live: T): T {
  const [previous, setPrevious] = useState(live)
  const [held, setHeld] = useState<T | null>(null)

  if (previous !== live) {
    setPrevious(live)
    if (live.target) {
      setHeld(null)
    } else if (previous.target) {
      setHeld(previous)
    }
  }

  return held ?? live
}
