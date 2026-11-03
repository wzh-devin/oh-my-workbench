import { useEffect, useRef, useState, type ReactNode } from "react"
import { InputGroupTextarea } from "@/components/ui/input-group"
import {
  sourceCommand,
  type MarkdownCommand,
  type SourceSelection,
} from "../source-commands"
import { MarkdownToolbar } from "./markdown-toolbar"
import { MarkdownEditorLayout } from "./markdown-editor-layout"
export type SourceMarkdownEditorProps = {
  value: string
  readOnly: boolean
  onChange: (markdown: string) => void
  onComposition: (active: boolean) => void
  previewPane?: ReactNode
}

export function SourceMarkdownEditor({
  value,
  readOnly,
  onChange,
  onComposition,
  previewPane,
}: SourceMarkdownEditorProps) {
  const input = useRef<HTMLTextAreaElement>(null)
  const current = useRef<SourceSelection>({ value, start: 0, end: 0 })
  const [history, setHistory] = useState<{
    past: SourceSelection[]
    future: SourceSelection[]
  }>({ past: [], future: [] })
  const [heading, setHeading] = useState(0)
  const [composing, setComposing] = useState(false)
  const compositionStart = useRef<SourceSelection | null>(null)
  const frame = useRef<number | null>(null)
  useEffect(() => {
    if (current.current.value === value) return
    current.current = { value, start: 0, end: 0 }
    setHistory({ past: [], future: [] })
  }, [value])
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )
  const selection = () => ({
    value: current.current.value,
    start: input.current?.selectionStart ?? 0,
    end: input.current?.selectionEnd ?? 0,
  })
  const remember = (previous: SourceSelection) => {
    // shortcut: 源码撤销最多100步，需要长会话历史时再改为差量存储。
    setHistory((items) => ({
      past: [...items.past.slice(-99), previous],
      future: [],
    }))
  }
  const apply = (next: SourceSelection) => {
    current.current = next
    onChange(next.value)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(next.start, next.end)
      frame.current = null
    })
  }
  const command = (kind: MarkdownCommand, href?: string) => {
    if (readOnly || composing) return
    const before = selection()
    if (kind === "undo" || kind === "redo") {
      const stack = kind === "undo" ? history.past : history.future
      const next = stack.at(-1)
      if (!next) return
      setHistory((items) =>
        kind === "undo"
          ? { past: items.past.slice(0, -1), future: [...items.future, before] }
          : { past: [...items.past, before], future: items.future.slice(0, -1) }
      )
      apply(next)
      return
    }
    const next = sourceCommand(before, kind, href)
    if (next.value === before.value) return
    remember(before)
    apply(next)
  }
  return (
    <MarkdownEditorLayout
      preview={previewPane}
      toolbar={
        <MarkdownToolbar
          state={{
            undo: history.past.length > 0,
            redo: history.future.length > 0,
            heading,
          }}
          disabled={readOnly || composing}
          onCommand={command}
        />
      }
    >
      <InputGroupTextarea
        ref={input}
        aria-label="Markdown 正文"
        placeholder="使用 Markdown 记录内容…"
        value={value}
        readOnly={readOnly}
        className="min-h-full min-w-0 overflow-hidden font-mono text-sm"
        onSelect={() => {
          current.current = selection()
          const from =
            current.current.start === 0
              ? 0
              : value.lastIndexOf("\n", current.current.start - 1) + 1
          setHeading(value.slice(from).match(/^(#{1,6}) /)?.[1].length ?? 0)
        }}
        onBeforeInput={() => {
          current.current = selection()
        }}
        onChange={(event) => {
          if (frame.current !== null) {
            cancelAnimationFrame(frame.current)
            frame.current = null
          }
          const next = {
            value: event.target.value,
            start: event.target.selectionStart,
            end: event.target.selectionEnd,
          }
          if (next.value === current.current.value) return
          if (!compositionStart.current) remember(current.current)
          current.current = next
          onChange(next.value)
        }}
        onCompositionStart={() => {
          compositionStart.current = selection()
          setComposing(true)
          onComposition(true)
        }}
        onCompositionEnd={(event) => {
          const target = event.currentTarget
          if (current.current.value !== target.value) {
            current.current = {
              value: target.value,
              start: target.selectionStart,
              end: target.selectionEnd,
            }
            onChange(target.value)
          }
          const before = compositionStart.current
          if (before && before.value !== current.current.value) remember(before)
          compositionStart.current = null
          setComposing(false)
          onComposition(false)
        }}
        onKeyDown={(event) => {
          if (
            event.nativeEvent.isComposing ||
            composing ||
            !(event.metaKey || event.ctrlKey) ||
            event.altKey
          )
            return
          const key = event.key.toLowerCase()
          if (!["z", "y", "b", "i"].includes(key)) return
          event.preventDefault()
          command(
            key === "b"
              ? "bold"
              : key === "i"
                ? "italic"
                : key === "y" || event.shiftKey
                  ? "redo"
                  : "undo"
          )
        }}
      />
    </MarkdownEditorLayout>
  )
}
