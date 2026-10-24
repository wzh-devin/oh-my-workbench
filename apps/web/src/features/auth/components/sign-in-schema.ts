import * as z from "zod"

// The demo account, filled in on load as the other ReUI templates do, so a
// visitor signs in with one press.
export const DEMO_EMAIL = "demo@reui.io"

// The sign-in link only goes to a workspace address, so personal mailboxes
// are turned away with a message, as an approved-domain check would.
const PERSONAL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
]

function isCompanyEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase()
  return !domain || !PERSONAL_DOMAINS.includes(domain)
}

/** A work email, as the sign-in form and the new workspace sheet take it:
 *  trimmed, present, well formed and not a personal mailbox. */
export const workEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your work email.")
  .max(254, "Use an email address of 254 characters or fewer.")
  .pipe(
    z
      .email("Enter a valid email address.")
      .refine(isCompanyEmail, "Use your company email, not a personal one.")
  )

export const signInSchema = z.object({
  email: workEmailSchema,
})

export type SignInValues = z.infer<typeof signInSchema>

export const signInDefaultValues: SignInValues = { email: DEMO_EMAIL }
