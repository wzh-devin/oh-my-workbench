import type { FilterQuery } from "@/components/reui/filters/filters-types"
import { matchesQuery } from "@/features/workbench/filters"
import type { Asset, AssetFolder, Workbench } from "@/features/workbench/model"
import type { RemoteEntry } from "./model"

export type AssetEntry = (
  (Asset & { kind: "file" }) | (AssetFolder & { kind: "folder" })
) & {
  thumbnail?: RemoteEntry["thumbnail"]
}

export const assetEntries = (data: Workbench): AssetEntry[] => [
  ...data.assetFolders.map((folder) => ({
    ...folder,
    kind: "folder" as const,
  })),
  ...data.assets.map((asset) => ({ ...asset, kind: "file" as const })),
]

/** 目录链按根到叶返回，损坏或循环数据不继续遍历。 */
export const folderTrail = (data: Workbench, parentId: string | null) => {
  const folderMap = new Map(
    data.assetFolders.map((folder) => [folder.id, folder])
  )
  const folders: AssetFolder[] = []
  const visited = new Set<string>()
  let folder = parentId ? folderMap.get(parentId) : undefined
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id)
    folders.unshift(folder)
    folder = folder.parentId ? folderMap.get(folder.parentId) : undefined
  }
  return folders
}

/** 父目录进回收站后整棵子树隐藏，子项原有的删除状态保持独立。 */
export const trashedEntryIds = (data: Workbench) => {
  const folderMap = new Map(
    data.assetFolders.map((folder) => [folder.id, folder])
  )
  const memo = new Map<string, boolean>()
  const folderIsTrashed = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!
    const folder = folderMap.get(id)
    const trashed =
      !folder ||
      !!folder.trashedAt ||
      (!!folder.parentId && folderIsTrashed(folder.parentId))
    memo.set(id, trashed)
    return trashed
  }
  return new Set(
    assetEntries(data)
      .filter(
        (entry) =>
          entry.trashedAt || (entry.parentId && folderIsTrashed(entry.parentId))
      )
      .map((entry) => entry.id)
  )
}

/** Dashboard 与 Workflow 统一排除回收站及被删除目录中的文件。 */
export const activeAssets = (data: Workbench) => {
  const trashIds = trashedEntryIds(data)
  return data.assets.filter((asset) => !trashIds.has(asset.id))
}

/** 多选包含父子项时只保留最外层，避免复制或移动同一子树两次。 */
export const selectionRoots = (data: Workbench, ids: string[]) => {
  const selectedIds = new Set(ids)
  return assetEntries(data).filter(
    (entry) =>
      selectedIds.has(entry.id) &&
      !folderTrail(data, entry.parentId).some((folder) =>
        selectedIds.has(folder.id)
      )
  )
}

/** 同存储内递归收集子树，永久删除同时包括已删除的子项。 */
export const subtreeIds = (data: Workbench, roots: AssetEntry[]) => {
  const childrenMap = new Map<string, AssetEntry[]>()
  assetEntries(data).forEach((entry) => {
    if (entry.parentId)
      childrenMap.set(entry.parentId, [
        ...(childrenMap.get(entry.parentId) ?? []),
        entry,
      ])
  })
  const ids = new Set<string>()
  const visit = (entry: AssetEntry) => {
    if (ids.has(entry.id)) return
    ids.add(entry.id)
    childrenMap.get(entry.id)?.forEach(visit)
  }
  roots.forEach(visit)
  return ids
}

/** 目录和文件名称共用路径安全约束。 */
export const assetName = (name: string) => {
  const normalized = name.trim()
  if (
    !normalized ||
    normalized.length > 200 ||
    /[/\\]/.test(normalized) ||
    Array.from(normalized).some((character) => character.charCodeAt(0) < 32) ||
    normalized === "." ||
    normalized === ".."
  ) {
    throw new Error("名称需为 1–200 个字符，不能包含路径分隔符。")
  }
  return normalized
}

/** 每次写入前校验目标目录，拒绝跨存储或已删除目录。 */
export const assertDestination = (
  data: Workbench,
  connectionId: string,
  parentId: string | null
) => {
  if (!data.connections.some((connection) => connection.id === connectionId))
    throw new Error("存储不存在。")
  if (
    parentId &&
    !data.assetFolders.some(
      (folder) =>
        folder.id === parentId &&
        folder.connectionId === connectionId &&
        !trashedEntryIds(data).has(folder.id)
    )
  ) {
    throw new Error("目标文件夹不可用，请重新选择。")
  }
  if (folderTrail(data, parentId).length >= 64)
    throw new Error("目录最多支持 64 层。")
}

