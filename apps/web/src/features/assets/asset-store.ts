import type { Workbench } from "@/features/workbench/model"
import { deleteFiles, putFiles } from "@/features/workbench/local-files"
import {
  flushFileDeletes,
  getWorkbench,
  readAsset,
  updateWorkbench,
} from "@/features/workbench/store"
import {
  assertAvailableName,
  assertDestination,
  assetEntries,
  assetName,
  availableName,
  folderTrail,
  selectionRoots,
  subtreeIds,
  trashedEntryIds,
  type AssetEntry,
} from "./asset-rules"

/** 所有目录操作先完成校验，保存失败时维持最后一个有效快照。 */
const commit = (change: (data: Workbench) => Workbench) => {
  const next = change(getWorkbench())
  if (!updateWorkbench(() => next)) throw new Error("保存失败，请重试。")
}
const mapEntries = (
  data: Workbench,
  transform: (entry: AssetEntry) => AssetEntry
): Workbench => {
  const entries = assetEntries(data).map(transform)
  return {
    ...data,
    assets: entries.filter((entry) => entry.kind === "file"),
    assetFolders: entries.filter((entry) => entry.kind === "folder"),
  }
}

/** 创建当前存储中的空目录，名称冲突不会覆盖已有条目。 */
export const createFolder = (
  connectionId: string,
  parentId: string | null,
  name: string
) => {
  const id = crypto.randomUUID()
  commit((data) => {
    assertDestination(data, connectionId, parentId)
    name = assetName(name)
    assertAvailableName(data, connectionId, parentId, name)
    const now = new Date().toISOString()
    return {
      ...data,
      assetFolders: [
        ...data.assetFolders,
        {
          id,
          name,
          connectionId,
          parentId,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: null,
          starred: false,
          trashedAt: null,
        },
      ],
    }
  })
  return id
}

/** 仅更新名称和修改时间，保留文件内容索引与目录关联。 */
export const renameEntry = (id: string, name: string) =>
  commit((data) => {
    const entry = assetEntries(data).find((record) => record.id === id)
    if (!entry || trashedEntryIds(data).has(id))
      throw new Error("文件或文件夹不可用。")
    name = assetName(name)
    assertAvailableName(data, entry.connectionId, entry.parentId, name, [id])
    return mapEntries(data, (record) =>
      record.id === id
        ? { ...record, name, updatedAt: new Date().toISOString() }
        : record
    )
  })

/** 批量收藏仅作用于可用记录。 */
export const starEntries = (ids: string[], starred: boolean) =>
  commit((data) => {
    const trashIds = trashedEntryIds(data)
    return mapEntries(data, (entry) =>
      ids.includes(entry.id) && !trashIds.has(entry.id)
        ? { ...entry, starred }
        : entry
    )
  })

/** 记录最近访问，不改变文件的修改时间。 */
export const recordOpened = (id: string) =>
  commit((data) => {
    if (trashedEntryIds(data).has(id)) return data
    return mapEntries(data, (entry) =>
      entry.id === id
        ? { ...entry, lastOpenedAt: new Date().toISOString() }
        : entry
    )
  })

/** 软删除只标记选中根节点，不抹去子项此前的回收站状态。 */
export const trashEntries = (ids: string[]) =>
  commit((data) => {
    const rootIds = new Set(selectionRoots(data, ids).map((entry) => entry.id))
    const now = new Date().toISOString()
    return mapEntries(data, (entry) =>
      rootIds.has(entry.id) ? { ...entry, trashedAt: now } : entry
    )
  })

/** 原父目录不可用时恢复到存储根，同名内容自动保留为副本。 */
export const restoreEntries = (ids: string[]) =>
  commit((data) => {
    let next = data
    const roots = selectionRoots(data, ids).filter((entry) => entry.trashedAt)
    for (const root of roots) {
      const parentId =
        root.parentId && !trashedEntryIds(next).has(root.parentId)
          ? root.parentId
          : null
      const name = availableName(
        next,
        root.connectionId,
        parentId,
        root.name,
        root.kind === "folder"
      )
      next = mapEntries(next, (entry) =>
        entry.id === root.id
          ? {
              ...entry,
              parentId,
              name,
              trashedAt: null,
              updatedAt: new Date().toISOString(),
            }
          : entry
      )
    }
    return next
  })

/** 删除记录与清理内容分两步，清理队列持久化以便失败后重试。 */
export const permanentlyDeleteEntries = async (ids: string[]) => {
  commit((data) => {
    const trashIds = trashedEntryIds(data)
    const roots = selectionRoots(data, ids)
    if (!roots.length || roots.some((entry) => !trashIds.has(entry.id)))
      throw new Error("只能彻底删除回收站中的文件。")
    const removedIds = subtreeIds(data, roots)
    const fileIds = data.assets
      .filter((asset) => removedIds.has(asset.id) && asset.origin === "upload")
      .map((asset) => asset.id)
    return {
      ...data,
      assets: data.assets.filter((asset) => !removedIds.has(asset.id)),
      assetFolders: data.assetFolders.filter(
        (folder) => !removedIds.has(folder.id)
      ),
      pendingFileDeletes: [
        ...new Set([...data.pendingFileDeletes, ...fileIds]),
      ],
    }
  })
  try {
    await flushFileDeletes()
  } catch {
    throw new Error("记录已删除，文件内容清理失败，请重试。")
  }
}

