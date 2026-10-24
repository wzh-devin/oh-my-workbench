"use client"

import { type RefObject } from "react"
import { cn } from "cn"
import { Controller, type Control } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InviteRoleSelect } from "./invite-role-select"
import { type InviteValues } from "./invite-schema"
import { Trash2Icon } from "lucide-react"

interface MemberInviteRowProps {
  control: Control<InviteValues>
  index: number
  canRemove: boolean
  emailInputRef?: RefObject<HTMLInputElement | null>
  /** Called after the email changes, so rows that compare with it re-check. */
  onEmailChange: () => void
  onRemove: (index: number) => void
}

export function MemberInviteRow({
  control,
  index,
  canRemove,
  emailInputRef,
  onEmailChange,
  onRemove,
}: MemberInviteRowProps) {
  const rowNumber = index + 1
  const rowId = `invite-row-${rowNumber}`
  const emailInputId = `${rowId}-email`
  const emailErrorId = `${rowId}-email-error`
  const roleSelectId = `${rowId}-role`
  const roleErrorId = `${rowId}-role-error`

  return (
    <div
      className={cn(
        "grid gap-2 sm:items-start",
        canRemove
          ? "sm:grid-cols-[minmax(0,1fr)_15rem_2.5rem]"
          : "sm:grid-cols-[minmax(0,1fr)_15rem]"
      )}
    >
      <Controller
        name={`invites.${index}.email`}
        control={control}
        render={({ field, fieldState }) => (
          <Field className="gap-1.5" data-invalid={fieldState.invalid}>
            <Input
              {...field}
              ref={(element) => {
                field.ref(element)
                if (emailInputRef) {
                  emailInputRef.current = element
                }
              }}
              onChange={(event) => {
                field.onChange(event)
                onEmailChange()
              }}
              id={emailInputId}
              type="email"
              placeholder="Enter user email"
              autoComplete="email"
              aria-label={`Email address for invite ${rowNumber}`}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? emailErrorId : undefined}
            />
            {fieldState.invalid && (
              <FieldError id={emailErrorId} errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />

      <Controller
        name={`invites.${index}.roleId`}
        control={control}
        render={({ field, fieldState }) => (
          <Field className="gap-1.5" data-invalid={fieldState.invalid}>
            <InviteRoleSelect
              ref={field.ref}
              id={roleSelectId}
              value={field.value}
              label={`Role for invite ${rowNumber}`}
              invalid={fieldState.invalid}
              describedBy={fieldState.invalid ? roleErrorId : undefined}
              onValueChange={field.onChange}
            />
            {fieldState.invalid && (
              <FieldError id={roleErrorId} errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />

      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="justify-self-start sm:justify-self-end"
          aria-label={`Remove invite row ${rowNumber}`}
          onClick={() => onRemove(index)}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
