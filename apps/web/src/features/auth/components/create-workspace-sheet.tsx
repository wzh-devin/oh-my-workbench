"use client"

import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheckIcon, PlusIcon, XIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

import {
  createWorkspaceDefaultValues,
  createWorkspaceSchema,
  type CreateWorkspaceValues,
} from "./create-workspace-schema"
import { SIGNED_IN_HREF } from "./data"
import {
  SHEET_BODY,
  SHEET_FOOTER,
  SHEET_HEADER,
  SHEET_SHELL,
} from "./sheet-layout"

// "Create a workspace": the new owner lands signed in. There is no backend,
// so creating it is shown with a toast and the redirect.
export function CreateWorkspaceSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const nameRef = useRef<HTMLInputElement>(null)
  const form = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: createWorkspaceDefaultValues,
  })
  // Set once the workspace is created: the sheet is on its way out and the
  // page is navigating, so a second press must not submit again.
  const [created, setCreated] = useState(false)

  // Reset once the sheet has finished closing, so it slides out as it was
  // and not blank.
  function handleOpenChangeComplete(isOpen: boolean) {
    if (isOpen) return
    form.reset(createWorkspaceDefaultValues)
    setCreated(false)
  }

  function onSubmit(values: CreateWorkspaceValues) {
    if (created) return
    toast.success("Workspace created", {
      icon: (
        <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
      ),
      description: `${values.workspace} is ready. You are signed in as ${values.email}.`,
      closeButton: true,
    })
    setCreated(true)
    onOpenChange(false)
    navigate(SIGNED_IN_HREF)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        initialFocus={nameRef}
        className={SHEET_SHELL}
      >
        {/* Header band */}
        <div className={SHEET_HEADER}>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="min-w-0 text-lg">
              Create a workspace
            </SheetTitle>
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="mt-1">
            Start a Flowly workspace and invite your team after.
          </SheetDescription>
        </div>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ScrollArea className={SHEET_BODY}>
            <FieldGroup className="gap-4 px-5 py-5">
              <Controller
                name="workspace"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workspace-name">
                      Workspace name
                    </FieldLabel>
                    <Input
                      {...field}
                      // The sheet opens with focus here, and the form moves it
                      // here when it is the first field in error.
                      ref={(element) => {
                        field.ref(element)
                        nameRef.current = element
                      }}
                      id="workspace-name"
                      autoComplete="organization"
                      placeholder="Acme Operations"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workspace-owner">Full name</FieldLabel>
                    <Input
                      {...field}
                      id="workspace-owner"
                      autoComplete="name"
                      placeholder="Jordan Lee"
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
                    <FieldLabel htmlFor="workspace-email">
                      Work email
                    </FieldLabel>
                    <Input
                      {...field}
                      id="workspace-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
          </ScrollArea>

          <div className={SHEET_FOOTER}>
            <SheetClose render={<Button type="button" variant="outline" />}>
              Cancel
            </SheetClose>
            <Button type="submit" disabled={created}>
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Create workspace
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
