import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { noteApi, type NoteQuery } from "./api"
import type { Note, Notebook, NoteView } from "./model"

type Status = "ready" | "error"
/** 配置和当前列表独立加载；请求键派生加载态，查询变化取消旧请求。 */
export const useNotesData = (query: NoteQuery, queryError: string | null) => {
  const [bookRevision, setBookRevision] = useState(0)
  const [books, setBooks] = useState<{
    revision: number
    records: Notebook[]
    views: NoteView[]
    status: Status
  }>({ revision: -1, records: [], views: [], status: "ready" })
  const [revision, setRevision] = useState(0)
  const resolvedView =
    !query.viewId && ["favorite", "locked"].includes(query.scope)
      ? books.views.find((view) => view.builtinKey === query.scope)?.id
      : undefined
  const key = JSON.stringify({ ...query, viewId: query.viewId || resolvedView })
  const requestKey = JSON.stringify([key, revision])
  const [page, setPage] = useState<{
    key: string
    records: Note[]
    total: number
    status: Status
  }>({ key: "", records: [], total: 0, status: "ready" })
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      noteApi.notebooks(controller.signal),
      noteApi.views(controller.signal),
    ]).then(
      ([records, views]) => {
        if (!controller.signal.aborted)
          setBooks({ revision: bookRevision, records, views, status: "ready" })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setBooks((previous) => ({
            ...previous,
            revision: bookRevision,
            status: "error",
          }))
          toast.error(
            error instanceof Error ? error.message : "读取笔记本失败",
            { id: "notes-books" }
          )
        }
      }
    )
    return () => controller.abort()
  }, [bookRevision])
  useEffect(() => {
    if (queryError) {
      toast.error(queryError, { id: "notes-query" })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void noteApi.page(JSON.parse(key) as NoteQuery, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted)
            setPage({
              key: requestKey,
              records: result.records,
              total: result.total,
              status: "ready",
            })
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setPage((previous) => ({
              ...previous,
              key: requestKey,
              status: "error",
            }))
            toast.error(
              error instanceof Error ? error.message : "读取笔记失败",
              { id: "notes-page" }
            )
          }
        }
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, requestKey, queryError])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const refreshBooks = useCallback(() => {
    setBookRevision((value) => value + 1)
    setRevision((value) => value + 1)
  }, [])
  /** 保存回执只替换元数据，正文编辑不会额外读取配置或详情。 */
  const remember = useCallback((note: Note) => {
    setPage((previous) => ({
      ...previous,
      records: previous.records.map((record) =>
        record.id === note.id ? note : record
      ),
    }))
  }, [])
  return {
    notebooks: books.records,
    views: books.views,
    booksStatus:
      books.revision !== bookRevision ? ("loading" as const) : books.status,
    records: page.records,
    total: page.total,
    pageStatus: queryError
      ? ("error" as const)
      : page.key !== requestKey
        ? ("loading" as const)
        : page.status,
    refresh,
    refreshBooks,
    rememberView: (view: NoteView) =>
      setBooks((previous) => ({
        ...previous,
        views: previous.views.some((entry) => entry.id === view.id)
          ? previous.views.map((entry) => (entry.id === view.id ? view : entry))
          : [...previous.views, view],
      })),
    remember,
  }
}
