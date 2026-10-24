import * as z from "zod"

import { DEFAULT_SETTINGS_VALUES } from "../data"

// Settings > AI Models. Its fields apply as they are edited, with no Save,
// so the panel checks each one as it is left. The budget is typed between
// "$" and "/ month", so it stays a string of dollars and cents here.

export const BUDGET_RANGE = { min: 1, max: 100_000 } as const

/** Dollars, with or without thousands commas, and up to two cents digits. */
const DOLLARS = /^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/

/** A typed budget in dollars, or null when it is not an amount. */
export function parseBudget(budget: string) {
  const trimmed = budget.trim()
  return DOLLARS.test(trimmed) ? Number(trimmed.replace(/,/g, "")) : null
}

export const aiModelsSchema = z.object({
  tokenBudget: z
    .string()
    .trim()
    .min(1, "Enter a monthly budget.")
    .refine(
      (budget) => budget === "" || parseBudget(budget) !== null,
      "Enter an amount in dollars, like 40 or 40.50."
    )
    .refine((budget) => {
      const dollars = parseBudget(budget)
      return (
        dollars === null ||
        (dollars >= BUDGET_RANGE.min && dollars <= BUDGET_RANGE.max)
      )
    }, "Enter an amount from $1 to $100,000."),
})

export type AiModelsValues = z.infer<typeof aiModelsSchema>

export const AI_MODELS_DEFAULTS: AiModelsValues = {
  tokenBudget: DEFAULT_SETTINGS_VALUES.tokenBudget,
}
