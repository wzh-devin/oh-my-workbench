import { z } from "zod"

/** Remote mail is validated at the API boundary; credentials never enter these records. */
export const mailAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["QQ", "Gmail"]),
  email: z.string(),
  status: z.enum(["connected", "error", "paused"]),
  enabled: z.boolean(),
  notifyEnabled: z.boolean(),
  version: z.number().int(),
  lastSync: z.string().nullable(),
  error: z.string().nullable(),
  host: z.string(),
  port: z.number(),
  tls: z.boolean(),
  syncing: z.boolean(),
  unread: z.number(),
  total: z.number(),
})
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number(),
  content: z.string().default(""),
})
export const messageSchema = z.object({
  todoId: z.string().nullable().optional(),
  id: z.string(),
  accountId: z.string(),
  sender: z.string(),
  address: z.string(),
  subject: z.string(),
  preview: z.string(),
  receivedAt: z.string(),
  body: z
    .string()
    .nullable()
    .optional()
    .transform((body) => body ?? ""),
  bodyHtml: z.string().nullable().optional(),
  archived: z.boolean().default(false),
  read: z.boolean(),
  starred: z.boolean(),
  version: z.number().int(),
  attachmentCount: z.number(),
  attachments: z.array(attachmentSchema).default([]),
})
export const notificationSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  subject: z.string(),
  sender: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})
export const overviewSchema = z.object({
  accounts: z.array(mailAccountSchema),
  messages: z.array(messageSchema),
  notifications: z.array(notificationSchema),
  notificationCount: z.number(),
  total: z.number(),
  unread: z.number(),
  latestReceivedAt: z.string().nullable(),
  daily: z.record(z.string(), z.number()),
  notificationsEnabled: z.boolean(),
})
export type MailAccount = z.infer<typeof mailAccountSchema>
export type Message = z.infer<typeof messageSchema>
export type MailNotification = z.infer<typeof notificationSchema>
export type MailOverview = z.infer<typeof overviewSchema>
export type AccountInput = {
  name: string
  provider?: "QQ" | "Gmail"
  email?: string
  credential?: string
  enabled?: boolean
  notifyEnabled?: boolean
  version?: number
}

export { formatDateTime as formatMailTime } from "@/lib/format-date-time"
