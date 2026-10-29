"use client"

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import {
  useNodesInitialized,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type XYPosition,
} from "@xyflow/react"
import {
  Controller,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form"
import { toast } from "sonner"
import { cn } from "cn"

import {
  InspectorDock,
  settledCanvasWidth,
} from "@/components/shared/inspector-dock"
import { useHeldWhileClosing } from "@/hooks/use-held-while-closing"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { Spinner } from "@/components/ui/spinner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  BRANCH_PATHS,
  isPreferredPath,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  createStep,
  KIND_LABEL,
  STATUS_BADGE,
  STATUS_ICON,
  STATUS_LABEL,
  STEP_CATEGORIES,
  STEP_LIBRARY,
  STEP_OWNERS,
  TOAST_SUCCESS_ICON,
  WORKFLOW,
  type StepCategory,
  type StepNodeData,
  type StepNodeType,
  type StepTemplate,
} from "./data"
import { stepDefaultValues, stepSchema, type StepValues } from "./step-schema"
import { useTestRun, type RunState } from "./test-run"
import {
  ArrowRightIcon,
  InfoIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

// A select's list renders in a portal, outside the panel. React Flow's `nokey`
// keeps a key pressed in the open list (Backspace deletes the selection) from
// reaching the canvas behind it.
const LIST_KEYS = "nokey"

type InspectTarget = { nodeId: string; mode: "view" | "edit" } | null

/** The panel's tabs: the step itself, how it ran, what it logged. */
export type PanelTab = "build" | "status" | "logs"

type StepActionsApi = {
  inspect: (nodeId: string, mode: "view" | "edit", seed?: StepValues) => void
  /** Opens a step's logs, every step's entries listed. */
  showLogs: (nodeId: string) => void
  /** The step a run goes on to from this one, if any. */
  nextOf: (nodeId: string) => string | undefined
  /** Moves the panel, and the selection, on to the next step. */
  goToNext: (nodeId: string) => void
  tab: PanelTab
  setTab: (tab: PanelTab) => void
  logScope: "step" | "all"
  setLogScope: (scope: "step" | "all") => void
  addStep: () => void
  /**
   * Adds a step from the library with its top left corner at `position`.
   * `dropped` says the user put it there by hand. Returns the corner the step
   * took, which is lower when it was not dropped and had to find a free lane,
   * or nothing on a locked canvas.
   */
  addFromLibrary: (
    template: StepTemplate,
    position: XYPosition,
    dropped: boolean
  ) => XYPosition | undefined
  addAfter: (nodeId: string, template?: StepTemplate) => void
  duplicate: (nodeId: string) => void
  remove: (nodeId: string) => void
  close: () => void
  /** Commits the form's values, already checked against stepSchema. */
  save: (values: StepValues) => void
  /** The step form. The provider owns it, so opening a step re-seeds it. */
  form: UseFormReturn<StepValues>
  target: InspectTarget
  data: StepNodeData | undefined
  locked: boolean
  wiring: { incoming: number; outgoing: number }
}

const StepActionsContext = createContext<StepActionsApi | null>(null)

/** Nodes reach their own actions through this; the editor owns the state. */
export function useStepActions() {
  const api = useContext(StepActionsContext)

  if (!api) {
    throw new Error("useStepActions must be used inside StepActionsProvider")
  }

  return api
}

// Inserted ids are counted, never random, so a run reproduces exactly.
let stepCount = 0

// A card is w-60, and a lane is its height plus the gap to the next one.
const CARD_WIDTH = 240
const CARD_HEIGHT = 83
const LANE = 96

/** Whether a card at x, y would cover an existing step. */
function covered(nodes: StepNodeType[], x: number, y: number) {
  return nodes.some(
    (node) =>
      Math.abs(node.position.x - x) < CARD_WIDTH &&
      Math.abs(node.position.y - y) < LANE
  )
}

/** The first lane at or below y where a card at x covers no existing step. */
function freeLane(nodes: StepNodeType[], x: number, y: number) {
  let lane = y

  while (covered(nodes, x, lane)) {
    lane += LANE
  }

  return lane
}

interface StepActionsProviderProps {
  locked: boolean
  /**
   * Runs before an edit commits, so history records the graph it replaces.
   * Returns the version that edit mints.
   */
  onBeforeEdit: () => number
  /** Raises a toast whose Undo reverses that one edit and no other. */
  offerUndo: (title: string, description: string, edit: number) => void
  nodes: StepNodeType[]
  edges: Edge[]
  setNodes: React.Dispatch<React.SetStateAction<StepNodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  children: React.ReactNode
}

export function StepActionsProvider({
  locked,
  onBeforeEdit,
  offerUndo,
  nodes,
  edges,
  setNodes,
  setEdges,
  children,
}: StepActionsProviderProps) {
  const { deleteElements, getViewport, setViewport } = useReactFlow()
  const store = useStoreApi()
  const [target, setTarget] = useState<InspectTarget>(null)
  const [tab, setTab] = useState<PanelTab>("build")
  const [logScope, setLogScope] = useState<"step" | "all">("step")

  // A step can leave by a route the panel never hears about, so the panel
  // checks the graph rather than trusting its own close handler. Adjusting
  // state while rendering (not in an effect) clears it before anything
  // paints, and it stays cleared: an undo that restores the step does not
  // reopen the panel.
  if (target && !nodes.some((node) => node.id === target.nodeId)) {
    setTarget(null)
  }
  const form = useForm<StepValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: stepDefaultValues,
  })

  // A step created this tick is not in state yet, so its values come in
  // through seed rather than a lookup that would return nothing. Every way
  // into the form comes through here, so it opens on the step's own values,
  // with no message left from the last one.
  function inspect(nodeId: string, mode: "view" | "edit", seed?: StepValues) {
    const data = nodes.find((node) => node.id === nodeId)?.data

    form.reset(
      seed ?? {
        title: data?.title ?? "",
        detail: data?.detail ?? "",
        category: data?.category ?? "action",
        ownerId: data?.owner.id ?? STEP_OWNERS[0].id,
      }
    )
    setTarget({ nodeId, mode: locked ? "view" : mode })

    // The form lives on Build; a step opened only to read keeps the tab the
    // panel is on, so Next step can walk a run's logs step by step.
    if (mode === "edit" && !locked) {
      setTab("build")
    }
  }

  function showLogs(nodeId: string) {
    inspect(nodeId, "view")
    setTab("logs")
    setLogScope("all")
  }

  // A branch goes on by its True path, as a test run does.
  function nextOf(nodeId: string) {
    const out = edges.filter(
      (edge) =>
        edge.source === nodeId && nodes.some((node) => node.id === edge.target)
    )

    return (out.find((edge) => isPreferredPath(edge.label)) ?? out[0])?.target
  }

  /**
   * Brings a step on screen if it is not, centred, at the zoom the view has.
   * Measured against the width the canvas keeps once the dock has settled,
   * so a step the opening panel is about to cover counts as hidden.
   */
  function reveal(position: XYPosition) {
    const canvas = store.getState().domNode

    if (!canvas) {
      return
    }

    const width = settledCanvasWidth(canvas) ?? canvas.clientWidth
    const height = canvas.clientHeight
    const { x, y, zoom } = getViewport()
    const left = position.x * zoom + x
    const top = position.y * zoom + y
    const visible =
      left >= 0 &&
      top >= 0 &&
      left + CARD_WIDTH * zoom <= width &&
      top + CARD_HEIGHT * zoom <= height

    if (!visible) {
      const still = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches

      void setViewport(
        {
          x: Math.round(width / 2 - (position.x + CARD_WIDTH / 2) * zoom),
          y: Math.round(height / 2 - (position.y + CARD_HEIGHT / 2) * zoom),
          zoom,
        },
        { duration: still ? 0 : 300 }
      )
    }
  }

  // The step the panel opens on is brought out from under it, once per step:
  // run after the commit, when the dock already says it is opening.
  const revealed = useRef<string | null>(null)
  const inspected = target?.nodeId ?? null
  const inspectedAt = nodes.find((node) => node.id === inspected)?.position

  useEffect(() => {
    if (revealed.current === inspected) {
      return
    }

    revealed.current = inspected

    if (inspectedAt) {
      reveal(inspectedAt)
    }
    // Keyed on the step alone: a drag of the open step must not pull the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspected])

  function select(nodeId: string) {
    setNodes((current) =>
      current.map((node) =>
        node.selected !== (node.id === nodeId)
          ? { ...node, selected: node.id === nodeId }
          : node
      )
    )
  }

  function goToNext(nodeId: string) {
    const next = nextOf(nodeId)

    if (next) {
      inspect(next, "view")
      select(next)
    }
  }

  function connect(sourceId: string, targetId: string, label?: string) {
    setEdges((current) => [
      ...current,
      {
        id: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: "labeled",
        ...(label ? { label } : {}),
      },
    ])
  }

  // A branch has two ways out; a step added after one takes the way still
  // free, so the canvas reads which path it sits on.
  function freePath(sourceId: string) {
    const source = nodes.find((node) => node.id === sourceId)

    if (source?.data.kind !== "condition") {
      return undefined
    }

    const used = new Set(
      edges
        .filter((edge) => edge.source === sourceId)
        .map((edge) => String(edge.label ?? "").toLowerCase())
    )

    return BRANCH_PATHS.find((label) => !used.has(label.toLowerCase()))
  }

  // A locked canvas is read only, whichever surface asks for the edit.
  function addAfter(nodeId: string, template?: StepTemplate) {
    if (locked) {
      return
    }

    const source = nodes.find((node) => node.id === nodeId)

    if (!source) {
      return
    }

    onBeforeEdit()
    stepCount += 1
    const stepId = `${nodeId}_step_${stepCount}`
    // One column on and one lane down. When a step already sits there, the
    // source's own row is tried, then on down past whatever is in the way: a
    // second insert never hides the first, and the card stays near its source
    // instead of dropping to the foot of the canvas.
    const x = source.position.x + 300
    const below = source.position.y + LANE
    const step = createStep(
      stepId,
      {
        x,
        y:
          covered(nodes, x, below) && !covered(nodes, x, source.position.y)
            ? source.position.y
            : freeLane(nodes, x, below),
      },
      template
    )

    setNodes((current) => [
      ...current.map((node) =>
        node.selected ? { ...node, selected: false } : node
      ),
      { ...step, selected: true },
    ])
    connect(nodeId, stepId, freePath(nodeId))
    inspect(stepId, "edit", {
      title: step.data.title,
      detail: step.data.detail,
      category: step.data.category,
      ownerId: step.data.owner.id,
    })
    // The new step's form is open in the inspector, so the toast confirms the
    // wiring the insert also made rather than offering an Undo.
    toast.success("Step created", {
      description: `${step.data.title} after ${source.data.title}.`,
      icon: TOAST_SUCCESS_ICON,
    })
  }

  // Lands a lane below everything so it never covers existing work, and opens
  // straight into edit because a new step has nothing worth reading yet.
  function addStep() {
    if (locked) {
      return
    }

    const lowest = nodes.reduce((y, node) => Math.max(y, node.position.y), 0)

    onBeforeEdit()
    stepCount += 1
    const stepId = `step_${stepCount}`
    const step = createStep(stepId, { x: 0, y: lowest + 140 })

    setNodes((current) => [...current, step])
    inspect(stepId, "edit", {
      title: step.data.title,
      detail: step.data.detail,
      category: step.data.category,
      ownerId: step.data.owner.id,
    })
    toast.success("Step created", {
      description: step.data.title,
      icon: TOAST_SUCCESS_ICON,
    })
  }

  // A dropped step lands exactly where it was let go, even over another
  // card: that was the user's aim, and a drop is its own confirmation. One
  // added by a click or a key has no aim, so it steps down to a free lane,
  // and a toast says it arrived and offers the way back.
  function addFromLibrary(
    template: StepTemplate,
    position: XYPosition,
    dropped: boolean
  ) {
    if (locked) {
      return undefined
    }

    const edit = onBeforeEdit()

    stepCount += 1
    const step = createStep(
      `step_${stepCount}`,
      dropped
        ? position
        : { x: position.x, y: freeLane(nodes, position.x, position.y) },
      template
    )

    // The new step becomes the selection: the ring shows where it landed, and
    // its toolbar is the way on to editing or wiring it.
    setNodes((current) => [
      ...current.map((node) =>
        node.selected ? { ...node, selected: false } : node
      ),
      { ...step, selected: true },
    ])
    setEdges((current) =>
      current.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge
      )
    )
    // A box selection leaves the engine drawing one rectangle around whatever
    // is selected; left on, it would close over the new step and take its
    // double click.
    store.setState({ nodesSelectionActive: false })

    if (!dropped) {
      offerUndo("Step added", step.data.title, edit)
    }

    return step.position
  }

  function duplicate(nodeId: string) {
    if (locked) {
      return
    }

    const source = nodes.find((node) => node.id === nodeId)

    if (!source) {
      return
    }

    onBeforeEdit()
    stepCount += 1
    const copyId = `${nodeId}_copy_${stepCount}`

    setNodes((current) => [
      ...current,
      {
        ...source,
        id: copyId,
        // Under its source, past whatever already sits there.
        position: {
          x: source.position.x,
          y: freeLane(nodes, source.position.x, source.position.y + LANE),
        },
        selected: false,
      },
    ])
    // A floating copy is a dead end, so it arrives wired to its source.
    connect(nodeId, copyId)
    toast.success("Step duplicated", {
      description: source.data.title,
      icon: TOAST_SUCCESS_ICON,
    })
  }

  // The one removal path in the block. It clears the connected edges itself
  // and runs the confirmation the canvas installs.
  function remove(nodeId: string) {
    if (locked) {
      return
    }

    void deleteElements({ nodes: [{ id: nodeId }] })
  }

  function save(values: StepValues) {
    if (!target || locked) {
      return
    }

    const current = nodes.find((node) => node.id === target.nodeId)?.data
    // An unchanged save only closes the form, so it records no edit.
    const changed =
      !current ||
      current.title !== values.title ||
      current.detail !== values.detail ||
      current.category !== values.category ||
      current.owner.id !== values.ownerId

    if (!changed) {
      setTarget({ nodeId: target.nodeId, mode: "view" })
      return
    }

    const edit = onBeforeEdit()

    const owner =
      STEP_OWNERS.find((person) => person.id === values.ownerId) ??
      STEP_OWNERS[0]

    setNodes((current) =>
      current.map((node) =>
        node.id === target.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                title: values.title,
                detail: values.detail,
                category: values.category,
                owner,
              },
            }
          : node
      )
    )
    setTarget({ nodeId: target.nodeId, mode: "view" })
    offerUndo("Step updated", values.title, edit)
  }

  const data = target
    ? nodes.find((node) => node.id === target.nodeId)?.data
    : undefined

  // A save leaves the form in the same update, so a step whose data object is
  // swapped under an open form was restored by the history: Undo or Redo, from
  // the toast, the toolbar or the keyboard. The draft would write the undone
  // values straight back on the next Save, so the form steps back to the view.
  // An undo that does not touch this step keeps the form and its draft.
  const [shown, setShown] = useState({ nodeId: target?.nodeId, data })

  if (shown.nodeId !== target?.nodeId || shown.data !== data) {
    setShown({ nodeId: target?.nodeId, data })

    if (
      target?.mode === "edit" &&
      shown.nodeId === target.nodeId &&
      shown.data &&
      data
    ) {
      setTarget({ nodeId: target.nodeId, mode: "view" })
    }
  }

  const wiring = {
    incoming: target
      ? edges.filter((edge) => edge.target === target.nodeId).length
      : 0,
    outgoing: target
      ? edges.filter((edge) => edge.source === target.nodeId).length
      : 0,
  }

  return (
    <StepActionsContext.Provider
      value={{
        inspect,
        showLogs,
        nextOf,
        goToNext,
        tab,
        setTab,
        logScope,
        setLogScope,
        addStep,
        addFromLibrary,
        addAfter,
        duplicate,
        remove,
        close: () => setTarget(null),
        save,
        form,
        target: target && locked ? { ...target, mode: "view" } : target,
        data,
        locked,
        wiring,
      }}
    >
      {children}
    </StepActionsContext.Provider>
  )
}

