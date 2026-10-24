/**
 * Preview: a sample of what one step handed on, as items or as its fields.
 * Personal data stays masked until the reader unmasks it; New sample draws
 * another set from the step's recent runs.
 */
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { type WorkflowItem } from "./data"
import { TOAST_ERROR_ICON, TOAST_SUCCESS_ICON, UI_ICONS } from "./icons"
import {
  COLUMN_TYPES,
  formatClock,
  formatCount,
  formatSample,
  maskSample,
  plural,
  PREVIEW_ROWS,
  REFERENCE_MS,
  sampleGapOf,
  sampleRows,
  STEP_KINDS,
  type ColumnSpec,
  type SampleRow,
  type WorkflowDetails,
  type WorkflowStep,
} from "./sheet-data"
import { ColumnTypeGlyph } from "./value-faces"

type View = "rows" | "schema"

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "rows", label: "Items" },
  { value: "schema", label: "Fields" },
]

const RESAMPLE_MS = 600

function copySample(step: WorkflowStep, rows: SampleRow[]) {
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
  navigator.clipboard.writeText(JSON.stringify(rows, null, 2)).then(
    () =>
      toast.success("Sample copied", {
        icon: TOAST_SUCCESS_ICON,
        description: `${plural(rows.length, "item")} from ${step.key} as JSON.`,
        closeButton: true,
      }),
    failed
  )
}

/** One sample value, masked while personal data stays hidden. */
function SampleCell({
  spec,
  row,
  masked,
}: {
  spec: ColumnSpec
  row: SampleRow
  masked: boolean
}) {
  const value = row[spec.name]
  const text = formatSample(spec, value, row)
  if (spec.pii && masked) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground [&_svg:not([class*=size-])]:size-3">
        {UI_ICONS.lock}
        {maskSample(text)}
      </span>
    )
  }
  return (
    <span
      className={cn(
        (value === null || spec.type === "boolean") && "text-muted-foreground"
      )}
    >
      {text}
    </span>
  )
}

