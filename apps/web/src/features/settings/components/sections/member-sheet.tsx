"use client"

import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
} from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CrownIcon,
  EyeIcon,
  MailIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UserMinusIcon,
  XIcon,
} from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"

import {
  ALL_MEMBER_AREAS,
  MEMBER_ACCESS_OPTIONS,
  MEMBER_ACCESS_SCOPE_OPTIONS,
  type MemberAccess,
  type MemberArea,
  type MemberRecord,
} from "./data"
import {
  memberAccessDefaults,
  memberAccessSchema,
  reachesEverything,
  type MemberAccessValues,
} from "./member-access-schema"
import { AccessBadge, MemberStatusBadge } from "./member-management-columns"
import {
  CopyToken,
  DotSeparator,
  FactGroup,
  SHEET_FOOTER,
  SHEET_SHELL,
  StepButton,
  TAB_TRIGGER,
} from "./sheet-parts"

// One drawer for a member, in two modes. View member is the inspector: a
// copyable id, J and K stepping through the list, Details and Access tabs,
// and the footer's actions. Change access is the rule editor, set on Card
// here: its action cards choose the access level, its footer removes, cancels
// or saves, and Save waits for a change. Both show the same access, the level
// and the areas it opens.

export type MemberSheetMode = "view" | "edit"

export type MemberAccessDraft = Pick<MemberRecord, "access" | "areas">

export type MemberSheetActions = {
  save: (id: string, draft: MemberAccessDraft) => void
  /** Asks first; the removal itself offers Undo */
  requestRemove: (member: MemberRecord) => void
  resendInvite: (member: MemberRecord) => void
  resetSession: (member: MemberRecord) => void
}

const ACCESS_ICONS: Record<MemberAccess, ReactNode> = {
  Owner: <CrownIcon aria-hidden="true" />,
  Admin: <ShieldCheckIcon aria-hidden="true" />,
  Editor: <PencilIcon aria-hidden="true" />,
  Viewer: <EyeIcon aria-hidden="true" />,
}

const areaTitle = (area: MemberArea) =>
  MEMBER_ACCESS_SCOPE_OPTIONS.find((option) => option.id === area)?.title ??
  area

const sameAreas = (a: MemberArea[], b: MemberArea[]) =>
  a.length === b.length && a.every((area) => b.includes(area))

// ── Header band ──

function HeaderBand({
  member,
  children,
}: {
  member: MemberRecord
  /** The right end of the top row: stepping and close */
  children: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 px-5 pt-3.5 pb-3">
      <div className="flex items-center justify-between gap-2">
        <CopyToken key={member.id} value={member.email} label="email" />
        <div className="flex shrink-0 items-center gap-1">{children}</div>
      </div>
      <div className="flex min-w-0 items-center gap-3 pt-1">
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={member.src} alt={member.name} />
          <AvatarFallback>{member.initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SheetTitle className="min-w-0 truncate text-lg">
              {member.name}
            </SheetTitle>
            <AccessBadge access={member.access} />
          </div>
          <SheetDescription>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span>{member.role}</span>
              <DotSeparator />
              <span>{member.team}</span>
              <DotSeparator />
              <span>{member.lastActive}</span>
            </span>
          </SheetDescription>
        </div>
      </div>
    </div>
  )
}

function CloseButton() {
  return (
    <SheetClose
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-me-1 shrink-0"
          aria-label="Close"
        />
      }
    >
      <XIcon aria-hidden="true" />
    </SheetClose>
  )
}

// ── View member (sheet-19) ──

