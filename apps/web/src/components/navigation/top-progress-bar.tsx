"use client"

/**
 * Page-load progress bar: a thin line pinned to the top of the viewport that
 * starts the moment a navigation begins and finishes once the new route has
 * rendered, the way YouTube and GitHub do it.
 *
 * START comes from a capture-phase click listener on the document, since the
 * listener also catches links rendered through Base UI. It runs before the
 * router's own handler,
 * so the bar is on screen before the request for the next page goes out.
 * Back and forward come from the Navigation API's `navigate` event where the
 * browser has it, with `popstate` as the fallback. Code that navigates
 * imperatively (navigate after a form, a command palette) calls
 * `startPageProgress()`.
 *
 * Every start commits with `flushSync`. Measured without it: once the
 * router had begun restoring a history entry that still had to be fetched,
 * the bar's state update was not committed until that fetch resolved, so
 * the bar appeared together with the page.
 *
 * DONE is the route committing: `useLocation` and `useSearchParams` change
 * once the new tree has rendered.
 *
 * While waiting the fill follows `CAP * (1 - e^(-elapsed / TAU))`, recomputed
 * every animation frame, so it moves fast at first, eases toward the cap and
 * never reaches 100% before the page lands. The finish is deliberately slow:
 * a 400ms minimum on screen, a 350ms eased glide to 100%, a 350ms fade.
 *
 * The fill is `transform: scaleX()` rather than width: same curve, same
 * hand-off from a zero-duration transition to the eased finish, but
 * composited instead of relayouting the bar every frame.
 */
import { Suspense, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useLocation, useSearchParams } from "react-router"

/** Asymptote while waiting, in percent. */
const CAP = 90
/** Time constant of the ramp; lower reaches the cap faster. */
const TAU = 1100
/** A navigation shorter than this still shows a full pass, not a blink. */
const MIN_VISIBLE_MS = 400
/** The glide from the ramp to 100%. */
const FINISH_MS = 350
const FINISH_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** The fade out after the glide. */
const FADE_MS = 350
// The animation skill's strong ease-out. The token layer has no easing
// tokens, so the value lives here, with its one consumer.
const FADE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)"
/** A navigation that never commits is force-finished after this. */
const SAFETY_MS = 12_000
// Zero duration on transform while the ramp drives it per frame, so the
// finish can retarget the same transition smoothly instead of snapping.
const RAMP_TRANSITION = "transform 0ms linear, opacity 0ms linear"

const START_EVENT = "flowly:page-progress-start"
const CANCEL_EVENT = "flowly:page-progress-cancel"

/**
 * Starts the bar for a navigation that no link click announces: a
 * `navigate()` after a form submit or an action, a command palette, an auth
 * guard. Pass the destination when you have it: the bar only ends when the
 * route changes, so a push to the current path and query (or a
 * reload) would otherwise run until the safety timeout. Safe
 * to call while a navigation is already in flight (ignored) and before the
 * bar has mounted (nothing happens).
 */
export function startPageProgress(href?: string) {
  if (typeof window === "undefined") return
  if (href !== undefined) {
    const url = new URL(href, window.location.href)
    const here = routeKeyOf(window.location.pathname, window.location.search)
    if (routeKeyOf(url.pathname, url.search) === here) return
  }
  // A microtask, so a call made during a render never flushes inside it.
  queueMicrotask(() => window.dispatchEvent(new Event(START_EVENT)))
}

/**
 * Takes the bar down when a navigation it started is not going to happen:
 * the `preventDefault` branch of a `Link` `onNavigate` guard, a form that
 * decided not to submit after all. Without it such a bar runs until the
 * safety timeout. Does nothing while no bar is loading.
 */
export function cancelPageProgress() {
  if (typeof window === "undefined") return
  queueMicrotask(() => window.dispatchEvent(new Event(CANCEL_EVENT)))
}

/** What is on screen: nothing, the ramp, or the reduced-motion static line. */
type Mode = "hidden" | "ramp" | "static"
type Phase = "idle" | "ramping" | "finishing"

/**
 * Whether a click on this anchor will produce an in-app navigation.
 * Exported for its test; not part of the component's API.
 */
