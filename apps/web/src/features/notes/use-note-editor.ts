import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { verifyPasskey } from "./passkeys"
import { createNoteApi, NoteApiError } from "./api"
import { contentKey, type Draft, type Note, type NoteContent } from "./model"

type EditorState = {
  draft: Draft | null
  source: Note | null
  selected: Note | null
  dirty: boolean
  status: "idle" | "loading" | "saving" | "error" | "conflict"
  concealed: boolean
  remote: Note | null
}
const initial: EditorState = {
  draft: null,
  source: null,
  selected: null,
  dirty: false,
  status: "idle",
  concealed: false,
  remote: null,
}
const meta = ({ markdown: _markdown, ...note }: Note): Note => note
const content = (note: Note): Draft => ({
  title: note.title,
  markdown: note.markdown ?? "",
  notebookId: note.notebookId,
  tags: note.tags,
  favorite: note.favorite,
  requiresUnlock: note.requiresUnlock,
  diaryDate: note.diaryDate,
  requestId: crypto.randomUUID(),
})

/** 单笔记保存队列；网络失败、CAS 冲突和锁定均保留内存草稿，不持久化正文。 */
export const useNoteEditor = (
  onSaved: (note: Note, previous: Note | null) => void
) => {
  const [noteApi] = useState(() => createNoteApi(crypto.randomUUID()))
  const [state, setState] = useState<EditorState>(initial)
  const current = useRef<EditorState>(initial)
  const savedKey = useRef("")
  const pending = useRef<Promise<boolean> | null>(null)
  const reading = useRef<AbortController | null>(null)
  const composing = useRef(false)
  const timers = useRef<{
    debounce?: ReturnType<typeof setTimeout>
    maximum?: ReturnType<typeof setTimeout>
    lock?: ReturnType<typeof setTimeout>
  }>({})
  const deadline = useRef(0)
  const mounted = useRef(true)
  const generation = useRef(0)
  const invalidate = useCallback(() => {
    ++generation.current
  }, [])
  const channel = useRef<BroadcastChannel | null>(null)
  const callback = useRef(onSaved)
  const retry = useRef<() => Promise<boolean>>(async () => false)
  useEffect(() => {
    callback.current = onSaved
  }, [onSaved])
  const publish = useCallback((changes: Partial<EditorState>) => {
    current.current = { ...current.current, ...changes }
    if (mounted.current) setState(current.current)
  }, [])
  const clearSaveTimers = useCallback(() => {
    clearTimeout(timers.current.debounce)
    clearTimeout(timers.current.maximum)
    timers.current.debounce = undefined
    timers.current.maximum = undefined
  }, [])
  const conceal = useCallback(() => {
    deadline.current = 0
    clearTimeout(timers.current.lock)
    const m = current.current
    if (m.draft?.requiresUnlock || m.selected?.requiresUnlock) {
      composing.current = false
      reading.current?.abort()
      clearSaveTimers()
      if (!m.dirty) savedKey.current = ""
      publish({
        concealed: true,
        remote: null,
        draft: m.dirty ? m.draft : null,
        status: "idle",
      })
    }
  }, [clearSaveTimers, publish])
  const setDeadline = useCallback(
    (value?: string) => {
      if (!value || !mounted.current) return
      clearTimeout(timers.current.lock)
      deadline.current = Date.parse(value)
      timers.current.lock = setTimeout(
        conceal,
        Math.max(0, deadline.current - new Date().getTime())
      )
    },
    [conceal]
  )

  const save = useCallback((): Promise<boolean> => {
    if (pending.current)
      return pending.current.then((saved) => saved && !composing.current)
    if (composing.current) return Promise.resolve(false)
    if (!current.current.dirty) return Promise.resolve(true)
    if (
      composing.current ||
      current.current.concealed ||
      current.current.status === "conflict"
    )
      return Promise.resolve(false)
    clearSaveTimers()
    const epoch = generation.current
    const task = (async () => {
      while (current.current.dirty) {
        const m = current.current
        if (!m.draft || m.concealed || composing.current) return false
        const sent = m.draft
        if (
          [...sent.title.trim()].length > 200 ||
          sent.tags.length > 10 ||
          sent.tags.some((tag) => [...tag].length > 24) ||
          new TextEncoder().encode(sent.markdown).length > 1_048_576
        ) {
          publish({ status: "error" })
          toast.error(
            "标题最多 200 字、标签最多 10 个且每个 24 字，正文最多 1 MiB",
            { id: "note-save" }
          )
          return false
        }
        publish({ status: "saving" })
        const sentKey = contentKey(sent)
        try {
          let result: Note
          try {
            result = await noteApi.save(
              sent,
              sent.requestId,
              m.source ?? undefined
            )
          } catch (error) {
            if (
              !(error instanceof NoteApiError) ||
              error.status !== 409 ||
              !m.source
            )
              throw error
            // A lost acknowledgement is success only when every submitted field matches the server.
            const remote = await noteApi.detail(m.source.id)
            if (!mounted.current || epoch !== generation.current) return true
            if (contentKey(content(remote)) !== sentKey) {
              publish({ status: "conflict", remote })
              toast.error("笔记已在其他位置更新", { id: "note-save" })
              return false
            }
            result = remote
            setDeadline(remote.unlockedUntil)
          }
          if (!mounted.current || epoch !== generation.current) return true
          if (!m.source && result.version > 1) {
            const remote = await noteApi.detail(result.id)
            if (!mounted.current || epoch !== generation.current) return true
            if (contentKey(content(remote)) !== sentKey || remote.deletedAt) {
              publish({
                status: "conflict",
                source: meta(result),
                selected: meta(result),
                remote,
              })
              return false
            }
          }
          savedKey.current = sentKey
          const dirty =
            current.current.draft !== null &&
            contentKey(current.current.draft) !== sentKey
          publish({
            source: meta(result),
            selected: meta(result),
            dirty,
            status: "idle",
          })
          callback.current(meta(result), m.source)
          if (!dirty || current.current.concealed) return true
        } catch (error) {
          if (!mounted.current || epoch !== generation.current) return false
          if (error instanceof NoteApiError && error.status === 423) {
            conceal()
          } else {
            publish({ status: "error" })
            toast.error(
              error instanceof Error ? error.message : "保存失败，请重试",
              {
                id: "note-save",
                action: {
                  label: "重试",
                  onClick: () => {
                    void retry.current()
                  },
                },
              }
            )
          }
          clearSaveTimers()
          return false
        }
      }
      return true
    })().finally(() => {
      pending.current = null
    })
    pending.current = task
    return task
  }, [clearSaveTimers, conceal, publish, setDeadline, noteApi])
  useEffect(() => {
    retry.current = save
  }, [save])

  /** 切换目标前等待保存；读取取消后不接收上一篇正文。 */
  const open = useCallback(
    async function openNote(selected: Note): Promise<boolean> {
      if (!(await save())) return false
      reading.current?.abort()
      if (current.current.selected?.id !== selected.id) {
        noteApi.rotateContext()
        deadline.current = 0
        clearTimeout(timers.current.lock)
      }
      const controller = new AbortController()
      reading.current = controller
      publish(initial)
      try {
        const summary = await noteApi.metadata(selected.id, controller.signal)
        if (controller.signal.aborted) return false
        if (
          summary.requiresUnlock &&
          deadline.current <= new Date().getTime()
        ) {
          savedKey.current = ""
          publish({ ...initial, selected: meta(summary), concealed: true })
          return true
        }
        publish({ ...initial, selected: meta(summary), status: "loading" })
        const note = await noteApi.detail(selected.id, controller.signal)
        if (controller.signal.aborted) return false
        const draft = content(note)
        savedKey.current = contentKey(draft)
        publish({
          source: meta(note),
          selected: meta(note),
          draft,
          status: "idle",
        })
        setDeadline(note.unlockedUntil)
        return true
      } catch (error) {
        if (controller.signal.aborted) return false
        if (error instanceof NoteApiError && error.status === 423) {
          publish({
            selected: { ...meta(selected), requiresUnlock: true },
            concealed: true,
            status: "idle",
          })
        } else {
          publish({ status: "error" })
          toast.error(error instanceof Error ? error.message : "读取笔记失败", {
            id: "note-read",
            action: {
              label: "重试",
              onClick: () => {
                void openNote(selected)
              },
            },
          })
          return false
        }
        return true
      }
    },
    [publish, save, setDeadline, noteApi]
  )
  const create = useCallback(
    async (draft: Draft, persistImmediately = true) => {
      if (!(await save())) return false
      reading.current?.abort()
      savedKey.current = persistImmediately ? "" : contentKey(draft)
      publish({ ...initial, draft, dirty: persistImmediately })
      return true
    },
    [publish, save]
  )
  const change = useCallback(
    (changes: Partial<NoteContent>) => {
      const m = current.current
      if (!m.draft || m.concealed) return
      const draft = { ...m.draft, ...changes }
      publish({
        draft,
        dirty: contentKey(draft) !== savedKey.current,
        status: m.status === "conflict" ? "conflict" : "idle",
      })
    },
    [publish]
  )
  useEffect(() => {
    if (
      !state.dirty ||
      state.concealed ||
      state.status !== "idle" ||
      composing.current
    )
      return
    clearTimeout(timers.current.debounce)
    const debounce = setTimeout(() => {
      void save()
    }, 800)
    timers.current.debounce = debounce
    if (!timers.current.maximum)
      timers.current.maximum = setTimeout(() => {
        void save()
      }, 5000)
    // Edits own the debounce; save acknowledgements do not schedule another request.
    return () => clearTimeout(debounce)
  }, [state.draft, state.dirty, state.concealed, save, state.status])

  const composition = useCallback(
    (active: boolean) => {
      composing.current = active
      if (active) clearSaveTimers()
      else if (current.current.dirty)
        timers.current.debounce = setTimeout(() => {
          void save()
        }, 800)
    },
    [clearSaveTimers, save]
  )
  const acceptUnlock = useCallback(
    async (expiresAt: string, target: string | undefined) => {
      const m = current.current
      if (target !== (m.draft?.requestId ?? m.selected?.id)) return
      setDeadline(expiresAt)
      if (m.draft) publish({ concealed: false, status: "idle" })
      else if (m.selected) await open(m.selected)
    },
    [open, publish, setDeadline]
  )
  const unlock = useCallback(
    async (password: string) => {
      const target =
        current.current.draft?.requestId ?? current.current.selected?.id
      await acceptUnlock((await noteApi.unlock(password)).expiresAt, target)
    },
    [acceptUnlock, noteApi]
  )
  const unlockWithPasskey = useCallback(async () => {
    const target =
      current.current.draft?.requestId ?? current.current.selected?.id
    await acceptUnlock((await verifyPasskey(noteApi)).expiresAt, target)
  }, [acceptUnlock, noteApi])
  const lock = useCallback(async () => {
    if (!(await save())) return false
    await noteApi.lock()
    if (!mounted.current) return true
    channel.current?.postMessage("lock")
    conceal()
    return true
  }, [conceal, save, noteApi])
  const clear = useCallback(() => {
    invalidate()
    void noteApi.lock().catch(() => {})
    noteApi.rotateContext()
    deadline.current = 0
    clearTimeout(timers.current.lock)
    composing.current = false
    reading.current?.abort()
    clearSaveTimers()
    savedKey.current = ""
    publish(initial)
  }, [clearSaveTimers, publish, invalidate, noteApi])
  const discard = useCallback(() => {
    invalidate()
    composing.current = false
    savedKey.current = ""
    publish({ dirty: false })
  }, [publish, invalidate])
  const useRemote = useCallback(() => {
    const remote = current.current.remote
    if (!remote) return
    const draft = content(remote)
    savedKey.current = contentKey(draft)
    publish({
      draft,
      source: meta(remote),
      selected: meta(remote),
      remote: null,
      dirty: false,
      status: "idle",
    })
    setDeadline(remote.unlockedUntil)
  }, [publish, setDeadline])
  const saveCopy = useCallback(async () => {
    const draft = current.current.draft
    if (!draft) return false
    const copy = {
      ...draft,
      title: (draft.title || "未命名笔记") + " 副本",
      requestId: crypto.randomUUID(),
    }
    publish({
      draft: copy,
      source: null,
      selected: null,
      remote: null,
      dirty: true,
      status: "idle",
    })
    return save()
  }, [publish, save])
  useEffect(() => {
    mounted.current = true
    const timerState = timers.current
    const resume = () => {
      if (deadline.current && deadline.current <= new Date().getTime())
        conceal()
    }
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void save()
      }
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("keydown", keydown)
    window.addEventListener("beforeunload", beforeUnload)
    window.addEventListener("focus", resume)
    document.addEventListener("visibilitychange", resume)
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("notes-security")
      channel.current.onmessage = (event) => {
        if (event.data === "lock") conceal()
      }
    }
    return () => {
      mounted.current = false
      if (deadline.current) void noteApi.lock().catch(() => {})
      invalidate()
      reading.current?.abort()
      clearSaveTimers()
      clearTimeout(timerState.lock)
      channel.current?.close()
      channel.current = null
      window.removeEventListener("keydown", keydown)
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("focus", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [clearSaveTimers, conceal, save, invalidate, noteApi])
  const getSource = useCallback(() => current.current.source, [])
  const getDraft = useCallback(() => current.current.draft, [])
  const getSelectedId = useCallback(
    () => current.current.selected?.id ?? null,
    []
  )
  const isUnlocked = useCallback(
    () => deadline.current > new Date().getTime(),
    []
  )
  return {
    ...state,
    api: noteApi,
    save,
    open,
    create,
    change,
    composition,
    unlock,
    unlockWithPasskey,
    lock,
    clear,
    discard,
    useRemote,
    saveCopy,
    conceal,
    getSource,
    getDraft,
    getSelectedId,
    isUnlocked,
    hasUnsaved: () => current.current.dirty || composing.current,
  }
}
