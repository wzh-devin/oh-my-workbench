import { z } from "zod"
import { storageSchema } from "@/features/workbench/model"
import {
  entrySchema,
  operationSchema,
  previewSchema,
  thumbnailSchema,
  uploadSchema,
  viewSchema,
  type AssetView,
  type ConnectionInput,
  type UploadInput,
} from "./model"
import type { RuleDocument } from "@/lib/rules/model"

export class AssetApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public suggestedName?: string
  ) {
    super(message)
  }
}
/** 保留取消信号、登录 Cookie 和结构校验，错误交由操作入口反馈一次。 */
export const assetRequest = async <T>(
  path: string,
  method: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`/api/assets${path}`, {
    method,
    signal,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const conflict = z
      .object({
        data: z.object({
          kind: z.literal("upload_name_conflict"),
          suggestedName: z
            .string()
            .min(1)
            .refine((name) => [...name].length <= 200),
        }),
      })
      .safeParse(payload)
    const error = z
      .object({ message: z.string().min(1).max(500) })
      .safeParse(payload)
    throw new AssetApiError(
      error.success ? error.data.message : "资产服务暂不可用，请重试",
      response.status,
      response.status === 409 && conflict.success
        ? conflict.data.data.suggestedName
        : undefined
    )
  }
  return z.object({ code: z.literal(0), data: schema }).parse(payload).data
}
export type AssetQuery = {
  connectionId: string
  parentId: string | null
  viewId: string
  trash: boolean
  search: string
  filterQuery: RuleDocument
  sort: string
  page?: number
  pageSize: number
  cursorMode?: boolean
  cursor?: string
}
export const assetApi = {
  importMetadata: (entries: unknown[], signal: AbortSignal) =>
    assetRequest("/imports/metadata", "POST", z.null(), signal, { entries }),
  lookupUpload: (requestKey: string, signal: AbortSignal) =>
    assetRequest(
      `/uploads?requestKey=${encodeURIComponent(requestKey)}`,
      "GET",
      z.array(uploadSchema),
      signal
    ),
  connections: (signal: AbortSignal) =>
    assetRequest("/connections", "GET", z.array(storageSchema), signal),
  directories: (signal: AbortSignal) =>
    assetRequest("/directories", "GET", z.array(entrySchema), signal),
  views: (signal: AbortSignal) =>
    assetRequest("/views", "GET", z.array(viewSchema), signal),
  page: (input: AssetQuery, signal: AbortSignal) =>
    assetRequest(
      "/entries/page",
      "POST",
      z.object({
        entries: z.array(entrySchema),
        total: z.number(),
        hasMore: z.boolean().optional(),
        nextCursor: z.string().default(""),
      }),
      signal,
      { ...input, pageNum: (input.page ?? 0) + 1, page: undefined }
    ),
  entry: (id: string, signal: AbortSignal) =>
    assetRequest(
      `/entries/${encodeURIComponent(id)}`,
      "GET",
      entrySchema,
      signal
    ),
  connection: (
    input: ConnectionInput,
    id: string | undefined,
    signal: AbortSignal
  ) =>
    assetRequest(
      id ? "/connections/update" : "/connections/save",
      "POST",
      storageSchema,
      signal,
      { ...input, ...(id ? { id } : {}) }
    ),
  testConnection: (id: string, signal: AbortSignal) =>
    assetRequest(`/connections/${id}/test`, "POST", storageSchema, signal),
  folder: (
    input: {
      connectionId: string
      parentId: string | null
      name: string
      legacyId?: string
    },
    signal: AbortSignal
  ) => assetRequest("/entries/save", "POST", entrySchema, signal, input),
  change: (
    id: string,
    input: {
      version: number
      name?: string
      starred?: boolean
      opened?: boolean
    },
    signal: AbortSignal
  ) =>
    assetRequest("/entries/update", "POST", entrySchema, signal, {
      ...input,
      id,
    }),
  batch: (
    input: { action: string } & Record<string, unknown>,
    signal: AbortSignal
  ) => {
    const action = z
      .enum(["move", "copy", "trash", "restore", "delete", "star"])
      .parse(input.action)
    return assetRequest(
      `/entries/${action}Batch`,
      "POST",
      operationSchema,
      signal,
      input
    )
  },
  operation: (id: string, signal: AbortSignal) =>
    assetRequest(`/operations/${id}`, "GET", operationSchema, signal),
  saveView: (
    input: Pick<AssetView, "name" | "icon" | "filterQuery" | "sort">,
    view: AssetView | undefined,
    signal: AbortSignal
  ) =>
    assetRequest(
      view ? "/views/update" : "/views/save",
      "POST",
      viewSchema,
      signal,
      { ...input, ...(view ? { id: view.id, version: view.version } : {}) }
    ),
  deleteView: (view: AssetView, signal: AbortSignal) =>
    assetRequest("/views/deleteBatch", "POST", z.null(), signal, {
      items: [{ id: view.id, version: view.version }],
    }),
  initUpload: (input: UploadInput, signal: AbortSignal) =>
    assetRequest("/uploads/init", "POST", uploadSchema, signal, input),
  uploads: (signal: AbortSignal) =>
    assetRequest("/uploads", "GET", z.array(uploadSchema), signal),
  upload: (id: string, signal: AbortSignal) =>
    assetRequest(`/uploads/${id}`, "GET", uploadSchema, signal),
  controlUpload: (
    id: string,
    status: "paused" | "uploading",
    version: number,
    signal: AbortSignal
  ) =>
    assetRequest(`/uploads/${id}`, "PATCH", uploadSchema, signal, {
      status,
      version,
    }),
  cancelUpload: (id: string, signal: AbortSignal) =>
    assetRequest(`/uploads/${id}`, "DELETE", uploadSchema, signal),
  completeUpload: (id: string, signal: AbortSignal) =>
    assetRequest(`/uploads/${id}/complete`, "POST", uploadSchema, signal),
  preview: (id: string, create: boolean, signal: AbortSignal) =>
    assetRequest(
      `/entries/${id}/preview`,
      create ? "POST" : "GET",
      previewSchema,
      signal
    ),
  retryThumbnail: (id: string, signal: AbortSignal) =>
    assetRequest(
      `/entries/${encodeURIComponent(id)}/thumbnail`,
      "POST",
      thumbnailSchema,
      signal
    ),
}
/** 浏览器发送字节实时上报；服务端仍按分片指纹核验，成功响应才确认该片。 */
export const putAssetPart = (
  id: string,
  number: number,
  part: Blob,
  hash: string,
  signal: AbortSignal,
  onProgress?: (loaded: number) => void
) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("请求已取消", "AbortError"))
      return
    }
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort)
      request.upload.onprogress = null
      if (error) reject(error)
      else resolve()
    }
    request.open("PUT", `/api/assets/uploads/${id}/parts/${number}`)
    request.withCredentials = true
    request.responseType = "json"
    request.timeout = 120_000
    request.setRequestHeader("X-Part-SHA256", hash)
    request.upload.onprogress = (event) =>
      onProgress?.(Math.min(part.size, event.loaded))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(part.size)
        finish()
      } else {
        const payload = z
          .object({ message: z.string().min(1).max(500) })
          .safeParse(request.response)
        finish(
          new AssetApiError(
            payload.success ? payload.data.message : "分片上传失败",
            request.status
          )
        )
      }
    }
    request.onerror = () =>
      finish(new AssetApiError("分片上传网络中断，请重试", 0))
    request.ontimeout = () =>
      finish(new AssetApiError("分片上传超时，请重试", 0))
    request.onabort = () => finish(new DOMException("请求已取消", "AbortError"))
    signal.addEventListener("abort", abort, { once: true })
    try {
      request.send(part)
    } catch (error) {
      finish(error instanceof Error ? error : new Error("分片上传失败"))
    }
  })
