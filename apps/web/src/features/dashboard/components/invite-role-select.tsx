"use client"

import { type Ref } from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { type InviteRoleId } from "./invite-schema"

interface InviteRoleOption {
  value: InviteRoleId
  label: string
  description: string
}

// The workspace's roles, as Settings > Members offers them.
const INVITE_ROLE_OPTIONS: InviteRoleOption[] = [
  {
    value: "builder",
    label: "Builder",
    description: "Edit, test and publish workflows.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "See workflows and their runs.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Manage members and billing.",
  },
]

interface InviteRoleSelectProps {
  id: string
  value: InviteRoleId
  label: string
  invalid: boolean
  describedBy?: string
  /** The trigger, so the form can focus it when the role is invalid. */
  ref?: Ref<HTMLButtonElement>
  onValueChange: (value: InviteRoleId) => void
}

export function InviteRoleSelect({
  id,
  value,
  label,
  invalid,
  describedBy,
  ref,
  onValueChange,
}: InviteRoleSelectProps) {
  const selectedRole =
    INVITE_ROLE_OPTIONS.find((role) => role.value === value) ?? null

  return (
    <Select
      items={INVITE_ROLE_OPTIONS}
      value={selectedRole}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange((nextValue as InviteRoleOption).value)
        }
      }}
    >
      <SelectTrigger
        ref={ref}
        id={id}
        className="w-full"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <SelectValue>
          {(role: InviteRoleOption | null) => role?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {INVITE_ROLE_OPTIONS.map((role) => (
            <SelectItem key={role.value} value={role}>
              <span className="flex flex-col items-start gap-px">
                <span className="font-medium">{role.label}</span>
                {/* Important: the local SelectItem's focus:**:text-accent-foreground
                    would darken it on the highlighted row; the block's stays muted. */}
                <small className="text-xs text-muted-foreground!">
                  {role.description}
                </small>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
