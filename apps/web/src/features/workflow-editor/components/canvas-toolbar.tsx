import { useEffect, useRef, useSyncExternalStore } from "react"
import { useReactFlow, useStore } from "@xyflow/react"

import { FIT_VIEW_OPTIONS } from "@/components/shared/flow-canvas"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MousePointer2Icon,
  HandIcon,
  MinusIcon,
  PlusIcon,
  Undo2Icon,
  Redo2Icon,
  LockIcon,
} from "lucide-react"

// reui.io renders a tooltip key with the same 20% wash in both themes: the
// style's dark tint never matches there. The kit's Kbd applies it, so tooltip
// keys restate the light value to look the same as the preview in dark mode.
function TooltipKbd(props: React.ComponentProps<typeof Kbd>) {
  return (
    <Kbd
      className="dark:in-data-[slot=tooltip-content]:bg-background/20"
      {...props}
    />
  )
}

export type CanvasTool = "select" | "hand"

const isCanvasTool = (value: unknown): value is CanvasTool =>
  value === "select" || value === "hand"

// Inside the canvas zoom range, so no preset is silently clamped.
const ZOOM_PRESETS = [
  { zoom: 0.5, digit: null },
  { zoom: 1, digit: "0" },
  { zoom: 2, digit: null },
]

// A shortcut never fires while a field, dialog or menu owns the keyboard.
const KEYBOARD_OWNERS =
  "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [role='combobox']"

function isKeyboardOwned(target: EventTarget | null) {
  return target instanceof Element && target.closest(KEYBOARD_OWNERS) !== null
}

// The platform never changes while the page is open, so nothing to subscribe.
const subscribeToPlatform = () => () => {}

/** The server has no navigator, so it renders Mac keys and the client corrects. */
export function useIsApplePlatform() {
  return useSyncExternalStore(
    subscribeToPlatform,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => true
  )
}

