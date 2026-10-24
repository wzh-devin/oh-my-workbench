"use client"

/**
 * The Workflow Editor's assistant: a non modal window pinned in the page's
 * corner, with a thread, starter rows, history and a composer that attaches
 * context. Ask AI in the app header opens and closes it through `ref`, in place
 * of a corner launcher; an invisible anchor keeps the corner the window rises
 * from.
 * Customize: data in data.tsx, sizes in WINDOW; map your model's output into AnswerBody
 * in place of composeReply, and let its stream drive the reveal instead of THINK_MS.
 */
import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react"
import { highlightCode } from "@/components/reui/code-block/code-block-highlight"
import { cn } from "cn"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatStarters } from "./chat-starters"
import { ChatThread } from "./chat-thread"
import { Composer } from "./composer"
import {
  ASSISTANT_NAME,
  composeReply,
  DEFAULT_SOURCES,
  FOOTNOTE,
  NEW_THREAD_ID,
  readingLabel,
  THREADS,
  threadTitle,
  type AnswerBody,
  type ThreadRecord,
  type TurnRecord,
  type Vote,
} from "./data"
import { TOAST_SUCCESS_ICON } from "./icons"
import { answerCost, revealDurationMs } from "./reveal"
import { WindowHeader } from "./window-header"
import { useWindowMotion } from "./window-motion"

/** The beat between a send and the first word of the answer. */
const THINK_MS = 900
/** Breathing room between the reveal finishing and the answer settling. */
const SETTLE_MS = 250
/** A toast that carries Undo stays long enough to reach it by keyboard. */
const UNDO_TOAST_MS = 8000

// customize: the surface the window and its bar share, so a fold lands pixel for pixel;
// closed, it skips its contents too, so nothing inside outlives it on screen.
const SURFACE =
  "bg-popover fixed end-4 bottom-4 w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl p-0 shadow-md data-[state=closed]:invisible data-[state=closed]:[content-visibility:hidden] sm:max-w-104"

// customize: --window-h tall, and Expand grows it to 16px under the top. Motion
// lives in window-motion.ts; a CSS transition here would fight it.
const WINDOW = cn(
  SURFACE,
  "z-50 h-(--window-h) origin-bottom-right [--window-h:min(40rem,calc(100svh-2rem))] [--window-max-h:calc(100svh-2rem)] max-sm:h-(--window-max-h) sm:data-[expanded=true]:h-(--window-max-h) rtl:origin-bottom-left"
)

/** The pinned bar a minimized chat folds to, under the window's corner. */
const BAR = cn(SURFACE, "z-40 h-12")

type PendingReply = {
  id: string
  threadId: string
  body: AnswerBody
  /** What the thinking marker says while it waits. */
  label: string
}

/** Escape is the chat's while focus is in it or nowhere; the page's menus keep theirs. */
function ownsEscape(panel: HTMLElement | null) {
  const focused = document.activeElement
  return (
    !focused || focused === document.body || Boolean(panel?.contains(focused))
  )
}

/** One identity for the life of the chat that still runs this render's handler, so
    the memoised thread, starters and composer skip a re-render a toggle causes. */
function useStableHandler<A extends unknown[]>(handler: (...args: A) => void) {
  const latest = useRef(handler)
  useLayoutEffect(() => {
    latest.current = handler
  })
  const [stable] = useState(
    () =>
      (...args: A) =>
        latest.current(...args)
  )
  return stable
}

/** Marks the last question as stopped, so a dropped reply is never a mystery. */
function markStopped(turns: TurnRecord[]) {
  const last = turns.at(-1)
  if (last?.kind !== "asked") return turns
  return [...turns.slice(0, -1), { ...last, stopped: true }]
}

/** What the header's trigger needs to show: open, a reply on its way, or one unread. */
export type AiChatStatus = { open: boolean; replying: boolean; unread: boolean }

export type AiChatHandle = {
  /** Opens the window (restoring it from the bar) or closes it. */
  toggle: () => void
}

interface AiChatProps {
  ref?: Ref<AiChatHandle>
  /** The button that opens the chat; focus goes back to it on close. */
  triggerRef: RefObject<HTMLButtonElement | null>
  onStatusChange?: (status: AiChatStatus) => void
}

