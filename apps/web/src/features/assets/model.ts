import { z } from "zod"
import { ruleDocumentSchema } from "@/lib/rules/model"
import { storageSchema } from "@/features/workbench/model"

export const thumbnailSchema = z.object({
  status: z.enum(["queued", "rendering", "ready", "failed"]),
  version: z.string().optional(),
})

/** 服务端条目在请求边界统一验证，文件和目录共用版本及位置契约。 */
export const entrySchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  connectionId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  kind: z.enum(["file", "folder"]),
  type: z.string(),
  size: z.number().nonnegative(),
  fileCount: z.number().int().nonnegative().optional(),
  hidden: z.boolean().optional(),
  origin: z.literal("remote"),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  starred: z.boolean(),
  trashedAt: z.string().nullable(),
  lastOpenedAt: z.string().nullable(),
  legacyId: z.string().nullable().optional(),
  thumbnail: thumbnailSchema.optional(),
})
export const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  builtinKey: z.string().nullable(),
  filterQuery: ruleDocumentSchema,
  sort: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const overviewSchema = z.object({
  connections: z.array(storageSchema),
  folders: z.array(entrySchema),
  recent: z.array(entrySchema),
  views: z.array(viewSchema),
  total: z.number(),
  size: z.number(),
  images: z.number(),
  documents: z.number(),
  daily: z.record(z.string(), z.number()),
  storage: z.array(
    z.object({ id: z.string(), total: z.number(), size: z.number() })
  ),
})
export const uploadSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  connectionId: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  sha256: z.string().optional(),
  size: z.number().default(0),
  partSize: z.number().default(0),
  partCount: z.number().default(0),
  requestKey: z.string().default(""),
  status: z.enum([
    "initializing",
    "uploading",
    "paused",
    "completing",
    "verifying",
    "completed",
    "failed",
    "cleaning",
    "closed",
  ]),
  version: z.number().default(1),
  error: z.string().default(""),
  parts: z
    .array(
      z.object({
        number: z.number(),
        size: z.number(),
        sha256: z.string(),
        status: z.string(),
      })
    )
    .nullable()
    .transform((value) => value ?? []),
  entry: entrySchema.optional(),
})
export const operationSchema = z.object({
  id: z.string(),
  status: z.string(),
  error: z.string(),
  kind: z.string(),
  requestKey: z.string(),
})
export const previewSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "rendering", "ready", "failed"]),
  error: z.string(),
})
export type RemoteEntry = z.infer<typeof entrySchema>
export type AssetView = z.infer<typeof viewSchema>
export type AssetOverview = z.infer<typeof overviewSchema>
export type AssetUpload = z.infer<typeof uploadSchema>
export type ConnectionInput = {
  name: string
  endpoint: string
  publicEndpoint?: string
  addressingStyle?: "path" | "virtual"
  bucket: string
  region: string
  prefix: string
  accessKey: string
  secretKey: string
  enabled: boolean
  version?: number
}
export type UploadInput = {
  connectionId: string
  parentId: string | null
  name: string
  type: string
  size: number
  sha256: string
  requestKey: string
  legacyId?: string
}
