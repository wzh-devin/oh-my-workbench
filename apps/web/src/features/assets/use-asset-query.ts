import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { assetApi, type AssetQuery } from "./api"
import type { RemoteEntry } from "./model"
import { rememberEntries, useAssets } from "./store"

type QueryPage = {
  cursor: string
  entries: RemoteEntry[]
  nextCursor: string
  hasMore: boolean
}
type Result = {
  key: string
  revision: number
  owner: string | null
  entries: RemoteEntry[]
  status: "loading" | "ready" | "error"
  hasMore: boolean
  loadingMore: boolean
  moreError: boolean
}
const empty = {
  entries: [] as RemoteEntry[],
  status: "loading" as const,
  hasMore: false,
  loadingMore: false,
  moreError: false,
}

/** 游标按查询/身份隔离，追加与缩略图刷新共用单请求门，旧响应不能写回新目录。 */
export const useAssetQuery = (input: AssetQuery, enabled = true) => {
  const { userId, revision } = useAssets(),
    key = JSON.stringify(input)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({
    ...empty,
    key: "",
    revision: -1,
    owner: null,
  })
  const more = useRef<() => void>(() => {})
  const loadMore = useCallback(() => more.current(), [])
  useEffect(() => {
    if (!userId || !enabled) return
    const controller = new AbortController(),
      requested = JSON.parse(key) as AssetQuery
    let pages: QueryPage[] = [],
      reading = false,
      timer: ReturnType<typeof setTimeout> | undefined
    const hasPending = (page: QueryPage) =>
      page.entries.some(
        (entry) =>
          entry.thumbnail?.status === "queued" ||
          entry.thumbnail?.status === "rendering"
      )
    const pending = () => pages.some(hasPending)
    const publish = (background = false) => {
      const entries = [
        ...new Map(
          pages
            .flatMap((page) => page.entries)
            .map((entry) => [entry.id, entry])
        ).values(),
      ]
      rememberEntries(entries, userId, true)
      setResult((current) => ({
        key,
        revision,
        owner: userId,
        entries,
        status: "ready",
        hasMore: pages.at(-1)?.hasMore ?? false,
        loadingMore: false,
        moreError: background ? current.moreError : false,
      }))
    }
    const read = async (mode: "initial" | "more" | "refresh") => {
      if (
        controller.signal.aborted ||
        reading ||
        (mode === "refresh" && document.hidden)
      )
        return
      const last = pages.at(-1)
      if (mode === "more" && (!last?.hasMore || !last.nextCursor)) return
      clearTimeout(timer)
      reading = true
      if (mode === "more")
        setResult((current) => ({
          ...current,
          loadingMore: true,
          moreError: false,
        }))
      try {
        if (mode === "refresh") {
          // 只重读有待生成产物的批次，保留已加载边界、顺序与下一游标。
          for (let index = 0; index < pages.length; index++) {
            if (!hasPending(pages[index])) continue
            const current = pages[index],
              value = await assetApi.query(
                { ...requested, cursor: current.cursor, cursorMode: true },
                controller.signal
              )
            if (controller.signal.aborted) return
            const updated = new Map(
              value.entries.map((entry) => [entry.id, entry])
            )
            pages[index] = {
              ...current,
              entries: current.entries.map(
                (entry) => updated.get(entry.id) ?? entry
              ),
            }
          }
        } else {
          const cursor = mode === "more" ? last!.nextCursor : ""
          const value = await assetApi.query(
            { ...requested, cursor, cursorMode: true },
            controller.signal
          )
          if (controller.signal.aborted) return
          if (typeof value.hasMore !== "boolean")
            throw new Error("请重启后端以启用游标加载")
          const page = {
            cursor,
            entries: value.entries,
            nextCursor: value.nextCursor ?? "",
            hasMore: value.hasMore ?? false,
          }
          if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))
            throw new Error("文件游标未更新，请刷新")
          pages = mode === "more" ? [...pages, page] : [page]
        }
        publish(mode === "refresh")
        toast.dismiss("asset-query")
      } catch (error) {
        if (controller.signal.aborted || mode === "refresh") return
        if (mode === "more")
          setResult((current) => ({
            ...current,
            loadingMore: false,
            moreError: true,
          }))
        else
          setResult({ ...empty, key, revision, owner: userId, status: "error" })
        toast.error(error instanceof Error ? error.message : "文件读取失败", {
          id: "asset-query",
          action: {
            label: "重试",
            onClick: () =>
              mode === "more"
                ? void read("more")
                : setAttempt((value) => value + 1),
          },
        })
      } finally {
        reading = false
        if (!controller.signal.aborted && pending() && !document.hidden)
          timer = setTimeout(() => void read("refresh"), 5000)
      }
    }
    more.current = () => void read("more")
    const visible = () => {
      clearTimeout(timer)
      if (!document.hidden && pending()) void read("refresh")
    }
    timer = setTimeout(() => void read("initial"), 150)
    document.addEventListener("visibilitychange", visible)
    return () => {
      clearTimeout(timer)
      controller.abort()
      more.current = () => {}
      document.removeEventListener("visibilitychange", visible)
    }
  }, [key, enabled, userId, revision, attempt])
  const current =
    result.key === key &&
    result.owner === userId &&
    result.revision === revision
      ? result
      : empty
  return { ...current, loadMore, retry: () => setAttempt((value) => value + 1) }
}