function StepPicker({
  steps,
  value,
  onChange,
}: {
  steps: WorkflowStep[]
  value: WorkflowStep
  onChange: (id: string) => void
}) {
  const items = steps.map((step) => ({ value: step.id, label: step.key }))
  return (
    <Select
      value={value.id}
      items={items}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
    >
      <SelectTrigger className="w-full" aria-label="Step to preview">
        <SelectValue>
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 text-muted-foreground">
              {STEP_KINDS[value.kind].icon}
            </span>
            <span className="truncate font-mono">{value.key}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {steps.map((step) => (
            <SelectItem key={step.id} value={step.id}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0 text-muted-foreground">
                  {STEP_KINDS[step.kind].icon}
                </span>
                <span className="truncate font-mono">{step.key}</span>
                {step.enabled ? null : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Off
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function RowsTable({
  step,
  rows,
  masked,
  loading,
}: {
  step: WorkflowStep
  rows: SampleRow[]
  masked: boolean
  loading: boolean
}) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          {step.columns.map((spec) => (
            <TableHead key={spec.name} className="ps-3 first:ps-4 last:pe-4">
              <span className="flex items-center gap-1.5 font-mono font-medium">
                <ColumnTypeGlyph type={spec.type} />
                {spec.name}
                {spec.pii ? (
                  <span className="flex text-muted-foreground [&_svg:not([class*=size-])]:size-3">
                    {UI_ICONS.lock}
                  </span>
                ) : null}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            {step.columns.map((spec) => (
              <TableCell
                key={spec.name}
                className={cn(
                  "ps-3 font-mono whitespace-nowrap tabular-nums first:ps-4 last:pe-4",
                  (spec.type === "money" || spec.type === "number") &&
                    "text-right"
                )}
              >
                {loading ? (
                  <Skeleton className="h-3.5 w-20" />
                ) : (
                  <SampleCell spec={spec} row={row} masked={masked} />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SchemaTable({
  step,
  first,
  masked,
}: {
  step: WorkflowStep
  first: SampleRow | undefined
  masked: boolean
}) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="ps-4">Field</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="pe-4">Sample</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {step.columns.map((spec) => (
          <TableRow key={spec.name}>
            <TableCell className="ps-4">
              <span className="flex items-center gap-1.5">
                <span className="font-mono font-medium">{spec.name}</span>
                {spec.key ? <Badge variant="outline">Key</Badge> : null}
                {spec.pii ? <Badge variant="outline">PII</Badge> : null}
              </span>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ColumnTypeGlyph type={spec.type} />
                {COLUMN_TYPES[spec.type].label}
              </span>
            </TableCell>
            <TableCell className="max-w-48 truncate pe-4 font-mono text-muted-foreground">
              {!first ? (
                "Not run yet"
              ) : (
                <SampleCell spec={spec} row={first} masked={masked} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Keyed by step id: a new pick starts with a fresh, masked sample. */
function StepPreview({
  workflow,
  details,
  step,
  onEnable,
  onRetry,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  step: WorkflowStep
  onEnable: (step: WorkflowStep) => void
  onRetry: () => void
}) {
  const [view, setView] = useState<View>("rows")
  const [masked, setMasked] = useState(true)
  const [draw, setDraw] = useState(0)
  const [resampling, setResampling] = useState(false)
  const gap = sampleGapOf(workflow)
  const rows = useMemo(() => sampleRows(step, gap, draw), [step, gap, draw])
  const hasPii = step.columns.some((column) => column.pii)
  const lastRun = details.runs.find((run) => run.outcome !== "failed")

  useEffect(() => {
    if (!resampling) return
    const timer = window.setTimeout(() => {
      setDraw((current) => current + 1)
      setResampling(false)
    }, RESAMPLE_MS)
    return () => window.clearTimeout(timer)
  }, [resampling])

  return (
    <>
      {!step.enabled ? (
        <Alert variant="info">
          {UI_ICONS.pause}
          <AlertTitle>Step Off</AlertTitle>
          <AlertAction>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onEnable(step)}
            >
              Turn On
            </Button>
          </AlertAction>
          <AlertDescription>
            Every run skips it. This is what it returned when it last ran.
          </AlertDescription>
        </Alert>
      ) : step.failure ? (
        <Alert variant="warning">
          {UI_ICONS.alert}
          <AlertTitle>Failed Last Run</AlertTitle>
          <AlertAction>
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </AlertAction>
          <AlertDescription>
            {step.failure}. The sample is from the last good run.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="min-w-0 gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <ToggleGroup
            multiple={false}
            value={[view]}
            onValueChange={(value: string[]) => {
              const next = VIEW_OPTIONS.find((item) => item.value === value[0])
              if (next) setView(next.value)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Preview as"
          >
            {VIEW_OPTIONS.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                className="text-muted-foreground data-pressed:text-foreground"
              >
                {item.value === "rows" ? UI_ICONS.rows : UI_ICONS.columns}
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-3">
            {hasPii ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="workflow-sheet-mask"
                  size="sm"
                  checked={masked}
                  onCheckedChange={setMasked}
                />
                <Label
                  htmlFor="workflow-sheet-mask"
                  className="text-xs leading-none"
                >
                  Mask PII
                </Label>
              </div>
            ) : null}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Copy the sample as JSON"
                      onClick={() => copySample(step, rows)}
                    />
                  }
                >
                  {UI_ICONS.code}
                </TooltipTrigger>
                <TooltipContent>Copy JSON</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Draw a new sample"
                      disabled={resampling}
                      onClick={() => setResampling(true)}
                    />
                  }
                >
                  {UI_ICONS.sync}
                </TooltipTrigger>
                <TooltipContent>New sample</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          {view === "rows" ? (
            <RowsTable
              step={step}
              rows={rows}
              masked={masked}
              loading={resampling}
            />
          ) : (
            <SchemaTable step={step} first={rows[0]} masked={masked} />
          )}
        </CardContent>
        <CardFooter className="flex-row flex-wrap items-center gap-x-2 gap-y-1 border-t px-4 py-2">
          <p
            aria-live="polite"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {view === "rows"
              ? `${PREVIEW_ROWS} of ${formatCount(workflow.runsSucceeded * details.itemsPerRun)} items, sampled ${formatClock(REFERENCE_MS)} UTC`
              : `${plural(step.columns.length, "field")}${lastRun ? `, from ${lastRun.id}` : ""}`}
          </p>
          {hasPii && !masked ? (
            <p className="text-xs text-warning">
              Unmasked reads are logged to the audit trail.
            </p>
          ) : null}
        </CardFooter>
      </Card>
    </>
  )
}

export function PreviewTab({
  workflow,
  details,
  stepId,
  onStepChange,
  onEnable,
  onRetry,
  onRun,
}: {
  workflow: WorkflowItem
  details: WorkflowDetails
  stepId: string | null
  onStepChange: (id: string) => void
  onEnable: (step: WorkflowStep) => void
  onRetry: () => void
  onRun: () => void
}) {
  const step =
    details.steps.find((item) => item.id === stepId) ??
    details.steps.find((item) => item.enabled && item.kind !== "trigger") ??
    details.steps[0]

  if (!step) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">{UI_ICONS.workflow}</EmptyMedia>
          <EmptyTitle>No Steps Yet</EmptyTitle>
          <EmptyDescription>
            Add steps in the Workflow Editor to preview what they return.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <StepPicker steps={details.steps} value={step} onChange={onStepChange} />
      {details.runs.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">{UI_ICONS.rows}</EmptyMedia>
            <EmptyTitle>No Output Yet</EmptyTitle>
            <EmptyDescription>
              Run the workflow once to sample what each step returns.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              disabled={!workflow.enabled}
              onClick={onRun}
            >
              {UI_ICONS.sync}
              Run Now
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <StepPreview
          key={step.id}
          workflow={workflow}
          details={details}
          step={step}
          onEnable={onEnable}
          onRetry={onRetry}
        />
      )}
    </>
  )
}
