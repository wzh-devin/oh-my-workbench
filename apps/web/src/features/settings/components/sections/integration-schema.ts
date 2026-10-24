import * as z from "zod"

import {
  CATALOG,
  catalogEntry,
  INTEGRATION_USES,
  type CatalogEntry,
  type CatalogId,
  type IntegrationRecord,
} from "./integrations-data"

// An integration's rules. The drawer's Settings tab (sheet-22) checks its
// form when Save Changes is pressed; New Integration (sheet-23) checks the
// fields of the step it is on before Continue moves on, and the picked
// service decides what Configure asks for.

export const INTEGRATION_LIMITS = {
  target: 120,
  description: 200,
  secretMin: 8,
  secretMax: 512,
} as const

const description = z
  .string()
  .trim()
  .max(
    INTEGRATION_LIMITS.description,
    "Keep the description to 200 characters or fewer."
  )

const uses = z
  .array(z.enum(INTEGRATION_USES.map((option) => option.value)))
  .min(1, "Pick at least one use.")

/** Where runs post or read, in the service's own word for it. */
function targetSchema(entry: Pick<CatalogEntry, "targetLabel">) {
  const label = entry.targetLabel.toLowerCase()
  return z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .max(
      INTEGRATION_LIMITS.target,
      `Keep the ${label} to 120 characters or fewer.`
    )
}

const secret = z
  .string()
  .trim()
  .min(1, "Paste the API key.")
  .min(INTEGRATION_LIMITS.secretMin, "Paste the full API key.")
  .max(INTEGRATION_LIMITS.secretMax, "Paste a key of 512 characters or fewer.")

// ── sheet-22: the Settings tab ──

export function integrationSettingsSchema(
  entry: Pick<CatalogEntry, "targetLabel">
) {
  return z.object({
    target: targetSchema(entry),
    description,
    uses,
    alertOnFailure: z.boolean(),
  })
}

export type IntegrationSettingsValues = z.infer<
  ReturnType<typeof integrationSettingsSchema>
>

/** The Settings tab starts from the record as it is saved. */
export const integrationSettingsDefaults = (
  record: IntegrationRecord
): IntegrationSettingsValues => ({
  target: record.target,
  description: record.description,
  uses: record.uses,
  alertOnFailure: record.alertOnFailure,
})

// ── sheet-23: New Integration ──

/**
 * Configure's connection on its own: the connection test can run once it
 * passes. A key is asked for only when the service signs in with one.
 */
export function integrationConnectionSchema(
  entry: Pick<CatalogEntry, "targetLabel" | "auth">
) {
  return z.object({
    target: targetSchema(entry),
    secret: entry.auth === "key" ? secret : z.string(),
  })
}

export const newIntegrationSchema = z
  .object({
    catalogId: z
      .enum(CATALOG.map((entry) => entry.id))
      .nullable()
      .refine((id) => id !== null, "Pick a service to connect."),
    target: z.string().trim(),
    secret: z.string().trim(),
    description,
    uses,
    alertOnFailure: z.boolean(),
    testPassed: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.catalogId === null) return
    const connection = integrationConnectionSchema(
      catalogEntry(values.catalogId)
    ).safeParse(values)
    if (!connection.success) {
      for (const issue of connection.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        })
      }
      return
    }
    // The test only runs once the connection is filled in.
    if (!values.testPassed) {
      ctx.addIssue({
        code: "custom",
        path: ["testPassed"],
        message: "Run the connection test to continue.",
      })
    }
  })

/** What the form holds: no service is picked until a tile is. */
export type NewIntegrationFormValues = z.input<typeof newIntegrationSchema>

/** What a passed form hands on: by then a service is picked. */
export type NewIntegrationValues = z.output<typeof newIntegrationSchema>

/** Connect on a listed service starts with it picked. */
export const newIntegrationDefaults = (
  preset: CatalogId | null
): NewIntegrationFormValues => ({
  catalogId: preset,
  target: "",
  secret: "",
  description: "",
  uses: ["steps"],
  alertOnFailure: true,
  testPassed: false,
})

/** What Continue checks on each step before it moves on; Use is the submit. */
export const NEW_INTEGRATION_STEP_FIELDS = {
  1: ["catalogId"],
  2: ["target", "secret", "description", "testPassed"],
} as const satisfies Record<1 | 2, readonly (keyof NewIntegrationFormValues)[]>
