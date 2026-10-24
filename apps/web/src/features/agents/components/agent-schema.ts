import * as z from "zod"

import { CURRENT_USER } from "@/lib/workspace/team"

import {
  AGENT_MODEL_OPTIONS,
  AGENT_OWNER_OPTIONS,
  type AgentRecord,
} from "./data"
import { ENVIRONMENT_OPTIONS } from "./sheet-data"

export const NAME_MAX_LENGTH = 60

/** USD a month; past this a typo is likelier than a real budget. */
export const BUDGET_MAX = 1_000_000

const MODEL_REQUIRED = "Choose the model the agent runs on."

/** A plain amount: digits with an optional decimal part, no sign or exponent. */
const AMOUNT = /^(?:\d+(?:\.\d*)?|\.\d+)$/
/** Whole cents at most. */
const CENTS = /^\d*(?:\.\d{0,2})?$/

/** The drawer's Settings form, the same for New Agent and an edit. The
 *  budget stays a string as typed; the sheet saves it as a number. An empty
 *  model is the form's "nothing picked yet", never a saved value. */
export const agentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for the agent.")
    .max(
      NAME_MAX_LENGTH,
      `Keep the name to ${NAME_MAX_LENGTH} characters or fewer.`
    ),
  environment: z.enum(
    ENVIRONMENT_OPTIONS.map((option) => option.value),
    { error: "Choose an environment." }
  ),
  /** USD a month, as typed. */
  monthlyBudget: z
    .string()
    .trim()
    .min(1, "Enter a monthly budget, 0 or more.")
    .regex(AMOUNT, "Enter the budget as a number, 0 or more.")
    .regex(CENTS, "Round the budget to whole cents, like 250.50.")
    .refine(
      (budget) => !AMOUNT.test(budget) || Number(budget) <= BUDGET_MAX,
      `Enter a budget of ${BUDGET_MAX.toLocaleString("en-US")} or less.`
    ),
  model: z
    .enum([...AGENT_MODEL_OPTIONS.map((option) => option.value), ""], {
      error: MODEL_REQUIRED,
    })
    // A length check, not `!== ""`: that would narrow the output type and
    // split it from the form values, which start empty.
    .refine((model) => model.length > 0, MODEL_REQUIRED),
  ownerId: z.enum(
    AGENT_OWNER_OPTIONS.map((option) => option.value),
    { error: "Choose an owner." }
  ),
  alertOnFailure: z.boolean(),
})

/** What the sheet's Settings tab edits: four record fields, two drawer ones. */
export type AgentSheetFormValues = z.infer<typeof agentSchema>

/** A new agent: a staging draft owned by whoever makes it. */
export const EMPTY_AGENT_SHEET_FORM: AgentSheetFormValues = {
  name: "",
  environment: "staging",
  monthlyBudget: "100",
  model: "",
  ownerId: CURRENT_USER.id,
  alertOnFailure: true,
}

/** Adds the rule that needs the list: a name no other agent uses, compared
 *  without case. `editingId` is the record being edited. */
export function agentFormSchema(agents: AgentRecord[], editingId?: string) {
  const taken = new Set(
    agents
      .filter((agent) => agent.id !== editingId)
      .map((agent) => agent.name.trim().toLowerCase())
  )

  return agentSchema.superRefine((values, ctx) => {
    if (taken.has(values.name.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Choose a name that no other agent uses.",
      })
    }
  })
}
