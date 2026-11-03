import { useState } from "react"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select"
import type { Draft, NoteContent, Notebook } from "../model"

/** 逗号输入保留用户的编辑文本，解析后的标签直接进入原有保存队列。 */
export function NoteMetadata({
  draft,
  notebooks,
  readOnly,
  onChange,
  onComposition,
}: {
  draft: Draft
  notebooks: Notebook[]
  readOnly: boolean
  onChange: (changes: Partial<NoteContent>) => void
  onComposition: (active: boolean) => void
}) {
  const canonical = JSON.stringify(draft.tags)
  const [input, setInput] = useState({ canonical, text: draft.tags.join("，") })
  const books = [
    { value: "unfiled", label: "未分类" },
    ...notebooks.map((book) => ({ value: book.id, label: book.name })),
  ]
  return (
    <div
      role="group"
      aria-label="笔记信息"
      className="grid shrink-0 grid-cols-2 items-center gap-2 @3xl/note-detail:grid-cols-[minmax(0,1fr)_12rem_16rem]"
    >
      <Input
        autoFocus
        aria-label="笔记标题"
        placeholder="输入笔记标题"
        maxLength={200}
        value={draft.title}
        readOnly={readOnly}
        className="col-span-2 font-medium @3xl/note-detail:col-span-1"
        onChange={(event) => onChange({ title: event.target.value })}
        onCompositionStart={() => onComposition(true)}
        onCompositionEnd={() => onComposition(false)}
      />
      <Select
        value={draft.notebookId ?? "unfiled"}
        items={books}
        disabled={readOnly}
        onValueChange={(value) => {
          if (typeof value === "string")
            onChange({ notebookId: value === "unfiled" ? null : value })
        }}
      >
        <SelectTrigger
          aria-label="笔记本"
          className="w-full font-normal text-muted-foreground"
        >
          <span className="text-xs">笔记本</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {books.map((book) => (
              <SelectItem key={book.value} value={book.value}>
                {book.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText className="text-xs font-normal">标签</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="标签"
          placeholder="输入标签，逗号分隔"
          className="font-normal text-muted-foreground"
          value={
            canonical === input.canonical ? input.text : draft.tags.join("，")
          }
          readOnly={readOnly}
          maxLength={300}
          onChange={(event) => {
            const text = event.target.value
            const tags = [
              ...new Set(
                text
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              ),
            ]
            setInput({ text, canonical: JSON.stringify(tags) })
            onChange({ tags })
          }}
          onCompositionStart={() => onComposition(true)}
          onCompositionEnd={() => onComposition(false)}
        />
      </InputGroup>
    </div>
  )
}
