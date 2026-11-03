import { z } from "zod"
import {
  noteSchema,
  noteViewSchema,
  type ViewContent,
  notebookSchema,
  revisionSchema,
  type NoteContent,
  type Target,
} from "./model"
import type { RuleDocument } from "@/lib/rules/model"

export class NoteApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = "NoteApiError"
  }
}
/** 校验信封和响应；正文仅经过当前请求，不进入公共工作台缓存。 */
const request = async <T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal,
  context = ""
): Promise<T> => {
  const response = await fetch("/api/notes" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(context ? { "X-Notes-Context": context } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new NoteApiError(
      failure.success ? failure.data.message : "记事本暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("记事本响应格式错误，请重试")
  return parsed.data.data
}
const pageSchema = z.object({
  records: z.array(noteSchema),
  total: z.number().int().nonnegative(),
  pageNum: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})
export type NoteQuery = {
  viewId?: string
  pageNum: number
  pageSize: number
  scope: string
  notebookId: string
  search: string
  filterQuery?: RuleDocument
}
export const createNoteApi = (initialContext = "") => {
  let context = initialContext
  const call = <T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal
  ) => request(path, schema, body, signal, context)
  return {
    rotateContext: () => {
      context = crypto.randomUUID()
    },
    passkeyStatus: (signal?: AbortSignal) =>
      call("/passkeys/status", z.object({ enabled: z.boolean() }), {}, signal),
    beginPasskeyRegistration: (password: string) =>
      call(
        "/passkeys/register/begin",
        z.object({
          publicKey: z.custom<PublicKeyCredentialCreationOptionsJSON>(
            (value) => typeof value === "object" && value !== null
          ),
        }),
        { password }
      ),
    finishPasskeyRegistration: (credential: unknown) =>
      call(
        "/passkeys/register/finish",
        z.object({ expiresAt: z.string() }),
        credential
      ),
    beginPasskeyLogin: () =>
      call(
        "/passkeys/login/begin",
        z.object({
          publicKey: z.custom<PublicKeyCredentialRequestOptionsJSON>(
            (value) => typeof value === "object" && value !== null
          ),
        }),
        {}
      ),
    finishPasskeyLogin: (credential: unknown) =>
      call(
        "/passkeys/login/finish",
        z.object({ expiresAt: z.string() }),
        credential
      ),
    deletePasskey: (password: string) =>
      call("/passkeys/delete", z.null(), { password }),
    views: (signal?: AbortSignal) =>
      call("/views", z.array(noteViewSchema), undefined, signal),
    saveView: (content: ViewContent, target?: Target) =>
      call("/views/" + (target ? "update" : "save"), noteViewSchema, {
        ...content,
        ...(target ? { id: target.id, version: target.version } : {}),
      }),
    deleteView: (target: Target) => call("/views/delete", z.null(), target),
    notebooks: (signal?: AbortSignal) =>
      call("/notebooks", z.array(notebookSchema), undefined, signal),
    saveNotebook: (name: string, target?: Target) =>
      call("/notebooks/" + (target ? "update" : "save"), notebookSchema, {
        name,
        ...(target ? { id: target.id, version: target.version } : {}),
      }),
    deleteNotebook: (target: Target) =>
      call("/notebooks/deleteBatch", z.null(), {
        targets: [{ id: target.id, version: target.version }],
      }),
    page: (query: NoteQuery, signal?: AbortSignal) =>
      call("/page", pageSchema, query, signal),
    metadata: (id: string, signal?: AbortSignal) =>
      call("/" + id + "/metadata", noteSchema, undefined, signal),
    detail: (id: string, signal?: AbortSignal) =>
      call(
        "/" + id,
        noteSchema.extend({ markdown: z.string() }),
        undefined,
        signal
      ),
    save: (content: NoteContent, requestId: string, target?: Target) =>
      call(target ? "/update" : "/save", noteSchema, {
        ...content,
        requestId,
        ...(target ? { id: target.id, version: target.version } : {}),
      }),
    batch: (action: "delete" | "restore" | "purge", target: Target) =>
      call("/" + action + "Batch", z.null(), {
        targets: [{ id: target.id, version: target.version }],
      }),
    unlock: (password: string) =>
      call("/unlock", z.object({ expiresAt: z.string() }), { password }),
    lock: () => call("/lock", z.null(), {}),
    revisions: (id: string, signal?: AbortSignal) =>
      call("/" + id + "/revisions", z.array(revisionSchema), undefined, signal),
    revision: (id: string, revision: string, signal?: AbortSignal) =>
      call(
        "/" + id + "/revisions/" + revision,
        revisionSchema.extend({ markdown: z.string() }),
        undefined,
        signal
      ),
    restoreRevision: (target: Target, revision: string) =>
      call(
        "/" + target.id + "/revisions/" + revision + "/restore",
        noteSchema,
        { version: target.version }
      ),
  }
}
export const noteApi = createNoteApi()
export type NoteApi = ReturnType<typeof createNoteApi>
