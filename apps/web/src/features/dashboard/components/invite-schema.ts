import * as z from "zod"

import { CURRENT_USER } from "@/lib/workspace/team"

/** The workspace's roles, as Settings > Members offers them. */
export const INVITE_ROLE_IDS = ["viewer", "builder", "admin"] as const

export type InviteRoleId = (typeof INVITE_ROLE_IDS)[number]

/** One address as the invitation goes out to it: trimmed and lowercased. */
export const inviteEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter an email address.")
  .max(254, "Enter an email of 254 characters or fewer.")
  .pipe(z.email("Enter a valid email address."))

/**
 * The invite dialog's rows: every row needs a valid email and a role, no
 * address twice, and nobody who is already in the workspace. `memberEmails`
 * are those people; a duplicate is flagged on its later row, so the first one
 * stays clean.
 */
export function createInviteSchema(memberEmails: readonly string[]) {
  const members = new Set(
    memberEmails.map((email) => email.trim().toLowerCase())
  )

  return z.object({
    invites: z
      .array(
        z.object({
          email: inviteEmailSchema,
          roleId: z.enum(INVITE_ROLE_IDS, "Choose a role."),
        })
      )
      .min(1, "Add at least one person to invite.")
      .superRefine((invites, ctx) => {
        const seen = new Set<string>()

        invites.forEach(({ email }, index) => {
          // A blank row already says what it needs; two of them are not
          // duplicates of each other.
          if (!email) {
            return
          }

          if (members.has(email)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "email"],
              message: "Invite someone who is not in the workspace yet.",
            })
          } else if (seen.has(email)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "email"],
              message: "Remove this duplicate email.",
            })
          }

          seen.add(email)
        })
      }),
  })
}

// The signed-in user is the one workspace address the app knows by email.
export const inviteSchema = createInviteSchema([CURRENT_USER.email])

export type InviteValues = z.infer<typeof inviteSchema>

export type InviteRow = InviteValues["invites"][number]

export const NEW_INVITE_ROW: InviteRow = { email: "", roleId: "builder" }

export const inviteDefaultValues: InviteValues = { invites: [NEW_INVITE_ROW] }

/** How many distinct, valid addresses the rows hold, for the send label. */
export function countReadyInvites(invites: readonly { email: string }[]) {
  const ready = new Set<string>()

  for (const { email } of invites) {
    const parsed = inviteEmailSchema.safeParse(email)

    if (parsed.success) {
      ready.add(parsed.data)
    }
  }

  return ready.size
}
