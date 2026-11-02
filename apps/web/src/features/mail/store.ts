import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import {
  notifyResourceChange,
  resourceIsActive,
} from "@/lib/requests/invalidation"
import { coalesceRead } from "@/lib/requests/coalesce-read"
import { mailApi, MailApiError, type MessageQuery } from "./api"
import type { AccountInput, MailOverview, Message } from "./model"

const emptyOverview = (): MailOverview => ({
  accounts: [],
  messages: [],
  notifications: [],
  notificationCount: 0,
  total: 0,
  unread: 0,
  latestReceivedAt: null,
  daily: {},
  notificationsEnabled: true,
})
type State = {
  userId: string | null
  overview: MailOverview
  status: "loading" | "ready" | "error"
  busyIds: string[]
  revision: number
}
let state: State = {
  userId: null,
  overview: emptyOverview(),
  status: "loading",
  busyIds: [],
  revision: 0,
}
let generation = 0
let reads: AbortController | null = null
const requests = new Set<AbortController>()
const listeners = new Set<() => void>()
let unauthorized: (() => Promise<void>) | undefined
const publish = (next: Partial<State>) => {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const useMail = () => useSyncExternalStore(subscribe, () => state)

/** Identity changes clear all mail before the next paint and invalidate pending requests. */
export const setMailUser = (
  userId: string | null,
  refresh?: () => Promise<void>
) => {
  unauthorized = refresh
  if (userId === state.userId) return
  generation++
  reads?.abort()
  requests.forEach((controller) => controller.abort())
  requests.clear()
  publish({
    userId,
    overview: emptyOverview(),
    status: "loading",
    busyIds: [],
    revision: state.revision + 1,
  })
}
export const loadMail = coalesceRead(
  () => generation,
  async (invalidate) => {
    if (!state.userId) return
    reads?.abort()
    const controller = new AbortController()
    reads = controller
    const owner = generation
    try {
      const accounts = await mailApi.accounts(controller.signal)
      const overview = {
        ...state.overview,
        accounts,
        total: accounts.reduce((n, a) => n + a.total, 0),
        unread: accounts.reduce((n, a) => n + a.unread, 0),
      }
      if (owner !== generation || controller.signal.aborted) return
      toast.dismiss("mail-load")
      // SSE 重连和轮询可能没有新数据，不通知所有消费者重复查询。
      if (
        invalidate ||
        state.status !== "ready" ||
        JSON.stringify(overview) !== JSON.stringify(state.overview)
      )
        publish({ overview, status: "ready", revision: state.revision + 1 })
    } catch (error) {
      if (owner !== generation || controller.signal.aborted) return
      if (state.status !== "ready") publish({ status: "error" })
      toast.error(error instanceof Error ? error.message : "读取邮箱失败", {
        id: "mail-load",
        action: { label: "重试", onClick: () => void loadMail() },
      })
      if (error instanceof MailApiError && error.status === 401)
        void unauthorized?.()
    }
  },
  () => reads?.abort()
)

/** A single mutation owns its toast; dialogs close only after a non-null result. */
const mutate = async <T>(
  key: string,
  request: (signal: AbortSignal) => Promise<T>,
  reload = true
): Promise<T | null> => {
  if (!state.userId || state.busyIds.includes(key)) return null
  const owner = generation
  const controller = new AbortController()
  requests.add(controller)
  publish({ busyIds: [...state.busyIds, key] })
  try {
    const result = await request(controller.signal)
    if (owner !== generation || controller.signal.aborted) return null
    if (reload && resourceIsActive("mail")) await loadMail(true)
    notifyResourceChange("mail")
    if (owner !== generation || controller.signal.aborted) return null
    return result
  } catch (error) {
    if (owner !== generation || controller.signal.aborted) return null
    toast.error(error instanceof Error ? error.message : "邮箱操作失败，请重试")
    if (error instanceof MailApiError && error.status === 401)
      void unauthorized?.()
    if (error instanceof MailApiError && error.status === 409) void loadMail()
    return null
  } finally {
    requests.delete(controller)
    if (owner === generation)
      publish({ busyIds: state.busyIds.filter((id) => id !== key) })
  }
}
export const saveMailAccount = (input: AccountInput, id?: string) =>
  mutate(id ?? "account:create", (signal) => mailApi.account(input, id, signal))
export const syncMailAccount = (id: string) =>
  mutate(`sync:${id}`, (signal) => mailApi.sync(id, signal))
export const changeMailMessage = (
  message: Message,
  changes: { read?: boolean; starred?: boolean; archived?: boolean }
) =>
  mutate(message.id, (signal) =>
    mailApi.change(message.id, { version: message.version, ...changes }, signal)
  )
export const setMailNotifications = (enabled: boolean) =>
  mutate("preferences", async (signal) => {
    await mailApi.preferences(enabled, signal)
    publish({ overview: { ...state.overview, notificationsEnabled: enabled } })
    return true
  })
// 回执已保存，后续刷新失败也不能让通知继续占位。
const acknowledgeNotifications = (ids?: string[]) => {
  reads?.abort()
  const selected = ids ? new Set(ids) : null
  const { notifications, notificationCount } = state.overview
  const remaining = selected
    ? notifications.filter((notice) => !selected.has(notice.id))
    : []
  publish({
    overview: {
      ...state.overview,
      notifications: remaining,
      notificationCount: selected
        ? Math.max(
            0,
            notificationCount -
              notifications.filter(
                (notice) => selected.has(notice.id) && notice.readAt === null
              ).length
          )
        : 0,
    },
  })
}
export const readMailNotifications = (ids: string[]) =>
  mutate("notifications", async (signal) => {
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200)
      await mailApi.readNotifications(batch, signal)
      if (signal.aborted) return false
      acknowledgeNotifications(batch)
    }
    return true
  })
