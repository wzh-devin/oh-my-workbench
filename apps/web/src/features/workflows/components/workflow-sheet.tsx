"use client"

/**
 * The workflow sheet: one workflow's drawer with
 * Overview, Steps, Preview and Settings tabs; stepping walks the triage order.
 * Create opens the same drawer on the Settings form alone. The list record
 * lives in the workspace store; steps, runs and the secret live here.
 */
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CURRENT_USER } from "@/lib/workspace/team"

import { type WorkflowItem } from "./data"
import { TOAST_ERROR_ICON, TOAST_SUCCESS_ICON, UI_ICONS } from "./icons"
import { PreviewTab } from "./preview-tab"
import {
  detailsOf,
  enabledOf,
  REFERENCE_MS,
  rotatedHint,
  statusOf,
  TRIGGER_SOURCE,
  triageOrder,
  type SheetTab,
  type WorkflowDetails,
  type WorkflowRun,
  type WorkflowStep,
} from "./sheet-data"
import { StepsTab } from "./steps-tab"
import {
  DotSeparator,
  EnvironmentFace,
  AppLogo,
  StatusFace,
} from "./value-faces"
import { sameDraft, WorkflowFormFields } from "./workflow-form-fields"
import { WorkflowOverviewTab } from "./workflow-overview-tab"
import {
  EMPTY_WORKFLOW_FORM,
  workflowFormSchema,
  type WorkflowFormValues,
} from "./workflow-schema"
import { toFormValues } from "./workflow-store"
import { checksForWorkflow, WorkflowTest } from "./workflow-test"

export type WorkflowSheetMode = "create" | "view" | "edit"

export type WorkflowSheetState = {
  open: boolean
  mode: WorkflowSheetMode
  workflow: WorkflowItem | null
}

/** What the drawer changed on a workflow beyond its list record. */
type DetailPatch = Partial<
  Pick<WorkflowDetails, "environment" | "alertOnFailure" | "secret" | "steps">
> & { manualRuns?: WorkflowRun[] }

const SHEET_TABS: { value: SheetTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "steps", label: "Steps" },
  { value: "preview", label: "Preview" },
  { value: "settings", label: "Settings" },
]

const FORM_ID = "workflow-sheet-form"
const RUN_MS = 1500

/** The floating inset shell: a full-height card held off every edge. The
 *  side-scoped copies outrank the sheet's own `data-[side=right]` sizing. */
const SHEET_SHELL =
  "inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(var(--sheet-width),calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 outline-none data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-[calc(100svh-2rem)] data-[side=right]:w-[min(var(--sheet-width),calc(100vw-2rem))] data-[side=right]:sm:max-w-none"

/** Pinned under the scrolling body; px-5 keeps it on the band's spine. */
const SHEET_FOOTER =
  "flex shrink-0 items-center gap-2 border-t bg-muted px-5 py-3"

/** Only the body scrolls; the header band, tabs and footer stay put. */
const SHEET_BODY =
  "scroll-fade-y min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:scroll-py-10"

type SheetActions = {
  onTabChange: (tab: SheetTab) => void
  onStepChange: (stepId: string) => void
  onClose: () => void
  onRun: (workflow: WorkflowItem) => void
  onPausedToggle: (workflow: WorkflowItem) => void
  onRotate: (workflow: WorkflowItem) => void
  onToggleStep: (
    workflow: WorkflowItem,
    step: WorkflowStep,
    enabled: boolean
  ) => void
  onOpenInEditor: (workflow: WorkflowItem) => void
  onDuplicate: (workflow: WorkflowItem) => void
  onDelete: (workflow: WorkflowItem) => void
  onSave: (workflow: WorkflowItem, values: WorkflowFormValues) => void
}

