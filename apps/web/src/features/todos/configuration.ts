import { z } from "zod"
import { ruleDocumentSchema, type RuleNode } from "@/lib/rules/model"

export const VIEW_ICON_KEYS = [
  "list-todo",
  "sun",
  "calendar",
  "calendar-clock",
  "check-check",
  "flag",
  "star",
  "heart",
  "briefcase",
  "house",
  "book-open",
  "coffee",
  "code",
  "target",
  "inbox",
  "folder",
  "tag",
  "zap",
] as const
const legacyPriorityColors: Record<string, string> = {
  gray: "#71717a",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  green: "#10b981",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  pink: "#ec4899",
}
const priorityColorSchema = z
  .string()
  .refine(
    (color) =>
      /^#[0-9a-f]{6}$/i.test(color) ||
      Object.hasOwn(legacyPriorityColors, color),
    "请选择有效的颜色"
  )
  .transform((color) => (legacyPriorityColors[color] ?? color).toLowerCase())
export const todoViewSchema = z
  .object({
    id: z.string().regex(/^[1-9]\d*$/),
    builtinKey: z.enum(["all", "myday", "overdue", "completed"]).nullable(),
    name: z.string().trim().min(1).max(100),
    icon: z.enum(VIEW_ICON_KEYS),
    filterQuery: ruleDocumentSchema,
    searchText: z.string().max(200).default(""),
    sort: z.enum(["due", "priority", "newest"]),
    version: z.number().int().positive(),
  })
  .transform(({ searchText, ...view }) => {
    // 旧关键词只在读取边界归并，保存完整规则后由服务端清空旧字段。
    if (!searchText) return view
    const text: RuleNode = {
      kind: "condition",
      op: "contains",
      args: [
        { kind: "fact", path: "text" },
        { kind: "constant", value: searchText.toLowerCase() },
      ],
    }
    const root = view.filterQuery.root
    return {
      ...view,
      filterQuery: {
        ...view.filterQuery,
        root: {
          kind: "all" as const,
          children:
            root.kind === "all" ? [...root.children, text] : [root, text],
        },
      },
    }
  })
export const todoPrioritySchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  value: z.number().int().min(1).max(4),
  name: z.string().trim().min(1).max(24),
  color: priorityColorSchema,
  position: z.number().int().min(0).max(3),
  version: z.number().int().positive(),
})
export type TodoView = z.infer<typeof todoViewSchema>
export type TodoPriority = z.infer<typeof todoPrioritySchema>
export type ViewChanges = Pick<
  TodoView,
  "name" | "icon" | "filterQuery" | "sort"
>
