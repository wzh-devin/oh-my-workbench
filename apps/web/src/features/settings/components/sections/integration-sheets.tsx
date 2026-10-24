"use client"

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { Badge } from "@/components/reui/badge"
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "cn"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlugIcon,
  RefreshCwIcon,
  SearchIcon,
  UnplugIcon,
} from "lucide-react"
import {
  Controller,
  useForm,
  type ControllerFieldState,
  type ControllerRenderProps,
  type RefCallBack,
} from "react-hook-form"

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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"

import { ConnectionTest, type TestCheck } from "./connection-test"
import {
  integrationConnectionSchema,
  integrationSettingsDefaults,
  integrationSettingsSchema,
  NEW_INTEGRATION_STEP_FIELDS,
  newIntegrationDefaults,
  newIntegrationSchema,
  type IntegrationSettingsValues,
  type NewIntegrationFormValues,
  type NewIntegrationValues,
} from "./integration-schema"
import {
  CATALOG,
  catalogEntry,
  INTEGRATION_USES,
  STATUS_FACE,
  type CatalogEntry,
  type CatalogId,
  type IntegrationDraft,
  type IntegrationRecord,
  type IntegrationUse,
} from "./integrations-data"
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

// An integration's drawers. Opening one is the connection drawer: id and
// stepping in the band, Sync Now and Pause under the name, Overview and
// Settings tabs, Disconnect in the menu. Adding one is the three-step setup:
// pick a service, point it at an account and pass a connection test, then
// choose where Flowly uses it.

export type IntegrationTab = "overview" | "settings"

export type IntegrationActions = {
  sync: (id: string) => void
  togglePause: (id: string) => void
  refreshToken: (record: IntegrationRecord) => void
  save: (id: string, draft: IntegrationDraft) => void
  requestDisconnect: (record: IntegrationRecord) => void
}

export type NewIntegrationInput = IntegrationDraft & { catalogId: CatalogId }

const sameDraft = (a: IntegrationDraft, b: IntegrationDraft) =>
  a.description.trim() === b.description.trim() &&
  a.target.trim() === b.target.trim() &&
  a.alertOnFailure === b.alertOnFailure &&
  a.uses.length === b.uses.length &&
  a.uses.every((use) => b.uses.includes(use))

/** The three checks a test runs, worded for the service. */
function checksFor(entry: CatalogEntry, target: string): TestCheck[] {
  return [
    {
      label: `Reach ${entry.name}`,
      passed: `${entry.name} answered in 182 ms`,
    },
    {
      label: "Authenticate",
      passed:
        entry.auth === "oauth"
          ? `Authorized as ${entry.principal}`
          : `Key accepted for ${entry.principal.toLowerCase()}`,
    },
    {
      label: `Open the ${entry.targetLabel.toLowerCase()}`,
      passed: `${target.trim() || entry.targetPlaceholder} is reachable`,
    },
  ]
}

function IntegrationLogo({ entry }: { entry: CatalogEntry }) {
  return <ProfileIconContainer>{entry.logo}</ProfileIconContainer>
}

// ── The fields both drawers share ──

/** A Controller's render props, as each shared field takes them. */
type BoundField<TValue> = {
  field: Omit<ControllerRenderProps, "value"> & { value: TValue }
  fieldState: ControllerFieldState
}

function ConnectionFieldSet({ children }: { children: ReactNode }) {
  return (
    <FieldSet>
      <FieldLegend variant="label">Connection</FieldLegend>
      <FieldGroup className="gap-4">{children}</FieldGroup>
    </FieldSet>
  )
}

function TargetField({
  idPrefix,
  entry,
  field,
  fieldState,
}: BoundField<string> & { idPrefix: string; entry: CatalogEntry }) {
  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={`${idPrefix}-target`}>
        {entry.targetLabel}
      </FieldLabel>
      <Input
        {...field}
        id={`${idPrefix}-target`}
        autoComplete="off"
        placeholder={entry.targetPlaceholder}
        aria-invalid={fieldState.invalid}
      />
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )
}