/** Mono id with an inline copy swap; a refused clipboard says so. */
function WorkflowIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
    }
  }, [])

  function handleCopy() {
    const failed = () =>
      toast.error("Copy failed", {
        icon: TOAST_ERROR_ICON,
        description: "Clipboard access was blocked.",
        closeButton: true,
      })
    // Clipboard access can be refused (an iframe, an insecure origin), so both paths answer.
    if (!navigator.clipboard) {
      failed()
      return
    }
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000)
    }, failed)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
        {id}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copied ? "Workflow ID copied" : "Copy workflow ID"}
              onClick={handleCopy}
            />
          }
        >
          {copied ? UI_ICONS.check : UI_ICONS.copy}
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : "Copy ID"}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function WorkflowSheetView({
  workflow,
  details,
  running,
  workflows,
  tab,
  stepId,
  position,
  onStep,
  actions,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  running: boolean
  workflows: WorkflowItem[]
  tab: SheetTab
  stepId: string | null
  position: { index: number; total: number } | null
  onStep: (direction: 1 | -1) => void
  actions: SheetActions
}) {
  const source = toFormValues(workflow, details)
  const schema = useMemo(
    () => workflowFormSchema(workflows, workflow.id),
    [workflows, workflow.id]
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: source,
  })
  const dirty = form.formState.isDirty

  // A save or an Undo changes the record outside the form: a clean form follows it.
  const seenSource = useRef(source)
  useEffect(() => {
    if (sameDraft(seenSource.current, source)) return
    seenSource.current = source
    if (!dirty) form.reset(source)
  })

  const status = statusOf(workflow, running)
  const enabled = enabledOf(details)
  const checks = useMemo(
    () => checksForWorkflow(workflow, details),
    [workflow, details]
  )

  function handleSave(values: WorkflowFormValues) {
    if (!dirty) return
    // The schema trimmed the values; the form holds them as saved, so it
    // reads pristine once the record updates.
    form.reset(values)
    actions.onSave(workflow, values)
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <WorkflowIdChip id={workflow.id} />
          <div className="flex shrink-0 items-center gap-1">
            {position ? (
              <ButtonGroup aria-label="Workflows">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Previous workflow"
                        disabled={position.index === 0 || dirty}
                        onClick={() => onStep(-1)}
                      />
                    }
                  >
                    {UI_ICONS.previous}
                  </TooltipTrigger>
                  <TooltipContent>Previous workflow</TooltipContent>
                </Tooltip>
                <ButtonGroupText className="min-w-16 justify-center text-xs tabular-nums">
                  {position.index + 1} of {position.total}
                </ButtonGroupText>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Next workflow"
                        disabled={
                          position.index === position.total - 1 || dirty
                        }
                        onClick={() => onStep(1)}
                      />
                    }
                  >
                    {UI_ICONS.next}
                  </TooltipTrigger>
                  <TooltipContent>Next workflow</TooltipContent>
                </Tooltip>
              </ButtonGroup>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="More workflow actions"
                  />
                }
              >
                {UI_ICONS.more}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="tabular-nums">
                    {workflow.id}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => actions.onOpenInEditor(workflow)}
                  >
                    {UI_ICONS.editor}
                    Open in Editor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onRotate(workflow)}>
                    {UI_ICONS.key}
                    Rotate Secret
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.onDuplicate(workflow)}
                  >
                    {UI_ICONS.copy}
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.onDelete(workflow)}
                  >
                    {UI_ICONS.trash}
                    Delete Workflow
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={actions.onClose}
            >
              {UI_ICONS.close}
            </Button>
          </div>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-3">
          <AppLogo app={details.app} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SheetTitle className="min-w-0 truncate">
                {workflow.name}
              </SheetTitle>
              <StatusFace status={status} />
            </div>
            <SheetDescription>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span>{workflow.trigger} trigger</span>
                <DotSeparator />
                <EnvironmentFace environment={details.environment} />
                <DotSeparator />
                <span className="tabular-nums">
                  {enabled.length} of {details.steps.length} steps enabled
                </span>
              </span>
            </SheetDescription>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!workflow.enabled || running}
            onClick={() => actions.onRun(workflow)}
          >
            {running ? (
              <Spinner
                role="presentation"
                aria-label={undefined}
                aria-hidden="true"
              />
            ) : (
              UI_ICONS.sync
            )}
            {running ? "Running" : "Run Now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actions.onPausedToggle(workflow)}
          >
            {workflow.enabled ? UI_ICONS.pause : UI_ICONS.resume}
            {workflow.enabled ? "Pause" : "Resume"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actions.onTabChange("preview")}
          >
            {UI_ICONS.rows}
            Preview
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = SHEET_TABS.find((item) => item.value === value)
          if (next) actions.onTabChange(next.value)
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b px-5">
          <TabsList
            variant="line"
            className="-mb-px h-10! max-w-full [scrollbar-width:none] gap-5 overflow-x-auto bg-transparent p-0 max-sm:gap-3 [&::-webkit-scrollbar]:hidden"
          >
            {SHEET_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-full! flex-none gap-1.5 px-0 text-sm font-medium after:-bottom-px!"
              >
                {item.label}
                {item.value === "steps" ? (
                  <Badge
                    variant="outline"
                    radius="full"
                    className="tabular-nums"
                  >
                    {details.steps.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className={SHEET_BODY}>
          <div className="flex flex-col gap-4 px-5 py-4">
            <TabsContent value="overview" className="flex flex-col gap-4">
              <WorkflowOverviewTab
                workflow={workflow}
                details={details}
                onRun={() => actions.onRun(workflow)}
                onResume={() => actions.onPausedToggle(workflow)}
                onRotate={() => actions.onRotate(workflow)}
                onShowSteps={() => actions.onTabChange("steps")}
              />
            </TabsContent>
            <TabsContent value="steps" className="flex flex-col gap-3">
              <StepsTab
                workflow={workflow}
                details={details}
                onToggle={(step, next) =>
                  actions.onToggleStep(workflow, step, next)
                }
                onPreview={(step) => {
                  actions.onStepChange(step.id)
                  actions.onTabChange("preview")
                }}
                onRetry={() => actions.onRun(workflow)}
                onOpenInEditor={() => actions.onOpenInEditor(workflow)}
              />
            </TabsContent>
            <TabsContent value="preview" className="flex flex-col gap-3">
              <PreviewTab
                workflow={workflow}
                details={details}
                stepId={stepId}
                onStepChange={actions.onStepChange}
                onEnable={(step) => actions.onToggleStep(workflow, step, true)}
                onRetry={() => actions.onRun(workflow)}
                onRun={() => actions.onRun(workflow)}
              />
            </TabsContent>
            <TabsContent value="settings" className="flex flex-col gap-4">
              <form
                id={FORM_ID}
                noValidate
                onSubmit={form.handleSubmit(handleSave)}
                className="flex flex-col gap-4"
              >
                <WorkflowFormFields
                  idPrefix="workflow-sheet-edit"
                  control={form.control}
                />
              </form>
              <WorkflowTest
                checks={checks}
                description="Runs the saved steps once on sample data; nothing is sent"
              />
            </TabsContent>
          </div>
        </ScrollArea>

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
            <Button type="submit" form={FORM_ID} disabled={!dirty}>
              Save Changes
            </Button>
          </div>
        ) : null}
      </Tabs>
    </>
  )
}

/** Create: the same drawer, its header band over the Settings form alone. */
function NewWorkflowView({
  workflows,
  onClose,
  onCreate,
}: {
  workflows: WorkflowItem[]
  onClose: () => void
  onCreate: (values: WorkflowFormValues) => void
}) {
  const schema = useMemo(() => workflowFormSchema(workflows), [workflows])
  // A first try shows every error at once; nothing is created until clean.
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_WORKFLOW_FORM,
  })

  function handleCreate(values: WorkflowFormValues) {
    // The schema hands the values over trimmed, as the store saves them.
    onCreate(values)
  }

  return (
    <>
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            New workflow
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            {UI_ICONS.close}
          </Button>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-3">
          <IconTile variant="outline" aria-hidden="true">
            {UI_ICONS.workflow}
          </IconTile>
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="min-w-0 truncate">New Workflow</SheetTitle>
            <SheetDescription>
              Name it and pick what starts it. Steps are added in the editor.
            </SheetDescription>
          </div>
        </div>
      </div>

      <ScrollArea className={SHEET_BODY}>
        <form
          id={FORM_ID}
          noValidate
          onSubmit={form.handleSubmit(handleCreate)}
          className="flex flex-col gap-4 px-5 py-4"
        >
          <WorkflowFormFields
            idPrefix="workflow-sheet-new"
            control={form.control}
          />
        </form>
      </ScrollArea>

      <div className={SHEET_FOOTER}>
        <Button
          type="button"
          variant="outline"
          className="ms-auto"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID}>
          Create Workflow
        </Button>
      </div>
    </>
  )
}

