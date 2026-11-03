import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useAuth } from "@/features/auth/auth-context"
import { useBlocker, useSearchParams } from "react-router"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
  ChevronDownIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  DownloadIcon,
  StarIcon,
  ArchiveRestoreIcon,
  HistoryIcon,
  LockIcon,
  LockOpenIcon,
  MoreHorizontalIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { HeaderActions } from "@/components/app-shell/header-actions"
import {
  WorkbenchNavigation,
  EmptyState,
} from "@/features/workbench/components"
import { DeleteConfirm } from "@/features/workbench/dialogs"
import { Button } from "@/components/ui/button"
import { RecordsGrid } from "@/features/workbench/records-grid"
import type { PaginationState } from "@tanstack/react-table"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SHEET_SHELL } from "@/features/settings/components/sections/sheet-parts"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TodoDatePicker } from "@/features/todos/components/todo-date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { RuleFilters } from "@/components/shared/rule-filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { noteApi } from "../api"
import { noteFields, noteRule, noteViewRequiresUnlock } from "../filters"
import {
  downloadNote,
  type Draft,
  type Note,
  type Notebook,
  type NoteView,
  type Scope,
} from "../model"
import { useNoteEditor } from "../use-note-editor"
import { useNotesData } from "../use-notes-data"
import { MarkdownEditor } from "./markdown-editor"
import { NoteViewDialog, NoteViewIcon } from "./note-view-dialog"
import { NoteMetadata } from "./note-metadata"
import { useNoteColumns } from "./note-columns"
import {
  ConflictDialog,
  CreateLockedNoteDialog,
  NotebookDialog,
  RevisionsDialog,
  UnlockDialog,
} from "./note-dialogs"

const shellNote = (id: string): Note => ({
  id,
  title: "笔记",
  notebookId: null,
  tags: [],
  requiresUnlock: false,
  favorite: false,
  diaryDate: null,
  version: 1,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
})