export function AiChat({ ref, triggerRef, onStatusChange }: AiChatProps) {
  // Closed on load: the canvas is what the page opens on.
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  /** Folded to the pinned bar; the chat keeps running while it is. */
  const [minimized, setMinimized] = useState(false)
  const [threads, setThreads] = useState<ThreadRecord[]>(THREADS)
  const [activeId, setActiveId] = useState(NEW_THREAD_ID)
  const [draft, setDraft] = useState("")
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES)
  const [pending, setPending] = useState<PendingReply | null>(null)
  /** The answer currently typing itself out. */
  const [arrivingId, setArrivingId] = useState<string | null>(null)
  /** The last turn the reader had in front of them when the window hid. */
  const [seenId, setSeenId] = useState<string | null>(null)
  /** The reply that just finished arriving, so the status can say it is ready. */
  const [readyId, setReadyId] = useState<string | null>(null)

  /** Monotonic counter, so ids never come from inside a state updater. */
  const serial = useRef(0)
  /** Counts replies, so the fallback lines take turns. */
  const replyCount = useRef(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const minimizeButtonRef = useRef<HTMLButtonElement>(null)
  /** True while the thread keeps its newest line in view; the fold reads it too. */
  const followingRef = useRef(true)
  /** Set by End chat, so the chat starts fresh only once it is out of sight. */
  const endedRef = useRef(false)
  /** Set when the chat closes, so the launcher takes focus back once it shows. */
  const focusLauncher = useRef(false)
  /** Set by a reader's open, so the open on page load leaves focus alone. */
  const focusOnOpen = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0]
  const lastTurn = active.turns.at(-1)
  const arriving = active.turns.find((turn) => turn.id === arrivingId)
  const arrivingCost = arriving?.kind === "answer" ? answerCost(arriving) : 0
  const streaming = pending !== null || arrivingId !== null
  // While hidden or minimized, a reply that has landed counts as new even before
  // it would have finished typing: nobody is watching it type.
  const hidden = !open || minimized
  const replying = hidden && pending !== null
  const unread =
    hidden && !pending && lastTurn?.kind === "answer" && lastTurn.id !== seenId

  // The beat before an answer. The reply lands in the thread that asked, even
  // if the window was hidden in the meantime.
  useEffect(() => {
    // Frozen demo guard: ?demo=frozen pins the demo, so no timer starts.
    if (document.documentElement.dataset.demo === "frozen") return
    if (!pending) return
    const timer = window.setTimeout(() => {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === pending.threadId
            ? {
                ...thread,
                turns: [
                  ...thread.turns,
                  { id: pending.id, kind: "answer", ...pending.body },
                ],
              }
            : thread
        )
      )
      setArrivingId(pending.id)
      setPending(null)
    }, THINK_MS)
    return () => window.clearTimeout(timer)
  }, [pending])

  // The settle waits out the reveal's own duration, so a long answer is never
  // cut mid type.
  useEffect(() => {
    // Frozen demo guard: ?demo=frozen pins the demo, so no timer starts.
    if (document.documentElement.dataset.demo === "frozen") return
    if (!arrivingId) return
    const timer = window.setTimeout(
      () => {
        setReadyId(arrivingId)
        setArrivingId(null)
      },
      revealDurationMs(arrivingCost) + SETTLE_MS
    )
    return () => window.clearTimeout(timer)
  }, [arrivingId, arrivingCost])

  // Closed, the header's trigger takes focus back.
  useEffect(() => {
    if (open || !focusLauncher.current) return
    focusLauncher.current = false
    triggerRef.current?.focus()
  }, [open, triggerRef])

  useEffect(() => {
    onStatusChange?.({ open: !hidden, replying, unread })
  }, [hidden, onStatusChange, replying, unread])

  // A reader's open or Restore focuses the composer; Minimize focuses Restore once
  // the bar has landed (onBarShown).
  useEffect(() => {
    if (!open || minimized || !focusOnOpen.current) return
    composerRef.current?.focus()
  }, [open, minimized])

  function updateActive(update: (turns: TurnRecord[]) => TurnRecord[]) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeId
          ? { ...thread, turns: update(thread.turns) }
          : thread
      )
    )
  }

  /** What the reader leaves or comes back to, whether the chat closes or minimizes. */
  function markView(visible: boolean) {
    // Closing from the bar keeps what minimizing marked: nothing since was seen.
    if (!visible && hidden) return
    // An answer still typing has not been read yet, so hiding marks nothing seen.
    setSeenId(arrivingId ? null : (lastTurn?.id ?? null))
    // An answer that landed while hidden was not watched, so it opens whole.
    if (visible) setArrivingId(null)
  }

  function show(next: boolean) {
    focusOnOpen.current = next
    focusLauncher.current = !next
    setOpen(next)
    markView(next)
    // Reopening shows the window, never the bar it was closed from.
    if (next) setMinimized(false)
    // Reopened before an ended chat finished leaving: it opens fresh all the same.
    if (next && endedRef.current) {
      endedRef.current = false
      startFresh()
      setExpanded(false)
    }
  }

  function minimize(next: boolean) {
    focusOnOpen.current = true
    setMinimized(next)
    markView(!next)
  }

  /** Grows the window to full height or back; from the bar it also restores. */
  function changeExpanded(next: boolean) {
    setExpanded(next)
    if (minimized) minimize(false)
  }

  /** Drops whatever is in flight: the thinking beat, or an answer still
      typing. Nothing half written is left in the thread. */
  function stop() {
    if (!streaming) return
    updateActive((turns) =>
      markStopped(turns.filter((turn) => turn.id !== arrivingId))
    )
    setPending(null)
    setArrivingId(null)
  }

  function send(text: string) {
    // Follow-up rows call this too, and must not replace a reply in flight.
    if (streaming) return
    const askedId = `t_${++serial.current}`
    const replyId = `t_${++serial.current}`
    // A continued chat moves to the top of History, filed under today.
    setThreads((current) => {
      const thread = current.find((entry) => entry.id === activeId)
      if (!thread) return current
      const asked: TurnRecord = { id: askedId, kind: "asked", text, sources }
      return [
        {
          ...thread,
          at: "Now",
          recency: "today",
          turns: [...thread.turns, asked],
        },
        ...current.filter((entry) => entry.id !== activeId),
      ]
    })
    setDraft("")
    setReadyId(null)
    const body = composeReply(text, sources, replyCount.current++)
    // Loads the highlighter during the thinking beat, so a snippet lands in colour.
    if (body.code)
      void highlightCode(body.code.code, { language: body.code.language })
    setPending({
      id: replyId,
      threadId: activeId,
      body,
      label: readingLabel(sources),
    })
  }

  /** Files the open chat under History and opens an empty one. */
  function startFresh() {
    stop()
    if (active.turns.length === 0) return
    const id = `th_${++serial.current}`
    setThreads((current) => [
      { id, at: "Now", recency: "today", turns: [] },
      ...current.filter((thread) => thread.turns.length > 0),
    ])
    setActiveId(id)
    setSources(DEFAULT_SOURCES)
  }

  function newChat() {
    startFresh()
    // The button disables itself once the chat is empty, so focus moves on.
    composerRef.current?.focus()
  }

  function selectThread(id: string) {
    if (id === activeId) return
    stop()
    setActiveId(id)
  }

  /** A second press on the same thumb takes the rating back. */
  function rate(turnId: string, vote: Vote | null) {
    updateActive((turns) =>
      turns.map((turn) =>
        turn.id === turnId && turn.kind === "answer"
          ? { ...turn, vote: vote ?? undefined }
          : turn
      )
    )
  }

  function togglePinned(id: string) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, pinned: !thread.pinned } : thread
      )
    )
  }

  /** Removes a chat from History; deleting the open one opens an empty chat. */
  function deleteThread(id: string) {
    const index = threads.findIndex((thread) => thread.id === id)
    if (index === -1) return
    const record = threads[index]
    // The chats after it as they stood: Undo lands it above the first one still in
    // place, since a send lifts a chat to the top as "Now".
    const followers = threads.slice(index + 1).map(({ id, at }) => ({ id, at }))
    if (id === activeId) {
      const freshId = `th_${++serial.current}`
      setThreads((current) => [
        { id: freshId, at: "Now", recency: "today", turns: [] },
        ...current.filter(
          (thread) => thread.id !== id && thread.turns.length > 0
        ),
      ])
      setActiveId(freshId)
      setSources(DEFAULT_SOURCES)
      setPending(null)
      setArrivingId(null)
    } else {
      setThreads((current) => current.filter((thread) => thread.id !== id))
    }
    toast.success("Chat deleted", {
      icon: TOAST_SUCCESS_ICON,
      description: threadTitle(record),
      duration: UNDO_TOAST_MS,
      action: {
        label: "Undo",
        onClick: () =>
          setThreads((current) => {
            if (current.some((thread) => thread.id === id)) return current
            const anchor = current.findIndex((thread) =>
              followers.some(
                (follower) =>
                  follower.id === thread.id && follower.at === thread.at
              )
            )
            const next = [...current]
            next.splice(anchor === -1 ? next.length : anchor, 0, record)
            return next
          }),
      },
    })
  }

  /** Closes first; the chat is filed and reset once it is out of sight (onClosed). */
  function endChat() {
    show(false)
    endedRef.current = true
  }

  // Escape closes the window while focus is in it or nowhere; a tooltip or menu that
  // takes the key first marks it handled. No deps, so show reads this render.
  useEffect(() => {
    if (hidden) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing)
        return
      if (!ownsEscape(windowRef.current)) return
      event.preventDefault()
      show(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  })

  // Every surface stays mounted; this moves them, so nothing remounts or replays.
  useWindowMotion({
    open,
    minimized,
    expanded,
    contentKey: `${active.id}:${active.turns.length === 0 ? "new" : "thread"}`,
    windowRef,
    barRef,
    launcherRef,
    followingRef,
    onBarShown: () => {
      if (focusOnOpen.current) minimizeButtonRef.current?.focus()
    },
    onClosed: () => {
      if (!endedRef.current) return
      endedRef.current = false
      startFresh()
      setExpanded(false)
    },
  })

  // No deps: the handle always runs this render's show.
  useImperativeHandle(ref, () => ({ toggle: () => show(hidden) }))

  const onSend = useStableHandler(send)
  const onStop = useStableHandler(stop)
  const onVote = useStableHandler(rate)

  return (
    // Every tooltip in the block needs this ancestor to open.
    <TooltipProvider delay={200}>
      <>
        {/* The corner the window rises from and drops back to. window-motion.ts
            swaps it with the window as the block's launcher; the reader opens the
            chat from the header, so it is never seen, focused or read out. */}
        <button
          ref={launcherRef}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          inert
          className="pointer-events-none invisible fixed end-4 bottom-4 z-40 size-8"
        />

        {/* Escape and End chat close it, Minimize folds it to the bar. Non modal and always
            mounted: it follows the launcher in the tab order, the page stays live beside it. */}
        <Card
          ref={windowRef}
          role="dialog"
          aria-modal={false}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-state={hidden ? "closed" : "open"}
          data-expanded={expanded}
          // Closed, it plays its exit without taking focus or clicks.
          inert={hidden}
          className={WINDOW}
        >
          {/* Header */}
          <WindowHeader
            titleId={titleId}
            descriptionId={descriptionId}
            threads={threads}
            activeId={active.id}
            canStartNew={active.turns.length > 0}
            surface="window"
            expanded={expanded}
            streaming={streaming}
            replying={replying}
            unread={unread}
            onNewChat={newChat}
            onSelectThread={selectThread}
            onTogglePinned={togglePinned}
            onDeleteThread={deleteThread}
            onExpandedChange={changeExpanded}
            onMinimizedChange={minimize}
            onEndChat={endChat}
          />

          {/* Everything under the header, which a fold fades out as one layer. */}
          <div data-fold="body" className="flex min-h-0 flex-1 flex-col">
            {/* Thread, or the starter rows on a fresh chat */}
            <div data-fold="content" className="flex min-h-0 flex-1 flex-col">
              {active.turns.length === 0 ? (
                <ChatStarters onSend={onSend} />
              ) : (
                <ChatThread
                  turns={active.turns}
                  arrivingId={arrivingId}
                  thinking={
                    pending?.threadId === active.id ? pending.label : null
                  }
                  ready={readyId !== null && readyId === lastTurn?.id}
                  followingRef={followingRef}
                  onSend={onSend}
                  onVote={onVote}
                />
              )}
            </div>

            {/* Composer: no top inset, the thread's own bottom padding is the gap. */}
            <div className="flex shrink-0 flex-col gap-2 px-4 pb-3">
              <Composer
                value={draft}
                onValueChange={setDraft}
                sources={sources}
                onSourcesChange={setSources}
                streaming={streaming}
                onSend={onSend}
                onStop={onStop}
                textareaRef={composerRef}
              />
              <p className="text-center text-xs text-muted-foreground">
                {FOOTNOTE}
              </p>
            </div>
          </div>
        </Card>

        {/* Sits under the window's corner, mounted, so a fold lands straight on it. */}
        <Card
          ref={barRef}
          size="sm"
          role="region"
          aria-label={ASSISTANT_NAME}
          data-size="minimized"
          data-state={open && minimized ? "open" : "closed"}
          inert={!open || !minimized}
          className={BAR}
        >
          <WindowHeader
            surface="bar"
            threads={threads}
            activeId={active.id}
            canStartNew={active.turns.length > 0}
            expanded={expanded}
            streaming={streaming}
            replying={replying}
            unread={unread}
            onNewChat={newChat}
            onSelectThread={selectThread}
            onTogglePinned={togglePinned}
            onDeleteThread={deleteThread}
            onExpandedChange={changeExpanded}
            onMinimizedChange={minimize}
            onEndChat={endChat}
            minimizeButtonRef={minimizeButtonRef}
          />
        </Card>
      </>
    </TooltipProvider>
  )
}