/** One portrait plus a name, the shape every owner row in the panel takes. */
function OwnerLine({
  name,
  initials,
  avatar,
}: {
  name: string
  initials: string
  avatar: string
}) {
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <Avatar className="size-5">
        <AvatarImage keepMounted src={avatar} alt={name} />
        {/* The kept image holds the box while it loads or after it fails, so
            the fallback lies over it, not beside it. */}
        <AvatarFallback delay={600} className="absolute inset-0 text-[9px]">
          {initials}
        </AvatarFallback>
      </Avatar>
      {name}
    </span>
  )
}

/** The glyph beside its name, the shape both the trigger and the list take. */
function CategoryLine({ category }: { category: StepCategory }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle [&_svg]:size-4 [&_svg]:shrink-0">
      {CATEGORY_ICON[category]}
      {CATEGORY_LABEL[category]}
    </span>
  )
}

/**
 * Guidance sits behind an icon, so each field stays a label and a control.
 * The tooltip is drawn for sighted users only (the kit gives it no role and
 * ties it to nothing), so the same text also describes the button.
 */
function FieldHint({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const hintId = useId()

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="-my-1 text-muted-foreground hover:text-foreground"
              aria-label={label}
              aria-describedby={hintId}
            />
          }
        >
          <InfoIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56">
          {children}
        </TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {children}
      </span>
    </>
  )
}