export function WorkflowSheet({
  state,
  workflows,
  onOpenChange,
  onSubmit,
  onToggle,
  onRunComplete,
  onOpenInEditor,
  onDuplicate,
  onDelete,
}: {
  state: WorkflowSheetState
  workflows: WorkflowItem[]
  onOpenChange: (open: boolean) => void
  /** Saves an edit, or creates and returns the new record. */
  onSubmit: (
    values: WorkflowFormValues,
    workflow: WorkflowItem | null
  ) => WorkflowItem | void
  onToggle: (workflow: WorkflowItem, enabled: boolean) => void
  onRunComplete: (workflow: WorkflowItem, run: WorkflowRun) => void
  onOpenInEditor: (workflow: WorkflowItem) => void
  onDuplicate: (workflow: WorkflowItem) => void
  onDelete: (workflow: WorkflowItem) => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [currentId, setCurrentId] = useState<string | null>(
    state.workflow?.id ?? null
  )
  const [tab, setTab] = useState<SheetTab>("overview")
  const [stepId, setStepId] = useState<string | null>(null)
  const [patches, setPatches] = useState<Record<string, DetailPatch>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  // Lives outside the keyed view, so a step's announcement survives the remount.
  const [announcement, setAnnouncement] = useState("")
  const timers = useRef<number[]>([])
  const runSeq = useRef(64_000)

  // A new request from the page (open, a row's Edit, a duplicate) starts the
  // drawer over on that record and the tab its mode asks for.
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    const fresh =
      state.open &&
      (!seenState.open ||
        state.mode !== seenState.mode ||
        state.workflow?.id !== seenState.workflow?.id)
    if (fresh) {
      setCurrentId(state.workflow?.id ?? null)
      setTab(state.mode === "edit" ? "settings" : "overview")
      setStepId(null)
      setAnnouncement("")
    }
  }

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  // Previous and Next walk the triage order: failing first, healthy last.
  const orderedIds = useMemo(
    () => triageOrder(workflows).map((workflow) => workflow.id),
    [workflows]
  )
  const workflow =
    state.mode === "create"
      ? null
      : (workflows.find((item) => item.id === currentId) ?? null)
  const index = workflow ? orderedIds.indexOf(workflow.id) : -1
  const position = index >= 0 ? { index, total: orderedIds.length } : null

  function detailsFor(item: WorkflowItem): WorkflowDetails {
    const base = detailsOf(item)
    const { manualRuns = [], ...patch } = patches[item.id] ?? {}
    return { ...base, ...patch, runs: [...manualRuns, ...base.runs] }
  }

  const details = workflow ? detailsFor(workflow) : null

  function patch(id: string, next: DetailPatch) {
    setPatches((current) => ({
      ...current,
      [id]: { ...current[id], ...next },
    }))
  }

  function handleRun(item: WorkflowItem) {
    if (running[item.id] || !item.enabled) return
    setRunning((current) => ({ ...current, [item.id]: true }))
    const base = detailsOf(item)
    const timer = window.setTimeout(() => {
      const run: WorkflowRun = {
        id: `run_${++runSeq.current}`,
        startedAt: REFERENCE_MS,
        durationSec: base.durationSec,
        items: base.itemsPerRun,
        outcome: "succeeded",
        by: CURRENT_USER.id,
      }
      // Read the patch as it stands now: a step may have been switched mid-run.
      setPatches((current) => {
        const own = current[item.id] ?? {}
        return {
          ...current,
          [item.id]: {
            ...own,
            // A retry clears the failure it was started for.
            steps: (own.steps ?? base.steps).map((step) => ({
              ...step,
              failure: undefined,
              added: step.enabled ? false : step.added,
            })),
            manualRuns: [run, ...(own.manualRuns ?? [])],
          },
        }
      })
      setRunning((state) => ({ ...state, [item.id]: false }))
      onRunComplete(item, run)
    }, RUN_MS)
    timers.current.push(timer)
  }

  function handleRotate(item: WorkflowItem) {
    const current = detailsFor(item)
    const hint = rotatedHint(current.secret.hint, runSeq.current++)
    patch(item.id, {
      secret: {
        hint,
        rotatedAt: REFERENCE_MS,
        rotatedBy: CURRENT_USER.id,
      },
    })
    const secret = TRIGGER_SOURCE[item.trigger].secret
    toast.success(`${secret} rotated`, {
      icon: TOAST_SUCCESS_ICON,
      description: `${item.name} now signs with ${hint}. The old one stops working now.`,
      closeButton: true,
    })
  }

  function handleToggleStep(
    item: WorkflowItem,
    step: WorkflowStep,
    enabled: boolean
  ) {
    const current = detailsFor(item)
    patch(item.id, {
      steps: current.steps.map((entry) =>
        entry.id === step.id ? { ...entry, enabled } : entry
      ),
    })
  }

  return (
    <TooltipProvider>
      <Sheet open={state.open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={popupRef}
          side="right"
          showCloseButton={false}
          // Focus the panel itself: a first control would pop its tooltip.
          initialFocus={popupRef}
          className={SHEET_SHELL}
        >
          {state.mode === "create" ? (
            <NewWorkflowView
              workflows={workflows}
              onClose={() => onOpenChange(false)}
              onCreate={(values) => {
                const created = onSubmit(values, null)
                // The drawer keeps what the list record has no field for.
                if (created) {
                  patch(created.id, {
                    environment: values.environment,
                    alertOnFailure: values.alertOnFailure,
                  })
                }
              }}
            />
          ) : workflow && details ? (
            <WorkflowSheetView
              key={workflow.id}
              workflow={workflow}
              details={details}
              running={running[workflow.id] ?? false}
              workflows={workflows}
              tab={tab}
              stepId={stepId}
              position={position}
              onStep={(direction) => {
                if (!position) return
                const next = position.index + direction
                const id = orderedIds[next]
                if (!id) return
                setAnnouncement(`Workflow ${next + 1} of ${position.total}`)
                setCurrentId(id)
                setStepId(null)
              }}
              actions={{
                onTabChange: setTab,
                onStepChange: setStepId,
                onClose: () => onOpenChange(false),
                onRun: handleRun,
                onPausedToggle: (item) => onToggle(item, !item.enabled),
                onRotate: handleRotate,
                onToggleStep: handleToggleStep,
                onOpenInEditor,
                onDuplicate,
                onDelete,
                onSave: (item, values) => {
                  patch(item.id, {
                    environment: values.environment,
                    alertOnFailure: values.alertOnFailure,
                  })
                  onSubmit(values, item)
                },
              }}
            />
          ) : (
            <SheetTitle className="sr-only">Workflow</SheetTitle>
          )}
          <span role="status" className="sr-only">
            {announcement}
          </span>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}