function StatusNote({ member }: { member: MemberRecord }) {
  if (member.status === "Needs review") {
    return (
      <Alert variant="warning">
        <ClockIcon aria-hidden="true" />
        <AlertTitle>Access review due</AlertTitle>
        <AlertDescription>
          {member.name.split(" ")[0]}&apos;s access has not been reviewed in 90
          days. Confirm it or change it.
        </AlertDescription>
      </Alert>
    )
  }

  if (member.status === "Invited") {
    return (
      <Alert variant="info">
        <MailIcon aria-hidden="true" />
        <AlertTitle>Invite pending</AlertTitle>
        <AlertDescription>
          {member.lastActive}. The access below applies once they join.
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

function AccessFacts({ member }: { member: MemberRecord }) {
  const level = MEMBER_ACCESS_OPTIONS.find(
    (option) => option.value === member.access
  )

  return (
    <FactGroup
      title="Access"
      facts={[
        {
          label: "Level",
          value: (
            <span className="flex min-w-0 flex-col items-start gap-1">
              <AccessBadge access={member.access} />
              <span className="text-muted-foreground">
                {level?.description}
              </span>
            </span>
          ),
        },
        {
          label: "Areas",
          value: (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {member.areas.map((area) => (
                <span key={area}>{areaTitle(area)}</span>
              ))}
            </span>
          ),
        },
      ]}
    />
  )
}

function MemberView({
  member,
  index,
  total,
  onStep,
  onChangeAccess,
  actions,
}: {
  member: MemberRecord
  index: number
  total: number
  onStep: (direction: 1 | -1) => void
  onChangeAccess: () => void
  actions: MemberSheetActions
}) {
  const [tab, setTab] = useState<"details" | "access">("details")

  return (
    <>
      <HeaderBand member={member}>
        <span className="text-xs text-muted-foreground tabular-nums">
          {`${index + 1} of ${total}`}
        </span>
        <StepButton
          label="Previous member"
          shortcut="K"
          disabled={index === 0}
          onClick={() => onStep(-1)}
        >
          <ChevronUpIcon aria-hidden="true" />
        </StepButton>
        <StepButton
          label="Next member"
          shortcut="J"
          disabled={index >= total - 1}
          onClick={() => onStep(1)}
        >
          <ChevronDownIcon aria-hidden="true" />
        </StepButton>
        <CloseButton />
      </HeaderBand>

      {/* The Tabs root ships a gap of its own, which would open a seam
          between the rule under the triggers and the panel below it. */}
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (next === "details" || next === "access") setTab(next)
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="h-auto w-full shrink-0 justify-start gap-5 border-b px-5 py-0"
        >
          <TabsTrigger value="details" className={TAB_TRIGGER}>
            Details
          </TabsTrigger>
          <TabsTrigger value="access" className={TAB_TRIGGER}>
            Access
          </TabsTrigger>
        </TabsList>
        {/* One scroll body for every panel, keyed so each member opens at the top. */}
        <div
          key={member.id}
          className="min-h-0 flex-1 scroll-py-10 overflow-y-auto"
        >
          <div className="flex flex-col gap-4 px-5 py-5">
            <TabsContent value="details">
              <div className="flex flex-col gap-5">
                <StatusNote member={member} />
                <FactGroup
                  title="Member"
                  facts={[
                    {
                      label: "Email",
                      value: <CopyToken value={member.email} label="email" />,
                    },
                    { label: "Role", value: member.role },
                    { label: "Team", value: member.team },
                  ]}
                />
                <FactGroup
                  title="Activity"
                  facts={[
                    {
                      label: "Status",
                      value: <MemberStatusBadge status={member.status} />,
                    },
                    { label: "Last active", value: member.lastActive },
                  ]}
                />
              </div>
            </TabsContent>
            <TabsContent value="access">
              <AccessFacts member={member} />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <div className={SHEET_FOOTER}>
        {member.status === "Invited" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => actions.resendInvite(member)}
          >
            <MailIcon aria-hidden="true" />
            Resend Invite
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => actions.resetSession(member)}
          >
            <RefreshCwIcon aria-hidden="true" />
            Reset Session
          </Button>
        )}
        {/* Keyed apart from the form's submit: were it the same node, the
            click that opens the form would then submit it. */}
        <Button
          key="change-access"
          type="button"
          className="ms-auto"
          onClick={onChangeAccess}
        >
          <ShieldCheckIcon aria-hidden="true" />
          Change Access
        </Button>
      </div>
    </>
  )
}

// ── Change access (sheet-18) ──

function LevelChoices({
  value,
  invalid,
  onChange,
  checkedRef,
}: {
  value: MemberAccess
  invalid: boolean
  onChange: (access: MemberAccess) => void
  /** On the checked level, so focus can return to it */
  checkedRef?: RefCallback<HTMLElement>
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => {
        const option = MEMBER_ACCESS_OPTIONS.find((item) => item.value === next)
        if (option) onChange(option.value)
      }}
      aria-label="Access level"
      className="grid gap-2 sm:grid-cols-2"
    >
      {MEMBER_ACCESS_OPTIONS.map((option) => {
        const id = `member-access-${option.value.toLowerCase()}`
        return (
          <FieldLabel key={option.value} htmlFor={id}>
            <Field orientation="horizontal" className="items-start">
              <FieldContent className="min-w-0 gap-0.5">
                <FieldTitle className="[&_svg:not([class*=size-])]:size-4">
                  <span className="flex text-muted-foreground">
                    {ACCESS_ICONS[option.value]}
                  </span>
                  {option.value}
                </FieldTitle>
                <FieldDescription className="text-xs">
                  {option.description}
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem
                ref={option.value === value ? checkedRef : undefined}
                id={id}
                value={option.value}
                aria-invalid={invalid || undefined}
              />
            </Field>
          </FieldLabel>
        )
      })}
    </RadioGroup>
  )
}