/** 标准表格保持挂载，详情和Markdown编辑通过Sheet按需打开；正文由独立队列保存。 */
export function Notes() {
  const { registerLogoutGuard } = useAuth()
  const [params, setParams] = useSearchParams()
  const viewId = params.get("view") ?? ""
  const [editingView, setEditingView] = useState<NoteView | "new" | null>(null)
  const [deletingView, setDeletingView] = useState<NoteView | null>(null)
  const routeScope: Scope = ["favorite", "locked", "trash"].includes(
    params.get("scope") ?? ""
  )
    ? (params.get("scope") as Scope)
    : "all"
  const notebookId = params.get("notebook") ?? ""
  const noteId = params.get("note")
  const previousNoteId = useRef(noteId)
  const returnFocusId = useRef<string | null>(null)
  const focusRestored = useRef(false)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })
  // shortcut: 详情前后篇仅遍历当前页，需要跨页阅读时再扩展保存保护和分页加载。
  const pageNum = pagination.pageIndex + 1
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(() => createFilterQuery())
  const [expanded, setExpanded] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [pendingCreate, setPendingCreate] = useState<Draft | null>(null)
  const [bookDialog, setBookDialog] = useState<Notebook | "new" | null>(null)
  const diaryDateId = useId()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPurpose, setUnlockPurpose] = useState<
    "read" | "export" | { protectionTarget: string }
  >("read")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [confirm, setConfirm] = useState<
    "delete" | "purge" | "book" | "export" | null
  >(null)
  const [busy, setBusy] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const activeParams = useRef(params)
  useEffect(() => {
    activeParams.current = params
  }, [params])
  const compiled = useMemo(() => {
    try {
      return { rule: noteRule(filters), error: null }
    } catch (error) {
      return {
        rule: undefined,
        error: error instanceof Error ? error.message : "筛选条件无效",
      }
    }
  }, [filters])
  const data = useNotesData(
    {
      pageNum,
      pageSize: pagination.pageSize,
      scope: routeScope,
      viewId,
      notebookId,
      search,
      filterQuery: compiled.rule,
    },
    compiled.error
  )
  const savedView = data.views.find((view) =>
    viewId
      ? view.id === viewId
      : !notebookId &&
        ["favorite", "locked"].includes(routeScope) &&
        view.builtinKey === routeScope
  )
  const scope = savedView?.scope ?? routeScope
  const currentView = savedView
  const createsLocked =
    scope === "locked" ||
    (!!savedView && noteViewRequiresUnlock(savedView.filterQuery.root))
  const onSaved = (note: Note, previous: Note | null) => {
    data.remember(note)
    if (!previous) data.refresh()
    const next = new URLSearchParams(activeParams.current)
    if (next.get("note") !== note.id) {
      next.set("note", note.id)
      setParams(next, { replace: true })
    }
  }
  const editor = useNoteEditor(onSaved)
  const { open, getSelectedId, getSource, conceal, save, clear } = editor
  useEffect(() => registerLogoutGuard(save), [registerLogoutGuard, save])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (editor.hasUnsaved()) return true
    if (currentLocation.pathname !== nextLocation.pathname) return false
    // 快速后退可能合并URL渲染；在导航边界收起已保存详情，不能依赖中间render。
    if (
      !new URLSearchParams(nextLocation.search).has("note") &&
      getSelectedId()
    ) {
      returnFocusId.current = getSelectedId()
      focusRestored.current = false
      clear()
    }
    return false
  })
  const selectedBook = data.notebooks.find((book) => book.id === notebookId)
  const selected = editor.source ?? editor.selected
  const readOnly = !!selected?.deletedAt
  const hasEditor = !!editor.draft || (!!editor.selected && !editor.concealed)
  const onLocked = useCallback(() => {
    conceal()
    setHistoryOpen(false)
    setUnlockOpen(true)
  }, [conceal, setHistoryOpen, setUnlockOpen])
  useEffect(() => {
    // 浏览器后退与页面返回共用列表状态；未保存的导航由 blocker 先拦截。
    const previous = previousNoteId.current
    previousNoteId.current = noteId
    if (previous && !noteId) {
      returnFocusId.current = getSelectedId() ?? previous
      focusRestored.current = false
      clear()
    }
  }, [noteId, clear, getSelectedId])
  useEffect(() => {
    if (
      hasEditor ||
      data.pageStatus !== "ready" ||
      !returnFocusId.current ||
      focusRestored.current
    )
      return
    const frame = requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLAnchorElement>(
          `[data-note-id="${returnFocusId.current}"]`
        ) ?? document.querySelector<HTMLInputElement>('[aria-label="搜索笔记"]')
      target?.focus()
      focusRestored.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [hasEditor, data.pageStatus, data.records])
  useEffect(() => {
    if (!noteId || getSelectedId() === noteId) return
    if (!/^[1-9]\d*$/.test(noteId)) {
      toast.error("笔记不存在", { id: "note-read" })
      return
    }
    void open(shellNote(noteId))
  }, [noteId, open, getSelectedId])

  const promptedNote = useRef<string | null>(null)
  useEffect(() => {
    if (!editor.selected) {
      promptedNote.current = null
      return
    }
    if (editor.concealed && promptedNote.current !== editor.selected.id) {
      promptedNote.current = editor.selected.id
      setUnlockOpen(true)
    }
  }, [editor.selected, editor.concealed])

  /** 新建模板只生成标准 Markdown；笔记本和加锁属性仍独立保存。 */
  const create = async (
    kind: "blank" | "diary" | "locked" | "credential",
    imported?: { title: string; markdown: string }
  ) => {
    const date = format(new Date(), "yyyy-MM-dd")
    const draft: Draft = {
      title: imported?.title ?? (kind === "diary" ? date : ""),
      markdown:
        imported?.markdown ??
        (kind === "diary"
          ? "## 今日记录\n\n"
          : kind === "credential"
            ? "## 服务\n\n- 地址：\n- 账号：\n\n## 密钥\n\n```text\n\n```\n"
            : ""),
      notebookId: selectedBook?.id ?? null,
      tags: [],
      favorite: false,
      requiresUnlock: createsLocked || kind !== "blank",
      diaryDate: kind === "diary" ? date : null,
      requestId: crypto.randomUUID(),
    }
    if (draft.requiresUnlock) {
      if (!(await editor.save())) return
      setPendingCreate(draft)
      return
    }
    await startDraft(draft, !!imported)
  }
  /** 创建模板先留在内存，导入才立即保存；URL不再指向上一篇。 */
  const startDraft = async (draft: Draft, persist: boolean) => {
    if (!(await editor.create(draft, persist))) return
    const next = new URLSearchParams(activeParams.current)
    next.delete("note")
    setParams(next, { replace: true })
    setExpanded(false)
  }
  const select = async (note: Note) => {
    if (transitioning) return
    setTransitioning(true)
    try {
      if (await editor.open(note)) {
        const next = new URLSearchParams(activeParams.current)
        next.set("note", note.id)
        setParams(next)
      }
    } finally {
      setTransitioning(false)
    }
  }
  const navigate = async (id: string) => {
    if (!(await editor.save())) return
    returnFocusId.current = null
    editor.clear()
    setPagination((current) => ({ ...current, pageIndex: 0 }))
    setSearch("")
    setFilters(createFilterQuery())
    setParams(
      id.startsWith("book:")
        ? { notebook: id.slice(5) }
        : id.startsWith("view:")
          ? { view: id.slice(5) }
          : { scope: id }
    )
  }
  const back = async () => {
    if (!(await editor.save())) return
    returnFocusId.current = getSelectedId()
    focusRestored.current = false
    editor.clear()
    const next = new URLSearchParams(activeParams.current)
    next.delete("note")
    setParams(next)
    data.refresh()
    setExpanded(false)
  }
  /** 变更操作始终等待保存并读取最新版本，不使用点击时的旧版本闭包。 */
  const runAction = async (action: "delete" | "restore" | "purge") => {
    if (!(await editor.save())) return false
    const target = getSource()
    if (!target) return false
    try {
      await editor.api.batch(action, target)
      editor.clear()
      data.refresh()
      const next = new URLSearchParams(activeParams.current)
      next.delete("note")
      setParams(next)
      if (action === "restore") toast.success("已恢复")
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败")
      if (error instanceof Error && "status" in error && error.status === 423)
        onLocked()
      return false
    }
  }
  const showHistory = async () => {
    if (await editor.save()) setHistoryOpen(true)
  }
  const exportNote = async () => {
    if (!(await editor.save())) return
    const target = getSource()
    if (!target) return
    try {
      const note = await editor.api.detail(target.id)
      downloadNote(note.title, note.markdown)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败")
      if (error instanceof Error && "status" in error && error.status === 423)
        onLocked()
    }
  }
  const sections = [
    {
      id: "notes",
      title: "视图",
      action: (
        <div className="flex items-center gap-1">
          {data.booksStatus === "loading" && (
            <Skeleton className="size-4" aria-label="正在读取视图" />
          )}
          {data.booksStatus === "error" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="重试读取视图"
              onClick={data.refreshBooks}
            >
              <RefreshCwIcon aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="新建视图"
            onClick={() => setEditingView("new")}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      ),
      items: [
        { id: "all", label: "全部笔记", icon: <FileTextIcon aria-hidden /> },
        ...data.views.map((view) => ({
          id: "view:" + view.id,
          label: view.name,
          icon: <NoteViewIcon name={view.icon} />,
        })),
      ],
    },
    {
      id: "notebooks",
      title: "笔记本",
      action: (
        <div className="flex items-center gap-1">
          {data.booksStatus === "loading" && (
            <Skeleton className="size-4" aria-label="正在读取笔记本" />
          )}
          {data.booksStatus === "error" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="重试读取笔记本"
              onClick={data.refreshBooks}
            >
              <RefreshCwIcon aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="新建笔记本"
            onClick={() => setBookDialog("new")}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      ),
      items: data.notebooks.map((book) => ({
        id: "book:" + book.id,
        label: book.name,
        icon: <BookOpenIcon aria-hidden />,
      })),
    },
    {
      id: "management",
      title: "管理",
      items: [
        { id: "trash", label: "回收站", icon: <Trash2Icon aria-hidden /> },
      ],
    },
  ]
  const title =
    selectedBook?.name ??
    savedView?.name ??
    (notebookId === "unfiled"
      ? "未分类"
      : scope === "favorite"
        ? "收藏"
        : scope === "locked"
          ? "加锁"
          : scope === "trash"
            ? "回收站"
            : "全部笔记")
  const index = data.records.findIndex((note) => note.id === selected?.id)
  const empty = (
    <EmptyState
      title={
        data.pageStatus === "error"
          ? "读取笔记失败"
          : search || filters.rules.length
            ? "没有匹配的笔记"
            : scope === "trash"
              ? "回收站为空"
              : "暂无笔记"
      }
      action={
        data.pageStatus === "error"
          ? compiled.error
            ? "清除筛选"
            : "重试"
          : search || filters.rules.length
            ? "清除筛选"
            : scope === "trash"
              ? "全部笔记"
              : scope === "locked"
                ? "新建加锁笔记"
                : "新建笔记"
      }
      onAction={
        data.pageStatus === "error" && !compiled.error
          ? data.refresh
          : search || filters.rules.length || compiled.error
            ? () => {
                setSearch("")
                setFilters(createFilterQuery())
              }
            : scope === "trash"
              ? () => void navigate("all")
              : () => void create(createsLocked ? "locked" : "blank")
      }
    />
  )
  const status =
    editor.status === "saving"
      ? "正在保存"
      : editor.status === "conflict"
        ? "版本冲突"
        : editor.status === "error" && editor.draft
          ? "保存失败"
          : editor.dirty
            ? "未保存"
            : editor.source
              ? "已保存"
              : ""
  const columns = useNoteColumns(
    data.notebooks,
    params,
    selected?.id ?? null,
    (note) => void select(note)
  )
  const afterUnlock = async () => {
    if (unlockPurpose === "export") await exportNote()
    else if (
      typeof unlockPurpose === "object" &&
      editor.getDraft()?.requestId === unlockPurpose.protectionTarget
    )
      editor.change({ requiresUnlock: true })
  }
  const unlockDialog = unlockOpen ? (
    <UnlockDialog
      api={editor.api}
      protect={typeof unlockPurpose === "object"}
      onPasskey={async () => {
        await editor.unlockWithPasskey()
        await afterUnlock()
      }}
      onCancel={() => {
        setUnlockOpen(false)
        setUnlockPurpose("read")
        if (!hasEditor) void back()
      }}
      onClose={() => {
        setUnlockOpen(false)
        setUnlockPurpose("read")
      }}
      onUnlock={async (password) => {
        await editor.unlock(password)
        await afterUnlock()
      }}
    />
  ) : null
  return (
    <section
      aria-label="记事本"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
    >
      <HeaderActions>
        {currentView && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="更多视图操作"
                  title="更多操作"
                  disabled={data.booksStatus !== "ready"}
                >
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingView(currentView)}>
                <PencilIcon aria-hidden />
                编辑视图
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={data.views.length <= 1}
                onClick={() => setDeletingView(currentView)}
              >
                <Trash2Icon aria-hidden />
                {data.views.length <= 1 ? "至少保留一个视图" : "删除视图"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => upload.current?.click()}
        >
          <UploadIcon aria-hidden />
          导入
        </Button>
        <ButtonGroup>
          <Button
            type="button"
            size="sm"
            onClick={() => void create(createsLocked ? "locked" : "blank")}
          >
            <PlusIcon aria-hidden />
            新建笔记
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="icon-sm" aria-label="选择笔记模板">
                  <ChevronDownIcon aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void create("blank")}>
                空白笔记
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void create("diary")}>
                日记
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void create("locked")}>
                加锁笔记
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void create("credential")}>
                凭证记录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </HeaderActions>
      <input
        type="file"
        ref={upload}
        accept=".md,text/markdown"
        aria-label="导入 Markdown"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          if (
            !file.name.toLowerCase().endsWith(".md") ||
            file.size > 1_048_576
          ) {
            toast.error("请选择不超过 1 MiB 的 Markdown 文件")
            return
          }
          try {
            const markdown = new TextDecoder("utf-8", { fatal: true }).decode(
              await file.arrayBuffer()
            )
            await create("blank", { title: file.name.slice(0, -3), markdown })
          } catch {
            toast.error("无法读取 UTF-8 Markdown 文件")
          }
        }}
      />
      <WorkbenchNavigation
        title="记事本"
        sections={sections}
        activeItem={
          notebookId
            ? "book:" + notebookId
            : currentView
              ? "view:" + currentView.id
              : scope
        }
        onItemChange={(id) => void navigate(id)}
      />
      <RecordsGrid<Note>
        fillHeight
        autoPageSize={false}
        title={title}
        icon={<FileTextIcon aria-hidden className="size-4" />}
        records={data.pageStatus === "error" ? [] : data.records}
        loading={data.pageStatus === "loading"}
        columns={columns}
        server={{
          total: data.total,
          pagination,
          onPaginationChange: setPagination,
          sorting: [],
          onSortingChange: () => {},
        }}
        empty={empty}
        toolbar={
          <>
            <Input
              aria-label="搜索笔记"
              placeholder="搜索标题或标签"
              maxLength={200}
              value={search}
              className="w-full sm:w-56"
              onChange={(event) => {
                setSearch(event.target.value)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}
            />
            <RuleFilters
              fields={noteFields(data.notebooks)}
              query={filters}
              onQueryChange={(next) => {
                setFilters(next)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="刷新笔记"
              onClick={data.refresh}
            >
              <RefreshCwIcon aria-hidden />
            </Button>
            {selectedBook && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label="笔记本操作"
                    >
                      <MoreHorizontalIcon aria-hidden />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setBookDialog(selectedBook)}>
                    重命名笔记本
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirm("book")}
                  >
                    删除笔记本
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <Sheet
        open={hasEditor && !unlockOpen}
        onOpenChange={(value) => {
          if (!value) void back()
        }}
      >
        <SheetContent
          className={SHEET_SHELL}
          style={
            {
              "--sheet-width": expanded ? "calc(100vw - 2rem)" : "960px",
            } as CSSProperties
          }
          showCloseButton={false}
          finalFocus={() => {
            const id = returnFocusId.current
            return id
              ? document.querySelector<HTMLAnchorElement>(
                  `[data-note-id="${id}"]`
                )
              : true
          }}
          aria-describedby={undefined}
        >
          <SheetHeader className="shrink-0 border-b border-border">
            <SheetTitle className="sr-only">笔记详情</SheetTitle>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="当前页上一篇"
                  disabled={
                    index <= 0 || transitioning || data.pageStatus !== "ready"
                  }
                  onClick={() => void select(data.records[index - 1])}
                >
                  <ChevronLeftIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="当前页下一篇"
                  disabled={
                    index < 0 ||
                    index >= data.records.length - 1 ||
                    transitioning ||
                    data.pageStatus !== "ready"
                  }
                  onClick={() => void select(data.records[index + 1])}
                >
                  <ChevronRightIcon aria-hidden />
                </Button>
                <span
                  role="status"
                  aria-live="polite"
                  className="text-xs text-muted-foreground"
                >
                  {status}
                </span>
                {editor.status === "error" && editor.draft && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void editor.save()}
                  >
                    重试
                  </Button>
                )}
                {editor.status === "conflict" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConflictOpen(true)}
                  >
                    比较
                  </Button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editor.draft &&
                  !editor.concealed &&
                  editor.draft.diaryDate !== null && (
                    <TodoDatePicker
                      id={diaryDateId}
                      label="日记日期"
                      compact
                      value={editor.draft.diaryDate}
                      disabled={readOnly || transitioning}
                      onChange={(value) =>
                        editor.change({ diaryDate: value || null })
                      }
                    />
                  )}
                {editor.draft && !editor.concealed && !readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={
                      editor.draft.requiresUnlock ? "取消笔记加锁" : "加锁笔记"
                    }
                    aria-pressed={editor.draft.requiresUnlock}
                    title={
                      editor.draft.requiresUnlock ? "取消笔记加锁" : "加锁笔记"
                    }
                    disabled={
                      transitioning ||
                      editor.status === "saving" ||
                      editor.status === "conflict"
                    }
                    onClick={() => {
                      const draft = editor.getDraft()
                      if (!draft) return
                      if (!draft.requiresUnlock && !editor.isUnlocked()) {
                        setUnlockPurpose({ protectionTarget: draft.requestId })
                        setUnlockOpen(true)
                      } else
                        editor.change({ requiresUnlock: !draft.requiresUnlock })
                    }}
                  >
                    {editor.draft.requiresUnlock ? (
                      <LockIcon aria-hidden />
                    ) : (
                      <LockOpenIcon aria-hidden />
                    )}
                    {editor.draft.requiresUnlock
                      ? editor.source?.requiresUnlock
                        ? "已加锁"
                        : "待加锁"
                      : editor.source?.requiresUnlock
                        ? "待取消加锁"
                        : "加锁"}
                  </Button>
                )}
                {editor.draft && !editor.concealed && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="笔记操作"
                        >
                          <MoreHorizontalIcon aria-hidden />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-max">
                      {!readOnly && (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              editor.change({
                                favorite: !editor.draft?.favorite,
                              })
                            }
                          >
                            <StarIcon aria-hidden />
                            {editor.draft.favorite ? "取消收藏" : "收藏"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!editor.source}
                            onClick={() => void showHistory()}
                          >
                            <HistoryIcon aria-hidden />
                            历史版本
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        disabled={!editor.source}
                        onClick={() =>
                          editor.draft?.requiresUnlock
                            ? setConfirm("export")
                            : void exportNote()
                        }
                      >
                        <DownloadIcon aria-hidden />
                        导出 Markdown
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {readOnly ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => void runAction("restore")}
                          >
                            <ArchiveRestoreIcon aria-hidden />
                            恢复笔记
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setConfirm("purge")}
                          >
                            <Trash2Icon aria-hidden />
                            彻底删除
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={!editor.source}
                          onClick={() => setConfirm("delete")}
                        >
                          <Trash2Icon aria-hidden />
                          移入回收站
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={expanded ? "收起写作区" : "展开写作区"}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? (
                    <Minimize2Icon aria-hidden />
                  ) : (
                    <Maximize2Icon aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="关闭笔记"
                  disabled={transitioning}
                  onClick={() => void back()}
                >
                  <XIcon aria-hidden />
                </Button>
              </div>
            </div>
          </SheetHeader>
          <div className="@container/note-detail flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
            {editor.status === "loading" ? (
              <div
                role="status"
                aria-label="正在读取笔记"
                className="flex min-h-0 flex-1 flex-col gap-4"
              >
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="min-h-0 flex-1" />
              </div>
            ) : editor.concealed ? (
              <EmptyState
                icon={LockIcon}
                title="笔记已加锁"
                action="解锁"
                onAction={() => setUnlockOpen(true)}
              />
            ) : editor.draft ? (
              <>
                <NoteMetadata
                  key={editor.draft.requestId}
                  draft={editor.draft}
                  notebooks={data.notebooks}
                  readOnly={readOnly}
                  onChange={editor.change}
                  onComposition={editor.composition}
                />
                <div
                  className={cn(
                    "mx-auto flex min-h-0 w-full flex-1 flex-col",
                    !expanded && "max-w-5xl"
                  )}
                >
                  <MarkdownEditor
                    key={editor.draft.requestId}
                    value={editor.draft.markdown}
                    readOnly={readOnly}
                    onChange={(markdown) => editor.change({ markdown })}
                    onComposition={editor.composition}
                  />
                </div>
              </>
            ) : editor.selected ? (
              <EmptyState
                title="读取笔记失败"
                action="重试"
                onAction={() => {
                  if (editor.selected) void editor.open(editor.selected)
                }}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      {unlockDialog}
      {editingView && (
        <NoteViewDialog
          view={editingView === "new" ? undefined : editingView}
          notebooks={data.notebooks}
          onClose={() => setEditingView(null)}
          onSaved={(view) => {
            data.rememberView(view)
            data.refreshBooks()
            void navigate("view:" + view.id)
          }}
        />
      )}
      <DeleteConfirm
        open={!!deletingView}
        onOpenChange={(open) => {
          if (!open) setDeletingView(null)
        }}
        title="删除视图"
        description="笔记仍保留。"
        onConfirm={async () => {
          if (!deletingView) return false
          try {
            await noteApi.deleteView(deletingView)
            if (currentView?.id === deletingView.id) await navigate("all")
            setDeletingView(null)
            data.refreshBooks()
            return true
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "删除视图失败")
            return false
          }
        }}
      />
      {pendingCreate && (
        <CreateLockedNoteDialog
          draft={pendingCreate}
          onClose={() => setPendingCreate(null)}
          onCreate={async (title) => {
            const note = await noteApi.save(
              { ...pendingCreate, title },
              pendingCreate.requestId
            )
            setPendingCreate(null)
            returnFocusId.current = note.id
            focusRestored.current = false
            setPagination((current) => ({ ...current, pageIndex: 0 }))
            data.refresh()
          }}
        />
      )}
      {bookDialog && (
        <NotebookDialog
          source={bookDialog === "new" ? null : bookDialog}
          onClose={() => setBookDialog(null)}
          onSaved={data.refreshBooks}
        />
      )}
      {historyOpen && editor.source && !editor.concealed && (
        <RevisionsDialog
          api={editor.api}
          note={editor.source}
          onClose={() => setHistoryOpen(false)}
          onLocked={onLocked}
          onRestore={async (revision) => {
            if (!(await editor.save())) throw new Error("请先保存当前修改")
            const target = getSource()
            if (!target) return
            const saved = await editor.api.restoreRevision(target, revision)
            await editor.open(saved)
            data.remember(saved)
            toast.success("已恢复")
          }}
        />
      )}
      {conflictOpen && editor.draft && editor.remote && !editor.concealed && (
        <ConflictDialog
          draft={editor.draft}
          remote={editor.remote}
          notebooks={data.notebooks}
          onClose={() => setConflictOpen(false)}
          onRemote={editor.useRemote}
          onCopy={editor.saveCopy}
        />
      )}
      <DeleteConfirm
        open={confirm === "delete" || confirm === "purge" || confirm === "book"}
        onOpenChange={(value) => {
          if (!value) setConfirm(null)
        }}
        title={
          confirm === "book"
            ? "删除笔记本"
            : confirm === "purge"
              ? "彻底删除笔记"
              : "移入回收站"
        }
        description={
          confirm === "book"
            ? "其中的笔记将移至未分类。"
            : confirm === "purge"
              ? "笔记及其历史版本将被删除。"
              : "可在回收站恢复这篇笔记。"
        }
        onConfirm={async () => {
          if (confirm !== "book")
            return runAction(confirm === "purge" ? "purge" : "delete")
          if (!selectedBook || !(await editor.save())) return false
          try {
            await noteApi.deleteNotebook(selectedBook)
            await navigate("book:unfiled")
            data.refreshBooks()
            return true
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "删除失败")
            return false
          }
        }}
      />
      <AlertDialog
        open={confirm === "export"}
        onOpenChange={(value) => {
          if (!value && !busy) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导出加锁笔记</AlertDialogTitle>
            <AlertDialogDescription>
              导出文件包含明文正文。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  setConfirm(null)
                  setUnlockPurpose("export")
                  setUnlockOpen(true)
                } finally {
                  setBusy(false)
                }
              }}
            >
              导出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(value) => {
          if (!value && !busy && blocker.state === "blocked") blocker.reset()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚有未保存修改</AlertDialogTitle>
            <AlertDialogDescription>
              离开前保存，或放弃当前草稿。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>继续编辑</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                editor.discard()
                if (blocker.state === "blocked") blocker.proceed()
              }}
            >
              放弃并离开
            </Button>
            <AlertDialogAction
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  if (await editor.save()) {
                    if (blocker.state === "blocked") blocker.proceed()
                  } else if (editor.concealed) {
                    if (blocker.state === "blocked") blocker.reset()
                    setUnlockOpen(true)
                  }
                } finally {
                  setBusy(false)
                }
              }}
            >
              保存并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
