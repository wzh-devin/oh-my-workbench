"use client"

import { type MouseEvent, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

import { AUTH_PROVIDERS, type LegalDoc, SIGNED_IN_HREF } from "./data"
import {
  signInDefaultValues,
  signInSchema,
  type SignInValues,
} from "./sign-in-schema"

// The template has no auth backend, so each path simulates its result: Google
// and GitHub "redirect" back signed in, SSO looks the company up from the work
// email first, and Continue shows the sent state with the link the email
// would carry.
const SIMULATED_DELAY_MS = 700

// The reui.io preview's style layer gives an outline button with a leading
// logo even padding (`pl-4`, not the primitive's `pl-2`); matched here, as
// the CLI-owned Button is not edited by hand.
const providerButtonClassName =
  "w-full justify-center px-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-4"

const legalLinkClassName =
  "text-foreground hover:text-primary underline underline-offset-4 transition-colors"

export function SignInForm({
  onOpenLegal,
}: {
  onOpenLegal: (doc: LegalDoc) => void
}) {
  const navigate = useNavigate()
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: signInDefaultValues,
  })
  const [pending, setPending] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // Swapping the form for the sent state (and back) unmounts the focused
  // control, so focus is placed on purpose: on the sent heading, which a
  // screen reader then reads out, and back on the email when returning.
  const sentHeadingRef = useRef<HTMLHeadingElement>(null)
  const returningRef = useRef(false)

  useEffect(() => {
    if (sentTo) {
      sentHeadingRef.current?.focus()
    } else if (returningRef.current) {
      returningRef.current = false
      form.setFocus("email")
    }
  }, [sentTo, form])

  function signIn(via: string) {
    setPending(via)
    window.setTimeout(() => navigate(SIGNED_IN_HREF), SIMULATED_DELAY_MS)
  }

  // SSO is found from the email's domain, so it holds the email to the same
  // schema as Continue; only a blank email says what SSO needs it for.
  const signInWithSso = form.handleSubmit(
    () => signIn("sso"),
    () => {
      if (form.getValues("email").trim()) return
      form.setError("email", {
        type: "required",
        message: "Enter your work email to find your company's SSO.",
      })
    }
  )

  function onSubmit(values: SignInValues) {
    setPending("email")
    window.setTimeout(() => {
      setPending(null)
      setSentTo(values.email)
    }, SIMULATED_DELAY_MS)
  }

  function openLegal(doc: LegalDoc) {
    return (event: MouseEvent) => {
      event.preventDefault()
      onOpenLegal(doc)
    }
  }

  const legal = (
    <p className="text-center text-xs leading-5 text-pretty text-muted-foreground">
      By continuing, you agree to Flowly&apos;s{" "}
      <a
        href="#terms"
        className={legalLinkClassName}
        onClick={openLegal("terms")}
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        href="#privacy"
        className={legalLinkClassName}
        onClick={openLegal("privacy")}
      >
        Privacy Policy
      </a>
      .
    </p>
  )

  if (sentTo) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* Heading */}
        <div className="flex flex-col gap-1.5 text-center">
          <h1
            ref={sentHeadingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight text-balance outline-none sm:text-[1.6875rem]"
          >
            Check your inbox.
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. It
            expires in 15 minutes.
          </p>
        </div>

        <div className="grid gap-2.5">
          <Button
            type="button"
            className="w-full"
            disabled={pending !== null}
            onClick={() => signIn("link")}
          >
            {pending === "link" ? <Spinner data-icon="inline-start" /> : null}
            Open sign-in link
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending !== null}
            onClick={() => {
              returningRef.current = true
              setSentTo(null)
            }}
          >
            Use a different email
          </Button>
        </div>

        {legal}
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.6875rem]">
          Back to building.
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Sign in to sync your team, tasks, and timelines across every surface.
        </p>
      </div>

      {/* Grid */}
      <div className="grid gap-2.5">
        {AUTH_PROVIDERS.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className={providerButtonClassName}
            disabled={pending !== null}
            onClick={() =>
              provider.id === "sso" ? void signInWithSso() : signIn(provider.id)
            }
          >
            {pending === provider.id ? (
              <Spinner data-icon="inline-start" />
            ) : (
              provider.logo
            )}
            {provider.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      {/* Form */}
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field className="gap-2" data-invalid={fieldState.invalid}>
                {/* `leading-none`: the preview sets a field label's line
                    height to 1, which the CLI-owned Field does not. */}
                <FieldLabel htmlFor="auth-email" className="leading-none">
                  Work email
                </FieldLabel>
                <Input
                  {...field}
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "auth-email-error" : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="auth-email-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === "email" ? <Spinner data-icon="inline-start" /> : null}
          Continue
          <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
        </Button>
      </form>

      {legal}
    </div>
  )
}
