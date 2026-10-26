import type {
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"

export const EQUALITY_OPERATORS = [
  { value: "is", label: "是", inverse: "is_not" },
  { value: "is_not", label: "不是", inverse: "is" },
]

/** 保留 ReUI 查询的组合与否定语义，未填写完整的条件不参与筛选。 */
export const matchesQuery = (
  query: FilterQuery,
  values: Record<string, string | string[]>
): boolean => {
  const evaluate = (node: FilterNode): boolean | undefined => {
    if (node.type === "group") {
      const results = node.rules
        .map(evaluate)
        .filter((result) => result !== undefined)
      if (!results.length) return undefined
      return node.combinator === "or"
        ? results.some(Boolean)
        : results.every(Boolean)
    }
    if (
      !node.operator ||
      node.value === undefined ||
      node.value === null ||
      node.value === ""
    )
      return undefined
    const selectedValues = Array.isArray(node.value)
      ? node.value.map(String)
      : [String(node.value)]
    const actual = values[node.path.join(".")]
    const actualValues = Array.isArray(actual) ? actual : [actual]
    const selected = selectedValues.some((value) =>
      actualValues.includes(value)
    )
    const matches = ["is_not", "is_none_of"].includes(node.operator)
      ? !selected
      : selected
    return node.negated ? !matches : matches
  }
  return evaluate(query) ?? true
}