/** Only New Integration asks for a key, and only a key service needs one. */
function SecretField({
  idPrefix,
  field,
  fieldState,
}: BoundField<string> & { idPrefix: string }) {
  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={`${idPrefix}-secret`}>API Key</FieldLabel>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <KeyRoundIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          {...field}
          id={`${idPrefix}-secret`}
          type="password"
          autoComplete="off"
          placeholder="Paste the key"
          aria-invalid={fieldState.invalid}
        />
      </InputGroup>
      <FieldDescription>
        Stored encrypted. Flowly shows only its last four characters.
      </FieldDescription>
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )
}

function AuthorizationNote({ entry }: { entry: CatalogEntry }) {
  return (
    <Field>
      <FieldLabel>Authorization</FieldLabel>
      <FieldDescription>
        {entry.name} asks you to approve access in a new window, then Flowly
        acts as {entry.principal}.
      </FieldDescription>
    </Field>
  )
}

function DescriptionField({
  idPrefix,
  field,
  fieldState,
}: BoundField<string> & { idPrefix: string }) {
  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={`${idPrefix}-description`}>
        What It Is For
      </FieldLabel>
      <Textarea
        {...field}
        id={`${idPrefix}-description`}
        placeholder="Post run alerts and approval requests."
        className="min-h-16"
        aria-invalid={fieldState.invalid}
      />
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )
}

