import { z } from "zod"
import {
  ruleDocumentSchema,
  type Operand,
  type RuleDocument,
  type RuleNode,
  type RuleSchema,
  type RuleType,
  type RuleValue,
} from "./model"

type Values = Record<string, unknown>
type Read = (facts: Values, context: Values) => RuleValue | undefined
type Argument = { type: RuleType | "null"; read: Read }
type Predicate = (facts: Values, context: Values) => boolean
const fail = (): never => {
  throw new Error("规则格式或参数不正确")
}
const isoDate = z.iso.date()

/** 浏览器只执行可精确表示的整数与日历日；未支持的协议能力明确拒绝。 */
const validValue = (value: unknown, type: RuleType): value is RuleValue => {
  if (type.endsWith("[]"))
    return (
      Array.isArray(value) &&
      value.length <= 10 &&
      value.every((item) => validValue(item, type.slice(0, -2) as RuleType))
    )
  if (type === "date") return isoDate.safeParse(value).success
  if (type === "number")
    return typeof value === "number" && Number.isSafeInteger(value)
  return typeof value === type
}
/** 数组按元素顺序比较，保持通用协议的等值语义。 */
const equals = (left: RuleValue, right: RuleValue): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((v, i) => v === right[i])
    : left === right

/** 编译与业务无关的条件树，运行时不再查找操作符或拆分字段路径。 */
export const compileRule = (
  input: RuleDocument,
  schema: RuleSchema,
  limits: { maxDepth?: number; maxNodes?: number } = {}
): Predicate => {
  const document = ruleDocumentSchema.parse(input)
  let count = 0
  const argument = (operand: Operand): Argument => {
    if (operand.kind === "constant") {
      const v = operand.value
      const inferred =
        v === null
          ? "null"
          : Array.isArray(v)
            ? v.length
              ? `${typeof v[0]}[]`
              : ""
            : typeof v
      const type = (operand.type ?? inferred) as RuleType | "null"
      if (type !== "null" ? !validValue(v, type) : operand.type !== undefined)
        fail()
      return { type, read: () => v }
    }
    const source = operand.kind === "fact" ? schema.facts : schema.context
    const type = source[operand.path]
    if (!type) fail()
    const parts = operand.path.split(".")
    return {
      type,
      read: (facts, context) => {
        let value: unknown = operand.kind === "fact" ? facts : context
        for (const part of parts)
          value =
            value && typeof value === "object"
              ? Object.getOwnPropertyDescriptor(value, part)?.value
              : undefined
        if (value !== undefined && value !== null && !validValue(value, type))
          fail()
        return value as RuleValue | undefined
      },
    }
  }
  const compile = (node: RuleNode, depth: number): Predicate => {
    if (++count > (limits.maxNodes ?? 256) || depth > (limits.maxDepth ?? 8))
      fail()
    if (node.kind === "constant") return () => node.value
    if (node.kind === "not") {
      const child = compile(node.child, depth + 1)
      return (f, c) => !child(f, c)
    }
    if (node.kind === "all" || node.kind === "any") {
      const children = node.children.map((child) => compile(child, depth + 1))
      return node.kind === "all"
        ? (f, c) => children.every((child) => child(f, c))
        : (f, c) => children.some((child) => child(f, c))
    }
    const args = node.args.map(argument),
      op = node.op
    count += args.length
    if (count > (limits.maxNodes ?? 256)) fail()
    const unary = ["exists", "is_null", "is_empty"].includes(op)
    if (args.length !== (unary ? 1 : op === "between" ? 3 : 2)) fail()
    const a = args[0],
      b = args[1]
    if (!unary) {
      const equality = op === "eq" || op === "ne"
      const collection = ["in", "not_in", "has_any", "has_all"].includes(op)
      if (collection) {
        if (
          !b.type.endsWith("[]") ||
          (["in", "not_in"].includes(op)
            ? a.type !== b.type.slice(0, -2)
            : a.type !== b.type)
        )
          fail()
      } else if (equality) {
        if (a.type !== b.type && a.type !== "null" && b.type !== "null") fail()
      } else if (op === "contains") {
        if (a.type !== "string" || b.type !== "string") fail()
      } else if (
        !["gt", "gte", "lt", "lte", "between"].includes(op) ||
        !["number", "string", "date"].includes(a.type) ||
        a.type !== b.type ||
        (op === "between" && args[2].type !== a.type)
      )
        fail()
    } else if (
      op === "is_empty" &&
      a.type !== "string" &&
      !a.type.endsWith("[]")
    )
      fail()
    return (facts, context) => {
      const values = args.map((arg) => arg.read(facts, context)),
        left = values[0],
        right = values[1]
      if (op === "exists") return left !== undefined
      if (values.some((v) => v === undefined)) fail()
      const x = left as RuleValue,
        y = right as RuleValue
      if (op === "is_null") return x === null
      if (op === "is_empty")
        return (
          x !== null &&
          (typeof x === "string" || Array.isArray(x)) &&
          x.length === 0
        )
      if (op === "eq") return equals(x, y)
      if (op === "ne") return !equals(x, y)
      if (x === null || y === null) return false
      switch (op) {
        case "contains":
          return (x as string).includes(y as string)
        case "in":
          return (y as RuleValue[]).some((v) => equals(x, v))
        case "not_in":
          return !(y as RuleValue[]).some((v) => equals(x, v))
        case "has_any":
          return (y as RuleValue[]).some((v) =>
            (x as RuleValue[]).some((item) => equals(item, v))
          )
        case "has_all":
          return (y as RuleValue[]).every((v) =>
            (x as RuleValue[]).some((item) => equals(item, v))
          )
        case "gt":
          return (x as string | number) > (y as string | number)
        case "gte":
          return (x as string | number) >= (y as string | number)
        case "lt":
          return (x as string | number) < (y as string | number)
        case "lte":
          return (x as string | number) <= (y as string | number)
        case "between":
          return (
            values[2] !== null &&
            (x as string | number) >= (y as string | number) &&
            (x as string | number) <= (values[2] as string | number)
          )
        default:
          return fail()
      }
    }
  }
  return compile(document.root, 1)
}
