import * as z from "zod"

import { WORKSPACE_IDENTITY } from "./data"

/** Where the timezone combobox starts, on General and on Profile. */
export const DEFAULT_TIMEZONE = "(GMT+1) Berlin"

/** The timezone combobox: one of its list, never left empty. Clearing its
 *  input clears the value. */
export const timezoneSchema = z.string().min(1, "Select a timezone.")

// Settings > General. Only the text fields and the timezone carry rules; the
// language, the date format and the switches are fixed choices that apply as
// they change. The slug is the path after app.flowly.dev/, so it keeps to what
// a URL segment holds without escaping.
export const generalSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(64, "Use 64 characters or fewer."),
  workspaceSlug: z.string().superRefine((slug, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message })

    if (slug.trim() === "") {
      return fail("Enter a slug for the workspace URL.")
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return fail("Use only lowercase letters, numbers and hyphens.")
    }

    if (slug.startsWith("-") || slug.endsWith("-")) {
      return fail("Start and end the slug with a letter or number.")
    }

    if (slug.length < 3) {
      return fail("Use at least 3 characters.")
    }

    if (slug.length > 40) {
      return fail("Use 40 characters or fewer.")
    }
  }),
  timezone: timezoneSchema,
})

export type GeneralValues = z.infer<typeof generalSchema>

export const GENERAL_DEFAULTS: GeneralValues = {
  workspaceName: WORKSPACE_IDENTITY.name,
  workspaceSlug: WORKSPACE_IDENTITY.domainValue,
  timezone: DEFAULT_TIMEZONE,
}