/** 移动和复制仅在同一存储内进行，且不能以源目录或其后代为目标。 */
const transferRoots = (
  data: Workbench,
  ids: string[],
  connectionId: string,
  parentId: string | null
) => {
  assertDestination(data, connectionId, parentId)
  const roots = selectionRoots(data, ids)
  const trashIds = trashedEntryIds(data)
  if (!roots.length || roots.some((entry) => trashIds.has(entry.id)))
    throw new Error("请选择可用的文件或文件夹。")
  if (roots.some((entry) => entry.connectionId !== connectionId))
    throw new Error("请选择同一存储中的文件。")
  const descendantIds = subtreeIds(data, roots)
  if (parentId && descendantIds.has(parentId))
    throw new Error("不能放入自身或子文件夹。")
  const targetDepth = folderTrail(data, parentId).length
  for (const entry of assetEntries(data).filter((entry) =>
    descendantIds.has(entry.id)
  )) {
    const root = roots.find(
      (candidate) =>
        candidate.id === entry.id ||
        folderTrail(data, entry.parentId).some(
          (folder) => folder.id === candidate.id
        )
    )!
    const relativeDepth =
      folderTrail(data, entry.parentId).length -
      folderTrail(data, root.parentId).length
    if (targetDepth + relativeDepth >= 64)
      throw new Error("目录最多支持 64 层。")
  }
  return roots
}

/** 整棵子树只更新根目录关联，原文件和后代 ID 保持不变。 */
export const moveEntries = (
  ids: string[],
  connectionId: string,
  parentId: string | null
) =>
  commit((data) => {
    const roots = transferRoots(data, ids, connectionId, parentId)
    const names = new Set<string>()
    for (const entry of roots) {
      assertAvailableName(data, connectionId, parentId, entry.name, ids)
      const name = entry.name.toLocaleLowerCase()
      if (names.has(name))
        throw new Error(`选中文件中存在同名项“${entry.name}”。`)
      names.add(name)
    }
    const rootIds = new Set(roots.map((entry) => entry.id))
    return mapEntries(data, (entry) =>
      rootIds.has(entry.id)
        ? { ...entry, parentId, updatedAt: new Date().toISOString() }
        : entry
    )
  })

/** 复制文件先读取原内容并落盘；期间数据变化或元数据失败则清理副本。 */
export const copyEntries = async (
  ids: string[],
  connectionId: string,
  parentId: string | null
) => {
  const before = getWorkbench()
  const roots = transferRoots(before, ids, connectionId, parentId)
  const descendantIds = subtreeIds(before, roots)
  const trashIds = trashedEntryIds(before)
  const entries = assetEntries(before).filter(
    (entry) => descendantIds.has(entry.id) && !trashIds.has(entry.id)
  )
  const idMap = new Map(entries.map((entry) => [entry.id, crypto.randomUUID()]))
  const files: { id: string; file: File }[] = []
  for (const entry of entries) {
    if (entry.kind === "file")
      files.push({
        id: idMap.get(entry.id)!,
        file: new File([await readAsset(entry)], entry.name, {
          type: entry.type,
        }),
      })
  }
  const now = new Date().toISOString()
  let next = {
    ...before,
    assets: [...before.assets],
    assetFolders: [...before.assetFolders],
  }
  for (const entry of entries) {
    const destinationId =
      entry.parentId && idMap.has(entry.parentId)
        ? idMap.get(entry.parentId)!
        : parentId
    const copy = {
      ...entry,
      id: idMap.get(entry.id)!,
      parentId: destinationId,
      name: availableName(
        next,
        connectionId,
        destinationId,
        entry.name,
        entry.kind === "folder"
      ),
      createdAt: now,
      updatedAt: now,
      starred: false,
      lastOpenedAt: null,
      trashedAt: null,
    }
    if (copy.kind === "file")
      next = {
        ...next,
        assets: [...next.assets, { ...copy, origin: "upload" }],
      }
    else next = { ...next, assetFolders: [...next.assetFolders, copy] }
  }
  await putFiles(files)
  try {
    if (getWorkbench() !== before)
      throw new Error("文件已发生变化，请重新操作。")
    if (!updateWorkbench(() => next)) throw new Error("副本保存失败，请重试。")
  } catch (error) {
    await deleteFiles(files.map((file) => file.id))
    throw error
  }
}
