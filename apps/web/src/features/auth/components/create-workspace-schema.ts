import * as z from "zod"

import { workEmailSchema } from "./sign-in-schema"

export const createWorkspaceSchema = z.object({
  workspace: z
    .string()
    .trim()
    .min(1, "Name your workspace.")
    .max(50, "Use a workspace name of 50 characters or fewer."),
  name: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(80, "Use a name of 80 characters or fewer."),
  email: workEmailSchema,
})

export type CreateWorkspaceValues = z.infer<typeof createWorkspaceSchema>

export const createWorkspaceDefaultValues: CreateWorkspaceValues = {
  workspace: "",
  name: "",
  email: "",
}