function UsesFieldSet({
  idPrefix,
  field,
  fieldState,
}: BoundField<IntegrationUse[]> & { idPrefix: string }) {
  return (
    <FieldSet data-invalid={fieldState.invalid}>
      <FieldLegend variant="label">Use In</FieldLegend>
      <FieldGroup className="gap-3">
        {INTEGRATION_USES.map((option, index) => (
          <Field
            key={option.value}
            orientation="horizontal"
            data-invalid={fieldState.invalid}
          >
            <Checkbox
              // An error sends focus to the first use.
              ref={index === 0 ? field.ref : undefined}
              id={`${idPrefix}-use-${option.value}`}
              name={field.name}
              checked={field.value.includes(option.value)}
              aria-invalid={fieldState.invalid}
              onCheckedChange={(checked) =>
                field.onChange(
                  // Kept in the options' order, so the overview lists them alike.
                  INTEGRATION_USES.map((item) => item.value).filter((value) =>
                    value === option.value
                      ? checked === true
                      : field.value.includes(value)
                  )
                )
              }
            />
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-use-${option.value}`}>
                {option.label}
              </FieldLabel>
              <FieldDescription>{option.description}</FieldDescription>
            </FieldContent>
          </Field>
        ))}
      </FieldGroup>
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </FieldSet>
  )
}

function AlertField({
  idPrefix,
  entry,
  field,
}: Pick<BoundField<boolean>, "field"> & {
  idPrefix: string
  entry: CatalogEntry
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={`${idPrefix}-alert`}>Alert on Failure</FieldLabel>
        <FieldDescription>
          Tell the workspace owners when a call to {entry.name} fails.
        </FieldDescription>
      </FieldContent>
      <Switch
        id={`${idPrefix}-alert`}
        size="sm"
        checked={field.value}
        onCheckedChange={field.onChange}
      />
    </Field>
  )
}

// ── sheet-22: the integration drawer ──

function IntegrationView({
  record,
  tab,
  onTabChange,
  position,
  onStep,
  syncing,
  actions,
}: {
  record: IntegrationRecord
  tab: IntegrationTab
  onTabChange: (tab: IntegrationTab) => void
  position: { index: number; total: number }
  onStep: (direction: 1 | -1) => void
  syncing: boolean
  actions: IntegrationActions
}) {
  const entry = catalogEntry(record.catalogId)
  const source = integrationSettingsDefaults(record)
  const form = useForm<IntegrationSettingsValues>({
    resolver: zodResolver(integrationSettingsSchema(entry)),
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
  const face = STATUS_FACE[record.status]
  const paused = record.status === "paused"

  function onSubmit(clean: IntegrationSettingsValues) {
    // The schema hands the target and description back trimmed.
    if (sameDraft(clean, source)) return
    form.reset(clean)
    actions.save(record.id, clean)
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <CopyToken key={record.id} value={record.id} label="integration ID" />
          <div className="flex shrink-0 items-center gap-1">
            <PositionStepper
              label="integration"
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
                    aria-label="More integration actions"
                  />
                }
              >
                <MoreHorizontalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{record.id}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => actions.refreshToken(record)}
                  >
                    <KeyRoundIcon aria-hidden="true" />
                    {entry.auth === "oauth"
                      ? "Renew Authorization"
                      : "Rotate Key"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.requestDisconnect(record)}
                  >
                    <UnplugIcon aria-hidden="true" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <SheetCloseButton />
          </div>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-3">
          <IntegrationLogo entry={entry} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SheetTitle className="min-w-0 truncate">{entry.name}</SheetTitle>
              <Badge variant={face.variant}>{face.label}</Badge>
            </div>
            <SheetDescription>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span>{entry.kind}</span>
                <DotSeparator />
                <span>{record.target}</span>
                <DotSeparator />
                <span className="tabular-nums">
                  {record.calls.toLocaleString("en-US")} calls today
                </span>
              </span>
            </SheetDescription>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={paused || syncing}
            onClick={() => actions.sync(record.id)}
          >
            {syncing ? (
              <Spinner aria-hidden="true" />
            ) : (
              <RefreshCwIcon aria-hidden="true" />
            )}
            {syncing ? "Syncing" : "Sync Now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => actions.togglePause(record.id)}
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
                title="Sync"
                facts={[
                  { label: "Status", value: face.label },
                  { label: "Last sync", value: record.lastSync },
                  {
                    label: "Calls today",
                    value: (
                      <span className="tabular-nums">
                        {record.calls.toLocaleString("en-US")}
                      </span>
                    ),
                  },
                ]}
              />
              <FactGroup
                title="Connection"
                facts={[
                  {
                    label: "Service",
                    value: (
                      <span>
                        {entry.name}{" "}
                        <span className="text-muted-foreground">
                          {entry.kind}
                        </span>
                      </span>
                    ),
                  },
                  { label: "Signs in as", value: entry.principal },
                  { label: entry.targetLabel, value: record.target },
                  {
                    label: "Used in",
                    value: (
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {record.uses.map((use) => (
                          <span key={use}>
                            {
                              INTEGRATION_USES.find(
                                (option) => option.value === use
                              )?.label
                            }
                          </span>
                        ))}
                      </span>
                    ),
                  },
                  {
                    label: "Failure alerts",
                    value: record.alertOnFailure ? "On" : "Off",
                  },
                ]}
              />
              {record.description ? (
                <p className="text-sm text-muted-foreground">
                  {record.description}
                </p>
              ) : null}
            </TabsContent>
            <TabsContent value="settings" className="flex flex-col gap-5">
              <form
                id="integration-settings-form"
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-6"
              >
                <ConnectionFieldSet>
                  <Controller
                    name="target"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <TargetField
                        idPrefix="integration-edit"
                        entry={entry}
                        field={field}
                        fieldState={fieldState}
                      />
                    )}
                  />
                  <Controller
                    name="description"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <DescriptionField
                        idPrefix="integration-edit"
                        field={field}
                        fieldState={fieldState}
                      />
                    )}
                  />
                </ConnectionFieldSet>
                <Controller
                  name="uses"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <UsesFieldSet
                      idPrefix="integration-edit"
                      field={field}
                      fieldState={fieldState}
                    />
                  )}
                />
                <Controller
                  name="alertOnFailure"
                  control={form.control}
                  render={({ field }) => (
                    <AlertField
                      idPrefix="integration-edit"
                      entry={entry}
                      field={field}
                    />
                  )}
                />
              </form>
              <ConnectionTest
                checks={checksFor(entry, record.target)}
                description={`Runs against the saved ${entry.targetLabel.toLowerCase()} and sign-in`}
              />
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
              key="save-integration"
              type="submit"
              form="integration-settings-form"
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

export function IntegrationSheet({
  open,
  onOpenChange,
  record,
  tab,
  onTabChange,
  position,
  onStep,
  syncing,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kept while the sheet fades out */
  record: IntegrationRecord | undefined
  tab: IntegrationTab
  onTabChange: (tab: IntegrationTab) => void
  position: { index: number; total: number }
  onStep: (direction: 1 | -1) => void
  syncing: boolean
  actions: IntegrationActions
}) {
  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={SHEET_SHELL}
        >
          {record ? (
            <IntegrationView
              key={record.id}
              record={record}
              tab={tab}
              onTabChange={onTabChange}
              position={position}
              onStep={onStep}
              syncing={syncing}
              actions={actions}
            />
          ) : (
            <SheetTitle className="sr-only">Integration</SheetTitle>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}

// ── sheet-23: New Integration ──

type Step = 1 | 2 | 3

const STEPS: { step: Step; title: string; description: string }[] = [
  { step: 1, title: "Service", description: "Pick what to connect." },
  { step: 2, title: "Configure", description: "Point it at your account." },
  { step: 3, title: "Use", description: "Choose where Flowly uses it." },
]

function StepNav({
  step,
  reached,
  onStep,
}: {
  step: Step
  reached: Step
  onStep: (step: Step) => void
}) {
  return (
    <Stepper
      value={step}
      onValueChange={(next) => {
        const match = STEPS.find((item) => item.step === next)
        if (match && match.step <= reached) onStep(match.step)
      }}
      aria-label="New integration steps"
      indicators={{ completed: <CheckIcon aria-hidden="true" /> }}
    >
      <StepperNav className="flex items-center">
        {STEPS.map((item, index) => (
          <StepperItem
            key={item.step}
            step={item.step}
            disabled={item.step > reached}
            className="min-w-0"
          >
            <StepperTrigger className="min-w-0 gap-1.5">
              <StepperIndicator className="[&_svg:not([class*=size-])]:size-3.5">
                {item.step}
              </StepperIndicator>
              <StepperTitle className="truncate">{item.title}</StepperTitle>
            </StepperTrigger>
            {index < STEPS.length - 1 ? (
              <StepperSeparator className="mx-2.5" />
            ) : null}
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  )
}

const SERVICE_ERROR_ID = "integration-service-error"

/** Step 1: the catalog as one dense grid; a tile selects its service. */
function ServiceStep({
  picked,
  connected,
  onPick,
  invalid,
  inputRef,
  error,
}: {
  picked: CatalogId | null
  connected: CatalogId[]
  onPick: (id: CatalogId) => void
  invalid: boolean
  /** Lands on the first tile that can be picked, where an error sends focus */
  inputRef: RefCallBack
  error: ReactNode
}) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const matches = CATALOG.filter(
    (entry) =>
      !query ||
      entry.name.toLowerCase().includes(query) ||
      entry.kind.toLowerCase().includes(query)
  )
  const firstOpen = matches.find((entry) => !connected.includes(entry.id))

  return (
    <>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search integrations..."
          aria-label="Search integrations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </InputGroup>
      <div className="flex flex-col gap-2">
        {/* Above the grid, not under it: the catalog runs past a phone's
            screen, and the message has to be seen when Continue is pressed. */}
        {error}
        {matches.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No Integration Found</EmptyTitle>
              <EmptyDescription>
                Try a product or a kind of tool.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-2 min-[460px]:grid-cols-2 sm:grid-cols-3">
            {matches.map((entry) => {
              const isPicked = picked === entry.id
              const isConnected = connected.includes(entry.id)
              return (
                <Item
                  key={entry.id}
                  variant="outline"
                  size="xs"
                  render={
                    <button
                      ref={entry === firstOpen ? inputRef : undefined}
                      type="button"
                      aria-pressed={isPicked}
                      aria-describedby={
                        invalid && !isConnected ? SERVICE_ERROR_ID : undefined
                      }
                      data-invalid={(invalid && !isConnected) || undefined}
                      disabled={isConnected}
                      onClick={() => onPick(entry.id)}
                    />
                  }
                  className={cn(
                    "cursor-pointer flex-nowrap px-2 text-start hover:bg-muted/50 disabled:cursor-default disabled:opacity-60 data-invalid:border-destructive",
                    isPicked && "border-primary"
                  )}
                >
                  <ItemMedia className="translate-y-0">
                    <IntegrationLogo entry={entry} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full min-w-0">
                      <span className="truncate">{entry.name}</span>
                    </ItemTitle>
                    <ItemDescription className="truncate">
                      {isConnected ? "Connected" : entry.kind}
                    </ItemDescription>
                  </ItemContent>
                  {isPicked ? (
                    <ItemActions className="text-primary [&_svg:not([class*=size-])]:size-4">
                      <CheckIcon aria-hidden="true" />
                    </ItemActions>
                  ) : null}
                </Item>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function NewIntegrationFlow({
  preset,
  connected,
  onCreate,
  onDone,
}: {
  /** Connect on a listed service opens on its Configure step */
  preset: CatalogId | null
  connected: CatalogId[]
  onCreate: (input: NewIntegrationInput) => void
  onDone: () => void
}) {
  const [step, setStep] = useState<Step>(preset ? 2 : 1)
  const form = useForm<NewIntegrationFormValues, unknown, NewIntegrationValues>(
    {
      resolver: zodResolver(newIntegrationSchema),
      defaultValues: newIntegrationDefaults(preset),
    }
  )
  const values = form.watch()

  useEffect(() => {
    const { unsubscribe } = form.watch((_, { name }) => {
      if (!name) return
      // Editing what the test checks resets it.
      if (name === "catalogId" || name === "target" || name === "secret")
        form.setValue("testPassed", false)
      // Continue checks a step without submitting the form, so a field it
      // marked checks again as it changes, as it would after a submit.
      if (form.getFieldState(name).invalid) void form.trigger(name)
    })
    return unsubscribe
  }, [form])

  const entry = values.catalogId ? catalogEntry(values.catalogId) : null
  const configValid =
    entry !== null &&
    integrationConnectionSchema(entry).safeParse(values).success
  const reached: Step = !entry ? 1 : configValid && values.testPassed ? 3 : 2
  const testKey = `${values.catalogId}|${values.target}|${values.secret}`

  /** Each step starts with nothing marked, as it did before it was checked. */
  function goTo(next: Step) {
    form.clearErrors()
    setStep(next)
  }

  function pick(id: CatalogId) {
    if (id === values.catalogId) return
    form.setValue("catalogId", id)
    form.setValue("secret", "")
    form.setValue("target", "")
  }

  async function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 3) return
    const passed = await form.trigger(NEW_INTEGRATION_STEP_FIELDS[step], {
      shouldFocus: true,
    })
    if (passed) goTo(step === 1 ? 2 : 3)
  }

  function onSubmit(passed: NewIntegrationValues) {
    // The schema hands the target and description back trimmed.
    onCreate({
      catalogId: passed.catalogId,
      target: passed.target,
      description: passed.description,
      uses: passed.uses,
      alertOnFailure: passed.alertOnFailure,
    })
    onDone()
  }

  const footerNote =
    step === 1
      ? entry
        ? `${entry.name} selected`
        : "Pick a service to continue"
      : step === 2
        ? !configValid
          ? "Fill in the connection to test it"
          : values.testPassed
            ? "Test passed"
            : "Run the connection test to continue"
        : `${values.uses.length} of ${INTEGRATION_USES.length} uses on`

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="min-w-0">New Integration</SheetTitle>
            <SheetDescription>{STEPS[step - 1].description}</SheetDescription>
          </div>
          <SheetCloseButton />
        </div>
        <StepNav step={step} reached={reached} onStep={goTo} />
      </div>

      <form
        id="new-integration-form"
        noValidate
        onSubmit={step === 3 ? form.handleSubmit(onSubmit) : handleContinue}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Only the body scrolls; the header band and footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-4">
            {step === 1 ? (
              <Controller
                name="catalogId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <ServiceStep
                    picked={field.value}
                    connected={connected}
                    onPick={pick}
                    invalid={fieldState.invalid}
                    inputRef={field.ref}
                    error={
                      fieldState.invalid && (
                        <FieldError
                          id={SERVICE_ERROR_ID}
                          errors={[fieldState.error]}
                        />
                      )
                    }
                  />
                )}
              />
            ) : null}
            {step >= 2 && entry ? (
              <div className="flex min-w-0 items-center gap-3">
                <IntegrationLogo entry={entry} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {entry.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.kind}, {entry.auth === "oauth" ? "OAuth" : "API key"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="ms-auto"
                  onClick={() => goTo(1)}
                >
                  Change
                </Button>
              </div>
            ) : null}
            {step === 2 && entry ? (
              <>
                <FieldGroup className="gap-6">
                  <ConnectionFieldSet>
                    <Controller
                      name="target"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <TargetField
                          idPrefix="integration-new"
                          entry={entry}
                          field={field}
                          fieldState={fieldState}
                        />
                      )}
                    />
                    {entry.auth === "key" ? (
                      <Controller
                        name="secret"
                        control={form.control}
                        render={({ field, fieldState }) => (
                          <SecretField
                            idPrefix="integration-new"
                            field={field}
                            fieldState={fieldState}
                          />
                        )}
                      />
                    ) : (
                      <AuthorizationNote entry={entry} />
                    )}
                    <Controller
                      name="description"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <DescriptionField
                          idPrefix="integration-new"
                          field={field}
                          fieldState={fieldState}
                        />
                      )}
                    />
                  </ConnectionFieldSet>
                  <Controller
                    name="alertOnFailure"
                    control={form.control}
                    render={({ field }) => (
                      <AlertField
                        idPrefix="integration-new"
                        entry={entry}
                        field={field}
                      />
                    )}
                  />
                </FieldGroup>
                <Controller
                  name="testPassed"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-2">
                      <ConnectionTest
                        key={testKey}
                        checks={checksFor(entry, values.target)}
                        disabled={!configValid}
                        onResult={field.onChange}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </div>
                  )}
                />
              </>
            ) : null}
            {step === 3 && entry ? (
              <Controller
                name="uses"
                control={form.control}
                render={({ field, fieldState }) => (
                  <UsesFieldSet
                    idPrefix="integration-step"
                    field={field}
                    fieldState={fieldState}
                  />
                )}
              />
            ) : null}
          </div>
        </div>

        <div className={SHEET_FOOTER}>
          <p
            aria-live="polite"
            className="me-auto min-w-0 truncate text-xs text-muted-foreground"
          >
            {footerNote}
          </p>
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => goTo(step === 3 ? 2 : 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
              Back
            </Button>
          ) : null}
          {step === 3 ? (
            <Button key="create" type="submit">
              <PlugIcon aria-hidden="true" />
              Connect
            </Button>
          ) : (
            <Button key="continue" type="submit">
              Continue
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </>
  )
}

export function NewIntegrationSheet({
  open,
  onOpenChange,
  preset,
  session,
  connected,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: CatalogId | null
  /** Bumped on every open, so the flow starts afresh */
  session: number
  connected: CatalogId[]
  onCreate: (input: NewIntegrationInput) => void
}) {
  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={SHEET_SHELL}
        >
          <NewIntegrationFlow
            key={session}
            preset={preset}
            connected={connected}
            onCreate={onCreate}
            onDone={() => onOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}
