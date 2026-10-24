import * as z from "zod"

import { DEFAULT_SETTINGS_VALUES } from "../data"

// Settings > Billing. Its fields apply as they are edited, with no Save, so
// the panel checks each one as it is left. The run cap is typed into a text
// field, so it stays a string here and is read as a whole number.

export const RUN_CAP_RANGE = { min: 1, max: 10_000_000 } as const

/** Digits, with or without thousands commas: 250000 or 250,000. */
const WHOLE_NUMBER = /^(\d+|\d{1,3}(,\d{3})+)$/

/** What tax IDs are written with: US-84-3921048, GB 123 4567 89, 12.345.678/0001. */
const TAX_ID = /^[A-Za-z0-9 ./-]*$/

/** A typed cap as a number, or null when it is not a whole number. */
export function parseRunCap(cap: string) {
  const trimmed = cap.trim()
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed.replace(/,/g, "")) : null
}

export const billingSchema = z.object({
  billingEmail: z
    .string()
    .trim()
    .min(1, "Enter the billing email address.")
    .max(254, "Enter an email address of 254 characters or fewer.")
    .pipe(z.email("Enter an email address like finance@example.com.")),
  taxId: z
    .string()
    .trim()
    .max(32, "Keep the tax ID to 32 characters or fewer.")
    .regex(
      TAX_ID,
      "Use only letters, numbers, spaces, periods, hyphens and slashes."
    ),
  monthlyRunCap: z
    .string()
    .trim()
    .min(1, "Enter a monthly run cap.")
    .refine((cap) => {
      if (cap === "") return true
      const runs = parseRunCap(cap)
      return (
        runs !== null && runs >= RUN_CAP_RANGE.min && runs <= RUN_CAP_RANGE.max
      )
    }, "Enter a whole number from 1 to 10,000,000."),
})

export type BillingValues = z.infer<typeof billingSchema>

export const BILLING_DEFAULTS: BillingValues = {
  billingEmail: DEFAULT_SETTINGS_VALUES.billingEmail,
  taxId: DEFAULT_SETTINGS_VALUES.taxId,
  monthlyRunCap: DEFAULT_SETTINGS_VALUES.monthlyRunCap,
}
