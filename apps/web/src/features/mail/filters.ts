import type {
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import type { RuleDocument, RuleNode, RuleType } from "@/lib/rules/model"

const types: Record<string, RuleType> = {
  read: "boolean",
  starred: "boolean",
  hasAttachment: "boolean",
  sender: "string",
  address: "string",
  subject: "string",
  accountId: "string",
  receivedAt: "timestamp",
}

/** 保留 AND/OR/取反；批量操作开启严格校验，未填完的条件不能扩大更新范围。 */
export function mailFilterRule(
  query: FilterQuery,
  strict = false
): RuleDocument {
  const convert = (node: FilterNode, depth: number): RuleNode | null => {
    if (depth > 8 && strict) throw new Error("规则最多嵌套 8 层")
    if (node.type === "group") {
      const children = node.rules
        .map((child) => convert(child, depth + 1))
        .filter((child): child is RuleNode => child !== null)
      if (!children.length && strict && depth > 1)
        throw new Error("请补全分组条件")
      return children.length
        ? { kind: node.combinator === "or" ? "any" : "all", children }
        : null
    }
    if (
      !node.operator ||
      node.value === undefined ||
      node.value === null ||
      node.value === ""
    ) {
      if (strict) throw new Error("请补全筛选条件")
      return null
    }
    const field = node.path.join(".")
    const type = types[field]
    if (!type) throw new Error("不支持这个筛选字段")
    const raw = String(node.value)
    const value =
      type === "boolean" ? ["true", "read", "yes"].includes(raw) : raw
    const op =
      (
        { is: "eq", is_not: "ne", not_contains: "contains" } as Record<
          string,
          string
        >
      )[node.operator] ?? node.operator
    const condition: RuleNode = {
      kind: "condition",
      op,
      args: [
        { kind: "fact", path: field },
        { kind: "constant", type, value },
      ],
    }
    return !!node.negated !== (node.operator === "not_contains")
      ? { kind: "not", child: condition }
      : condition
  }
  return {
    schemaVersion: 1,
    root: convert(query, 1) ?? { kind: "constant", value: true },
  }
}
