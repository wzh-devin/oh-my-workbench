import * as z from "zod"

import { WORKSPACE_IDENTITY } from "./data"
import { DEFAULT_TIMEZONE, timezoneSchema } from "./general-schema"

// Settings > Profile: who you are across the workspace. The photo, the role
// and the landing view are choices that apply as they change, so only the
// text fields and the timezone carry rules.
export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(80, "Use 80 characters or fewer."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(254, "Use an email address of 254 characters or fewer.")
    .pipe(z.email("Enter a valid email address.")),
  username: z.string().superRefine((username, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message })

    if (username.trim() === "") {
      return fail("Enter a username.")
    }

    if (!/^[A-Za-z0-9._-]+$/.test(username)) {
      return fail(
        "Use only letters, numbers, periods, hyphens and underscores."
      )
    }

    if (username.length < 3) {
      return fail("Use at least 3 characters.")
    }

    if (username.length > 30) {
      return fail("Use 30 characters or fewer.")
    }
  }),
  timezone: timezoneSchema,
})

export type ProfileValues = z.infer<typeof profileSchema>

export const PROFILE_DEFAULTS: ProfileValues = {
  fullName: WORKSPACE_IDENTITY.profileName,
  email: WORKSPACE_IDENTITY.email,
  username: WORKSPACE_IDENTITY.username,
  timezone: DEFAULT_TIMEZONE,
}
