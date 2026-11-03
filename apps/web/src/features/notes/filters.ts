import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import { compileRule } from "@/lib/rules/compile"
import type { RuleDocument, RuleNode } from "@/lib/rules/model"
import type { Notebook } from "./model"

const equality = [
  { value: "eq", label: "是", inverse: "ne" },
  { value: "ne", label: "不是", inverse: "eq" },
]
const facts = {
  title: "string",
  tag: "string",
  notebookId: "string",
  favorite: "boolean",
  requiresUnlock: "boolean",
} as const
/** 筛选字段只涉及明文元数据，不为加密正文建立旁路索引。 */
export const noteFields = (notebooks: Notebook[]): FilterField[] => [
  {
    id: "title",
    label: "标题",
    type: "text",
    operators: [
      ...equality,
      { value: "contains", label: "包含", inverse: "not_contains" },
      { value: "not_contains", label: "不包含", inverse: "contains" },
    ],
    placeholder: "输入标题",
  },
  {
    id: "tag",
    label: "标签",
    type: "text",
    operators: equality,
    placeholder: "输入标签",
  },
  {
    id: "notebookId",
    label: "笔记本",
    type: "select",
    operators: equality,
    placeholder: "选择笔记本",
    options: [
      { value: "unfiled", label: "未分类" },
      ...notebooks.map((book) => ({ value: book.id, label: book.name })),
    ],
  },
  ...(["favorite", "requiresUnlock"] as const).map((field) => ({
    id: field,
    label: field === "favorite" ? "收藏" : "加锁",
    type: "select" as const,
    operators: equality,
    placeholder: "选择状态",
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "否" },
    ],
  })),
]
/** 直接递归分组，未填写完整的条件暂不应用，保留 AND/OR 和取反。 */
export const noteRule = (query: FilterQuery, strict = false): RuleDocument => {
  const walk = (node: FilterNode, depth: number): RuleNode | null => {
    if (depth > 9) throw new Error("规则最多嵌套 9 层")
    if (node.type === "group") {
      const children = node.rules
        .map((child) => walk(child, depth + 1))
        .filter((child): child is RuleNode => child !== null)
      return children.length
        ? { kind: node.combinator === "or" ? "any" : "all", children }
        : null
    }
    const field = node.path.join(".")
    if (
      !(field in facts) ||
      !node.operator ||
      node.value === "" ||
      node.value == null
    ) {
      if (strict) throw new Error("请补全筛选条件")
      return null
    }
    if (typeof node.value !== "string") throw new Error("请检查筛选条件")
    const boolean = field === "favorite" || field === "requiresUnlock"
    if (boolean && !["true", "false"].includes(node.value))
      throw new Error("请选择有效状态")
    const condition: RuleNode = {
      kind: "condition",
      op: node.operator === "not_contains" ? "contains" : node.operator,
      args: [
        { kind: "fact", path: field },
        {
          kind: "constant",
          value: boolean ? node.value === "true" : node.value,
        },
      ],
    }
    return !!node.negated !== (node.operator === "not_contains")
      ? { kind: "not", child: condition }
      : condition
  }
  const doc: RuleDocument = {
    schemaVersion: 1,
    root: walk(query, 1) ?? { kind: "constant", value: true },
  }
  compileRule(doc, { facts, context: {} }, { maxDepth: 9, maxNodes: 260 })
  return doc
}

/** 组合取反按德摩根律恢复，不能将 OR 或 NOT 展平为 AND。 */
export const noteRuleToQuery = (document: RuleDocument): FilterQuery => {
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
        path: ["favorite"],
        operator: "eq",
        value,
      }))
    )
  return root.type === "group" ? root : createFilterQuery([root])
}

/** 仅当完整规则必然要求加锁时继承，OR 分支不能被误当成 AND。 */
export const noteViewRequiresUnlock = (
  node: RuleNode,
  negated = false
): boolean => {
  if (node.kind === "not") return noteViewRequiresUnlock(node.child, !negated)
  if (node.kind === "all" || node.kind === "any") {
    const every = (node.kind === "any") !== negated
    return (
      node.children.length > 0 &&
      (every
        ? node.children.every((child) => noteViewRequiresUnlock(child, negated))
        : node.children.some((child) => noteViewRequiresUnlock(child, negated)))
    )
  }
  if (
    node.kind !== "condition" ||
    node.args[0]?.kind !== "fact" ||
    node.args[0].path !== "requiresUnlock" ||
    node.args[1]?.kind !== "constant"
  )
    return false
  if (node.op !== "eq" && node.op !== "ne") return false
  const { value } = node.args[1]
  return (
    typeof value === "boolean" &&
    ((node.op === "eq" && value) || (node.op === "ne" && !value)) !== negated
  )
}
