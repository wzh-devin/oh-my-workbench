import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import { compileRule } from "@/lib/rules/compile"
import { folderTrail } from "./asset-rules"
import type { RemoteEntry } from "./model"
import type {
  Operand,
  RuleDocument,
  RuleNode,
  RuleSchema,
} from "@/lib/rules/model"

const schema: RuleSchema = {
  facts: {
    name: "string",
    kind: "string",
    connectionId: "string",
    parentId: "string",
    size: "number",
    starred: "boolean",
    createdAt: "date",
    updatedAt: "date",
    lastOpenedAt: "date",
  },
  context: {},
}
const equality = [
  { value: "eq", label: "是", inverse: "ne" },
  { value: "ne", label: "不是", inverse: "eq" },
]
const comparison = [
  ...equality,
  { value: "gt", label: "大于", inverse: "lte" },
  { value: "gte", label: "大于等于", inverse: "lt" },
  { value: "lt", label: "小于", inverse: "gte" },
  { value: "lte", label: "小于等于", inverse: "gt" },
]
/** 列表与视图表单共用字段，不另建筛选面板或分叉文案。 */
export const assetRuleFields = (
  connections: { id: string; name: string }[],
  folders: RemoteEntry[]
): FilterField[] => [
  {
    id: "name",
    label: "文件名",
    type: "text",
    placeholder: "文件名称",
    operators: [
      ...equality,
      { value: "contains", label: "包含", inverse: "not_contains" },
      { value: "not_contains", label: "不包含", inverse: "contains" },
    ],
  },
  {
    id: "kind",
    label: "文件类型",
    type: "select",
    placeholder: "选择类型",
    operators: equality,
    options: [
      "文件夹",
      "文档",
      "表格",
      "图片",
      "视频",
      "音频",
      "压缩包",
      "其他",
    ].map((value) => ({ value, label: value })),
  },
  {
    id: "connectionId",
    label: "所属存储",
    type: "select",
    placeholder: "选择存储",
    operators: equality,
    options: connections.map((connection) => ({
      value: connection.id,
      label: connection.name,
    })),
  },
  {
    id: "parentId",
    label: "路径",
    type: "select",
    placeholder: "选择路径",
    operators: equality,
    options: [
      { value: "root", label: "根目录" },
      ...folders.map((folder) => ({
        value: folder.id,
        label: `${connections.find((source) => source.id === folder.connectionId)?.name ?? "存储"} / ${folderTrail(
          { assetFolders: folders },
          folder.id
        )
          .map((record) => record.name)
          .join(" / ")}`,
      })),
    ],
  },
  {
    id: "size",
    label: "文件大小（字节）",
    type: "number",
    placeholder: "例如 10485760",
    operators: comparison,
  },
  {
    id: "starred",
    label: "收藏",
    type: "select",
    placeholder: "选择收藏状态",
    operators: equality,
    options: [
      { value: "true", label: "已收藏" },
      { value: "false", label: "未收藏" },
    ],
  },
  ...["createdAt", "updatedAt", "lastOpenedAt"].map(
    (id, index): FilterField => ({
      id,
      label: ["创建日期", "修改日期", "访问日期"][index],
      type: "text",
      placeholder: "YYYY-MM-DD",
      operators: [
        ...comparison,
        ...(id === "lastOpenedAt"
          ? [
              {
                value: "empty",
                label: "为空",
                inverse: "not_empty",
                arity: "none" as const,
              },
              {
                value: "not_empty",
                label: "不为空",
                inverse: "empty",
                arity: "none" as const,
              },
            ]
          : []),
      ],
    })
  ),
]
/** 完整 AST 递归转换，编辑中未填完的条件只在临时查询中跳过。 */
export const assetQueryToRule = (
  query: FilterQuery,
  strict = true
): RuleDocument => {
  const convert = (node: FilterNode, depth: number): RuleNode | null => {
    if (depth > 9) throw new Error("规则最多嵌套 9 层")
    if (node.type === "group") {
      const children = node.rules
        .map((child) => convert(child, depth + 1))
        .filter((child): child is RuleNode => child !== null)
      if (!children.length && strict && depth > 1)
        throw new Error("条件分组不能为空")
      return children.length
        ? { kind: node.combinator === "or" ? "any" : "all", children }
        : null
    }
    const field = node.path.join("."),
      type = schema.facts[field]
    if (!type) throw new Error("未知筛选字段")
    if (!node.operator || node.value == null || node.value === "") {
      if (!["empty", "not_empty"].includes(node.operator ?? "")) {
        if (strict) throw new Error("请补全筛选条件")
        return null
      }
    }
    const empty = ["empty", "not_empty"].includes(node.operator),
      args: Operand[] = [{ kind: "fact", path: field }]
    if (!empty) {
      const text = String(node.value).trim()
      if (type === "number") {
        const value = Number(text)
        if (
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > 10 * 1024 ** 3
        ) {
          if (!strict) return null
          throw new Error("请输入有效的文件大小")
        }
        args.push({ kind: "constant", value })
      } else if (type === "boolean") {
        if (!["true", "false"].includes(text)) throw new Error("请选择收藏状态")
        args.push({ kind: "constant", value: text === "true" })
      } else {
        if (
          type === "date" &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
            !Number.isFinite(Date.parse(text)) ||
            new Date(text).toISOString().slice(0, 10) !== text)
        ) {
          if (!strict) return null
          throw new Error("请输入有效日期，格式为 YYYY-MM-DD")
        }
        args.push({
          kind: "constant",
          value: text,
          ...(type === "date" ? { type: "date" as const } : {}),
        })
      }
    }
    const condition: RuleNode = {
      kind: "condition",
      op: empty
        ? "is_null"
        : node.operator === "not_contains"
          ? "contains"
          : node.operator,
      args,
    }
    return !!node.negated !==
      ["not_empty", "not_contains"].includes(node.operator)
      ? { kind: "not", child: condition }
      : condition
  }
  const document: RuleDocument = {
    schemaVersion: 1,
    root: convert(query, 1) ?? { kind: "constant", value: true },
  }
  compileRule(document, schema, { maxDepth: 9, maxNodes: 260 })
  return document
}
/** 组合取反按德摩根律恢复，不能将 OR 或 NOT 展平为 AND。 */
export const assetRuleToQuery = (document: RuleDocument): FilterQuery => {
  let sequence = 0
  const convert = (node: RuleNode, negated = false): FilterNode | boolean => {
    if (node.kind === "constant") return node.value !== negated
    if (node.kind === "not") return convert(node.child, !negated)
    if (node.kind === "all" || node.kind === "any") {
      const and = (node.kind === "all") !== negated,
        children = node.children.map((child) => convert(child, negated))
      if (children.some((child) => child === !and)) return !and
      const rules = children.filter(
        (child): child is FilterNode => typeof child !== "boolean"
      )
      return rules.length
        ? {
            id: `group-${++sequence}`,
            type: "group",
            combinator: and ? "and" : "or",
            rules,
          }
        : and
    }
    const fact = node.args[0],
      value = node.args[1]
    if (fact?.kind !== "fact") throw new Error("视图规则无法编辑")
    return {
      id: `rule-${++sequence}`,
      type: "rule",
      path: [fact.path],
      operator: node.op === "is_null" ? "empty" : node.op,
      value: value?.kind === "constant" ? String(value.value) : undefined,
      negated,
    }
  }
  const root = convert(document.root)
  if (root === true) return createFilterQuery()
  if (root === false)
    return createFilterQuery(
      ["true", "false"].map((value) => ({
        id: `rule-${++sequence}`,
        type: "rule",
        path: ["starred"],
        operator: "eq",
        value,
      }))
    )
  return root.type === "group" ? root : createFilterQuery([root])
}