export function isInAppNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }

  const target = event.target
  if (!(target instanceof Element)) return false

  const anchor = target.closest("a[href]")
  if (!(anchor instanceof HTMLAnchorElement)) return false
  if (anchor.target && anchor.target !== "_self") return false
  if (anchor.hasAttribute("download")) return false

  const href = anchor.getAttribute("href")
  if (!href || href.startsWith("#")) return false

  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return false
  }

  if (url.origin !== window.location.origin) return false
  if (!isPagePath(url.pathname)) return false

  // The same page again: the router does nothing visible, so neither do we. Both
  // sides go through the one route key, so a different spelling of the same
  // query or a trailing slash does not pass as a change.
  const here = routeKeyOf(window.location.pathname, window.location.search)
  if (routeKeyOf(url.pathname, url.search) === here) return false

  return true
}

/**
 * 排除接口和构建资源，避免进度条等待不会发生的页面提交。
 * @param pathname 待导航的 URL 路径。
 * @return 是否属于前端页面。
 */
function isPagePath(pathname: string): boolean {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/src/")
  ) {
    return false
  }
  // A last segment with an extension is a file, not a route.
  return !/\.[a-z0-9]{1,8}$/i.test(pathname)
}

/**
 * One serialisation of path + query for both sides of a comparison. The
 * query is re-serialised and trailing slashes are ignored so equivalent URLs
 * share a key.
 */
function routeKeyOf(pathname: string, search: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  return `${path}?${new URLSearchParams(search).toString()}`
}

/**
 * The bar's state machine. It outlives any one route: a route change must
 * never cancel a ramp or a finish in flight, so nothing in here is tied to
 * React's render cycle except the one `setMode` that mounts the element.
 */
function createMachine(
  barRef: React.RefObject<HTMLDivElement | null>,
  setMode: (mode: Mode) => void
) {
  let phase: Phase = "idle"
  let startedAt = 0
  let frame = 0
  let timers: number[] = []
  let reducedMotion = false
  // The route the bar last saw committed, so a traversal to a hash-only
  // history entry (no route change coming) shows nothing.
  let committedKey: string | null = null

  const clearTimers = () => {
    for (const id of timers) window.clearTimeout(id)
    timers = []
  }
  const later = (fn: () => void, ms: number) => {
    timers.push(window.setTimeout(fn, ms))
  }

  const reset = () => {
    phase = "idle"
    window.cancelAnimationFrame(frame)
    clearTimers()
    setMode("hidden")
  }

  const fade = () => {
    const bar = barRef.current
    if (!bar) {
      reset()
      return
    }
    bar.style.transition = `opacity ${FADE_MS}ms ${FADE_EASE}`
    bar.style.opacity = "0"
    later(reset, FADE_MS)
  }

  const finish = () => {
    if (phase !== "ramping") return
    phase = "finishing"
    window.cancelAnimationFrame(frame)
    clearTimers()

    const bar = barRef.current
    // The static line leaves the way it came: at once.
    if (!bar || reducedMotion) {
      reset()
      return
    }

    // Hand-off: the transition on transform goes from 0ms to the eased
    // finish, so the glide starts from wherever the ramp was.
    bar.style.transition = `transform ${FINISH_MS}ms ${FINISH_EASE}`
    bar.style.transform = "scaleX(1)"
    later(fade, FINISH_MS)
  }

  const tick = (now: number) => {
    if (phase !== "ramping") return
    const bar = barRef.current
    if (bar) {
      // The frame's timestamp can precede the start taken in the same
      // frame; a negative elapsed would scale the bar backwards.
      const elapsed = Math.max(0, now - startedAt)
      const progress = CAP * (1 - Math.exp(-elapsed / TAU))
      bar.style.transform = `scaleX(${progress / 100})`
    }
    frame = window.requestAnimationFrame(tick)
  }

  const start = () => {
    // One continuous ramp per navigation: a start while loading is ignored.
    if (phase === "ramping") return
    // A navigation during the previous bar's finish interrupts it.
    if (phase === "finishing") {
      window.cancelAnimationFrame(frame)
      clearTimers()
    }

    phase = "ramping"
    startedAt = performance.now()
    reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    // Committed now, inside the event, not on React's next scheduled render
    // (see the file comment). Afterwards the element is in the DOM.
    flushSync(() => setMode(reducedMotion ? "static" : "ramp"))

    // Fresh inline styles: the element may be the one the interrupted
    // finish was fading, with its transitions still set.
    const bar = barRef.current
    if (bar) {
      bar.style.transition = RAMP_TRANSITION
      bar.style.transform = reducedMotion ? "scaleX(1)" : "scaleX(0)"
      bar.style.opacity = "1"
    }

    later(finish, SAFETY_MS)
    if (!reducedMotion) {
      frame = window.requestAnimationFrame(tick)
    }
  }

  // The route landed: finish once the minimum time is met. The ramp keeps
  // animating until then. A commit during the finish changes nothing.
  const done = () => {
    if (phase !== "ramping") return
    const elapsed = performance.now() - startedAt
    clearTimers()
    later(finish, Math.max(0, MIN_VISIBLE_MS - elapsed))
  }

  // A start that will not be followed by a route change. Only a loading
  // bar is taken down; a finishing one is already on its way out.
  const cancel = () => {
    if (phase === "ramping") reset()
  }

  return {
    start,
    cancel,
    /** Called with the route key on every commit, the first one included. */
    committed(key: string) {
      if (committedKey === null) {
        committedKey = key
      } else if (key !== committedKey) {
        committedKey = key
        done()
      }
    },
    onClick(event: MouseEvent) {
      if (isInAppNavigation(event)) start()
    },
    // Back / forward, before the router sees it. A hash-only traversal
    // changes no route, so it shows nothing.
    onNavigate(event: NavigateEvent) {
      if (event.navigationType === "traverse" && !event.hashChange) start()
    },
    // The fallback where the browser has no Navigation API: any traversal
    // to another route. A cached entry commits at once and still gets the
    // minimum pass; one that has to be fetched ramps until it lands.
    onPopState() {
      const key = routeKeyOf(window.location.pathname, window.location.search)
      if (key === committedKey) return
      start()
    },
    // A document restored from the back/forward cache comes back with
    // whatever the bar was doing when it left. It starts over.
    onPageShow(event: PageTransitionEvent) {
      if (event.persisted) reset()
    },
    /** Unmount: stop everything; the element is gone with the component. */
    dispose() {
      phase = "idle"
      window.cancelAnimationFrame(frame)
      clearTimers()
    },
  }
}

