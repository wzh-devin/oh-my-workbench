import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type {
  FilterNode,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import { compileRule } from "@/lib/rules/compile"
import type {
  Operand,
  RuleDocument,
  RuleNode,
  RuleSchema,
} from "@/lib/rules/model"
import type { Todo } from "./model"
import type { TodoView } from "./configuration"
import { offsetDate } from "./task-rules"

const schema: RuleSchema = {
  facts: {
    done: "boolean",
    listId: "string",
    priority: "number",
    tags: "string[]",
    plannedFor: "date",
    dueDate: "date",
    text: "string",
  },
  context: { today: "date", yesterday: "date", tomorrow: "date" },
}
// 为旧关键词归并保留一个AND层和二元条件（含操作数），避免满额规则失效。
const limits = { maxDepth: 9, maxNodes: 260 }
export const DATE_PRESETS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "tomorrow", label: "明天" },
]

/** 只有完整的可视化条件才能转换为通用规则，空根明确表示恒真。 */
export const queryToRule = (query: FilterQuery): RuleDocument => {
  const convert = (node: FilterNode, depth: number): RuleNode => {
    if (depth > limits.maxDepth) throw new Error("规则最多嵌套 9 层")
    if (node.type === "group") {
      if (!node.rules.length) {
        if (depth === 1) return { kind: "constant", value: true }
        throw new Error("条件分组不能为空")
      }
      return {
        kind: node.combinator === "or" ? "any" : "all",
        children: node.rules.map((child) => convert(child, depth + 1)),
      }
    }
    const field = node.path.join(".")
    if (!schema.facts[field] || !node.operator)
      throw new Error("请补全条件和操作符")
    const args: Operand[] = [{ kind: "fact", path: field }]
    const empty = node.operator === "empty" || node.operator === "not_empty"
    const op = empty
      ? field === "tags"
        ? "is_empty"
        : "is_null"
      : node.operator === "not_contains"
        ? "contains"
        : node.operator
    if (!empty) {
      if (typeof node.value !== "string" || !node.value.trim())
        throw new Error("请填写完整的条件值")
      const value = node.value.trim()
      if (field === "text" && value.length > 200)
        throw new Error("匹配文本最多 200 字")
      if (field === "done") {
        if (value !== "true" && value !== "false")
          throw new Error("请选择完成状态")
        args.push({ kind: "constant", value: value === "true" })
      } else if (field === "priority") {
        const number = Number(value)
        if (![1, 2, 3, 4].includes(number))
          throw new Error("请选择有效的优先级")
        args.push({ kind: "constant", value: number })
      } else if (field === "tags") {
        const tags = [
          ...new Set(
            value
              .split(/[,，]/)
              .map((v) => v.trim())
              .filter(Boolean)
          ),
        ]
        if (
          !tags.length ||
          tags.length > 10 ||
          tags.some((v) => [...v].length > 24)
        )
          throw new Error("标签最多 10 个，每个最多 24 字")
        args.push({ kind: "constant", value: tags, type: "string[]" })
      } else if (field === "plannedFor" || field === "dueDate")
        args.push(
          DATE_PRESETS.some((p) => p.value === value)
            ? { kind: "context", path: value }
            : { kind: "constant", type: "date", value }
        )
      else
        args.push({
          kind: "constant",
          value: field === "text" ? value.toLowerCase() : value,
        })
    }
    const condition: RuleNode = { kind: "condition", op, args }
    return !!node.negated !==
      ["not_empty", "not_contains"].includes(node.operator)
      ? { kind: "not", child: condition }
      : condition
  }
  const document: RuleDocument = { schemaVersion: 1, root: convert(query, 1) }
  compileRule(document, schema, limits)
  return document
}

