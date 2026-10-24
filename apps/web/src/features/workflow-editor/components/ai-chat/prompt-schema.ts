import * as z from "zod"

/** Room for a long question with a pasted snippet, short of a document. */
export const PROMPT_MAX = 2000

/** The Ask AI box. A question is sent trimmed, so blank text never sends. */
export const promptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "Type a question to send.")
    .max(
      PROMPT_MAX,
      `Keep the question to ${PROMPT_MAX.toLocaleString("en-US")} characters or fewer.`
    ),
})

export type PromptValues = z.infer<typeof promptSchema>

/** An empty box, as a fresh chat opens on. */
export const promptDefaultValues: PromptValues = { prompt: "" }
