"use client"

import { useEffect, useRef } from "react"
import { Badge } from "@/components/reui/badge"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "cn"
import {
  KeyRoundIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react"
import { Controller, useForm, type Control } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"

import { ProfileIconContainer } from "./profile-icon-container"
import {
  CopyToken,
  DotSeparator,
  FactGroup,
  PositionStepper,
  SHEET_FOOTER,
  SHEET_SHELL,
  SheetCloseButton,
  TAB_TRIGGER,
} from "./sheet-parts"
import {
  NEW_WEBHOOK_DEFAULTS,
  WEBHOOK_RETRY_OPTIONS,
  webhookDefaults,
  webhookSchema,
  type WebhookValues,
} from "./webhook-schema"
import {
  RETRY_LABEL,
  WEBHOOK_EVENTS,
  WEBHOOK_STATUS_FACE,
  type WebhookDraft,
  type WebhookEndpoint,
  type WebhookEvent,
} from "./webhooks-data"

// A webhook endpoint's drawers. Opening one is the connection drawer: id and
// stepping in the band, Send Test and Pause under the URL, Overview and
// Settings tabs, Delete in the menu. Adding one is the create form, its
// toggles choosing the retry window.

export type WebhookTab = "overview" | "settings"

export type WebhookActions = {
  sendTest: (id: string) => void
  togglePause: (id: string) => void
  rotateSecret: (endpoint: WebhookEndpoint) => void
  save: (id: string, draft: WebhookDraft) => void
  requestDelete: (endpoint: WebhookEndpoint) => void
}

const sameDraft = (a: WebhookDraft, b: WebhookDraft) =>
  a.url.trim() === b.url.trim() &&
  a.description.trim() === b.description.trim() &&
  a.retry === b.retry &&
  a.signing === b.signing &&
  a.events.length === b.events.length &&
  a.events.every((event) => b.events.includes(event))

/** The URL without its scheme, as the list and the band print it. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "")

// ── The fields both drawers share ──

function WebhookFormFields({
  idPrefix,
  control,
}: {
  idPrefix: string
  control: Control<WebhookValues>
}) {
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Endpoint</FieldLegend>
        <FieldGroup className="gap-4">
          <Controller
            name="url"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-url`}>URL</FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-url`}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://api.example.com/hooks/flowly"
                  aria-invalid={fieldState.invalid}
                  className="font-mono text-xs"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="description"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-description`}>
                  Description
                </FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-description`}
                  autoComplete="off"
                  placeholder="Run results for the ops dashboard."
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>

      <Controller
        name="events"
        control={control}
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid}>
            <FieldLegend variant="label">Events</FieldLegend>
            <FieldGroup className="gap-3">
              {WEBHOOK_EVENTS.map((option, index) => (
                <Field
                  key={option.value}
                  orientation="horizontal"
                  data-invalid={fieldState.invalid}
                >
                  <Checkbox
                    // An error sends focus to the first event.
                    ref={index === 0 ? field.ref : undefined}
                    id={`${idPrefix}-event-${option.value}`}
                    name={field.name}
                    checked={field.value.includes(option.value)}
                    aria-invalid={fieldState.invalid}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        // Kept in the options' order, so the overview lists them alike.
                        WEBHOOK_EVENTS.map((item) => item.value).filter(
                          (value: WebhookEvent) =>
                            value === option.value
                              ? checked === true
                              : field.value.includes(value)
                        )
                      )
                    }
                  />
                  <FieldContent>
                    <FieldLabel
                      htmlFor={`${idPrefix}-event-${option.value}`}
                      className="font-mono text-xs"
                    >
                      {option.value}
                    </FieldLabel>
                    <FieldDescription>{option.description}</FieldDescription>
                  </FieldContent>
                </Field>
              ))}
            </FieldGroup>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </FieldSet>
        )}
      />

      <FieldSet>
        <FieldLegend variant="label">Delivery</FieldLegend>
        <FieldGroup className="gap-4">
          <Controller
            name="retry"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel id={`${idPrefix}-retry-label`}>
                  Retry Failed Events
                </FieldLabel>
                <ToggleGroup
                  multiple={false}
                  value={[field.value]}
                  onValueChange={(value: string[]) => {
                    const next = WEBHOOK_RETRY_OPTIONS.find(
                      (option) => option === value[0]
                    )
                    if (next) field.onChange(next)
                  }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-labelledby={`${idPrefix}-retry-label`}
                  className="w-full"
                >
                  {WEBHOOK_RETRY_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option}
                      value={option}
                      className="flex-1 text-muted-foreground data-pressed:text-foreground"
                    >
                      {RETRY_LABEL[option]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          />
          <Controller
            name="signing"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`${idPrefix}-signing`}>
                    Sign Payloads
                  </FieldLabel>
                  <FieldDescription>
                    Adds a signature header the receiver can verify.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id={`${idPrefix}-signing`}
                  size="sm"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </>
  )
}

// ── sheet-22: the endpoint drawer ──

function WebhookView({
  endpoint,
  takenUrls,
  tab,
  onTabChange,
  position,
  onStep,
  testing,
  actions,
}: {
  endpoint: WebhookEndpoint
  /** Every other endpoint's URL */
  takenUrls: string[]
  tab: WebhookTab
  onTabChange: (tab: WebhookTab) => void
  position: { index: number; total: number }
  onStep: (direction: 1 | -1) => void
  testing: boolean
  actions: WebhookActions
}) {
  const source = webhookDefaults(endpoint)
  const form = useForm<WebhookValues>({
    resolver: zodResolver(webhookSchema({ takenUrls })),
    defaultValues: source,
  })

  // A save or an Undo changes the record outside the form: a clean form follows it.
  const seenSource = useRef(source)
  useEffect(() => {
    if (sameDraft(seenSource.current, source)) return
    if (sameDraft(form.getValues(), seenSource.current)) form.reset(source)
    seenSource.current = source
  }, [form, source])

  const dirty = !sameDraft(form.watch(), source)
  const face = WEBHOOK_STATUS_FACE[endpoint.status]
  const paused = endpoint.status === "paused"

  function onSubmit(clean: WebhookValues) {
    // The schema hands the URL and description back trimmed.
    if (sameDraft(clean, source)) return
    form.reset(clean)
    actions.save(endpoint.id, clean)
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <CopyToken
            key={endpoint.id}
            value={endpoint.id}
            label="endpoint ID"
          />
          <div className="flex shrink-0 items-center gap-1">
            <PositionStepper
              label="endpoint"
              index={position.index}
              total={position.total}
              disabled={dirty}
              onStep={onStep}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="More endpoint actions"
                  />
                }
              >
                <MoreHorizontalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{endpoint.id}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => actions.rotateSecret(endpoint)}
                  >
                    <KeyRoundIcon aria-hidden="true" />
                    Rotate Signing Secret
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.requestDelete(endpoint)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    Delete Endpoint
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <SheetCloseButton />
          </div>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-3">
          <ProfileIconContainer>
            <WebhookIcon aria-hidden="true" />
          </ProfileIconContainer>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SheetTitle className="min-w-0 truncate font-mono text-sm">
                {shortUrl(endpoint.url)}
              </SheetTitle>
              <Badge variant={face.variant}>{face.label}</Badge>
            </div>
            <SheetDescription>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span>
                  {endpoint.events.length} event
                  {endpoint.events.length === 1 ? "" : "s"}
                </span>
                <DotSeparator />
                <span className="tabular-nums">
                  {endpoint.successRate}% delivered
                </span>
                <DotSeparator />
                <span>Last {endpoint.lastDelivery}</span>
              </span>
            </SheetDescription>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={paused || testing}
            onClick={() => actions.sendTest(endpoint.id)}
          >
            {testing ? (
              <Spinner aria-hidden="true" />
            ) : (
              <SendIcon aria-hidden="true" />
            )}
            {testing ? "Sending" : "Send Test"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => actions.togglePause(endpoint.id)}
          >
            {paused ? (
              <PlayIcon aria-hidden="true" />
            ) : (
              <PauseIcon aria-hidden="true" />
            )}
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "overview" || value === "settings") onTabChange(value)
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b px-5">
          <TabsList
            variant="line"
            className="-mb-px h-10! gap-5 bg-transparent p-0"
          >
            <TabsTrigger value="overview" className={TAB_TRIGGER}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="settings" className={TAB_TRIGGER}>
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Only the body scrolls; the header band, tabs and footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-4">
            <TabsContent value="overview" className="flex flex-col gap-5">
              <FactGroup
                title="Delivery"
                facts={[
                  { label: "Status", value: face.label },
                  {
                    label: "Success",
                    value: (
                      <span className="tabular-nums">
                        {endpoint.successRate}% in 24 hours
                      </span>
                    ),
                  },
                  { label: "Retries", value: RETRY_LABEL[endpoint.retry] },
                  {
                    label: "Events",
                    value: (
                      <span className="flex flex-col gap-1 font-mono text-xs">
                        {endpoint.events.map((event) => (
                          <span key={event}>{event}</span>
                        ))}
                      </span>
                    ),
                  },
                ]}
              />
              <FactGroup
                title="Security"
                facts={[
                  {
                    label: "Signing",
                    value: endpoint.signing ? "Signed" : "Unsigned",
                  },
                  {
                    label: "Secret",
                    value: (
                      <span className="font-mono text-xs">
                        whsec_••••{endpoint.secretTail}
                      </span>
                    ),
                  },
                ]}
              />
              <section className="flex min-w-0 flex-col gap-3">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Recent Deliveries
                </h3>
                <ul className="flex flex-col divide-y">
                  {endpoint.deliveries.map((delivery) => (
                    <li
                      key={delivery.id}
                      className="flex min-w-0 items-center gap-3 py-2"
                    >
                      <Badge
                        variant={
                          delivery.code < 300
                            ? "success-light"
                            : "destructive-light"
                        }
                        className="tabular-nums"
                      >
                        {delivery.code}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {delivery.event}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {delivery.ms} ms
                      </span>
                      <span className="w-20 text-end text-xs text-muted-foreground">
                        {delivery.at}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </TabsContent>
            <TabsContent value="settings">
              <form
                id="webhook-settings-form"
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-6"
              >
                <WebhookFormFields
                  idPrefix="webhook-edit"
                  control={form.control}
                />
              </form>
            </TabsContent>
          </div>
        </div>

        {tab === "settings" ? (
          <div className={SHEET_FOOTER}>
            <Button
              type="button"
              variant="outline"
              className="ms-auto"
              disabled={!dirty}
              onClick={() => form.reset(source)}
            >
              Discard
            </Button>
            <Button
              key="save-webhook"
              type="submit"
              form="webhook-settings-form"
              disabled={!dirty}
            >
              Save Changes
            </Button>
          </div>
        ) : null}
      </Tabs>
    </>
  )
}

export function WebhookSheet({
  open,
  onOpenChange,
  endpoint,
  takenUrls,
  tab,
  onTabChange,
  position,
  onStep,
  testing,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kept while the sheet fades out */
  endpoint: WebhookEndpoint | undefined
  takenUrls: string[]
  tab: WebhookTab
  onTabChange: (tab: WebhookTab) => void
  position: { index: number; total: number }
  onStep: (direction: 1 | -1) => void
  testing: boolean
  actions: WebhookActions
}) {
  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={SHEET_SHELL}
        >
          {endpoint ? (
            <WebhookView
              key={endpoint.id}
              endpoint={endpoint}
              takenUrls={takenUrls}
              tab={tab}
              onTabChange={onTabChange}
              position={position}
              onStep={onStep}
              testing={testing}
              actions={actions}
            />
          ) : (
            <SheetTitle className="sr-only">Endpoint</SheetTitle>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}

// ── sheet-21: Add Endpoint ──

function NewWebhookForm({
  takenUrls,
  onCreate,
  onDone,
}: {
  takenUrls: string[]
  onCreate: (draft: WebhookDraft) => void
  onDone: () => void
}) {
  const form = useForm<WebhookValues>({
    resolver: zodResolver(webhookSchema({ takenUrls })),
    defaultValues: NEW_WEBHOOK_DEFAULTS,
  })
  const values = form.watch()

  function onSubmit(clean: WebhookValues) {
    // The schema hands the URL and description back trimmed.
    onCreate(clean)
    onDone()
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <SheetTitle className="min-w-0 text-lg">Add Endpoint</SheetTitle>
          <SheetCloseButton />
        </div>
        <SheetDescription className="mt-1">
          Flowly posts the events you pick to this URL as they happen.
        </SheetDescription>
      </div>

      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-5 py-5">
            <WebhookFormFields idPrefix="webhook-new" control={form.control} />
          </div>
        </div>

        <div className={SHEET_FOOTER}>
          {/* The subscription stays in view while the body scrolls. */}
          <p
            aria-live="polite"
            className={cn(
              "me-auto min-w-0 truncate text-xs text-muted-foreground"
            )}
          >
            {values.events.length} event{values.events.length === 1 ? "" : "s"},{" "}
            {RETRY_LABEL[values.retry].toLowerCase()} of retries
          </p>
          <SheetClose render={<Button type="button" variant="outline" />}>
            Cancel
          </SheetClose>
          <Button type="submit">
            <PlusIcon aria-hidden="true" />
            Add Endpoint
          </Button>
        </div>
      </form>
    </>
  )
}

export function NewWebhookSheet({
  open,
  onOpenChange,
  session,
  takenUrls,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bumped on every open, so the form starts empty */
  session: number
  takenUrls: string[]
  onCreate: (draft: WebhookDraft) => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={popupRef}
        side="right"
        showCloseButton={false}
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>("#webhook-new-url") ??
          true
        }
        className={SHEET_SHELL}
      >
        <NewWebhookForm
          key={session}
          takenUrls={takenUrls}
          onCreate={onCreate}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
