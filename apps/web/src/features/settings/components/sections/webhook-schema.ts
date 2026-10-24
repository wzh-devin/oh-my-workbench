import * as z from "zod"

import {
  WEBHOOK_EVENTS,
  type WebhookEndpoint,
  type WebhookRetry,
} from "./webhooks-data"

// An endpoint's rules. Add Endpoint (sheet-21) and an endpoint's Settings
// tab (sheet-22) share them, each checking its form when it is submitted.

/** An https address with a dotted host: Flowly never posts in the clear. */
const HTTPS_URL = /^https:\/\/[^\s/]+\.[^\s]+$/

export const WEBHOOK_RETRY_OPTIONS = [
  "standard",
  "extended",
  "off",
] as const satisfies readonly WebhookRetry[]

/** `takenUrls` are the other endpoints' URLs: two never share one. */
export function webhookSchema({ takenUrls }: { takenUrls: readonly string[] }) {
  const taken = new Set(takenUrls.map((url) => url.trim()))

  return z.object({
    url: z
      .string()
      .trim()
      .min(1, "Enter the endpoint URL.")
      .max(2048, "Keep the URL to 2,048 characters or fewer.")
      .regex(
        HTTPS_URL,
        "Enter an https URL, like https://api.example.com/hooks."
      )
      .refine((url) => !taken.has(url), "Enter a URL no other endpoint uses."),
    description: z
      .string()
      .trim()
      .max(200, "Keep the description to 200 characters or fewer."),
    events: z
      .array(z.enum(WEBHOOK_EVENTS.map((option) => option.value)))
      .min(1, "Pick at least one event."),
    retry: z.enum(WEBHOOK_RETRY_OPTIONS),
    signing: z.boolean(),
  })
}

export type WebhookValues = z.infer<ReturnType<typeof webhookSchema>>

/** Add Endpoint starts on failures only, retried for a day and signed. */
export const NEW_WEBHOOK_DEFAULTS: WebhookValues = {
  url: "",
  description: "",
  events: ["run.failed"],
  retry: "standard",
  signing: true,
}

/** The Settings tab starts from the endpoint as it is saved. */
export const webhookDefaults = (endpoint: WebhookEndpoint): WebhookValues => ({
  url: endpoint.url,
  description: endpoint.description,
  events: endpoint.events,
  retry: endpoint.retry,
  signing: endpoint.signing,
})
