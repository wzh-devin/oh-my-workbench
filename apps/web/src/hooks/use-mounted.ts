import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * True after client mount, false during SSR and on the first client render.
 *
 * Use it to defer anything that only the browser knows (the resolved theme, a
 * media query, a localStorage value) until hydration has happened, so the
 * server HTML and the first client render agree. `useSyncExternalStore` gives
 * the same answer as the usual `useState` + `useEffect` pair without the
 * set-state-in-effect that the React Compiler and eslint both flag.
 */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
