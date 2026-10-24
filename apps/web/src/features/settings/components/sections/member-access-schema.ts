import * as z from "zod"

import {
  ALL_MEMBER_AREAS,
  MEMBER_ACCESS_OPTIONS,
  type MemberAccess,
  type MemberRecord,
} from "./data"

/** Owners and admins reach every area, so their areas are not a choice. */
export const reachesEverything = (access: MemberAccess) =>
  access === "Owner" || access === "Admin"

/**
 * Change access (sheet-18): the level and the areas it opens. The workspace
 * keeps at least one owner, so the schema is built knowing whether this
 * member is the last one.
 */
export function memberAccessSchema({
  name,
  isLastOwner,
}: {
  name: string
  isLastOwner: boolean
}) {
  return z
    .object({
      access: z
        .enum(
          MEMBER_ACCESS_OPTIONS.map((option) => option.value),
          "Choose an access level."
        )
        .refine(
          (access) => !isLastOwner || access === "Owner",
          `${name} is the only owner. Make someone else an owner first.`
        ),
      areas: z.array(z.enum(ALL_MEMBER_AREAS)),
    })
    .refine(
      (draft) => reachesEverything(draft.access) || draft.areas.length > 0,
      { error: "Pick at least one area.", path: ["areas"] }
    )
}

export type MemberAccessValues = z.infer<ReturnType<typeof memberAccessSchema>>

/** The form starts from the member's access as it stands. */
export const memberAccessDefaults = (
  member: Pick<MemberRecord, "access" | "areas">
): MemberAccessValues => ({ access: member.access, areas: member.areas })