function AccessForm({
  member,
  isLastOwner,
  actions,
  onDone,
}: {
  member: MemberRecord
  /** The workspace keeps at least one owner */
  isLastOwner: boolean
  actions: MemberSheetActions
  onDone: () => void
}) {
  const form = useForm({
    resolver: zodResolver(
      memberAccessSchema({ name: member.name, isLastOwner })
    ),
    defaultValues: memberAccessDefaults(member),
  })
  const access = useWatch({ control: form.control, name: "access" })
  const areas = useWatch({ control: form.control, name: "areas" })
  const submitted = form.formState.isSubmitted
  const everything = reachesEverything(access)
  const nextAreas = everything ? ALL_MEMBER_AREAS : areas
  const dirty = access !== member.access || !sameAreas(nextAreas, member.areas)

  function onSubmit(values: MemberAccessValues) {
    actions.save(member.id, {
      access: values.access,
      areas: reachesEverything(values.access) ? ALL_MEMBER_AREAS : values.areas,
    })
    onDone()
  }

  return (
    <>
      <HeaderBand member={member}>
        <CloseButton />
      </HeaderBand>

      <form
        id="member-access-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="min-h-0 flex-1 overflow-y-auto border-t"
      >
        <FieldGroup className="gap-6 px-5 py-5">
          <Controller
            name="access"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet className="gap-3" data-invalid={fieldState.invalid}>
                <FieldLegend variant="label">Level</FieldLegend>
                <LevelChoices
                  value={field.value}
                  invalid={fieldState.invalid}
                  checkedRef={field.ref}
                  onChange={(next) => {
                    field.onChange(next)
                    // Owner and Admin lift the area rule, so a shown error rechecks.
                    if (submitted) form.trigger("areas")
                  }}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </FieldSet>
            )}
          />

          <Controller
            name="areas"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet className="gap-3" data-invalid={fieldState.invalid}>
                <FieldLegend variant="label">Areas</FieldLegend>
                <FieldDescription className="-mt-1.5 text-xs">
                  {everything
                    ? `${access}s reach every area.`
                    : "The parts of Flowly this member can open."}
                </FieldDescription>
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  {MEMBER_ACCESS_SCOPE_OPTIONS.map((option, index) => (
                    <Field key={option.id} orientation="horizontal">
                      <Checkbox
                        ref={index === 0 ? field.ref : undefined}
                        id={`member-area-${option.id}`}
                        checked={everything || field.value.includes(option.id)}
                        disabled={everything}
                        aria-invalid={fieldState.invalid}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            // Kept in the options' order, so the view lists them alike.
                            ALL_MEMBER_AREAS.filter((area) =>
                              area === option.id
                                ? checked === true
                                : field.value.includes(area)
                            )
                          )
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`member-area-${option.id}`}>
                          {option.title}
                        </FieldLabel>
                        <FieldDescription className="text-xs">
                          {option.description}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </FieldGroup>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </FieldSet>
            )}
          />
        </FieldGroup>
      </form>

      <div className={SHEET_FOOTER}>
        <Button
          type="button"
          variant="destructive"
          onClick={() => actions.requestRemove(member)}
        >
          <UserMinusIcon aria-hidden="true" />
          Remove Access
        </Button>
        <div className="ms-auto flex items-center gap-2">
          <SheetClose render={<Button type="button" variant="outline" />}>
            Cancel
          </SheetClose>
          {/* Save waits for a change. A change that breaks a rule shows
              its message instead of saving. */}
          <Button
            key="save-access"
            type="submit"
            form="member-access-form"
            disabled={!dirty}
          >
            <CheckIcon aria-hidden="true" />
            Save Access
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Sheet ──

export function MemberSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  member,
  index,
  total,
  onStep,
  isLastOwner,
  session,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: MemberSheetMode
  onModeChange: (mode: MemberSheetMode) => void
  /** Kept while the sheet fades out */
  member: MemberRecord | undefined
  /** Where the member sits in the list as it is sorted and filtered */
  index: number
  total: number
  onStep: (direction: 1 | -1) => void
  isLastOwner: boolean
  /** Bumped on every open, so the form starts from the member each time */
  session: number
  actions: MemberSheetActions
}) {
  const popupRef = useRef<HTMLDivElement>(null)

  // J and K step like a mail client; typing in a field or a held modifier wins.
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (mode !== "view" || !member) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest("input, textarea, [contenteditable='true']")
    )
      return
    const key = event.key.toLowerCase()
    if (key === "j" && index < total - 1) {
      event.preventDefault()
      onStep(1)
    } else if (key === "k" && index > 0) {
      event.preventDefault()
      onStep(-1)
    }
  }

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={popupRef}
          side="right"
          showCloseButton={false}
          // Focus the panel itself: a first control would pop its tooltip.
          initialFocus={popupRef}
          onKeyDown={handleKeys}
          className={SHEET_SHELL}
        >
          {member ? (
            mode === "view" ? (
              <MemberView
                member={member}
                index={index}
                total={total}
                onStep={onStep}
                onChangeAccess={() => onModeChange("edit")}
                actions={actions}
              />
            ) : (
              <AccessForm
                key={`${member.id}-${session}`}
                member={member}
                isLastOwner={isLastOwner}
                actions={actions}
                onDone={() => onModeChange("view")}
              />
            )
          ) : (
            <SheetTitle className="sr-only">Member</SheetTitle>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}

// ── Remove access (sheet-18's delete confirm) ──

export function RemoveMemberDialog({
  member,
  open,
  onOpenChange,
  onConfirm,
}: {
  /** Kept while the dialog closes, so the exit keeps its copy */
  member: MemberRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Access?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{member?.name}</span>{" "}
            loses access to Flowly Labs at once. Their workflows and agents stay
            with the workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
