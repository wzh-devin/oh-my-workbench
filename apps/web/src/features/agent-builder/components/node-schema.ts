import * as z from "zod"

import { AGENT_APPS } from "./data"
import { captionKey } from "./flow-layout"

/** A card is w-60: past this a name only ever reads truncated. */
export const NODE_NAME_MAX = 60

/** The card's second line, kept to what a short clause needs. */
export const NODE_DETAIL_MAX = 160

/** A caption rides the connector, so it stays a word or two. */
export const NODE_PATH_MAX = 40

/**
 * The node inspector's form. `siblingPaths` are the captions of the other
 * paths out of this step's parent, empty when the step is not on a fork. A
 * run takes a path by its caption, so on a fork the caption is required and
 * must differ, trimmed and in any case, from every sibling's. Text is saved
 * trimmed.
 */
export function nodeSchema(siblingPaths: (string | undefined)[] = []) {
  const forked = siblingPaths.length > 0

  return z.object({
    app: z.enum(AGENT_APPS, { error: "Choose a step type." }),
    title: z
      .string()
      .trim()
      .min(1, "Enter a step name.")
      .max(
        NODE_NAME_MAX,
        `Keep the name to ${NODE_NAME_MAX} characters or fewer.`
      ),
    detail: z
      .string()
      .trim()
      .max(
        NODE_DETAIL_MAX,
        `Keep the description to ${NODE_DETAIL_MAX} characters or fewer.`
      ),
    branchLabel: z
      .string()
      .trim()
      .max(
        NODE_PATH_MAX,
        `Keep the path name to ${NODE_PATH_MAX} characters or fewer.`
      )
      .refine(
        (caption) => !forked || caption !== "",
        "Enter a name for this path."
      )
      .refine(
        (caption) =>
          caption === "" ||
          !siblingPaths.some(
            (path) => captionKey(path) === captionKey(caption)
          ),
        "Use a name no other path here has."
      ),
  })
}

export type NodeValues = z.infer<ReturnType<typeof nodeSchema>>

/** What the form holds before a step is opened into it. */
export const nodeDefaultValues: NodeValues = {
  app: "custom",
  title: "",
  detail: "",
  branchLabel: "",
}
