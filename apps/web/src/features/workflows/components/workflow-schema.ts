import * as z from "zod"

import { CURRENT_USER } from "@/lib/workspace/team"

import { type WorkflowItem } from "./data"
import { ENVIRONMENT_OPTIONS, TRIGGER_OPTIONS } from "./sheet-data"

export const NAME_MAX_LENGTH = 60

export const CADENCE_MAX_LENGTH = 80

const TRIGGER_REQUIRED = "Choose what starts the workflow."

/** The drawer's Settings form, the same for New Workflow and an edit. An
 *  empty trigger is the form's "nothing picked yet", never a saved value. */
export const workflowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workflow name.")
    .max(
      NAME_MAX_LENGTH,
      `Keep the name to ${NAME_MAX_LENGTH} characters or fewer.`
    ),
  environment: z.enum(
    ENVIRONMENT_OPTIONS.map((option) => option.value),
    { error: "Choose an environment." }
  ),
  trigger: z
    .enum([...TRIGGER_OPTIONS.map((option) => option.value), ""], {
      error: TRIGGER_REQUIRED,
    })
    // A length check, not `!== ""`: that would narrow the output type and
    // split it from the form values, which start empty.
    .refine((trigger) => trigger.length > 0, TRIGGER_REQUIRED),
  cadence: z
    .string()
    .trim()
    .min(1, "Describe when the trigger fires.")
    .max(
      CADENCE_MAX_LENGTH,
      `Keep this to ${CADENCE_MAX_LENGTH} characters or fewer.`
    ),
  owner: z.string().min(1, "Choose an owner."),
  alertOnFailure: z.boolean(),
})

/** What the sheet's Settings tab edits; the rest comes from runs and steps. */
export type WorkflowFormValues = z.infer<typeof workflowSchema>

/** A new workflow: production, alerting, owned by whoever makes it. */
export const EMPTY_WORKFLOW_FORM: WorkflowFormValues = {
  name: "",
  environment: "production",
  trigger: "",
  cadence: "",
  owner: CURRENT_USER.name,
  alertOnFailure: true,
}

/** Adds the rule that needs the list: a name no other workflow uses,
 *  compared without case. `editingId` is the record being edited. */
export function workflowFormSchema(
  workflows: WorkflowItem[],
  editingId?: string
) {
  const taken = new Set(
    workflows
      .filter((workflow) => workflow.id !== editingId)
      .map((workflow) => workflow.name.trim().toLowerCase())
  )

  return workflowSchema.superRefine((values, ctx) => {
    if (taken.has(values.name.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Choose a name that no other workflow uses.",
      })
    }
  })
}
