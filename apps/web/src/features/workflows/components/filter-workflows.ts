import type { FilterCondition } from "@/components/reui/filters/filters-query"

import { getWorkflowSearchBlob, type WorkflowItem } from "./data"

export function getActiveFilters(filters: FilterCondition[]) {
  return filters.filter((filter) => {
    const { operator, values } = filter

    if (operator === "empty" || operator === "not_empty") return true
    if (!values || values.length === 0) return false

    if (
      values.every((value) => typeof value === "string" && value.trim() === "")
    ) {
      return false
    }

    return true
  })
}

/** The values one field holds for a row; tags hold several. */
function filterFieldValues(item: WorkflowItem, field: string): string[] {
  switch (field) {
    case "keyword":
      return [getWorkflowSearchBlob(item)]
    case "owner":
      return [item.owner.name]
    case "enabled":
      return [item.enabled ? "On" : "Off"]
    case "lastRun":
      return [item.lastRun]
    case "trigger":
      return [item.trigger]
    case "tag":
      return item.tags
    default:
      return [""]
  }
}

/**
 * Whether one row satisfies one condition. `null` means the condition places no
 * constraint on the row, so a negated rule must not drop it either.
 */
function matchWorkflowFilterValue(
  fieldValues: string[],
  operator: string,
  values: unknown[]
): boolean | null {
  const lowered = fieldValues.map((value) => value.toLowerCase())
  const has = (value: unknown) => fieldValues.includes(String(value))

  switch (operator) {
    case "is":
    case "is_any_of":
      return values.some(has)
    case "is_not":
    case "is_none_of":
      return !values.some(has)
    case "contains": {
      const tokens = values.map((value) => String(value).trim()).filter(Boolean)

      if (tokens.length === 0) return null

      return tokens.some((token) =>
        lowered.some((value) => value.includes(token.toLowerCase()))
      )
    }
    case "not_contains":
      return !values.some((token) =>
        lowered.some((value) => value.includes(String(token).toLowerCase()))
      )
    case "starts_with":
      return values.some((token) =>
        lowered.some((value) => value.startsWith(String(token).toLowerCase()))
      )
    case "ends_with":
      return values.some((token) =>
        lowered.some((value) => value.endsWith(String(token).toLowerCase()))
      )
    case "empty":
      return fieldValues.every((value) => value.length === 0)
    case "not_empty":
      return fieldValues.some((value) => value.length > 0)
    default:
      return null
  }
}

export function applyWorkflowFilters(
  data: WorkflowItem[],
  filters: FilterCondition[]
) {
  return getActiveFilters(filters).reduce((result, filter) => {
    const { field, operator, values, negated } = filter

    return result.filter((item) => {
      const matched = matchWorkflowFilterValue(
        filterFieldValues(item, field),
        operator,
        values
      )

      if (matched === null) return true

      // The chip menu negates in place whenever the operator declares no
      // inverse to swap to ("starts with", "ends with"), so the row test has to
      // flip with it.
      return negated ? !matched : matched
    })
  }, data)
}
