import { z } from "zod"
import { ruleDocumentSchema } from "@/lib/rules/model"

const id = z.string().regex(/^[1-9]\d*$/)
export const notebookSchema = z.object({
  id,
  name: z.string(),
  version: z.number().int().positive(),
})
export const noteSchema = z.object({
  id,
  notebookId: id.nullable(),
  title: z.string(),
  tags: z.array(z.string()),
  requiresUnlock: z.boolean(),
  favorite: z.boolean(),
  diaryDate: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  markdown: z.string().optional(),
  unlockedUntil: z.string().optional(),
})
export const revisionSchema = z.object({
  id,
  noteVersion: z.number().int().positive(),
  createdAt: z.string(),
  markdown: z.string().optional(),
})
export type Notebook = z.infer<typeof notebookSchema>
export type Note = z.infer<typeof noteSchema>
export type Revision = z.infer<typeof revisionSchema>
export type Scope = "all" | "favorite" | "locked" | "trash"
export type NoteContent = {
  title: string
  markdown: string
  notebookId: string | null
  tags: string[]
  requiresUnlock: boolean
  favorite: boolean
  diaryDate: string | null
}
export type Draft = NoteContent & { requestId: string }
export type Target = { id: string; version: number }

/** 服务端会修剪标题和去重标签；比较采用同一规则，保留 Markdown 原文。 */
export const contentKey = (content: NoteContent): string =>
  JSON.stringify({
    title: content.title.trim() || "未命名笔记",
    markdown: content.markdown,
    notebookId: content.notebookId,
    tags: [...new Set(content.tags.map((tag) => tag.trim()).filter(Boolean))],
    requiresUnlock: content.requiresUnlock,
    favorite: content.favorite,
    diaryDate: content.diaryDate,
  })

/** 导入和下载只处理 UTF-8 Markdown，不将正文写入持久缓存。 */
export const downloadNote = (title: string, markdown: string) => {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download =
    (title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "_").trim() || "未命名笔记") + ".md"
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const noteViewSchema = z.object({
  builtinKey: z.string().nullable().default(null),
  id,
  name: z.string(),
  icon: z.string(),
  scope: z.enum(["all", "favorite", "locked", "trash"]),
  filterQuery: ruleDocumentSchema,
  sort: z.enum(["updated", "created", "title"]),
  version: z.number().int().positive(),
})
export type NoteView = z.infer<typeof noteViewSchema>
export type ViewContent = Omit<NoteView, "id" | "version" | "builtinKey">
