import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { toast } from "sonner"
import { useWorkbench } from "./store"
import {
  emptyNotifications,
  notificationPageSchema,
  useWorkbenchQuery,
  workbenchRequest,
} from "./remote"
import { notifyResourceChange } from "@/lib/requests/invalidation"
/** 全局通知独立分页，已读偏好参与服务器计数，追加页绑定同一快照。 */
export const useNotifications = () => {
  const { data } = useWorkbench()
  const kinds = Object.entries(data.preferences.notifications)
    .filter(([, enabled]) => enabled)
    .map(([kind]) => kind)
  const body = {
    pageNum: 1,
    pageSize: 50,
    kinds,
    readIds: data.notificationReadIds,
  }
  const feed = useWorkbenchQuery(
    "/notifications/page",
    notificationPageSchema,
    emptyNotifications,
    body,
    ""
  )
  const [extra, setExtra] = useState({
    base: emptyNotifications,
    records: emptyNotifications.records,
    page: 1,
  })
  const pending = useRef<AbortController | null>(null),
    [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => () => pending.current?.abort(), [feed.data])
  const records =
    extra.base === feed.data
      ? [...feed.data.records, ...extra.records]
      : feed.data.records
  const loadMore = async () => {
    if (pending.current || feed.status !== "ready") return
    const base = feed.data,
      page = extra.base === base ? extra.page + 1 : 2,
      controller = new AbortController()
    pending.current = controller
    setLoadingMore(true)
    try {
      const next = await workbenchRequest(
        "/notifications/page",
        notificationPageSchema,
        controller.signal,
        { ...body, pageNum: page }
      )
      if (!controller.signal.aborted)
        setExtra((current) => ({
          base,
          page,
          records: [
            ...new Map(
              [
                ...(current.base === base ? current.records : []),
                ...next.records,
              ].map((record) => [record.id, record])
            ).values(),
          ],
        }))
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(error instanceof Error ? error.message : "读取通知失败")
    } finally {
      if (pending.current === controller) pending.current = null
      setLoadingMore(false)
    }
  }
  const readAll = async () => {
    const controller = new AbortController()
    try {
      await workbenchRequest(
        "/notifications/readAll",
        z.null(),
        controller.signal,
        { kinds }
      )
      feed.reload()
      notifyResourceChange("mail")
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "标记通知失败")
      return false
    }
  }
  return {
    ...feed,
    records,
    unread: feed.data.total,
    hasMore: records.length < feed.data.total,
    loadMore,
    loadingMore,
    readAll,
  }
}
