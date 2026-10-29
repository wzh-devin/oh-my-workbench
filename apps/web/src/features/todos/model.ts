import { z } from "zod"
import { todoPrioritySchema, todoViewSchema } from "./configuration"

const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "日期格式不正确")
export const INBOX_ID = "list-inbox"
export const todoSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(0).default(0),
  updatedAt: timestamp.optional(),
  listId: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, "请输入待办内容")
    .max(200, "待办内容最多 200 字"),
  note: z.string().max(2000, "备注最多 2000 字"),
  done: z.boolean(),
  createdAt: timestamp,
  completedAt: timestamp.nullable().default(null),
  dueDate: z.iso.date({ error: "截止日期不正确" }).nullable().default(null),
  plannedFor: z.iso.date({ error: "计划日期不正确" }).nullable().default(null),
  priority: z.number().int().min(1).max(4).default(4),
  tags: z
    .array(z.string().trim().min(1).max(24, "标签最多 24 字"))
    .max(10, "最多添加 10 个标签")
    .default([]),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1, "请填写步骤内容").max(200),
        done: z.boolean(),
      })
    )
    .max(50, "最多添加 50 个步骤")
    .default([]),
  source: z
    .object({
      kind: z.literal("mail"),
      id: z.string().min(1),
      label: z.string().max(200),
    })
    .nullable()
    .default(null),
})

export type Todo = z.infer<typeof todoSchema>
const serverID = z.string().regex(/^[1-9]\d*$/)
export const listSchema = z.object({
  id: serverID,
  name: z.string().min(1).max(100),
})
export const remoteTodoSchema = todoSchema.extend({
  id: serverID,
  listId: serverID.nullable().transform((value) => value ?? INBOX_ID),
  version: z.number().int().positive(),
  updatedAt: timestamp,
  steps: z
    .array(
      z.object({
        id: serverID,
        title: z.string().min(1).max(200),
        done: z.boolean(),
      })
    )
    .max(50),
})
export const snapshotSchema = z.object({
  todoLists: z.array(listSchema),
  todos: z.array(remoteTodoSchema),
  todoViews: z.array(todoViewSchema).min(1),
  todoPriorities: z
    .array(todoPrioritySchema)
    .length(4)
    .refine((rows) => new Set(rows.map((p) => p.value)).size === 4),
})
export type TodoChanges = Partial<
  Pick<
    Todo,
    | "title"
    | "note"
    | "listId"
    | "done"
    | "priority"
    | "dueDate"
    | "plannedFor"
    | "tags"
    | "steps"
    | "source"
  >
>
