import * as z from "zod"

import { ALL_MEMBER_AREAS } from "./data"

/** An invite starts below owner: ownership is handed over, not sent. */
export const INVITE_ACCESS_LEVELS = ["Admin", "Editor", "Viewer"] as const

/**
 * Invite Member (sheet-21). Who is already in the workspace and how many
 * seats the plan has left come from the members list, so the schema is built
 * from them. The seat rule belongs to no one field: it lands on `root.seats`,
 * which the form shows above its fieldsets.
 */
export function inviteMemberSchema({
  takenEmails,
  seatsLeft,
}: {
  takenEmails: readonly string[]
  seatsLeft: number
}) {
  const taken = new Set(takenEmails.map((email) => email.trim().toLowerCase()))

  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Enter their name.")
        .max(80, "Use 80 characters or fewer."),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .min(1, "Enter their work email.")
        .max(254, "Use an email address of 254 characters or fewer.")
        .pipe(z.email("Enter a valid email address."))
        .refine(
          (email) => !taken.has(email),
          "Invite someone who is not in the workspace yet."
        ),
      role: z.string().trim().max(80, "Use 80 characters or fewer."),
      team: z.string().min(1, "Choose a team."),
      access: z.enum(INVITE_ACCESS_LEVELS, "Choose an access level."),
      areas: z.array(z.enum(ALL_MEMBER_AREAS)),
      message: z
        .string()
        .trim()
        .max(500, "Keep the message to 500 characters or fewer."),
    })
    .refine((invite) => invite.access === "Admin" || invite.areas.length > 0, {
      error: "Turn on at least one area.",
      path: ["areas"],
    })
    .refine(() => seatsLeft > 0, {
      error:
        "Every seat on the Pro plan is taken. Remove someone or upgrade first.",
      path: ["root", "seats"],
    })
}

export type InviteMemberValues = z.infer<ReturnType<typeof inviteMemberSchema>>

/** A new invite: an Editor in the two areas most people start in. The team
 *  is the workspace's first, which the form fills in. */
export const INVITE_MEMBER_DEFAULTS: InviteMemberValues = {
  name: "",
  email: "",
  role: "",
  team: "",
  access: "Editor",
  areas: ["workflows", "agents"],
  message: "",
}
