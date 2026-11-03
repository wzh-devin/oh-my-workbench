import { useState } from "react"
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  Code2Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  Undo2Icon,
  Redo2Icon,
  LinkIcon,
  Table2Icon,
  ChevronDownIcon,
  MinusIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputGroupAddon } from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MarkdownCommand } from "../source-commands"

export type MarkdownToolbarState = Partial<Record<MarkdownCommand, boolean>> & {
  heading?: number
  href?: string
}
type Props = {
  state: MarkdownToolbarState
  disabled?: boolean
  onCommand: (command: MarkdownCommand, value?: string) => void
}
const marks = [
  { command: "bold", label: "粗体", icon: BoldIcon },
  { command: "italic", label: "斜体", icon: ItalicIcon },
  { command: "strike", label: "删除线", icon: StrikethroughIcon },
  { command: "code", label: "行内代码", icon: CodeIcon },
] as const
const blocks = [
  { command: "bullet", label: "无序列表", icon: ListIcon },
  { command: "ordered", label: "有序列表", icon: ListOrderedIcon },
  { command: "task", label: "任务列表", icon: ListTodoIcon },
  { command: "quote", label: "引用", icon: QuoteIcon },
  { command: "block", label: "代码块", icon: Code2Icon },
  { command: "rule", label: "分隔线", icon: MinusIcon },
] as const

/** 格式操作直接作用于源码的当前选区或所在行。 */
export function MarkdownToolbar({ state, disabled = false, onCommand }: Props) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState("")
  const action = ({
    command,
    label,
    icon: Icon,
  }: {
    command: MarkdownCommand
    label: string
    icon: typeof BoldIcon
  }) => (
    <Tooltip key={command}>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            aria-pressed={
              command === "undo" || command === "redo"
                ? undefined
                : state[command]
            }
            disabled={
              disabled ||
              ((command === "undo" || command === "redo") && !state[command])
            }
            onClick={() => onCommand(command)}
          >
            <Icon aria-hidden />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  const menu = ({
    command,
    label,
    icon: Icon,
  }: {
    command: MarkdownCommand
    label: string
    icon: typeof BoldIcon
  }) => (
    <DropdownMenuItem
      key={command}
      disabled={
        disabled ||
        ((command === "undo" || command === "redo") && !state[command])
      }
      onClick={() => onCommand(command)}
    >
      <Icon aria-hidden />
      {label}
    </DropdownMenuItem>
  )
  return (
    <InputGroupAddon
      align="block-start"
      className="border-b"
      aria-label="文本格式"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="flex shrink-0 items-center gap-1 border-r border-border pr-1">
          {action({ command: "undo", label: "撤销", icon: Undo2Icon })}
          <div className="hidden @md:flex">
            {action({ command: "redo", label: "重做", icon: Redo2Icon })}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="文本样式"
                disabled={disabled}
              >
                {state.heading ? `标题 ${state.heading}` : "正文"}
                <ChevronDownIcon aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onCommand("paragraph")}>
              正文
            </DropdownMenuItem>
            {([1, 2, 3, 4, 5, 6] as const).map((level) => (
              <DropdownMenuItem
                key={level}
                onClick={() => onCommand(`h${level}`)}
              >
                标题 {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {action(marks[0])}
        <div className="hidden shrink-0 items-center @md:flex">
          {action(marks[1])}
        </div>
        <div className="hidden shrink-0 items-center gap-1 @4xl:flex">
          {marks.slice(2).map(action)}
          <div className="flex items-center gap-1 border-l border-border pl-1">
            {blocks.map(action)}
          </div>
        </div>
        <div className="shrink-0 @4xl:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="更多格式"
                  disabled={disabled}
                >
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {menu({ command: "redo", label: "重做", icon: Redo2Icon })}
              {menu(marks[1])}
              {marks.slice(2).map(menu)}
              <DropdownMenuSeparator />
              {blocks.map(menu)}
              <DropdownMenuSeparator />
              {menu({ command: "table", label: "插入表格", icon: Table2Icon })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Popover
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open)
            if (open) setLink(state.href ?? "")
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="链接"
                title="链接"
                disabled={disabled}
              >
                <LinkIcon aria-hidden />
              </Button>
            }
          />
          <PopoverContent align="start">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                try {
                  const uri = new URL(link.trim())
                  if (!["http:", "https:"].includes(uri.protocol))
                    throw new Error()
                  onCommand("link", uri.href)
                  setLinkOpen(false)
                } catch {
                  toast.error("请输入有效的 http 或 https 链接")
                }
              }}
            >
              <label className="flex flex-col gap-2 text-sm">
                链接地址
                <Input
                  placeholder="https://example.com"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onCommand("unlink")
                    setLinkOpen(false)
                  }}
                >
                  移除
                </Button>
                <Button type="submit" size="sm">
                  应用
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        <div className="hidden shrink-0 @2xl:block">
          {action({ command: "table", label: "插入表格", icon: Table2Icon })}
        </div>
      </div>
    </InputGroupAddon>
  )
}
