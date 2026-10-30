import {
  flattenFilterConditions,
  type FilterCondition,
} from "@/components/reui/filters/filters-query"
import type {
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"

/** 按原树计算组合关系；旧平面调用仍按 AND，未完成条件不约束结果。 */
export const matchesFilterQuery = (
  query: FilterQuery | FilterCondition[],
  match: (condition: FilterCondition) => boolean | undefined
): boolean => {
  if (Array.isArray(query))
    return query.every((condition) => match(condition) ?? true)
  const evaluate = (node: FilterNode): boolean | undefined => {
    if (node.type === "rule") {
      const [condition] = flattenFilterConditions({ ...query, rules: [node] })
      return condition ? match(condition) : undefined
    }
    const results = node.rules
      .map(evaluate)
      .filter((result) => result !== undefined)
    if (!results.length) return undefined
    return node.combinator === "or"
      ? results.some(Boolean)
      : results.every(Boolean)
  }
  return evaluate(query) ?? true
}