export const readAllMailNotifications = () =>
  mutate("notifications", async (signal) => {
    await mailApi.readAllNotifications(signal)
    if (signal.aborted) return false
    acknowledgeNotifications()
    return true
  })
export const loadMoreMailNotifications = () =>
  mutate(
    "notifications:more",
    async (signal) => {
      const notices = state.overview.notifications
      if (!notices.length) return true
      const next = await mailApi.notifications(
        notices[notices.length - 1].id,
        signal
      )
      // 已读或刷新改变了列表，丢弃基于旧游标的晚到分页。
      if (!signal.aborted && state.overview.notifications === notices)
        publish({
          overview: {
            ...state.overview,
            notifications: [
              ...state.overview.notifications,
              ...next.filter(
                (item) =>
                  !state.overview.notifications.some(
                    (old) => old.id === item.id
                  )
              ),
            ],
          },
        })
      return true
    },
    false
  )

/** 集合操作只发送筛选规则，成功后统一刷新导航计数和各页。 */
export const bulkMailMessages = (
  scope: MessageQuery,
  action: "read" | "archive-read"
) =>
  mutate("messages:bulk", (signal) =>
    mailApi.bulk({ ...scope, action }, signal)
  )

/** 通知设置只读取偏好，保留邮箱列表尚未加载的状态。 */
export const loadMailPreferences = async () => {
  if (!state.userId) return
  const owner = generation,
    controller = new AbortController()
  requests.add(controller)
  try {
    const value = await mailApi.readPreferences(controller.signal)
    if (owner === generation && !controller.signal.aborted)
      publish({
        overview: {
          ...state.overview,
          notificationsEnabled: value.notificationsEnabled,
        },
      })
  } catch (error) {
    if (!controller.signal.aborted) {
      toast.error(error instanceof Error ? error.message : "读取通知设置失败")
      if (error instanceof MailApiError && error.status === 401)
        void unauthorized?.()
    }
  } finally {
    requests.delete(controller)
  }
}