/** Label left, value right: a narrow panel reads far better than stacked rows. */
function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words tabular-nums">
        {value}
      </dd>
    </div>
  )
}

// The Save button sits in the footer, outside the form, and submits it by id.
const STEP_FORM = "step-form"

/**
 * A tab's pane. It scrolls with no scrollbar and fades at the edge that has
 * more to read, as the panels beside the canvas do. Flex outranks the hidden
 * attribute an inactive tab's pane gets, so the attribute is restated.
 */
function Pane({
  value,
  className,
  children,
}: {
  value: PanelTab
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsContent
      value={value}
      className="flex min-h-0 flex-col [&[hidden]]:hidden"
    >
      <ScrollArea className="scroll-fade-y min-h-0 flex-1">
        <div className={cn("flex flex-col gap-5 p-4", className)}>
          {children}
        </div>
      </ScrollArea>
    </TabsContent>
  )
}

/** The panel contents, shared by the dock and the sheet below lg. */
function StepPanel() {
  const {
    close,
    data,
    form,
    inspect,
    locked,
    remove,
    save,
    setTab,
    tab,
    target,
    wiring,
  } = useStepActions()
  const editing = target?.mode === "edit"
  const title = useWatch({ control: form.control, name: "title" })
  const unreachable =
    Boolean(data) && data?.kind !== "trigger" && wiring.incoming === 0
  const editRef = useRef<HTMLButtonElement>(null)
  const swapping = useRef(false)

  // The footer swaps its buttons with the mode, which unmounts the one just
  // pressed. Focus follows that swap, into the form or back to Edit step,
  // instead of dropping to the page; a mode set from the canvas moves nothing.
  useEffect(() => {
    if (!swapping.current) {
      return
    }

    swapping.current = false

    if (editing) {
      form.setFocus("title")
    } else {
      editRef.current?.focus()
    }
  }, [editing, form])

  // Only a valid form gets here: an invalid submit shows each field's message
  // and moves focus to the first, and the footer keeps its buttons.
  function onSubmit(values: StepValues) {
    swapping.current = true
    save(values)
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex shrink-0 items-start gap-3 px-4 pt-3">
        <IconTile size="sm">
          {CATEGORY_ICON[data?.category ?? "action"]}
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-sm font-semibold">
            {data?.title ?? title}
          </h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">
              {KIND_LABEL[data?.kind ?? "action"]}
            </Badge>
            <span
              aria-hidden="true"
              className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <span className="truncate">{target?.nodeId}</span>
          </div>
        </div>
        <div className="-me-2 -mt-1.5 flex items-center">
          {/* The trigger starts the run, so it is the one step with no delete,
              here as on the canvas. */}
          {data && data.kind !== "trigger" ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${data.title}`}
              disabled={locked}
              onClick={() => target && remove(target.nodeId)}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close step details"
            onClick={close}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </header>
      <Tabs
        value={editing ? "build" : tab}
        onValueChange={(value) => setTab(value as PanelTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="shrink-0 border-b px-4 pt-3 pb-3">
          {/* An open form holds the panel on Build until it is saved or
              cancelled, so a draft is never left behind another tab. */}
          <TabsList className="w-full">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="status" disabled={editing}>
              Status
            </TabsTrigger>
            <TabsTrigger value="logs" disabled={editing}>
              Logs
            </TabsTrigger>
          </TabsList>
        </div>
        <Pane value="build">
          {unreachable ? (
            <Alert variant="warning">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>Nothing Routes Here</AlertTitle>
              <AlertDescription>
                Connect a step into this one or the run never reaches it.
              </AlertDescription>
            </Alert>
          ) : null}
          {editing ? (
            <TooltipProvider delay={300}>
              {/* Bound at submit, not in render: onSubmit marks the footer's
                  swap through a ref. */}
              <form
                id={STEP_FORM}
                onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
              >
                {/* reui.io sets a field label at leading-none, the Label rule
                    landing after FieldLabel's leading-snug; the kit merges
                    them the other way, so each label restates it. */}
                <FieldGroup>
                  <Controller
                    name="category"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <div className="flex items-center gap-1.5">
                          <FieldLabel
                            htmlFor="step-category"
                            className="leading-none"
                          >
                            Type
                          </FieldLabel>
                          <FieldHint label="About the type">
                            Sets the glyph on the node, so a run reads by shape
                            before anyone reads the words.
                          </FieldHint>
                        </div>
                        <Select
                          name={field.name}
                          value={field.value}
                          onValueChange={(value) =>
                            value && field.onChange(value as StepCategory)
                          }
                        >
                          <SelectTrigger
                            id="step-category"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue>
                              <CategoryLine category={field.value} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent
                            align="start"
                            alignItemWithTrigger={false}
                            className={LIST_KEYS}
                          >
                            <SelectGroup>
                              {STEP_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                  <CategoryLine category={category} />
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
                  <Controller
                    name="title"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <div className="flex items-center gap-1.5">
                          <FieldLabel
                            htmlFor="step-title"
                            className="leading-none"
                          >
                            Name
                          </FieldLabel>
                          <FieldHint label="About the name">
                            Shown on the node. Two or three words read best.
                          </FieldHint>
                        </div>
                        <Input
                          {...field}
                          id="step-title"
                          placeholder="Enter step title"
                          aria-invalid={fieldState.invalid}
                          aria-describedby={
                            fieldState.invalid ? "step-title-error" : undefined
                          }
                        />
                        {fieldState.invalid && (
                          <FieldError
                            id="step-title-error"
                            errors={[fieldState.error]}
                          />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="detail"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <div className="flex items-center gap-1.5">
                          <FieldLabel
                            htmlFor="step-detail"
                            className="leading-none"
                          >
                            Description
                          </FieldLabel>
                          <FieldHint label="About the description">
                            The second line on the node. Usually the service it
                            calls or the condition it tests.
                          </FieldHint>
                        </div>
                        <Textarea
                          {...field}
                          id="step-detail"
                          placeholder="Describe this step"
                          rows={3}
                          aria-invalid={fieldState.invalid}
                          aria-describedby={
                            fieldState.invalid ? "step-detail-error" : undefined
                          }
                        />
                        {fieldState.invalid && (
                          <FieldError
                            id="step-detail-error"
                            errors={[fieldState.error]}
                          />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="ownerId"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <div className="flex items-center gap-1.5">
                          <FieldLabel
                            htmlFor="step-owner"
                            className="leading-none"
                          >
                            Owner
                          </FieldLabel>
                          <FieldHint label="About the owner">
                            Whoever gets paged when this step fails on a live
                            run.
                          </FieldHint>
                        </div>
                        <Select
                          name={field.name}
                          value={field.value}
                          onValueChange={(value) =>
                            value && field.onChange(value)
                          }
                        >
                          {/* The trigger renders the same row as the options,
                              so the picked person keeps their portrait. */}
                          <SelectTrigger
                            id="step-owner"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue>
                              <OwnerLine
                                {...(STEP_OWNERS.find(
                                  (person) => person.id === field.value
                                ) ?? STEP_OWNERS[0])}
                              />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent
                            align="start"
                            alignItemWithTrigger={false}
                            className={LIST_KEYS}
                          >
                            <SelectGroup>
                              {STEP_OWNERS.map((person) => (
                                <SelectItem key={person.id} value={person.id}>
                                  <OwnerLine {...person} />
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
                </FieldGroup>
              </form>
            </TooltipProvider>
          ) : (
            <section
              className="flex flex-col gap-3"
              aria-labelledby="step-facts"
            >
              <h3 id="step-facts" className="text-sm font-semibold">
                Details
              </h3>
              <dl className="flex flex-col gap-3">
                <FactRow
                  label="Type"
                  value={
                    data ? <CategoryLine category={data.category} /> : null
                  }
                />
                <FactRow label="Name" value={data?.title} />
                <FactRow label="Description" value={data?.detail} />
                <FactRow
                  label="Owner"
                  value={data ? <OwnerLine {...data.owner} /> : null}
                />
                <FactRow label="Incoming" value={wiring.incoming} />
                <FactRow label="Outgoing" value={wiring.outgoing} />
              </dl>
            </section>
          )}
        </Pane>
        <Pane value="status">
          <StepStatus />
        </Pane>
        <Pane value="logs" className="gap-3">
          <StepLogs />
        </Pane>
      </Tabs>
      <footer className="shrink-0 border-t p-4">
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={STEP_FORM}>
              Save step
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              ref={editRef}
              variant="outline"
              disabled={locked}
              onClick={() => {
                if (target) {
                  swapping.current = true
                  inspect(target.nodeId, "edit")
                }
              }}
            >
              <PencilIcon aria-hidden="true" />
              Edit step
            </Button>
            <NextStepButton />
          </div>
        )}
      </footer>
    </div>
  )
}

/**
 * Walks the run on: the next step when there is one, and otherwise a pick of
 * the library, which adds that step after this one and opens it to edit.
 */
function NextStepButton() {
  const { addAfter, goToNext, locked, nextOf, target } = useStepActions()
  const next = target ? nextOf(target.nodeId) : undefined

  if (next || !target) {
    return (
      <Button onClick={() => target && goToNext(target.nodeId)}>
        Next step
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button disabled={locked} />}>
        <PlusIcon aria-hidden="true" />
        Add next step
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className={cn("w-56", LIST_KEYS)}
      >
        {STEP_LIBRARY.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
              {section.items.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => addAfter(target.nodeId, template)}
                >
                  {CATEGORY_ICON[template.category]}
                  {template.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** How the step ran: the last live run, then what test runs saw of it. */
function StepStatus() {
  const { data, target } = useStepActions()
  const { run, states, stats } = useTestRun()
  const id = target?.nodeId ?? ""
  const tested = states[id]
  const seen = stats[id]
  const dropOff =
    seen && seen.entered > 0
      ? Math.round(((seen.entered - seen.completed) / seen.entered) * 100)
      : 0

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="run-facts">
        <h3 id="run-facts" className="text-sm font-semibold">
          Last Run
        </h3>
        <dl className="flex flex-col gap-3">
          <FactRow
            label="Status"
            value={
              data ? (
                <Badge variant={STATUS_BADGE[data.status]}>
                  {STATUS_ICON[data.status]}
                  {STATUS_LABEL[data.status]}
                </Badge>
              ) : null
            }
          />
          <FactRow label="Duration" value={data?.duration} />
          <FactRow label="Run" value={WORKFLOW.lastRun} />
        </dl>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="test-facts">
        <div className="flex items-center justify-between gap-2">
          <h3 id="test-facts" className="text-sm font-semibold">
            Test Runs
          </h3>
          {tested ? <RunBadge state={tested.state} /> : null}
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {[
            { label: "Entered", value: seen?.entered ?? 0 },
            { label: "Completed", value: seen?.completed ?? 0 },
            { label: "Drop-off", value: `${dropOff}%` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-lg border p-3"
            >
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {seen
            ? `Last activity at ${seen.lastActivity}, test run #${run}.`
            : run > 0
              ? "The last test run did not reach this step."
              : "No test run has reached this step yet. Use Run once to send a test through the workflow."}
        </p>
      </section>
    </>
  )
}

