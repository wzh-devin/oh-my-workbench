import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import {
  notifyResourceChange,
  resourceIsActive,
} from "@/lib/requests/invalidation"
import { coalesceRead } from "@/lib/requests/coalesce-read"
import {
  assetApi,
  AssetApiError,
  clearAssetContentLinks,
  getAssetContentURL,
} from "./api"
import { entrySchema } from "./model"
import type {
  AssetOverview,
  AssetView,
  ConnectionInput,
  RemoteEntry,
} from "./model"

const emptyOverview = (): AssetOverview => ({
  connections: [],
  folders: [],
  recent: [],
  views: [],
  total: 0,
  size: 0,
  images: 0,
  documents: 0,
  daily: {},
  storage: [],
})
type State = {
  userId: string | null
  overview: AssetOverview
  entries: RemoteEntry[]
  status: "loading" | "ready" | "error"
  busyIds: string[]
  revision: number
}
let state: State = {
  userId: null,
  overview: emptyOverview(),
  entries: [],
  status: "loading",
  busyIds: [],
  revision: 0,
}
let generation = 0
let reads: AbortController | null = null
let unauthorized: (() => Promise<void>) | undefined
const requests = new Set<AbortController>()
const listeners = new Set<() => void>()
const publish = (changes: Partial<State>) => {
  state = { ...state, ...changes }
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const useAssets = () => useSyncExternalStore(subscribe, () => state)
export const getAssets = () => state

/** 切换身份先取消所有在途读写，清除快照后才加载新账户。 */
export const setAssetUser = (
  userId: string | null,
  refresh?: () => Promise<void>
) => {
  unauthorized = refresh
  if (state.userId === userId) return
  clearAssetContentLinks()
  generation++
  reads?.abort()
  requests.forEach((request) => request.abort())
  requests.clear()
  publish({
    userId,
    overview: emptyOverview(),
    entries: [],
    status: "loading",
    busyIds: [],
    revision: state.revision + 1,
  })
}
/** 汇总更新统一使列表失效；失败保留上一次成功汇总并提供重试。 */
export const loadAssets = coalesceRead(
  () => generation,
  async (invalidate) => {
    if (!state.userId) return
    reads?.abort()
    const controller = new AbortController()
    reads = controller
    const owner = generation
    try {
      const [connections, folders, views] = await Promise.all([
        assetApi.connections(controller.signal),
        assetApi.directories(controller.signal),
        assetApi.views(controller.signal),
      ])
      const overview = { ...state.overview, connections, folders, views }
      if (owner !== generation || controller.signal.aborted) return
      toast.dismiss("asset-load")
      if (
        invalidate ||
        state.status !== "ready" ||
        JSON.stringify(overview) !== JSON.stringify(state.overview)
      )
        publish({ overview, status: "ready", revision: state.revision + 1 })
    } catch (error) {
      if (owner !== generation || controller.signal.aborted) return
      if (state.status !== "ready") publish({ status: "error" })
      toast.error(error instanceof Error ? error.message : "读取资产失败", {
        id: "asset-load",
        action: { label: "重试", onClick: () => void loadAssets() },
      })
      if (error instanceof AssetApiError && error.status === 401)
        void unauthorized?.()
    }
  },
  () => reads?.abort()
)
/** 请求归属固定在启动时，旧用户的迟到响应不能进入当前快照。 */
export const assetOperation = async <T>(
  key: string,
  action: (signal: AbortSignal) => Promise<T>,
  reload = true
): Promise<T> => {
  if (!state.userId || state.busyIds.includes(key))
    throw new Error("操作正在进行，请稍候")
  const owner = generation,
    controller = new AbortController()
  requests.add(controller)
  publish({ busyIds: [...state.busyIds, key] })
  try {
    const result = await action(controller.signal)
    if (owner !== generation || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError")
    const changed = entrySchema.safeParse(result)
    if (changed.success && state.userId)
      rememberEntries([changed.data], state.userId)
    if (reload) {
      if (resourceIsActive("assets")) await loadAssets(true)
      else publish({ revision: state.revision + 1 })
      notifyResourceChange("assets")
    }
    if (owner !== generation || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError")
    return result
  } catch (error) {
    if (error instanceof AssetApiError && owner === generation) {
      if (error.status === 401) void unauthorized?.()
      if (error.status === 409) void loadAssets(true)
    }
    throw error
  } finally {
    requests.delete(controller)
    if (owner === generation)
      publish({ busyIds: state.busyIds.filter((id) => id !== key) })
  }
}
/** 当前查询的已加载文件全部保留；切换查询只额外保留最近600项，深链仍可合并。 */
export const rememberEntries = (
  entries: RemoteEntry[],
  userId: string,
  currentQuery = false
) => {
  if (userId !== state.userId) return
  const cached = new Map(state.entries.map((entry) => [entry.id, entry]))
  // 追加旧批次不能覆盖预览访问、重命名等操作刚写回的新版本。
  const latest = entries.map((entry) => {
    const previous = cached.get(entry.id)
    return previous && previous.version > entry.version ? previous : entry
  })
  publish({
    entries: [
      ...new Map(
        [
          ...(currentQuery ? state.entries.slice(-600) : state.entries),
          ...latest,
        ].map((entry) => [entry.id, entry])
      ).values(),
    ],
  })
}
const entry = (id: string) => {
  const found = [
    ...state.entries,
    ...state.overview.folders,
    ...state.overview.recent,
  ].find((record) => record.id === id)
  if (!found) throw new Error("记录已变化，请重载后重试")
  return found
}
export const createFolder = async (
  connectionId: string,
  parentId: string | null,
  name: string
) =>
  (
    await assetOperation("folder:create", (signal) =>
      assetApi.folder({ connectionId, parentId, name }, signal)
    )
  ).id
export const renameEntry = (id: string, name: string) =>
  assetOperation(id, (signal) =>
    assetApi.change(id, { name, version: entry(id).version }, signal)
  )
/** 访问只回写条目版本，保留当前列表与游标；进入最近访问时再查询。 */
export const recordOpened = (id: string) =>
  assetOperation(
    `open:${id}`,
    (signal) =>
      assetApi.change(id, { opened: true, version: entry(id).version }, signal),
    false
  )

/** 请求标识保留到收到成功响应，网络重试不会重复复制或删除。 */
const batch = (
  ids: string[],
  action: string,
  target: Record<string, unknown> = {}
) => {
  const body = {
    entries: ids.map((id) => ({ id, version: entry(id).version })),
    action,
    ...target,
  }
  const storageKey = `workbench.asset-operation:${state.userId}`
  const signature = JSON.stringify(body)
  let pending: { signature: string; key: string } | null = null
  try {
    pending = JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
  } catch {
    /* 存储被禁用时仍保留服务端的请求幂等边界。 */
  }
  const requestKey =
    pending?.signature === signature ? pending.key : crypto.randomUUID()
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ signature, key: requestKey })
    )
  } catch {
    /* 不阻止已授权操作。 */
  }
  return assetOperation("entries:batch", async (signal) => {
    const result = await assetApi.batch({ ...body, requestKey }, signal)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* 成功结果不依赖浏览器存储权限。 */
    }
    return result
  })
}
export const starEntries = (ids: string[], starred: boolean) =>
  batch(ids, "star", { starred })