export const assetContentURL = (id: string, mode?: "preview" | "download") =>
  `/api/assets/entries/${encodeURIComponent(id)}/content${mode ? `?${mode}=1` : ""}`

const contentAccessSchema = z.object({
  url: z.string().min(1),
  expiresAt: z.iso.datetime().nullable(),
  cacheKey: z.string(),
})
const contentLinks = new Map<string, z.infer<typeof contentAccessSchema>>()
export const clearAssetContentLinks = () => contentLinks.clear()

/** 每次打开仍鉴权；只复用同一版本且未到期的地址，让浏览器复用原图缓存。 */
export async function getAssetContentURL(
  id: string,
  mode: "preview" | "download" | undefined,
  signal: AbortSignal,
  refresh = false
) {
  const access = await assetRequest(
    `/entries/${encodeURIComponent(id)}/access${mode ? `?${mode}=1` : ""}`,
    "GET",
    contentAccessSchema,
    signal
  )
  const key = `${id}:${mode ?? "original"}`,
    cached = contentLinks.get(key)
  // 过期判断只在异步访问请求中读取时钟，不在React渲染过程中执行。
  if (
    !refresh &&
    cached?.expiresAt &&
    cached.cacheKey === access.cacheKey &&
    Date.parse(cached.expiresAt) > Date.now() + 30_000
  )
    return cached.url
  contentLinks.delete(key)
  if (access.expiresAt) {
    contentLinks.set(key, access)
    if (contentLinks.size > 100)
      contentLinks.delete(contentLinks.keys().next().value!)
  }
  return access.url
}

/** 产物版本只用于缓存定位，读取权限仍由后端按文件ID检查。 */
export const assetThumbnailURL = (id: string, version: string) =>
  `/api/assets/entries/${encodeURIComponent(id)}/thumbnail?v=${encodeURIComponent(version)}`
