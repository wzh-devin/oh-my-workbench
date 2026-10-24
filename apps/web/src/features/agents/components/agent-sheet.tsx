"use client"

/**
 * The agent sheet: one agent's drawer with
 * Overview, Tools, Preview and Settings tabs; stepping walks the triage order.
 * Create opens the same drawer on the Settings form alone. The list record
 * lives in the workspace store; tools, sessions and the API key live here.
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

import {
  AgentFormFields,
  sameDraft,
  toSheetFormValues,
} from "./agent-form-fields"
import { AgentOverviewTab } from "./agent-overview-tab"
import {
  agentFormSchema,
  EMPTY_AGENT_SHEET_FORM,
  type AgentSheetFormValues,
} from "./agent-schema"
import { AgentTest, checksForAgent } from "./agent-test"
import { type AgentRecord, type AgentStatus } from "./data"
import { TOAST_ERROR_ICON, TOAST_SUCCESS_ICON, UI_ICONS } from "./icons"
import { PreviewTab } from "./preview-tab"
import {
  detailsOf,
  enabledOf,
  healthOf,
  plural,
  REFERENCE_MS,
  rotatedHint,
  testSessionOf,
  triageOrder,
  withPatch,
  type AgentDetails,
  type AgentSession,
  type AgentTool,
  type DetailPatch,
  type SheetTab,
} from "./sheet-data"
import { ToolsTab } from "./tools-tab"
import {
  DotSeparator,
  EnvironmentFace,
  HealthFace,
  ModelLogo,
} from "./value-faces"

export type AgentSheetMode = "create" | "view" | "edit"

export type AgentSheetState = {
  open: boolean
  mode: AgentSheetMode
  agent: AgentRecord | null
}

const SHEET_TABS: { value: SheetTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "tools", label: "Tools" },
  { value: "preview", label: "Preview" },
  { value: "settings", label: "Settings" },
]

const FORM_ID = "agent-sheet-form"
const RUN_MS = 1500

/** The floating inset shell: a full-height card held off every edge. The
 *  side-scoped copies outrank the sheet's own `data-[side=right]` sizing. */
const SHEET_SHELL =
  "inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(var(--sheet-width),calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 outline-none data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-[calc(100svh-2rem)] data-[side=right]:w-[min(var(--sheet-width),calc(100vw-2rem))] data-[side=right]:sm:max-w-none"

/** Pinned under the scrolling body; px-5 keeps it on the band's spine. */
const SHEET_FOOTER =
  "flex shrink-0 items-center gap-2 border-t bg-muted px-5 py-3"

/** Only the body scrolls; the header band, tabs and footer stay put. The
 *  40px scroll padding is the block's, so focus never lands under a fade. */
const SHEET_BODY =
  "scroll-fade-y min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:scroll-py-10"

/** The values a save writes: the name trimmed, the budget as the record
 *  will read it back ("250.50" saves as 250.5), so a saved form is clean. */
function cleanDraft(draft: AgentSheetFormValues): AgentSheetFormValues {
  return {
    ...draft,
    name: draft.name.trim(),
    monthlyBudget: String(Number(draft.monthlyBudget.trim())),
  }
}

type SheetActions = {
  onTabChange: (tab: SheetTab) => void
  onToolChange: (toolId: string) => void
  onClose: () => void
  onRun: (agent: AgentRecord) => void
  onPausedToggle: (agent: AgentRecord) => void
  onRotate: (agent: AgentRecord) => void
  onToggleTool: (agent: AgentRecord, tool: AgentTool, enabled: boolean) => void
  onOpenInBuilder: (agent: AgentRecord) => void
  onDuplicate: (agent: AgentRecord) => void
  onDelete: (agent: AgentRecord) => void
  onSave: (agent: AgentRecord, values: AgentSheetFormValues) => void
}

