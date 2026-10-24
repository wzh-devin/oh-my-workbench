import * as z from "zod"

import { STEP_CATEGORIES, STEP_OWNERS } from "./data"

/** A card is w-60: past this a name only ever reads truncated. */
export const STEP_NAME_MAX = 60

/** The card's second line, kept to what a short clause needs. */
export const STEP_DETAIL_MAX = 160

/**
 * The step inspector's form. A step's title names its controls on the canvas,
 * so a blank one never saves; text is saved trimmed.
 */
export const stepSchema = z.object({
  category: z.enum(STEP_CATEGORIES, { error: "Choose a step type." }),
  title: z
    .string()
    .trim()
    .min(1, "Enter a step name.")
    .max(
      STEP_NAME_MAX,
      `Keep the name to ${STEP_NAME_MAX} characters or fewer.`
    ),
  detail: z
    .string()
    .trim()
    .max(
      STEP_DETAIL_MAX,
      `Keep the description to ${STEP_DETAIL_MAX} characters or fewer.`
    ),
  ownerId: z
    .string()
    .refine(
      (id) => STEP_OWNERS.some((person) => person.id === id),
      "Choose an owner."
    ),
})

export type StepValues = z.infer<typeof stepSchema>

/** What the form holds before a step is opened into it. */
export const stepDefaultValues: StepValues = {
  category: "action",
  title: "",
  detail: "",
  ownerId: STEP_OWNERS[0].id,
}