/** 恢复可视化条件；将组合取反转换为等价的 AND/OR 与单条件取反。 */
export const ruleToQuery = (document: RuleDocument): FilterQuery => {
  let sequence = 0
  const nextId = () => `rule-${++sequence}`
  const convert = (node: RuleNode, negated = false): FilterNode | boolean => {
    if (node.kind === "constant") return node.value !== negated
    if (node.kind === "not") return convert(node.child, !negated)
    if (node.kind === "all" || node.kind === "any") {
      const and = (node.kind === "all") !== negated
      const children = node.children.map((child) => convert(child, negated))
      if (children.some((child) => child === !and)) return !and
      const rules = children.filter(
        (child): child is FilterNode => typeof child !== "boolean"
      )
      return rules.length
        ? { id: nextId(), type: "group", combinator: and ? "and" : "or", rules }
        : and
    }
    const field = node.args[0]
    if (field?.kind !== "fact") throw new Error("无法编辑这个条件")
    const operand = node.args[1]
    const value =
      operand?.kind === "context"
        ? operand.path
        : operand?.kind === "constant"
          ? Array.isArray(operand.value)
            ? operand.value.join("，")
            : String(operand.value)
          : undefined
    const empty = node.op === "is_null" || node.op === "is_empty"
    return {
      id: nextId(),
      type: "rule",
      path: [field.path],
      operator:
        field.path === "text" && negated
          ? "not_contains"
          : empty
            ? "empty"
            : node.op,
      value,
      negated: field.path === "text" ? false : negated,
    }
  }
  const root = convert(document.root)
  if (root === true) return createFilterQuery()
  if (root === false)
    return createFilterQuery(
      [true, false].map((value) => ({
        id: nextId(),
        type: "rule",
        path: ["done"],
        operator: "eq",
        value: String(value),
      }))
    )
  return root.type === "group" ? root : createFilterQuery([root])
}

/** 先检查引用再编译，清单被删除时整个视图失效，不把条件静默放宽。 */
export const compileTodoViews = (
  views: TodoView[],
  listIds: string[],
  today: string
) =>
  views.map((view) => {
    try {
      const check = (node: RuleNode): void => {
        if (node.kind === "all" || node.kind === "any")
          node.children.forEach(check)
        else if (node.kind === "not") check(node.child)
        else if (
          node.kind === "condition" &&
          node.args[0]?.kind === "fact" &&
          node.args[0].path === "listId"
        ) {
          const value = node.args[1]
          if (
            value?.kind === "constant" &&
            !listIds.includes(String(value.value))
          )
            throw new Error("规则引用的清单已删除，请编辑视图")
        }
      }
      check(view.filterQuery.root)
      const predicate = compileTodoRule(view.filterQuery, today)
      return {
        view,
        error: null,
        match: predicate,
      }
    } catch (error) {
      return {
        view,
        error: error instanceof Error ? error.message : "视图规则无效",
        match: () => false,
      }
    }
  })

/** 固定日期上下文并编译一次，同一条件复用于当前快照中的任务。 */
export const compileTodoRule = (document: RuleDocument, today: string) => {
  const predicate = compileRule(document, schema, limits)
  const readsText = (node: RuleNode): boolean =>
    node.kind === "all" || node.kind === "any"
      ? node.children.some(readsText)
      : node.kind === "not"
        ? readsText(node.child)
        : node.kind === "condition" &&
          node.args.some((arg) => arg.kind === "fact" && arg.path === "text")
  const needsText = readsText(document.root)
  const context = {
    today,
    yesterday: today ? offsetDate(today, -1) : "",
    tomorrow: today ? offsetDate(today, 1) : "",
  }
  return (todo: Todo) =>
    !!today &&
    predicate(
      {
        done: todo.done,
        listId: todo.listId,
        priority: todo.priority,
        tags: todo.tags,
        plannedFor: todo.plannedFor,
        dueDate: todo.dueDate,
        text: needsText ? taskSearchText(todo) : "",
      },
      context
    )
}

/** 只从确定的 AND 等值条件派生新任务字段，不猜测 OR 或取反分支。 */
export const viewTaskDefaults = (
  view: TodoView | undefined,
  today: string
): Partial<Todo> => {
  const result: Partial<Todo> = {}
  const walk = (node: RuleNode) => {
    if (node.kind === "all") node.children.forEach(walk)
    else if (
      node.kind === "condition" &&
      node.op === "eq" &&
      node.args[0]?.kind === "fact"
    ) {
      const field = node.args[0].path,
        operand = node.args[1]
      const value =
        operand?.kind === "constant"
          ? operand.value
          : operand?.kind === "context"
            ? operand.path === "today"
              ? today
              : operand.path === "yesterday"
                ? offsetDate(today, -1)
                : offsetDate(today, 1)
            : undefined
      if (
        (field === "dueDate" || field === "plannedFor") &&
        typeof value === "string"
      )
        result[field] = value
      if (field === "priority" && typeof value === "number")
        result.priority = value
      if (field === "listId" && typeof value === "string") result.listId = value
    }
  }
  if (view && today) walk(view.filterQuery.root)
  return result
}

export const taskSearchText = (todo: Todo) =>
  `${todo.title} ${todo.note} ${todo.tags.join(" ")} ${todo.steps.map((step) => step.title).join(" ")}`.toLowerCase()
