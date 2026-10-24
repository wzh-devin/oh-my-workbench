import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import {
  AlertCircleIcon,
  CheckIcon,
  CircleCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  InfoIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { SheetClose } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// The parts the settings sheets share: sheet-19 (the request inspector),
// sheet-18 (the rule editor), sheet-21 (the create form), sheet-22 (the
// connection drawer) and sheet-23 (the connection setup). Frames in those
// blocks are set on Card here.

/** Floats inside the viewport at `--sheet-width`; only the body scrolls.
 *  The base sheet pins a right sheet edge to edge through its
 *  data-[side=right] classes, so the float overrides those. */
export const SHEET_SHELL =
  "flex-col gap-0 overflow-hidden rounded-xl border p-0 outline-none data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-[calc(100svh-2rem)] data-[side=right]:w-[min(var(--sheet-width),calc(100vw-2rem))] data-[side=right]:sm:max-w-none"

/** Pinned under the scrolling body; px-5 keeps it on the band's spine. */
export const SHEET_FOOTER =
  "bg-muted flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3"

export const TAB_TRIGGER = "h-full flex-none px-0 py-2 after:-bottom-px!"

/** Ends stay focusable while disabled, so focus never drops to the page. */
export function StepButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-keyshortcuts={shortcut}
            disabled={disabled}
            focusableWhenDisabled
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1.5">
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

type Fact = { label: string; value: ReactNode }

export function FactGroup({ title, facts }: { title: string; facts: Fact[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="flex min-w-0 items-center leading-5">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function DotSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1 shrink-0 rounded-full bg-muted-foreground/40",
        className
      )}
    />
  )
}

const COPIED_MS = 2000

/** A mono value with its own copy button; only a failure toasts. */
export function CopyToken({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
    }
  }, [])

  function copy() {
    const failed = () =>
      toast.error("Copy failed", {
        closeButton: true,
        icon: (
          <AlertCircleIcon
            className="size-4 text-destructive"
            aria-hidden="true"
          />
        ),
        description: "Clipboard access was blocked.",
      })
    // Clipboard access can be refused (an iframe, an insecure origin), so both paths answer.
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      failed()
      return
    }
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
    }, failed)
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <span className="min-w-0 truncate font-mono text-xs text-foreground">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={copy}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
      </Button>
    </span>
  )
}

// ── sheet-22's header band ──

/** The ghost close in every band's top row. */
export function SheetCloseButton() {
  return (
    <SheetClose
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close"
        />
      }
    >
      <XIcon aria-hidden="true" />
    </SheetClose>
  )
}

/** Previous, "n of N", next: the band's way through the list. */
export function PositionStepper({
  label,
  index,
  total,
  disabled,
  onStep,
}: {
  /** The list's noun, as in "Previous integration" */
  label: string
  index: number
  total: number
  /** Unsaved edits hold the sheet on its record */
  disabled?: boolean
  onStep: (direction: 1 | -1) => void
}) {
  return (
    <ButtonGroup aria-label={`${label}s`}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Previous ${label}`}
              disabled={index === 0 || disabled}
              onClick={() => onStep(-1)}
            />
          }
        >
          <ChevronUpIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Previous {label}</TooltipContent>
      </Tooltip>
      <ButtonGroupText className="min-w-16 justify-center text-xs tabular-nums">
        {index + 1} of {total}
      </ButtonGroupText>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Next ${label}`}
              disabled={index >= total - 1 || disabled}
              onClick={() => onStep(1)}
            />
          }
        >
          <ChevronDownIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Next {label}</TooltipContent>
      </Tooltip>
    </ButtonGroup>
  )
}

/** A card nested in a sheet: one header line, its description moved into
 *  a hint beside the title (sheet-22's HintHeader, on Card). */
export function HintCard({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <CardHeader className="flex items-center gap-2 border-b py-2.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <CardTitle className="truncate text-sm">{title}</CardTitle>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={hint}
                  className="text-muted-foreground"
                />
              }
            >
              <InfoIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        </div>
        {action ? (
          <CardAction className="ms-auto self-center">{action}</CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="py-3">{children}</CardContent>
    </Card>
  )
}

// ── sheet-18's delete confirm ──

export function ConfirmRemoveDialog({
  open,
  onOpenChange,
  title,
  subject,
  rest,
  action,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Bold, then `rest`: "Slack stops posting run alerts." */
  subject: string | undefined
  rest: string
  action: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{subject}</span>
            {rest}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** A toast that carries Undo stays long enough to reach it by keyboard. */
export const UNDO_TOAST_MS = 8000

export const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)