/** What test runs logged, newest first: this step's lines or every step's. */
function StepLogs() {
  const { logScope, setLogScope, target } = useStepActions()
  const { logs, running, start } = useTestRun()
  const shown =
    logScope === "all"
      ? logs
      : logs.filter((entry) => entry.nodeId === target?.nodeId)

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[logScope]}
          onValueChange={(value: string[]) =>
            value[0] && setLogScope(value[0] as "step" | "all")
          }
          aria-label="Which logs to show"
        >
          <ToggleGroupItem value="step">This step</ToggleGroupItem>
          <ToggleGroupItem value="all">All steps</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground tabular-nums">
          {shown.length === 1 ? "1 entry" : `${shown.length} entries`}
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No logs yet</p>
            <p className="text-xs text-muted-foreground">
              Send a test through the workflow to see what each step does.
            </p>
          </div>
          <Button size="sm" disabled={running} onClick={start}>
            {running ? <Spinner /> : <PlayIcon aria-hidden="true" />}
            {running ? "Running" : "Run once"}
          </Button>
        </div>
      ) : (
        <ol
          className="flex flex-col divide-y rounded-lg border"
          aria-live="polite"
        >
          {shown.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  entry.tone === "success" && "bg-success",
                  entry.tone === "warning" && "bg-warning",
                  entry.tone === "info" && "bg-muted-foreground/50"
                )}
              />
              <p className="min-w-0 flex-1 text-xs leading-5 break-words">
                {entry.tone === "warning" ? (
                  <span className="sr-only">Warning: </span>
                ) : null}
                {entry.message}
              </p>
              <span className="shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">
                Run {entry.run}, {entry.time}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** A test run's state for one step, the badge the card wears too. */
