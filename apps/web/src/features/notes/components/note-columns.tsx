import { Link } from "react-router"
import { FileTextIcon, LockIcon, PencilIcon, StarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  RecordHint,
  type RecordColumn,
} from "@/features/workbench/records-grid"
import type { Note, Notebook } from "../model"

/** 列定义复用工作台表格的宽度、时间和提示约定；列表只使用笔记元数据。 */
export const useNoteColumns = (
  notebooks: Notebook[],
  params: URLSearchParams,
  selectedId: string | null,
  onOpen: (note: Note) => void
): RecordColumn<Note>[] => [
  {
    accessorKey: "title",
    header: "标题",
    size: 320,
    meta: { fillWidth: true },
    cell: ({ row }) => {
      const note = row.original
      const next = new URLSearchParams(params)
      next.set("note", note.id)
      return (
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Link
            to={"?" + next}
            data-note-id={note.id}
            aria-current={selectedId === note.id ? "location" : undefined}
            className="min-w-0 truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return
              event.preventDefault()
              onOpen(note)
            }}
          >
            {note.title}
          </Link>
          {note.requiresUnlock && (
            <LockIcon
              aria-label="加锁"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          {note.favorite && (
            <StarIcon
              aria-label="已收藏"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "notebookId",
    header: "笔记本",
    size: 120,
    cell: ({ row }) => (
      <span className="block truncate text-sm text-muted-foreground">
        {notebooks.find((book) => book.id === row.original.notebookId)?.name ??
          "未分类"}
      </span>
    ),
  },
  {
    accessorKey: "tags",
    header: "标签",
    size: 160,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-sm text-muted-foreground">
          {row.original.tags.join("、") || "—"}
        </span>
        {row.original.tags.length > 1 && (
          <RecordHint label={`查看全部标签：${row.original.title}`}>
            {row.original.tags.join("、")}
          </RecordHint>
        )}
      </div>
    ),
  },
  { accessorKey: "updatedAt", header: "更新时间", dataType: "datetime" },
  {
    id: "actions",
    header: "操作",
    size: 80,
    meta: { align: "center" },
    cell: ({ row }) => (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`编辑笔记：${row.original.title}`}
        onClick={() => onOpen(row.original)}
      >
        <PencilIcon aria-hidden />
      </Button>
    ),
  },
]
