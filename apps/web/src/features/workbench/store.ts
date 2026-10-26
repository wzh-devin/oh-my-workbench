import { useEffect, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { deleteFiles, getFile, putFiles, saveBlob } from "./local-files"
import {
  assertDestination,
  assetName,
  availableName,
} from "@/features/assets/asset-rules"
import {
  SAMPLE_CONTENT,
  SEED_WORKBENCH,
  workbenchSchema,
  type Asset,
  type AssetFolder,
  type Workbench,
} from "./model"

export const WORKBENCH_STORAGE_KEY = "workbench.personal-demo.v1"
type Snapshot = {
  data: Workbench
  status: "loading" | "ready" | "error"
  error: string | null
  busyIds: string[]
}
let snapshot: Snapshot = {
  data: SEED_WORKBENCH,
  status: "loading",
  error: null,
  busyIds: [],
}
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const publish = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

/** 只读取当前版本的演示数据；损坏数据不被默认样例覆盖。 */
export const loadWorkbench = () => {
  try {
    const saved = localStorage.getItem(WORKBENCH_STORAGE_KEY)
    const persisted = workbenchSchema.parse(
      saved ? JSON.parse(saved) : SEED_WORKBENCH
    )
    // 内置内容更新不重置完成、阅读、星标、连接配置或用户新增记录。
    const data: Workbench = {
      ...persisted,
      todoLists: persisted.todoLists.some((list) => list.id === "list-inbox")
        ? persisted.todoLists
        : [{ id: "list-inbox", name: "收集箱" }, ...persisted.todoLists],
      accounts: persisted.accounts.map((account) =>
        account.error === "演示连接已过期，可通过重试恢复。"
          ? { ...account, error: "连接已过期" }
          : account
      ),
      messages: persisted.messages.map((message) => {
        const sample = SEED_WORKBENCH.messages.find(
          (record) => record.id === message.id
        )
        return sample
          ? {
              ...message,
              subject: sample.subject,
              preview: sample.preview,
              body: sample.body,
              attachments: sample.attachments,
            }
          : message
      }),
      assets: persisted.assets.map((asset) => {
        const sample =
          asset.origin === "sample"
            ? SEED_WORKBENCH.assets.find((record) => record.id === asset.id)
            : undefined
        return sample ? { ...asset, size: sample.size } : asset
      }),
    }
    publish({ data, status: "ready", error: null })
    void flushFileDeletes().catch(() => {
      publish({ error: "文件内容清理失败，请重试。" })
    })
  } catch {
    publish({
      status: "error",
      error: "数据读取失败，请检查存储权限后重试。",
    })
  }
}

/** 五个页面共享同一快照；切页与浏览器刷新保持记录一致。 */
export const useWorkbench = () => {
  const current = useSyncExternalStore(subscribe, () => snapshot)
  useEffect(() => {
    if (snapshot.status === "loading") loadWorkbench()
  }, [])
  return current
}

export const getWorkbench = () => snapshot.data

/** 元数据删除与文件清理通过持久化队列衔接，失败可跨刷新重试。 */
export const flushFileDeletes = async () => {
  const ids = [...snapshot.data.pendingFileDeletes]
  if (!ids.length) return
  await deleteFiles(ids)
  if (
    !updateWorkbench((current) => ({
      ...current,
      pendingFileDeletes: current.pendingFileDeletes.filter(
        (id) => !ids.includes(id)
      ),
    }))
  ) {
    throw new Error("文件清理结果保存失败，请重试。")
  }
}

/** 保存成功后才发布快照，存储失败时保留最后一次有效状态。 */
export const updateWorkbench = (update: (current: Workbench) => Workbench) => {
  if (snapshot.status !== "ready") return false
  try {
    const proposed = update(snapshot.data)
    if (proposed === snapshot.data) return true
    const next = workbenchSchema.parse(proposed)
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(next))
    publish({ data: next, error: null })
    return true
  } catch {
    publish({
      error: "保存失败，请检查本地存储空间和浏览器权限后重试。此次修改未保存。",
    })
    toast.error("保存失败", {
      description: "此次修改未保存，请检查存储空间后重试。",
    })
    return false
  }
}

/** 模拟连接检查并防止重复操作，暂停中的来源不会被异步结果重新开启。 */
export const refreshConnection = async (
  kind: "mail" | "storage",
  id: string
) => {
  if (snapshot.busyIds.includes(id)) return
  publish({ busyIds: [...snapshot.busyIds, id] })
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 600))
    const now = new Date().toISOString()
    const success = updateWorkbench((current) =>
      kind === "mail"
        ? {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === id && account.status !== "paused"
                ? {
                    ...account,
                    status: "connected",
                    lastSync: now,
                    error: null,
                  }
                : account
            ),
          }
        : {
            ...current,
            connections: current.connections.map((connection) =>
              connection.id === id && connection.status !== "paused"
                ? {
                    ...connection,
                    status: "connected",
                    lastSync: now,
                    error: null,
                  }
                : connection
            ),
          }
    )
    if (success) toast.success("连接状态已更新")
  } finally {
    publish({ busyIds: snapshot.busyIds.filter((value) => value !== id) })
  }
}