/** Mono id with an inline copy swap; a refused clipboard says so. */
function AgentIdChip({ id }: { id: string }) {
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
              aria-label={copied ? "Agent ID copied" : "Copy agent ID"}
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

function AgentSheetView({
  agent,
  details,
  running,
  agents,
  tab,
  toolId,
  position,
  onStep,
  actions,
}: {
  agent: AgentRecord
  details: AgentDetails
  running: boolean
  agents: AgentRecord[]
  tab: SheetTab
  toolId: string | null
  position: { index: number; total: number } | null
  onStep: (direction: 1 | -1) => void
  actions: SheetActions
}) {
  const source = toSheetFormValues(agent, details)
  const schema = useMemo(
    () => agentFormSchema(agents, agent.id),
    [agents, agent.id]
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: source,
  })
  const dirty = form.formState.isDirty

  // A save or a status change moves the record outside the form: a clean form follows it.
  const seenSource = useRef(source)
  useEffect(() => {
    if (sameDraft(seenSource.current, source)) return
    seenSource.current = source
    if (!dirty) form.reset(source)
  })

  const health = healthOf(agent, running)
  const paused = agent.status === "Paused"
  const enabled = enabledOf(details)
  const checks = useMemo(() => checksForAgent(agent, details), [agent, details])

  function handleSave(values: AgentSheetFormValues) {
    if (!dirty) return
    const clean = cleanDraft(values)
    // The form holds the saved values, so it reads pristine once the record updates.
    form.reset(clean)
    actions.onSave(agent, clean)
  }

  return (
    <>
      {/* Header band */}
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <AgentIdChip id={agent.id} />
          <div className="flex shrink-0 items-center gap-1">
            {position ? (
              <ButtonGroup aria-label="Agents">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Previous agent"
                        disabled={position.index === 0 || dirty}
                        onClick={() => onStep(-1)}
                      />
                    }
                  >
                    {UI_ICONS.previous}
                  </TooltipTrigger>
                  <TooltipContent>Previous agent</TooltipContent>
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
                        aria-label="Next agent"
                        disabled={
                          position.index === position.total - 1 || dirty
                        }
                        onClick={() => onStep(1)}
                      />
                    }
                  >
                    {UI_ICONS.next}
                  </TooltipTrigger>
                  <TooltipContent>Next agent</TooltipContent>
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
                    aria-label="More agent actions"
                  />
                }
              >
                {UI_ICONS.more}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="tabular-nums">
                    {agent.id}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => actions.onOpenInBuilder(agent)}
                  >
                    {UI_ICONS.editor}
                    Open in Builder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onRotate(agent)}>
                    {UI_ICONS.key}
                    Rotate API Key
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onDuplicate(agent)}>
                    {UI_ICONS.copy}
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.onDelete(agent)}
                  >
                    {UI_ICONS.trash}
                    Delete Agent
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
          <ModelLogo model={agent.model} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SheetTitle className="min-w-0 truncate">{agent.name}</SheetTitle>
              <HealthFace health={health} />
            </div>
            <SheetDescription>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span>{agent.model}</span>
                <DotSeparator />
                <EnvironmentFace environment={details.environment} />
                <DotSeparator />
                <span className="tabular-nums">
                  {enabled.length} of {plural(details.tools.length, "tool")}{" "}
                  enabled
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
            disabled={paused || running}
            onClick={() => actions.onRun(agent)}
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
            {running ? "Running" : "Run Test"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actions.onPausedToggle(agent)}
          >
            {paused ? UI_ICONS.resume : UI_ICONS.pause}
            {paused ? "Resume" : "Pause"}
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
                {item.value === "tools" ? (
                  <Badge
                    variant="outline"
                    radius="full"
                    className="tabular-nums"
                  >
                    {details.tools.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className={SHEET_BODY}>
          <div className="flex flex-col gap-4 px-5 py-4">
            <TabsContent value="overview" className="flex flex-col gap-4">
              <AgentOverviewTab
                agent={agent}
                details={details}
                onRun={() => actions.onRun(agent)}
                onResume={() => actions.onPausedToggle(agent)}
                onRotate={() => actions.onRotate(agent)}
                onShowTools={() => actions.onTabChange("tools")}
              />
            </TabsContent>
            <TabsContent value="tools" className="flex flex-col gap-3">
              <ToolsTab
                agent={agent}
                details={details}
                onToggle={(tool, next) =>
                  actions.onToggleTool(agent, tool, next)
                }
                onPreview={(tool) => {
                  actions.onToolChange(tool.id)
                  actions.onTabChange("preview")
                }}
                onRetry={() => actions.onRun(agent)}
                onOpenInBuilder={() => actions.onOpenInBuilder(agent)}
              />
            </TabsContent>
            <TabsContent value="preview" className="flex flex-col gap-3">
              <PreviewTab
                agent={agent}
                details={details}
                toolId={toolId}
                onToolChange={actions.onToolChange}
                onEnable={(tool) => actions.onToggleTool(agent, tool, true)}
                onRetry={() => actions.onRun(agent)}
                onRun={() => actions.onRun(agent)}
              />
            </TabsContent>
            <TabsContent value="settings" className="flex flex-col gap-4">
              <form
                id={FORM_ID}
                noValidate
                onSubmit={form.handleSubmit(handleSave)}
                className="flex flex-col gap-4"
              >
                <AgentFormFields
                  idPrefix="agent-sheet-edit"
                  control={form.control}
                />
              </form>
              <AgentTest key={agent.id} checks={checks} />
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
function NewAgentView({
  agents,
  onClose,
  onCreate,
}: {
  agents: AgentRecord[]
  onClose: () => void
  onCreate: (values: AgentSheetFormValues) => void
}) {
  const schema = useMemo(() => agentFormSchema(agents), [agents])
  // A first try shows every error at once; nothing is created until clean.
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_AGENT_SHEET_FORM,
  })

  function handleCreate(values: AgentSheetFormValues) {
    onCreate(cleanDraft(values))
  }

  return (
    <>
      <div className="flex shrink-0 flex-col border-b px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            New agent
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
            {UI_ICONS.agent}
          </IconTile>
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="min-w-0 truncate">New Agent</SheetTitle>
            <SheetDescription>
              Name it and pick its model. Tools and instructions are added in
              the Builder.
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
          <AgentFormFields idPrefix="agent-sheet-new" control={form.control} />
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
          Create Agent
        </Button>
      </div>
    </>
  )
}

export function AgentSheet({
  state,
  agents,
  onOpenChange,
  onSubmit,
  onStatusChange,
  onRunComplete,
  onOpenInBuilder,
  onDuplicate,
  onDelete,
}: {
  state: AgentSheetState
  agents: AgentRecord[]
  onOpenChange: (open: boolean) => void
  /** Saves an edit, or creates and returns the new record. */
  onSubmit: (
    values: AgentSheetFormValues,
    agent: AgentRecord | null
  ) => AgentRecord | void
  /** Pause and Resume. */
  onStatusChange: (agent: AgentRecord, status: AgentStatus) => void
  onRunComplete: (agent: AgentRecord, session: AgentSession) => void
  onOpenInBuilder: (agent: AgentRecord) => void
  /** Makes the copy and returns it. */
  onDuplicate: (agent: AgentRecord) => AgentRecord | null | void
  onDelete: (agent: AgentRecord) => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [currentId, setCurrentId] = useState<string | null>(
    state.agent?.id ?? null
  )
  const [tab, setTab] = useState<SheetTab>("overview")
  const [toolId, setToolId] = useState<string | null>(null)
  const [patches, setPatches] = useState<Record<string, DetailPatch>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  // What Pause interrupted, so Resume puts it back: a draft stays a draft and
  // a failing agent keeps failing until a test run passes.
  const [pausedFrom, setPausedFrom] = useState<Record<string, AgentStatus>>({})
  // The latest list, for a test run that finishes after its agent is deleted.
  const agentsRef = useRef(agents)
  // Lives outside the keyed view, so a step's announcement survives the remount.
  const [announcement, setAnnouncement] = useState("")
  const timers = useRef<number[]>([])
  // Above every seeded session id, so a test session is always the newest.
  const sessionSeq = useRef(95_000)

  // A new request from the page (open, a row's Edit, a duplicate) starts the
  // drawer over on that record and the tab its mode asks for.
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    const fresh =
      state.open &&
      (!seenState.open ||
        state.mode !== seenState.mode ||
        state.agent?.id !== seenState.agent?.id)
    if (fresh) {
      setCurrentId(state.agent?.id ?? null)
      setTab(state.mode === "edit" ? "settings" : "overview")
      setToolId(null)
      setAnnouncement("")
    }
  }

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

  // Previous and Next walk the triage order: failing first, healthy last.
  const orderedIds = useMemo(
    () => triageOrder(agents).map((agent) => agent.id),
    [agents]
  )
  const agent =
    state.mode === "create"
      ? null
      : (agents.find((item) => item.id === currentId) ?? null)
  const index = agent ? orderedIds.indexOf(agent.id) : -1
  const position = index >= 0 ? { index, total: orderedIds.length } : null

  function detailsFor(item: AgentRecord): AgentDetails {
    const details = withPatch(detailsOf(item), patches[item.id])
    // A tool failure follows the live status, as the seed does: patched tools
    // keep theirs only while the agent is still in Error.
    if (item.status === "Error" || !details.tools.some((tool) => tool.failure))
      return details
    return {
      ...details,
      tools: details.tools.map((tool) => ({ ...tool, failure: undefined })),
    }
  }

  const details = agent ? detailsFor(agent) : null

  function patch(id: string, next: DetailPatch) {
    setPatches((current) => ({
      ...current,
      [id]: { ...current[id], ...next },
    }))
  }

  function handleRun(item: AgentRecord) {
    if (running[item.id] || item.status === "Paused") return
    setRunning((current) => ({ ...current, [item.id]: true }))
    const base = detailsOf(item)
    const timer = window.setTimeout(() => {
      setRunning((state) => ({ ...state, [item.id]: false }))
      // Deleted mid-run: nothing is left to record the session on.
      if (!agentsRef.current.some((entry) => entry.id === item.id)) return
      const session = testSessionOf(base, ++sessionSeq.current, CURRENT_USER.id)
      // Read the patch as it stands now: a tool may have been switched mid-run.
      setPatches((current) => {
        const own = current[item.id] ?? {}
        return {
          ...current,
          [item.id]: {
            ...own,
            // A passing test clears the failure it was started for.
            tools: (own.tools ?? base.tools).map((tool) => ({
              ...tool,
              failure: undefined,
              added: tool.enabled ? false : tool.added,
            })),
            manualSessions: [session, ...(own.manualSessions ?? [])],
          },
        }
      })
      onRunComplete(item, session)
    }, RUN_MS)
    timers.current.push(timer)
  }

  function handlePausedToggle(item: AgentRecord) {
    if (item.status === "Paused") {
      // A seeded pause has no earlier status on record: it resumes Live.
      onStatusChange(item, pausedFrom[item.id] ?? "Live")
      return
    }
    setPausedFrom((current) => ({ ...current, [item.id]: item.status }))
    onStatusChange(item, "Paused")
  }

  /** The copy takes what the drawer changed on its source, tools fresh. */
  function handleDuplicate(item: AgentRecord) {
    const source = detailsFor(item)
    const copy = onDuplicate(item)
    if (!copy) return
    patch(copy.id, {
      environment: source.environment,
      alertOnFailure: source.alertOnFailure,
      tools: source.tools.map((tool, index) => ({
        ...tool,
        id: `${copy.id}-tool-${index + 1}`,
        added: true,
        failure: undefined,
      })),
    })
  }

  function handleRotate(item: AgentRecord) {
    const current = detailsFor(item)
    const hint = rotatedHint(current.secret.hint, sessionSeq.current++)
    patch(item.id, {
      secret: {
        hint,
        rotatedAt: REFERENCE_MS,
        rotatedBy: CURRENT_USER.id,
      },
    })
    toast.success("API key rotated", {
      icon: TOAST_SUCCESS_ICON,
      description: `${item.name} now signs in with ${hint}. The old key stops working now.`,
      closeButton: true,
    })
  }

  function handleToggleTool(
    item: AgentRecord,
    tool: AgentTool,
    enabled: boolean
  ) {
    const current = detailsFor(item)
    patch(item.id, {
      tools: current.tools.map((entry) =>
        entry.id === tool.id ? { ...entry, enabled } : entry
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
            <NewAgentView
              agents={agents}
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
          ) : agent && details ? (
            <AgentSheetView
              key={agent.id}
              agent={agent}
              details={details}
              running={running[agent.id] ?? false}
              agents={agents}
              tab={tab}
              toolId={toolId}
              position={position}
              onStep={(direction) => {
                if (!position) return
                const next = position.index + direction
                const id = orderedIds[next]
                if (!id) return
                setAnnouncement(`Agent ${next + 1} of ${position.total}`)
                setCurrentId(id)
                setToolId(null)
              }}
              actions={{
                onTabChange: setTab,
                onToolChange: setToolId,
                onClose: () => onOpenChange(false),
                onRun: handleRun,
                onPausedToggle: handlePausedToggle,
                onRotate: handleRotate,
                onToggleTool: handleToggleTool,
                onOpenInBuilder,
                onDuplicate: handleDuplicate,
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
            <SheetTitle className="sr-only">Agent</SheetTitle>
          )}
          <span role="status" className="sr-only">
            {announcement}
          </span>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}
