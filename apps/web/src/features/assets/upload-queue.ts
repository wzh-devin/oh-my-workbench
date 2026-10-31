import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { AssetApiError, assetApi, putAssetPart } from "./api"
import { uploadSchema, type AssetUpload } from "./model"
import { assetOperation, loadAssets } from "./store"
import { persistUpload, restoredUploads } from "./upload-persistence"

export type UploadTask = {
  id: string
  serverId?: string
  serverStatus?: AssetUpload["status"]
  requestKey: string
  connectionId: string
  parentId: string | null
  name: string
  suggestedName?: string
  size: number
  type: string
  sha256?: string
  legacyId?: string
  status:
    | "queued"
    | "hashing"
    | "uploading"
    | "paused"
    | "conflict"
    | "verifying"
    | "completed"
    | "error"
    | "cleaning"
    | "cancelled"
  progress: number
  error: string
  needsFile: boolean
  cancelRequested?: boolean
}
const taskSchema = z.object({
  id: z.string(),
  serverId: z.string().optional(),
  serverStatus: uploadSchema.shape.status.optional(),
  requestKey: z.string(),
  connectionId: z.string(),
  parentId: z.string().nullable(),
  name: z.string().refine((name) => [...name].length <= 200),
  suggestedName: z
    .string()
    .refine((name) => [...name].length <= 200)
    .optional(),
  size: z
    .number()
    .nonnegative()
    .max(10 * 1024 ** 3),
  type: z.string(),
  sha256: z.string().optional(),
  legacyId: z.string().optional(),
  status: z.enum([
    "queued",
    "hashing",
    "uploading",
    "paused",
    "conflict",
    "verifying",
    "completed",
    "error",
    "cleaning",
    "cancelled",
  ]),
  progress: z.number(),
  error: z.string(),
  needsFile: z.boolean(),
  cancelRequested: z.boolean().optional(),
})
let owner: string | null = null
let tasks: UploadTask[] = []
let generation = 0
const files = new Map<string, File>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const useUploadQueue = () => useSyncExternalStore(subscribe, () => tasks)
export const getUploadTasks = () => tasks
/** 已结束记录仅清除浏览器列表，不删除远端文件或中断进行中的任务。 */
export const clearFinishedUploads = () => {
  tasks = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled"
  )
  notify()
}
const update = (id: string, changes: Partial<UploadTask>) => {
  const task = tasks.find((record) => record.id === id)
  if (!task || !owner) return
  const next = { ...task, ...changes }
  tasks = tasks.map((record) => (record.id === id ? next : record))
  notify()
  if (Object.keys(changes).every((key) => key === "progress")) return
  void persistUpload(
    owner,
    next,
    ["completed", "cancelled"].includes(next.status)
  ).catch(() =>
    toast.error("上传任务保存失败，刷新后请重新选择文件", {
      id: "asset-upload-persist",
    })
  )
}
/** 每次登录从数据库恢复会话，浏览器记录仅补全重新选文件所需信息。 */
export const setUploadUser = (userId: string | null) => {
  if (owner === userId) return
  generation++
  controllers.forEach((controller) => controller.abort())
  controllers.clear()
  files.clear()
  tasks = []
  owner = userId
  notify()
  if (!userId) return
  const current = generation,
    controller = new AbortController()
  controllers.set("restore", controller)
  void Promise.all([
    restoredUploads(userId).catch(() => []),
    assetApi.uploads(controller.signal),
  ])
    .then(([local, remote]) => {
      if (current !== generation) return
      const restored = local.flatMap((record) => {
        const parsed = taskSchema.safeParse(record)
        return parsed.success
          ? [
              {
                ...parsed.data,
                status:
                  parsed.data.status === "conflict"
                    ? ("conflict" as const)
                    : ("paused" as const),
                needsFile: true,
              },
            ]
          : []
      })
      tasks = [
        ...tasks,
        ...restored.filter(
          (record) => !tasks.some((task) => task.id === record.id)
        ),
      ]
      for (const upload of remote) {
        const existing = tasks.find((record) => record.serverId === upload.id)
        if (existing) {
          if (!controllers.has(existing.id)) applyRemote(existing.id, upload)
          continue
        }
        tasks.push({
          id: crypto.randomUUID(),
          serverId: upload.id,
          requestKey: upload.requestKey,
          connectionId: upload.connectionId ?? "",
          parentId: upload.parentId ?? null,
          name: upload.name ?? "",
          size: upload.size,
          type: upload.type ?? "",
          sha256: upload.sha256,
          status: "paused",
          progress: 0,
          error: upload.error,
          needsFile: true,
        })
        applyRemote(tasks[tasks.length - 1].id, upload)
      }
      tasks = [...tasks]
      notify()
      for (const task of tasks)
        if (task.status === "verifying" || task.status === "cleaning")
          void watch(task.id)
    })
    .catch((error: unknown) => {
      if (current === generation && !controller.signal.aborted)
        toast.error(
          error instanceof Error ? error.message : "恢复上传任务失败",
          { id: "asset-upload-restore" }
        )
    })
    .finally(() => {
      if (current === generation) controllers.delete("restore")
    })
}
/** 固定两个文件槽，每个文件最多三个分片，整个队列最多六个传输。 */
const pump = () => {
  const running = [...controllers.keys()].filter((key) =>
    tasks.some((task) => task.id === key)
  ).length
  for (const task of tasks
    .filter((record) => record.status === "queued")
    .slice(0, Math.max(0, 2 - running)))
    void transfer(task.id)
}
export const enqueueUploads = async (
  connectionId: string,
  parentId: string | null,
  selected: File[],
  legacyId?: string
) => {
  if (!owner) throw new Error("请先登录")
  const userId = owner,
    current = generation
  if (
    !selected.length ||
    selected.length > 200 ||
    tasks.filter((task) => !["completed", "cancelled"].includes(task.status))
      .length +
      selected.length >
      200
  )
    throw new Error("上传队列最多 200 个文件")
  if (selected.some((file) => file.size > 10 * 1024 ** 3))
    throw new Error("单文件最大 10 GiB")
  const added = selected.map((file): UploadTask => {
    const task: UploadTask = {
      id: crypto.randomUUID(),
      requestKey: crypto.randomUUID(),
      connectionId,
      parentId,
      name: file.name,
      size: file.size,
      type: file.type,
      legacyId,
      status: "queued",
      progress: 0,
      error: "",
      needsFile: false,
    }
    files.set(task.id, file)
    return task
  })
  try {
    for (const task of added) await persistUpload(userId, task)
  } catch (error) {
    added.forEach((task) => files.delete(task.id))
    throw error
  }
  if (current !== generation) throw new DOMException("上传已取消", "AbortError")
  tasks = [...tasks, ...added]
  notify()
  pump()
  return added.map((task) => task.id)
}
/** Hash Worker 可被暂停与退出登录直接终止，避免主线程长任务。 */
const fingerprint = (file: File, signal: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), {
      type: "module",
    })
    const dispose = () => {
      worker.terminate()
      signal.removeEventListener("abort", abort)
    }
    const abort = () => {
      dispose()
      reject(new DOMException("上传已暂停", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
    worker.onmessage = (
      event: MessageEvent<{ hash?: string; progress?: number; error?: string }>
    ) => {
      if (event.data.error) {
        dispose()
        reject(new Error(event.data.error))
      } else if (event.data.hash) {
        dispose()
        resolve(event.data.hash)
      }
    }
    worker.onerror = () => {
      dispose()
      reject(new Error("计算文件指纹失败"))
    }
    worker.postMessage(file)
  })
const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException("请求已取消", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, milliseconds)
    signal.addEventListener("abort", abort, { once: true })
  })
