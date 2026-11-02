import { z } from "zod"
import {
  mailAccountSchema,
  messageSchema,
  notificationSchema,
  type AccountInput,
} from "./model"
import type { RuleDocument } from "@/lib/rules/model"

export class MailApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/** Fetch before saving so authentication and provider failures use the same Toast flow. */
export async function downloadMailAttachment(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/mail/attachments/${id}/download`, {
    signal,
    credentials: "same-origin",
    cache: "no-store",
  })
  if (!response.ok) {
    const error = z
      .object({ message: z.string().min(1).max(300) })
      .safeParse(await response.json().catch(() => null))
    throw new MailApiError(
      error.success ? error.data.message : "附件下载失败，请重试",
      response.status
    )
  }
  // shortcut: 浏览器保存先构造 Blob，超大附件场景改为 File System Access 流式写入。
  return response.blob()
}

/** Validate responses and preserve AbortSignal so a previous login cannot publish late results. */
export const mailRequest = async <T>(
  path: string,
  method: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`/api/mail${path}`, {
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
    const error = z
      .object({ message: z.string().min(1).max(300) })
      .safeParse(payload)
    throw new MailApiError(
      error.success ? error.data.message : "邮箱服务暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("邮箱响应格式错误，请重试")
  return parsed.data.data
}
const nothing = z.null()
export type MessageQuery = {
  accountId: string
  searchText: string
  filterQuery: RuleDocument
  page: number
  pageSize: number
  sort: "newest" | "oldest" | "subject"
  afterId?: string
  archived?: boolean
}
export const mailApi = {
  accounts: (signal: AbortSignal) =>
    mailRequest("/accounts", "GET", z.array(mailAccountSchema), signal),
  readPreferences: (signal: AbortSignal) =>
    mailRequest(
      "/preferences",
      "GET",
      z.object({ notificationsEnabled: z.boolean() }),
      signal
    ),
  bulk: (
    body: MessageQuery & { action: "read" | "archive-read" },
    signal: AbortSignal
  ) =>
    mailRequest(
      "/messages/bulk",
      "POST",
      z.object({ affected: z.number().int().nonnegative() }),
      signal,
      { ...body, pageNum: body.page, page: undefined }
    ),
  page: (body: MessageQuery, signal: AbortSignal) =>
    mailRequest(
      "/messages/page",
      "POST",
      z.object({
        messages: z.array(messageSchema),
        total: z.number(),
        nextAfter: z.string().optional(),
      }),
      signal,
      { ...body, pageNum: body.page, page: undefined }
    ),
  message: (id: string, signal: AbortSignal) =>
    mailRequest(`/messages/${id}`, "GET", messageSchema, signal),
  change: (
    id: string,
    body: {
      version: number
      read?: boolean
      starred?: boolean
      archived?: boolean
    },
    signal: AbortSignal
  ) =>
    mailRequest("/messages/update", "POST", messageSchema, signal, {
      ...body,
      id,
    }),
  account: (body: AccountInput, id: string | undefined, signal: AbortSignal) =>
    mailRequest(
      id ? "/accounts/update" : "/accounts/save",
      "POST",
      mailAccountSchema,
      signal,
      { ...body, ...(id ? { id } : {}) }
    ),
  sync: (id: string, signal: AbortSignal) =>
    mailRequest(
      `/accounts/${id}/sync`,
      "POST",
      z.object({ id: z.string() }),
      signal
    ),
  preferences: (enabled: boolean, signal: AbortSignal) =>
    mailRequest("/preferences", "PUT", nothing, signal, { enabled }),
  notifications: (before: string, signal: AbortSignal) =>
    mailRequest(
      `/notifications?before=${before}`,
      "GET",
      z.array(notificationSchema),
      signal
    ),
  readNotifications: (ids: string[], signal: AbortSignal) =>
    mailRequest("/notifications/read", "PATCH", nothing, signal, { ids }),
  readAllNotifications: (signal: AbortSignal) =>
    mailRequest("/notifications/read", "PATCH", nothing, signal, { all: true }),
}