type Machine = ReturnType<typeof createMachine>

function ProgressBar() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>("hidden")
  const barRef = useRef<HTMLDivElement | null>(null)
  const machineRef = useRef<Machine | null>(null)

  const routeKey = routeKeyOf(pathname, searchParams.toString())

  // The machine and its listeners live for the component's life. Nothing
  // here depends on the route, so a route change cancels nothing.
  useEffect(() => {
    const machine = createMachine(barRef, setMode)
    machineRef.current = machine
    // Undefined where the browser has no Navigation API yet.
    const navigation: Navigation | undefined = window.navigation

    document.addEventListener("click", machine.onClick, true)
    navigation?.addEventListener("navigate", machine.onNavigate)
    window.addEventListener("popstate", machine.onPopState)
    window.addEventListener("pageshow", machine.onPageShow)
    window.addEventListener(START_EVENT, machine.start)
    window.addEventListener(CANCEL_EVENT, machine.cancel)

    return () => {
      document.removeEventListener("click", machine.onClick, true)
      navigation?.removeEventListener("navigate", machine.onNavigate)
      window.removeEventListener("popstate", machine.onPopState)
      window.removeEventListener("pageshow", machine.onPageShow)
      window.removeEventListener(START_EVENT, machine.start)
      window.removeEventListener(CANCEL_EVENT, machine.cancel)
      machine.dispose()
      machineRef.current = null
    }
  }, [])

  // The route committed: the first run records it, later ones land the bar.
  useEffect(() => {
    machineRef.current?.committed(routeKey)
  }, [routeKey])

  if (mode === "hidden") return null

  return (
    <div
      ref={barRef}
      data-slot="top-progress-bar"
      aria-hidden="true"
      // Above the sticky header and every z-50 overlay; never catches a click.
      className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 origin-left bg-primary"
      style={{
        // Reduced motion: a static full-width line instead of the ramp.
        transform: mode === "static" ? "scaleX(1)" : "scaleX(0)",
        opacity: 1,
        transition: RAMP_TRANSITION,
      }}
    />
  )
}

/** Mount once at the application root, above the page content. */
export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  )
}