interface CanvasToolbarProps {
  tool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  locked: boolean
  onLockedChange: (locked: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/** Floats over the canvas, so the controls sit where the pointer already is. */
export function CanvasToolbar({
  tool,
  onToolChange,
  locked,
  onLockedChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: CanvasToolbarProps) {
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow()
  // Only the zoom, so a pan never re-renders the bar.
  const zoom = useStore((state) => state.transform[2])
  const minZoom = useStore((state) => state.minZoom)
  const maxZoom = useStore((state) => state.maxZoom)
  const apple = useIsApplePlatform()
  const modKey = apple ? "⌘" : "Ctrl"
  const shiftKey = apple ? "⇧" : "Shift+"
  const percent = Math.round(zoom * 100)
  const undoRef = useRef<HTMLButtonElement>(null)
  const redoRef = useRef<HTMLButtonElement>(null)
  const actedRef = useRef<"undo" | "redo" | null>(null)

  // Emptying a stack disables the button just pressed, which would drop focus
  // to the page, so focus moves to its counterpart instead. The browser only
  // takes focus off a disabled button at its next rendering update, so here
  // the pressed button still holds it; focus anywhere else is left alone.
  useEffect(() => {
    const acted = actedRef.current
    actedRef.current = null
    const active = document.activeElement

    if (
      active !== document.body &&
      active !== undoRef.current &&
      active !== redoRef.current
    ) {
      return
    }

    if (acted === "undo" && !canUndo) {
      redoRef.current?.focus()
    } else if (acted === "redo" && !canRedo) {
      undoRef.current?.focus()
    }
  }, [canRedo, canUndo])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        isKeyboardOwned(event.target)
      ) {
        return
      }

      // A layout with another alphabet prints its own letter on a letter key,
      // so that key matches by position. Whatever a Latin layout prints there
      // is kept, letter or not (AZERTY, Dvorak).
      const key =
        event.code.startsWith("Key") && event.key.charCodeAt(0) > 127
          ? event.code.slice(3).toLowerCase()
          : event.key.toLowerCase()

      if (event.metaKey || event.ctrlKey) {
        // Claims the key only when it acts, so the host page keeps its undo.
        if (key === "z" && event.shiftKey && canRedo) {
          event.preventDefault()
          onRedo()
        } else if (key === "z" && !event.shiftKey && canUndo) {
          event.preventDefault()
          onUndo()
        }

        return
      }

      // A shifted digit prints a different glyph per layout, so match the key.
      if (event.shiftKey && event.code === "Digit1") {
        void fitView(FIT_VIEW_OPTIONS)
      } else if (event.shiftKey && event.code === "Digit0") {
        void zoomTo(1)
      } else if (key === "+" || key === "=") {
        void zoomIn()
      } else if (key === "-") {
        void zoomOut()
      } else if (key === "v" && !locked) {
        onToolChange("select")
      } else if (key === "h" && !locked) {
        onToolChange("hand")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    canRedo,
    canUndo,
    fitView,
    locked,
    onRedo,
    onToolChange,
    onUndo,
    zoomIn,
    zoomOut,
    zoomTo,
  ])

  return (
    <TooltipProvider delay={300}>
      <Card
        role="group"
        aria-label="Canvas controls"
        size="sm"
        className="flex-row items-center gap-1 p-1"
      >
        {/* A locked canvas pans on any drag, so Pan reads as the tool in force. */}
        <ToggleGroup
          multiple={false}
          value={[locked ? "hand" : tool]}
          onValueChange={(value) => {
            const next = value[0]

            if (isCanvasTool(next)) {
              onToolChange(next)
            }
          }}
          size="sm"
          spacing={0.5}
          aria-label="Canvas tool"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                // An icon has no label to pad, so the item stays square.
                <ToggleGroupItem
                  value="select"
                  aria-label="Select"
                  disabled={locked}
                  className="px-0"
                />
              }
            >
              <MousePointer2Icon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Select
              <TooltipKbd>V</TooltipKbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value="hand"
                  aria-label="Pan"
                  className="px-0"
                />
              }
            >
              <HandIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Pan
              <TooltipKbd>H</TooltipKbd>
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>
        <Separator
          orientation="vertical"
          className="h-4 data-vertical:self-center"
        />
        {/* Groups own the 2px button rhythm; the bar's 4px gap frames each seam. */}
        <div
          role="group"
          aria-label="Zoom"
          className="flex items-center gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  disabled={zoom <= minZoom}
                  onClick={() => zoomOut()}
                />
              }
            >
              <MinusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Zoom out
              <TooltipKbd>-</TooltipKbd>
            </TooltipContent>
          </Tooltip>
          {/* Fixed width, so the bar never shifts as the value gains a digit.
              Open, it stays clear unless hovered: the Base UI on reui.io marks
              the trigger expanded only after a re-render, and every zoom item
              closes the menu first, so the preview never shows it expanded. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Zoom level ${percent}%`}
                  className="w-12 tabular-nums aria-expanded:not-hover:bg-transparent"
                />
              }
            >
              {percent}%
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              sideOffset={8}
              className="w-44"
            >
              <DropdownMenuItem onClick={() => fitView(FIT_VIEW_OPTIONS)}>
                Zoom to fit
                <DropdownMenuShortcut>{shiftKey}1</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {ZOOM_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.zoom}
                  onClick={() => zoomTo(preset.zoom)}
                >
                  Zoom to {preset.zoom * 100}%
                  {preset.digit ? (
                    <DropdownMenuShortcut>
                      {shiftKey}
                      {preset.digit}
                    </DropdownMenuShortcut>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  disabled={zoom >= maxZoom}
                  onClick={() => zoomIn()}
                />
              }
            >
              <PlusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Zoom in
              <TooltipKbd>+</TooltipKbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <Separator
          orientation="vertical"
          className="h-4 data-vertical:self-center"
        />
        <div
          role="group"
          aria-label="History"
          className="flex items-center gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Undo"
                  disabled={!canUndo}
                  ref={undoRef}
                  onClick={() => {
                    actedRef.current = "undo"
                    onUndo()
                    setTimeout(() => (actedRef.current = null))
                  }}
                />
              }
            >
              <Undo2Icon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Undo
              <KbdGroup>
                <TooltipKbd>{modKey}</TooltipKbd>
                <TooltipKbd>Z</TooltipKbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Redo"
                  disabled={!canRedo}
                  ref={redoRef}
                  onClick={() => {
                    actedRef.current = "redo"
                    onRedo()
                    setTimeout(() => (actedRef.current = null))
                  }}
                />
              }
            >
              <Redo2Icon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Redo
              <KbdGroup>
                <TooltipKbd>{modKey}</TooltipKbd>
                <TooltipKbd>{apple ? "⇧" : "Shift"}</TooltipKbd>
                <TooltipKbd>Z</TooltipKbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
        </div>
        <Separator
          orientation="vertical"
          className="h-4 data-vertical:self-center"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                aria-label="Lock canvas"
                className="px-0 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                pressed={locked}
                onPressedChange={onLockedChange}
              />
            }
          >
            <LockIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {locked ? "Unlock canvas" : "Lock canvas"}
          </TooltipContent>
        </Tooltip>
      </Card>
    </TooltipProvider>
  )
}
