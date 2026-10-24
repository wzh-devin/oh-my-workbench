"use client"

import { useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { SendIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import {
  ALL_MEMBER_AREAS,
  MEMBER_ACCESS_OPTIONS,
  MEMBER_ACCESS_SCOPE_OPTIONS,
} from "./data"
import {
  INVITE_ACCESS_LEVELS,
  INVITE_MEMBER_DEFAULTS,
  inviteMemberSchema,
  type InviteMemberValues,
} from "./invite-member-schema"
import { SHEET_FOOTER, SHEET_SHELL, SheetCloseButton } from "./sheet-parts"

// Invite Member, the create form: a header band, fieldsets that scroll, and a
// footer that keeps a summary in view. Its toggles pick the access level; its
// switches pick the areas.

/** The levels an invite offers, as the schema allows them. */
const INVITE_LEVELS = MEMBER_ACCESS_OPTIONS.filter((option) =>
  INVITE_ACCESS_LEVELS.some((level) => level === option.value)
)

function InviteForm({
  teams,
  takenEmails,
  seatsLeft,
  onInvite,
  onDone,
}: {
  teams: string[]
  takenEmails: string[]
  seatsLeft: number
  onInvite: (draft: InviteMemberValues) => void
  onDone: () => void
}) {
  const form = useForm({
    resolver: zodResolver(inviteMemberSchema({ takenEmails, seatsLeft })),
    defaultValues: { ...INVITE_MEMBER_DEFAULTS, team: teams[0] ?? "" },
  })
  const access = useWatch({ control: form.control, name: "access" })
  const everything = access === "Admin"
  const level = INVITE_LEVELS.find((option) => option.value === access)
  const seatsError = form.formState.errors.root?.seats
  const submitted = form.formState.isSubmitted

  function onSubmit(values: InviteMemberValues) {
    onInvite({
      ...values,
      areas: values.access === "Admin" ? ALL_MEMBER_AREAS : values.areas,
    })
    onDone()
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <SheetTitle className="min-w-0 text-lg">Invite Member</SheetTitle>
          <SheetCloseButton />
        </div>
        <SheetDescription className="mt-1">
          Add someone to Flowly Labs with the access they need.
        </SheetDescription>
      </div>

      <form
        id="invite-member-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Only the body scrolls; the header band and footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-5 py-5">
            {seatsError ? (
              <Field data-invalid>
                <FieldError errors={[seatsError]} />
              </Field>
            ) : null}
            <FieldSet>
              <FieldLegend variant="label">Person</FieldLegend>
              <FieldGroup className="gap-4">
                <div className="grid gap-4 min-[360px]:grid-cols-2">
                  <Controller
                    name="name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="invite-name">Name</FieldLabel>
                        <Input
                          {...field}
                          id="invite-name"
                          autoComplete="off"
                          placeholder="Ana Lopez"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="invite-email">
                          Work Email
                        </FieldLabel>
                        <Input
                          {...field}
                          id="invite-email"
                          type="email"
                          autoComplete="off"
                          placeholder="ana@flowly.dev"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>
                <div className="grid gap-4 min-[360px]:grid-cols-2">
                  <Controller
                    name="role"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                        <Input
                          {...field}
                          id="invite-role"
                          autoComplete="off"
                          placeholder="Automation Engineer"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="team"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="invite-team">Team</FieldLabel>
                        <Select
                          name={field.name}
                          value={field.value}
                          items={teams.map((team) => ({
                            value: team,
                            label: team,
                          }))}
                          onValueChange={(next) => {
                            if (typeof next === "string") field.onChange(next)
                          }}
                        >
                          <SelectTrigger
                            ref={field.ref}
                            id="invite-team"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                            onBlur={field.onBlur}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            align="start"
                            alignItemWithTrigger={false}
                          >
                            <SelectGroup>
                              {teams.map((team) => (
                                <SelectItem key={team} value={team}>
                                  {team}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Access</FieldLegend>
              <Controller
                name="access"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel id="invite-level-label">Level</FieldLabel>
                    <ToggleGroup
                      multiple={false}
                      value={[field.value]}
                      onValueChange={(value: string[]) => {
                        const next = INVITE_ACCESS_LEVELS.find(
                          (option) => option === value[0]
                        )
                        if (!next) return
                        field.onChange(next)
                        // Admin lifts the area rule, so a shown error rechecks.
                        if (submitted) form.trigger("areas")
                      }}
                      variant="outline"
                      size="sm"
                      spacing={0}
                      aria-labelledby="invite-level-label"
                      className="w-full"
                    >
                      {INVITE_LEVELS.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          className="flex-1 text-muted-foreground data-pressed:text-foreground"
                        >
                          {option.value}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription aria-live="polite">
                      {level?.description}
                    </FieldDescription>
                  </Field>
                )}
              />
            </FieldSet>

            <Controller
              name="areas"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Areas</FieldLegend>
                  <FieldGroup className="gap-4">
                    {MEMBER_ACCESS_SCOPE_OPTIONS.map((option, index) => (
                      <Field
                        key={option.id}
                        orientation="horizontal"
                        data-disabled={everything || undefined}
                      >
                        <FieldContent>
                          <FieldLabel htmlFor={`invite-area-${option.id}`}>
                            {option.title}
                          </FieldLabel>
                          <FieldDescription>
                            {option.description}
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          ref={index === 0 ? field.ref : undefined}
                          id={`invite-area-${option.id}`}
                          size="sm"
                          disabled={everything}
                          checked={
                            everything || field.value.includes(option.id)
                          }
                          aria-invalid={fieldState.invalid}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              // Kept in the options' order, so every view lists them alike.
                              ALL_MEMBER_AREAS.filter((area) =>
                                area === option.id
                                  ? checked
                                  : field.value.includes(area)
                              )
                            )
                          }
                        />
                      </Field>
                    ))}
                  </FieldGroup>
                  {everything ? (
                    <FieldDescription>
                      Admins reach every area.
                    </FieldDescription>
                  ) : null}
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />

            <FieldSet>
              <FieldLegend variant="label">Message</FieldLegend>
              <Controller
                name="message"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invite-message" className="sr-only">
                      Message
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id="invite-message"
                      placeholder="Welcome aboard. Start with the Lead Enrichment workflow."
                      className="min-h-16"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Added to the invite email.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldSet>
          </div>
        </div>

        <div className={SHEET_FOOTER}>
          {/* What the invite does stays in view while the body scrolls. */}
          <p
            aria-live="polite"
            className="me-auto min-w-0 truncate text-xs text-muted-foreground"
          >
            {seatsLeft > 0
              ? `Joins as ${access}, ${seatsLeft} of the plan's seats left`
              : "No seats left on the plan"}
          </p>
          <SheetClose render={<Button type="button" variant="outline" />}>
            Cancel
          </SheetClose>
          <Button type="submit">
            <SendIcon aria-hidden="true" />
            Send Invite
          </Button>
        </div>
      </form>
    </>
  )
}

export function InviteMemberSheet({
  open,
  onOpenChange,
  session,
  teams,
  takenEmails,
  seatsLeft,
  onInvite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bumped on every open, so the form starts empty */
  session: number
  teams: string[]
  takenEmails: string[]
  /** Seats the plan has free; an invite takes one */
  seatsLeft: number
  onInvite: (draft: InviteMemberValues) => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={popupRef}
        side="right"
        showCloseButton={false}
        // The sheet opens on its first field.
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>("#invite-name") ?? true
        }
        className={SHEET_SHELL}
      >
        <InviteForm
          key={session}
          teams={teams}
          takenEmails={takenEmails}
          seatsLeft={seatsLeft}
          onInvite={onInvite}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