/** 文件内容成功落盘后才添加元数据；元数据失败时清理刚写入的内容。 */
export const uploadFiles = async (
  connectionId: string,
  files: File[],
  parentId: string | null = null,
  directoryIds = new Map<string, string>()
) => {
  if (!files.length) throw new Error("请先选择文件。")
  if (files.length > 10) throw new Error("每次最多选择 10 个文件。")
  const connection = snapshot.data.connections.find(
    (record) => record.id === connectionId
  )
  if (!connection || connection.status !== "connected")
    throw new Error("请选择一个连接正常的存储。")
  if (files.some((file) => file.size > 20 * 1024 * 1024))
    throw new Error("单个文件不能超过 20 MB。")
  assertDestination(snapshot.data, connectionId, parentId)
  files.forEach((file) => {
    assetName(file.name)
    const path = file.webkitRelativePath
    if (
      path &&
      (path.split("/").some((part) => assetName(part) !== part) ||
        path.split("/").length > 64)
    )
      throw new Error("文件目录无效或超过 64 层。")
  })
  const records = files.map((file) => ({ id: crypto.randomUUID(), file }))
  await putFiles(records)
  if (
    !snapshot.data.connections.some(
      (record) => record.id === connectionId && record.status === "connected"
    )
  ) {
    await deleteFiles(records.map((record) => record.id))
    throw new Error("目标存储状态已变化，请重新选择后重试。")
  }
  const now = new Date().toISOString()
  const resolvedDirectories = new Map(directoryIds)
  const saved = updateWorkbench((current) => {
    assertDestination(current, connectionId, parentId)
    const next = {
      ...current,
      assetFolders: [...current.assetFolders],
      assets: [...current.assets],
    }
    records.forEach(({ id, file }) => {
      let destinationId = parentId
      let directoryPath = `${connectionId}/${parentId ?? ""}`
      for (const name of (file.webkitRelativePath || "")
        .split("/")
        .slice(0, -1)) {
        directoryPath += `/${name}`
        const resolvedId = resolvedDirectories.get(directoryPath)
        const folder: AssetFolder | undefined = next.assetFolders.find(
          (entry) =>
            entry.connectionId === connectionId &&
            entry.parentId === destinationId &&
            (resolvedId ? entry.id === resolvedId : entry.name === name) &&
            !entry.trashedAt
        )
        if (resolvedId && !folder)
          throw new Error("上传目录已发生变化，请重新选择。")
        if (folder) destinationId = folder.id
        else {
          const folderId = crypto.randomUUID()
          next.assetFolders.push({
            id: folderId,
            name: availableName(next, connectionId, destinationId, name, true),
            connectionId,
            parentId: destinationId,
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: null,
            starred: false,
            trashedAt: null,
          })
          destinationId = folderId
        }
        resolvedDirectories.set(directoryPath, destinationId)
      }
      assertDestination(next, connectionId, destinationId)
      next.assets.unshift({
        id,
        connectionId,
        parentId: destinationId,
        name: availableName(
          next,
          connectionId,
          destinationId,
          assetName(file.name)
        ),
        size: file.size,
        type: file.type || "application/octet-stream",
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        starred: false,
        trashedAt: null,
        origin: "upload",
      })
    })
    return {
      ...next,
      connections: next.connections.map((record) =>
        record.id === connectionId ? { ...record, lastSync: now } : record
      ),
    }
  })
  if (!saved) {
    await deleteFiles(records.map((record) => record.id))
    throw new Error("文件记录保存失败，请重试。")
  }
  resolvedDirectories.forEach((id, path) => directoryIds.set(path, id))
}

/** 示例内容与上传原文件分别读取，缺失的文件明确报错。 */
export const readAsset = async (
  asset: Pick<Asset, "id" | "origin" | "type">
) => {
  const file =
    asset.origin === "sample"
      ? SAMPLE_CONTENT[asset.id] === undefined
        ? undefined
        : new Blob([SAMPLE_CONTENT[asset.id]], { type: asset.type })
      : await getFile(asset.id)
  if (!file)
    throw new Error("本地文件内容不存在，可能已被浏览器清理，请重新上传。")
  return file
}

/** 预览与下载复用同一读取入口，重命名不改变文件内容索引。 */
export const downloadAsset = async (asset: Asset) =>
  saveBlob(await readAsset(asset), asset.name)