const applyRemote = (id: string, upload: AssetUpload) => {
  const previous = tasks.find((task) => task.id === id)
  const statuses: Record<AssetUpload["status"], UploadTask["status"]> = {
    initializing: "paused",
    uploading: "paused",
    paused: "paused",
    completing: "verifying",
    verifying: "verifying",
    completed: "completed",
    failed: "error",
    cleaning: "cleaning",
    closed: upload.error && !previous?.cancelRequested ? "error" : "cancelled",
  }
  const status = statuses[upload.status]
  update(id, {
    ...(upload.entry ? { name: upload.entry.name } : {}),
    serverId: upload.id,
    serverStatus: upload.status,
    status,
    progress: ["completing", "verifying", "completed"].includes(upload.status)
      ? 1
      : upload.size
        ? upload.parts.reduce((sum, part) => sum + part.size, 0) / upload.size
        : 0,
    error: upload.error,
    ...(status === "cancelled" ? { needsFile: true } : {}),
  })
  if (
    upload.error &&
    upload.error !== previous?.error &&
    upload.error !== "等待在途分片结束"
  )
    toast.error(upload.error, { id: `upload:${id}` })
  if (upload.status === "completed") {
    if (previous?.status !== "completed") {
      toast.success("上传完成", { id: "asset-upload-complete" })
      void loadAssets(true)
    }
    files.delete(id)
  }
  if (status === "cancelled") files.delete(id)
}
/** 完成是服务端校验后的状态，上传字节完毕不能提前计入成功。 */
const watch = async (id: string) => {
  const task = tasks.find((record) => record.id === id)
  if (!task?.serverId || controllers.has(`watch:${id}`)) return
  const controller = new AbortController(),
    current = generation
  controllers.set(`watch:${id}`, controller)
  try {
    for (;;) {
      const upload = await assetApi.upload(task.serverId, controller.signal)
      if (current !== generation || controller.signal.aborted) return
      applyRemote(id, upload)
      if (
        !["initializing", "completing", "verifying", "cleaning"].includes(
          upload.status
        )
      )
        break
      await wait(2000, controller.signal)
    }
  } catch (error) {
    if (current === generation && !controller.signal.aborted) {
      update(id, {
        status: "error",
        error: error instanceof Error ? error.message : "获取上传状态失败",
      })
      toast.error("获取上传状态失败，请重试", { id: `upload:${id}` })
    }
  } finally {
    if (current === generation && controllers.get(`watch:${id}`) === controller)
      controllers.delete(`watch:${id}`)
  }
}
/** 分片失败只重试该分片；刷新后必须重新核对完整文件指纹。 */
const transfer = async (id: string) => {
  const initial = tasks.find((record) => record.id === id),
    file = files.get(id)
  if (!initial || !file || controllers.has(id)) return
  const controller = new AbortController(),
    current = generation
  controllers.set(id, controller)
  const { signal } = controller
  try {
    update(id, { status: "hashing", error: "" })
    const hash = await fingerprint(file, signal)
    if (initial.sha256 && hash !== initial.sha256) {
      files.delete(id)
      update(id, { needsFile: true })
      throw new Error("文件指纹不一致，请重新选择原文件")
    }
    update(id, { sha256: hash })
    let upload = initial.serverId
      ? await assetApi.upload(initial.serverId, signal)
      : await assetApi.initUpload(
          {
            connectionId: initial.connectionId,
            parentId: initial.parentId,
            name: initial.name,
            type: initial.type,
            size: file.size,
            sha256: hash,
            requestKey: initial.requestKey,
            ...(initial.legacyId ? { legacyId: initial.legacyId } : {}),
          },
          signal
        )
    while (upload.status === "initializing") {
      await wait(1000, signal)
      upload = await assetApi.upload(upload.id, signal)
    }
    update(id, { serverId: upload.id })
    if (upload.status === "completed") {
      applyRemote(id, upload)
      return
    }
    if (["completing", "verifying", "cleaning"].includes(upload.status)) {
      applyRemote(id, upload)
      void watch(id)
      return
    }
    if (upload.status === "paused" || upload.status === "failed")
      upload = await assetApi.controlUpload(
        upload.id,
        "uploading",
        upload.version,
        signal
      )
    if (upload.status !== "uploading")
      throw new Error(upload.error || "上传会话不可恢复，请重新上传")
    update(id, { status: "uploading" })
    const done = new Set(upload.parts.map((part) => part.number))
    let uploaded = upload.parts.reduce((sum, part) => sum + part.size, 0),
      next = 1
    const inFlight = new Map<number, number>()
    let lastProgressAt = 0
    // 同一文件的并发请求聚合计数，每 100ms 通知一次；确认和重试立即对账。
    const reportProgress = (force = false) => {
      if (current !== generation || signal.aborted) return
      const now = performance.now()
      if (!force && now - lastProgressAt < 100) return
      lastProgressAt = now
      const sent =
        uploaded + [...inFlight.values()].reduce((sum, size) => sum + size, 0)
      update(id, { progress: file.size ? Math.min(1, sent / file.size) : 0 })
    }
    reportProgress(true)
    const send = async () => {
      while (next <= upload.partCount && !signal.aborted) {
        const number = next++
        if (done.has(number)) continue
        const part = file.slice(
          (number - 1) * upload.partSize,
          Math.min(number * upload.partSize, file.size)
        )
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await part.arrayBuffer())
          ),
          (byte) => byte.toString(16).padStart(2, "0")
        ).join("")
        for (let attempt = 0; ; attempt++) {
          try {
            await putAssetPart(
              upload.id,
              number,
              part,
              digest,
              signal,
              (loaded) => {
                inFlight.set(number, loaded)
                reportProgress()
              }
            )
            break
          } catch (error) {
            inFlight.delete(number)
            reportProgress(true)
            if (attempt >= 2 || signal.aborted) throw error
            await wait((attempt + 1) * 1000, signal)
          }
        }
        uploaded += part.size
        inFlight.delete(number)
        reportProgress(true)
      }
    }
    let partError: unknown
    const sendSafely = async () => {
      try {
        await send()
      } catch (error) {
        if (!signal.aborted && !partError) partError = error
        controller.abort()
      }
    }
    await Promise.all([sendSafely(), sendSafely(), sendSafely()])
    if (current !== generation) return
    if (partError) {
      update(id, {
        status: "error",
        error: partError instanceof Error ? partError.message : "分片上传失败",
      })
      toast.error("分片上传失败，请继续重试", { id: `upload:${id}` })
      return
    }
    if (signal.aborted) return
    update(id, { progress: 1 })
    upload = await assetApi.completeUpload(upload.id, signal)
    if (current !== generation) return
    applyRemote(id, upload)
    void watch(id)
  } catch (error) {
    if (current === generation && !signal.aborted) {
      if (error instanceof AssetApiError && error.suggestedName) {
        update(id, {
          status: "conflict",
          suggestedName: error.suggestedName,
          progress: 0,
          error: "",
        })
        return
      }
      update(id, {
        status: "error",
        error: error instanceof Error ? error.message : "上传失败",
      })
      toast.error(error instanceof Error ? error.message : "上传失败", {
        id: `upload:${id}`,
      })
    }
  } finally {
    if (current === generation) {
      controllers.delete(id)
      pump()
    }
  }
}
/** 暂停先中止传输，再持久化服务端状态，已确认分片保持不变。 */
export const pauseUpload = async (id: string) => {
  controllers.get(id)?.abort()
  const task = tasks.find((record) => record.id === id),
    current = generation
  if (!task) return
  if (!["queued", "hashing", "uploading"].includes(task.status)) return
  update(id, { status: "paused" })
  if (task.serverId)
    await assetOperation(
      `upload-control:${id}`,
      async (signal) => {
        const upload = await assetApi.upload(task.serverId!, signal)
        if (
          upload.status !== "uploading" &&
          upload.status !== "failed" &&
          upload.status !== "paused"
        ) {
          if (current === generation) {
            applyRemote(id, upload)
            void watch(id)
          }
          return
        }
        const paused = await assetApi.controlUpload(
          upload.id,
          "paused",
          upload.version,
          signal
        )
        if (current === generation) applyRemote(id, paused)
      },
      false
    )
}
/** 恢复前重读会话；已经合并的任务只重试状态读取，无需再次发送文件。 */
export const resumeUpload = async (id: string, file?: File) => {
  const task = tasks.find((record) => record.id === id),
    current = generation
  if (!task) return
  if (task.status === "conflict") throw new Error("请先确认上传名称")
  if (task.serverId) {
    const upload = await assetOperation(
      `upload-control:${id}`,
      (signal) => assetApi.upload(task.serverId!, signal),
      false
    )
    if (current !== generation) return
    if (
      ["completing", "verifying", "completed", "cleaning"].includes(
        upload.status
      )
    ) {
      if (current === generation) {
        applyRemote(id, upload)
        void watch(id)
      }
      return
    }
    // 已关闭会话不能复用；保留原文件指纹和目标，以新幂等键重新上传。
    if (upload.status === "closed")
      update(id, {
        serverId: undefined,
        serverStatus: undefined,
        requestKey: crypto.randomUUID(),
        cancelRequested: false,
        progress: 0,
      })
  }
  if (file) {
    if (file.size !== task.size) throw new Error("文件大小不一致，请选择原文件")
    files.set(id, file)
  }
  if (!files.has(id)) {
    update(id, { needsFile: true })
    throw new Error("请重新选择原文件")
  }
  if (current === generation) {
    update(id, { status: "queued", needsFile: false, error: "" })
    pump()
  }
}
/** 确认只改变目标名称；原文件与指纹仍由恢复流程核对，不复用旧幂等键。 */
export const continueUpload = async (id: string, name: string, file?: File) => {
  const task = tasks.find((record) => record.id === id)
  if (!task || task.status !== "conflict") return
  const nextName = name.trim()
  if (
    !nextName ||
    [...nextName].length > 200 ||
    nextName === "." ||
    nextName === ".." ||
    /[/\\\p{Cc}]/u.test(nextName)
  )
    throw new Error("请输入有效文件名，最多 200 个字符，不能包含斜杠或控制字符")
  if (task.needsFile && !file) throw new Error("请重新选择原文件")
  if (file && file.size !== task.size)
    throw new Error("文件大小不一致，请选择原文件")
  update(id, {
    name: nextName,
    suggestedName: undefined,
    requestKey: crypto.randomUUID(),
    status: "paused",
  })
  await resumeUpload(id, file)
}
/** 状态查询与文件续传分开，校验或取消阶段不要求重新选择原文件。 */
export const refreshUpload = async (id: string) => {
  const task = tasks.find((record) => record.id === id),
    current = generation
  if (!task?.serverId) return
  const upload = await assetOperation(
    `upload-control:${id}`,
    (signal) => assetApi.upload(task.serverId!, signal),
    false
  )
  if (current !== generation) return
  applyRemote(id, upload)
  if (
    ["initializing", "completing", "verifying", "cleaning"].includes(
      upload.status
    )
  )
    void watch(id)
}
/** 取消保留服务端清理记录，直到确认终止和对象清理完成。 */
export const cancelUpload = async (id: string) => {
  controllers.get(id)?.abort()
  controllers.get(`watch:${id}`)?.abort()
  controllers.delete(`watch:${id}`)
  const task = tasks.find((record) => record.id === id),
    current = generation
  if (!task || !owner) return
  await assetOperation(
    `upload-control:${id}`,
    async (signal) => {
      const server = task.serverId
        ? { id: task.serverId }
        : task.sha256
          ? (await assetApi.lookupUpload(task.requestKey, signal))[0]
          : undefined
      if (server) {
        const upload = await assetApi.cancelUpload(server.id, signal)
        if (current === generation) {
          update(id, { cancelRequested: true })
          applyRemote(id, upload)
          void watch(id)
        }
      } else if (current === generation)
        update(id, {
          status: "cancelled",
          needsFile: true,
          requestKey: crypto.randomUUID(),
        })
    },
    false
  )
  files.delete(id)
}
