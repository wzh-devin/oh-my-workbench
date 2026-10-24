"use client"

import { useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { CircleCheckIcon, PlusIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import {
  countReadyInvites,
  inviteDefaultValues,
  inviteSchema,
  type InviteValues,
  NEW_INVITE_ROW,
} from "./invite-schema"
import { MemberInviteRow } from "./member-invite-row"

/**
 * The invite dialog, opened by the Invite button beside the header's presence
 * stack. There is no backend: sending confirms with a toast and clears the
 * rows for the next invite.
 */
export function CollaboratorInviteDialog({
  open,
  onOpenChange: setOpen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const firstEmailInputRef = useRef<HTMLInputElement | null>(null)
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: inviteDefaultValues,
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invites",
  })
  const invites = useWatch({ control: form.control, name: "invites" })
  const listError = form.formState.errors.invites?.root

  const readyInviteCount = countReadyInvites(invites)
  const submitLabel =
    readyInviteCount === 1 ? "Send invitation" : "Send invitations"

  // A duplicate is judged against the other rows, so editing or removing one
  // row can settle another's error. Once a send has been tried, re-check the
  // rows already showing one; a row that is still clean stays clean.
  const recheckFlaggedEmails = () => {
    if (!form.formState.isSubmitted) {
      return
    }

    const flagged = form
      .getValues("invites")
      .map((_, index) => `invites.${index}.email` as const)
      .filter((name) => form.getFieldState(name).invalid)

    if (flagged.length > 0) {
      void form.trigger(flagged)
    }
  }

  const handleRemoveRow = (index: number) => {
    remove(index)
    recheckFlaggedEmails()
  }

  const onSubmit = ({ invites: sentInvites }: InviteValues) => {
    const emails = sentInvites.map((invite) => invite.email)

    setOpen(false)
    form.reset(inviteDefaultValues)
    toast.success(
      emails.length === 1
        ? "Invitation sent"
        : `${emails.length} invitations sent`,
      {
        description: emails.join(", "),
        icon: (
          <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
        ),
        closeButton: true,
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        // Dismissed with a draft: keep the rows, drop the errors, so the
        // dialog reopens on what was typed rather than on a failed send.
        if (!isOpen) {
          form.reset(form.getValues(), { keepDefaultValues: true })
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl" initialFocus={firstEmailInputRef}>
        <DialogHeader>
          <DialogTitle>Invite Collaborators</DialogTitle>
          <DialogDescription>
            Add each person with the access they need.
          </DialogDescription>
        </DialogHeader>

        <form
          className="contents py-3"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <MemberInviteRow
                key={field.id}
                control={form.control}
                index={index}
                canRemove={fields.length > 1}
                emailInputRef={index === 0 ? firstEmailInputRef : undefined}
                onEmailChange={recheckFlaggedEmails}
                onRemove={handleRemoveRow}
              />
            ))}
            {listError && <FieldError errors={[listError]} />}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => append(NEW_INVITE_ROW, { shouldFocus: false })}
            >
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              Add new member
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
