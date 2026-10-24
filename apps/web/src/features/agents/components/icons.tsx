import type { SVGProps } from "react"
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  CodeIcon,
  Columns3Icon,
  CopyIcon,
  InfoIcon,
  KeyRoundIcon,
  LockIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayIcon,
  PlugZapIcon,
  RefreshCwIcon,
  Rows3Icon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserRoundIcon,
  WalletIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

export function FilterPlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2.25 3.25h11.5L9.5 8.15v2.95l-3 1.5V8.15L2.25 3.25Z" />
      <path d="M11.5 9.75v4" />
      <path d="M9.5 11.75h4" />
    </svg>
  )
}

/** The toast state glyphs, one per typed method, so every toast reads alike. */
export const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <CircleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
)

/** The agent sheet's glyphs. */
export const UI_ICONS = {
  close: <XIcon aria-hidden="true" />,
  more: <MoreHorizontalIcon aria-hidden="true" />,
  copy: <CopyIcon aria-hidden="true" />,
  check: <CheckIcon aria-hidden="true" />,
  trash: <Trash2Icon aria-hidden="true" />,
  search: <SearchIcon aria-hidden="true" />,
  previous: <ChevronUpIcon aria-hidden="true" />,
  next: <ChevronDownIcon aria-hidden="true" />,
  sync: <RefreshCwIcon aria-hidden="true" />,
  pause: <PauseCircleIcon aria-hidden="true" />,
  resume: <PlayIcon aria-hidden="true" />,
  key: <KeyRoundIcon aria-hidden="true" />,
  plug: <PlugZapIcon aria-hidden="true" />,
  editor: <SquarePenIcon aria-hidden="true" />,
  rows: <Rows3Icon aria-hidden="true" />,
  columns: <Columns3Icon aria-hidden="true" />,
  code: <CodeIcon aria-hidden="true" />,
  lock: <LockIcon aria-hidden="true" />,
  alert: <TriangleAlertIcon aria-hidden="true" />,
  failed: <CircleXIcon aria-hidden="true" />,
  passed: <CircleCheckIcon aria-hidden="true" />,
  pending: <CircleDotIcon aria-hidden="true" />,
  handoff: <UserRoundIcon aria-hidden="true" />,
  budget: <WalletIcon aria-hidden="true" />,
  tool: <WrenchIcon aria-hidden="true" />,
  agent: <BotIcon aria-hidden="true" />,
  info: <InfoIcon aria-hidden="true" />,
}