export const trashEntries = (ids: string[]) => batch(ids, "trash")
export const restoreEntries = (ids: string[]) => batch(ids, "restore")
export const moveEntries = (
  ids: string[],
  connectionId: string,
  parentId: string | null
) => batch(ids, "move", { connectionId, parentId })
export const copyEntries = (
  ids: string[],
  connectionId: string,
  parentId: string | null
) => batch(ids, "copy", { connectionId, parentId })
export const permanentlyDeleteEntries = (ids: string[]) => batch(ids, "delete")
export const saveAssetConnection = (input: ConnectionInput, id?: string) =>
  assetOperation(id ?? "connection:create", (signal) =>
    assetApi.connection(input, id, signal)
  )
export const testAssetConnection = (id: string) =>
  assetOperation(id, async (signal) => {
    try {
      return await assetApi.testConnection(id, signal)
    } finally {
      if (!signal.aborted) await loadAssets(true)
    }
  })
/** 失败产物由用户显式重试，成功入队后沿用当前页的批量刷新。 */
export const retryAssetThumbnail = (id: string) =>
  assetOperation(`thumbnail:${id}`, (signal) =>
    assetApi.retryThumbnail(id, signal)
  )
export const saveAssetView = (
  input: Pick<AssetView, "name" | "icon" | "filterQuery" | "sort">,
  view?: AssetView
) =>
  assetOperation(view?.id ?? "view:create", (signal) =>
    assetApi.saveView(input, view, signal)
  )
export const deleteAssetView = (view: AssetView) =>
  assetOperation(view.id, (signal) => assetApi.deleteView(view, signal))
/** 先校验下载权限，随后让浏览器流式保存，避免大文件构造成整份 Blob。 */
export const downloadRemoteAsset = (id: string) =>
  assetOperation(
    `download:${id}`,
    async (signal) => {
      const url = await getAssetContentURL(id, "download", signal)
      const link = document.createElement("a")
      link.href = url
      link.download = ""
      link.referrerPolicy = "no-referrer"
      document.body.append(link)
      link.click()
      link.remove()
    },
    false
  )