/** 同目录文件与文件夹共享名称空间，阻止无意覆盖。 */
export const assertAvailableName = (
  data: Workbench,
  connectionId: string,
  parentId: string | null,
  name: string,
  excludeIds: string[] = []
) => {
  if (
    assetEntries(data).some(
      (entry) =>
        entry.connectionId === connectionId &&
        entry.parentId === parentId &&
        !entry.trashedAt &&
        entry.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        !excludeIds.includes(entry.id)
    )
  ) {
    throw new Error(`已存在“${name}”，请修改名称。`)
  }
}

/** 自动保留副本，上传、复制和恢复均不覆盖已有内容。 */
export const availableName = (
  data: Workbench,
  connectionId: string,
  parentId: string | null,
  name: string,
  folder = false
) => {
  const names = new Set(
    assetEntries(data)
      .filter(
        (entry) =>
          entry.connectionId === connectionId &&
          entry.parentId === parentId &&
          !entry.trashedAt
      )
      .map((entry) => entry.name.toLocaleLowerCase())
  )
  if (!names.has(name.toLocaleLowerCase())) return name
  const dot = folder ? -1 : name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  let index = 1
  const candidate = () => {
    const suffix = ` (${index})${extension}`
    return `${stem.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`
  }
  while (names.has(candidate().toLocaleLowerCase())) index += 1
  return candidate()
}

/** 按浏览器媒体类型及扩展名展示分类。 */
export const assetKind = (asset: Pick<Asset, "name" | "type">) =>
  asset.type.startsWith("image/")
    ? "图片"
    : asset.type.startsWith("video/")
      ? "视频"
      : asset.type.startsWith("audio/")
        ? "音频"
        : /\.(csv|xlsx?|tsv)$/i.test(asset.name)
          ? "表格"
          : /\.(md|txt|pdf|docx?|json)$/i.test(asset.name)
            ? "文档"
            : /\.(zip|rar|7z|tar|gz)$/i.test(asset.name)
              ? "压缩包"
              : "其他"

/** 直接链接同时保存存储、父目录和预览文件。 */
export const assetHref = (asset: Asset) => {
  const params = new URLSearchParams({
    connection: asset.connectionId,
    file: asset.id,
  })
  if (asset.parentId) params.set("folder", asset.parentId)
  return `/assets?${params}`
}

/** 当前目录、智能视图和搜索结果使用一致的可见性与排序规则。 */
export const browseAssets = (
  data: Workbench,
  {
    connectionId,
    parentId,
    view,
    search,
    query,
    sort,
  }: {
    connectionId: string
    parentId: string | null
    view: string
    search: string
    query: FilterQuery
    sort: string
  }
) => {
  const trashIds = trashedEntryIds(data)
  const searching = !!search.trim() || query.rules.length > 0
  return assetEntries(data)
    .filter((entry) => {
      if (connectionId !== "all" && entry.connectionId !== connectionId)
        return false
      if (view === "trash") {
        if (
          !entry.trashedAt ||
          folderTrail(data, entry.parentId).some(
            (ancestor) => ancestor.trashedAt
          )
        )
          return false
      } else {
        if (trashIds.has(entry.id)) return false
        if (view === "recent" && !entry.lastOpenedAt) return false
        if (view === "starred" && !entry.starred) return false
        if (view === "files" && !searching && entry.parentId !== parentId)
          return false
      }
      return (
        entry.name
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()) &&
        matchesQuery(query, {
          kind: entry.kind === "folder" ? "文件夹" : assetKind(entry),
        })
      )
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
      if (view === "recent")
        return (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "")
      if (view === "trash")
        return (b.trashedAt ?? "").localeCompare(a.trashedAt ?? "")
      if (sort === "date")
        return (b.updatedAt ?? b.createdAt).localeCompare(
          a.updatedAt ?? a.createdAt
        )
      if (sort === "size")
        return (
          (b.kind === "file" ? b.size : 0) - (a.kind === "file" ? a.size : 0)
        )
      return a.name.localeCompare(b.name, "zh-CN", { numeric: true })
    })
}