export function RunBadge({ state }: { state: RunState }) {
  if (state === "running") {
    return (
      <Badge variant="info-light">
        <Spinner aria-hidden="true" role={undefined} aria-label={undefined} />
        Running
      </Badge>
    )
  }

  return state === "succeeded" ? (
    <Badge variant={STATUS_BADGE.succeeded}>
      {STATUS_ICON.succeeded}
      {STATUS_LABEL.succeeded}
    </Badge>
  ) : (
    <Badge variant={STATUS_BADGE.skipped}>
      {STATUS_ICON.skipped}
      {STATUS_LABEL.skipped}
    </Badge>
  )
}

/** The header's create action, a consumer so it can reach the provider. */
export function AddStepButton() {
  const { addStep, locked } = useStepActions()

  return (
    <Button variant="outline" disabled={locked} onClick={addStep}>
      <PlusIcon aria-hidden="true" />
      {/* In the app header on a phone the label goes sr-only, as Publish's
          does, so the breadcrumb keeps room to read. */}
      <span className="sr-only sm:not-sr-only">Add step</span>
    </Button>
  )
}

/**
 * The panel in the editor's dock (or its sheet, on a narrow screen). It holds
 * the last open context value while closing, so the dock leaves showing the
 * step it showed instead of the panel's empty state.
 */
export function StepInspectorPanel() {
  const live = useStepActions()
  const shown = useHeldWhileClosing(live)
  // Every step measured (or none left): the canvas has digested whatever
  // opened or closed the dock, and the dock may move.
  const measured = useNodesInitialized()
  const empty = useStore((state) => state.nodeLookup.size === 0)

  return (
    <InspectorDock
      label="Step details"
      title="Step Details"
      description="View or edit this workflow step."
      open={live.target !== null}
      onClose={live.close}
      ready={measured || empty}
    >
      <StepActionsContext.Provider value={shown}>
        <StepPanel />
      </StepActionsContext.Provider>
    </InspectorDock>
  )
}
