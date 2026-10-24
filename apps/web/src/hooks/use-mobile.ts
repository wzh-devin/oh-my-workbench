import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * True below the 768px breakpoint, false during SSR and hydration.
 *
 * `shadcn add sidebar` writes the stock version of this hook, a `useState` +
 * `useEffect` pair that sets state inside the effect, which
 * `react-hooks/set-state-in-effect` rejects and fails `pnpm lint`. This is the
 * same breakpoint and the same `matchMedia` subscription through
 * `useSyncExternalStore`, the pattern `use-mounted.ts` uses. A later
 * `shadcn add --overwrite` of anything that pulls in `sidebar` restores the
 * stock file; keep this one.
 */
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}
