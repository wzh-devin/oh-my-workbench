import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  EyeIcon,
  ActivityIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  WorkflowIcon,
} from "lucide-react"

/** The toast state glyphs, one per typed method, so every toast reads alike. */
export const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <CircleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
)

// prettier-ignore
export const UI_ICONS = {
  more:     <MoreHorizontalIcon aria-hidden="true" />,
  view:     <EyeIcon aria-hidden="true" />,
  edit:     <PencilIcon aria-hidden="true" />,
  copy:     <CopyIcon aria-hidden="true" />,
  up:       <ArrowUpIcon aria-hidden="true" />,
  down:     <ArrowDownIcon aria-hidden="true" />,
  go:       <ArrowRightIcon aria-hidden="true" />,
  sync:     <RefreshCwIcon aria-hidden="true" />,
  resume:   <PlayIcon aria-hidden="true" />,
  shield:   <ShieldCheckIcon aria-hidden="true" />,
  alert:    <TriangleAlertIcon aria-hidden="true" />,
  workflow: <WorkflowIcon aria-hidden="true" />,
  agent:    <BotIcon aria-hidden="true" />,
  activity: <ActivityIcon aria-hidden="true" />,
}
