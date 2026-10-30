import { z } from "zod"

export type RuleType =
  | "boolean"
  | "string"
  | "number"
  | "timestamp"
  | "date"
  | "boolean[]"
  | "string[]"
  | "number[]"
  | "date[]"
export type RuleValue =
  boolean | string | number | null | (boolean | string | number)[]
export type Operand =
  | { kind: "fact" | "context"; path: string }
  | { kind: "constant"; value: RuleValue; type?: RuleType }
export type RuleNode =
  | { kind: "constant"; value: boolean }
  | { kind: "all"; children: RuleNode[] }
  | { kind: "any"; children: RuleNode[] }
  | { kind: "not"; child: RuleNode }
  | { kind: "condition"; op: string; args: Operand[] }
export type RuleDocument = { schemaVersion: 1; root: RuleNode }
export type RuleSchema = {
  facts: Record<string, RuleType>
  context: Record<string, RuleType>
}

const scalar = z.union([
  z.boolean(),
  z.string().max(200),
  z.number().refine(Number.isSafeInteger),
])
const operandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fact"), path: z.string() }).strict(),
  z.object({ kind: z.literal("context"), path: z.string() }).strict(),
  z
    .object({
      kind: z.literal("constant"),
      value: z.union([scalar, z.null(), z.array(scalar).max(10)]),
      type: z
        .enum([
          "boolean",
          "string",
          "number",
          "date",
          "timestamp",
          "boolean[]",
          "string[]",
          "number[]",
          "date[]",
        ])
        .optional(),
    })
    .strict(),
])
const nodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("constant"), value: z.boolean() }).strict(),
    z
      .object({
        kind: z.literal("all"),
        children: z.array(nodeSchema).min(1).max(256),
      })
      .strict(),
    z
      .object({
        kind: z.literal("any"),
        children: z.array(nodeSchema).min(1).max(256),
      })
      .strict(),
    z.object({ kind: z.literal("not"), child: nodeSchema }).strict(),
    z
      .object({
        kind: z.literal("condition"),
        op: z.string().max(64),
        args: z.array(operandSchema).max(3),
      })
      .strict(),
  ])
)
export const ruleDocumentSchema: z.ZodType<RuleDocument> = z
  .object({ schemaVersion: z.literal(1), root: nodeSchema })
  .strict()
