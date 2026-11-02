import { useEffect, useMemo, useState, type FormEvent } from "react"
import { activateResource } from "@/lib/requests/invalidation"
import { Link, useSearchParams } from "react-router"
import {
  CalendarDaysIcon,
  InboxIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  MoreHorizontalIcon,
  Settings2Icon,
  ListChecksIcon,
} from "lucide-react"
import type { PaginationState } from "@tanstack/react-table"
import { useTaskPage } from "../use-task-page"
import { todoApi } from "../api"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Badge } from "@/components/reui/badge"
import { RuleFilters } from "@/components/shared/rule-filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Choice,
  EmptyState,
  WorkbenchNavigation,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { DeleteConfirm } from "@/features/workbench/dialogs"
import { type Todo } from "@/features/workbench/model"
import { RecordHint, RecordsGrid } from "@/features/workbench/records-grid"
import { useWorkbench } from "@/features/workbench/store"
import { INBOX_ID, newTask } from "../task-rules"
import { useToday } from "../use-today"
import {
  createTodo,
  updateTodo,
  deleteTodo,
  deleteTodoList,
  deleteTodoView,
  useTodos,
  loadTodos,
  rememberTodos,
} from "../store"
import { TodoState } from "./todo-state"
import { TodoImport } from "./todo-import"
import { ListDialog } from "./list-dialog"
import { TodoEditor } from "./todo-editor"
import { ViewDialog, todoRuleFields } from "./view-dialog"
import { TODO_FILTER_LABELS } from "../filter-labels"
import { ViewIcon } from "./view-icons"
import { PriorityBadge, PriorityDialog } from "./priority-dialog"
import { TodoDatePicker } from "./todo-date-picker"
import {
  compileTodoViews,
  compileTodoRule,
  queryToRule,
  viewTaskDefaults,
} from "../view-rules"
import type { TodoView } from "../configuration"

/** 智能视图只派生任务；清单、日期计划和截止日期保持各自含义。 */
export function Todos() {
  const { data } = useWorkbench()
  const { busyIds, status, userId, counts } = useTodos()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  useEffect(() => {
    const release = activateResource("todos")
    if (userId) void loadTodos()
    return release
  }, [userId])
  const [editorRevision, setEditorRevision] = useState(0)
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const listId = params.get("list")
  const compiledViews = useMemo(
    () =>
      compileTodoViews(
        data.todoViews,
        data.todoLists.map((list) => list.id),
        today
      ),
    [data.todoViews, data.todoLists, today]
  )
  const selectedView =
    compiledViews.find(
      (entry) =>
        entry.view.id === params.get("view") ||
        entry.view.builtinKey === params.get("view")
    ) ?? compiledViews[0]
  const currentView = selectedView?.view
  const [editingView, setEditingView] = useState<TodoView | "new" | null>(null)
  const [prioritiesOpen, setPrioritiesOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<string | null>(null)
  const [query, setQuery] = useState(() => createFilterQuery())
  const [editing, setEditing] = useState<Todo | "new" | null>(null)
  const [editingList, setEditingList] = useState<
    { id: string; name: string } | "new" | null
  >(null)
  const [deleting, setDeleting] = useState<Todo | "list" | "view" | null>(null)
  const [quickTitle, setQuickTitle] = useState("")
  const currentList = data.todoLists.find((list) => list.id === listId)
  const target =
    editing ?? data.todos.find((todo) => todo.id === params.get("task")) ?? null
  const title = listId
    ? (currentList?.name ?? "清单不存在")
    : (currentView?.name ?? "待办")
  const fields = todoRuleFields(data.todoLists, data.todoPriorities)
  const defaults = listId ? {} : viewTaskDefaults(currentView, today)
  const temporaryRule = useMemo(() => {
    try {
      return {
        match: compileTodoRule(queryToRule(query, false), today),
        error: null,
      }
    } catch (error) {
      return {
        match: () => false,
        error: error instanceof Error ? error.message : "筛选条件不正确",
      }
    }
  }, [query, today])
  const viewError = !listId ? selectedView?.error : undefined
  useEffect(() => {
    if (!viewError || !currentView) return
    toast.error(viewError, {
      id: "todo-view-rule",
      action: { label: "编辑视图", onClick: () => setEditingView(currentView) },
    })
    return () => {
      toast.dismiss("todo-view-rule")
    }
  }, [viewError, currentView])
  useEffect(() => {
    if (!temporaryRule.error) return
    toast.error(temporaryRule.error, {
      id: "todo-filter-rule",
      action: {
        label: "清除筛选",
        onClick: () => setQuery(createFilterQuery()),
      },
    })
    return () => {
      toast.dismiss("todo-filter-rule")
    }
  }, [temporaryRule.error])
  const queryKey = JSON.stringify({
    listId,
    viewId: currentView?.id,
    search,
    sort,
    query,
  })
  const [previousQuery, setPreviousQuery] = useState(queryKey)
  if (previousQuery !== queryKey) {
    setPreviousQuery(queryKey)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }
  const page = useTaskPage(
    {
      pageNum: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      viewId: currentView?.id ?? "",
      listId: listId ?? "",
      search,
      sort: sort ?? currentView?.sort ?? "due",
      ...(query.rules.length ? { filterQuery: queryToRule(query, false) } : {}),
    },
    status === "ready" && !viewError && !temporaryRule.error
  )
  const records = page.records
  const taskId = params.get("task")
  const cachedTask = data.todos.some((task) => task.id === taskId)
  useEffect(() => {
    if (!taskId || !userId || cachedTask) return
    const controller = new AbortController()
    void todoApi
      .detail(taskId, controller.signal)
      .then((task) => {
        if (!controller.signal.aborted) rememberTodos([task], userId)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          toast.error(error instanceof Error ? error.message : "待办不可用")
      })
    return () => controller.abort()
  }, [taskId, userId, cachedTask])
  const clearFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
  }
  const closeEditor = () => {
    setEditing(null)
    const next = new URLSearchParams(params)
    next.delete("task")
    setParams(next)
  }
  const changeNavigation = (id: string) => {
    page.retry()
    setPagination((current) => ({ ...current, pageIndex: 0 }))
    setSearch("")
    setQuery(createFilterQuery())
    setSort(null)
    setParams(
      id.startsWith("view:") ? { view: id.slice(5) } : { list: id.slice(5) }
    )
  }
  /** 快捷录入也经过服务端保存，成功后才清空输入和筛选。 */
  const quickAdd = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const task = newTask(
        quickTitle.trim(),
        currentList?.id ?? INBOX_ID,
        defaults
      )
      const saved = await createTodo({
        title: task.title,
        listId: task.listId,
        ...defaults,
      })
      if (!saved) return
      setQuickTitle("")
      setSearch("")
      setQuery(createFilterQuery())
      if (!listId && !selectedView?.match(saved))
        setParams({ list: saved.listId })
      toast.success("待办已添加")
    } catch {
      toast.error("请输入 1～200 字的待办内容。")
    }
  }
  const columns: ColumnDef<DataGridFeatures, Todo>[] = [
    {
      accessorKey: "title",
      header: "待办内容",
      size: 320,
      enableResizing: false,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox
            aria-label={`${row.original.done ? "取消完成" : "完成"}：${row.original.title}`}
            checked={row.original.done}
            disabled={busyIds.includes(row.original.id)}
            onCheckedChange={(done) => void updateTodo(row.original, { done })}
          />
          <Link
            to={`?${new URLSearchParams({ ...Object.fromEntries(params), task: row.original.id })}`}
            className={`min-w-0 truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring ${row.original.done ? "text-muted-foreground line-through" : "text-foreground"}`}
          >
            {row.original.title}
          </Link>
          {row.original.steps.length > 0 && (
            <span
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
              aria-label={`步骤：${row.original.steps.filter((step) => step.done).length}/${row.original.steps.length}`}
            >
              <ListChecksIcon className="size-3.5" aria-hidden="true" />
              {row.original.steps.filter((step) => step.done).length}/
              {row.original.steps.length}
            </span>
          )}
          {(row.original.note.trim() || row.original.tags.length > 0) && (
            <RecordHint label={`查看待办信息：${row.original.title}`}>
              <span className="flex flex-col gap-2">
                {row.original.note.trim() && <span>{row.original.note}</span>}
                {row.original.tags.length > 0 && (
                  <span>标签：{row.original.tags.join("、")}</span>
                )}
              </span>
            </RecordHint>
          )}
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "优先级",
      size: 120,
      enableResizing: false,
      cell: ({ row }) => (
        <PriorityBadge
          priority={data.todoPriorities.find(
            (p) => p.value === row.original.priority
          )}
        />
      ),
    },
    {
      accessorKey: "dueDate",
      header: "截止日期",
      size: 120,
      enableResizing: false,
      cell: ({ row }) =>
        row.original.dueDate ? (
          <Badge
            className="max-w-full"
            title={row.original.dueDate}
            variant={
              !row.original.done && row.original.dueDate < today
                ? "destructive-light"
                : row.original.dueDate === today && !row.original.done
                  ? "primary-light"
                  : "outline"
            }
          >
            <CalendarDaysIcon aria-hidden="true" />
            <span className="truncate">
              {row.original.dueDate === today
                ? "今天"
                : row.original.dueDate.startsWith(today.slice(0, 4))
                  ? row.original.dueDate.slice(5)
                  : row.original.dueDate}
              {!row.original.done && row.original.dueDate < today
                ? " · 逾期"
                : ""}
            </span>
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "listId",
      header: "所属清单",
      size: 120,
      enableResizing: false,
      cell: ({ row }) => (
        <span className="block truncate text-sm text-muted-foreground">
          {data.todoLists.find((list) => list.id === row.original.listId)?.name}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      size: 80,
      enableResizing: false,
      meta: { align: "center" },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <TodoDatePicker
            id={`planned-${row.original.id}`}
            value={row.original.plannedFor ?? ""}
            label={`计划日期：${row.original.title}`}
            compact
            disabled={busyIds.includes(row.original.id)}
            onChange={(value) =>
              void updateTodo(row.original, { plannedFor: value || null })
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`待办操作：${row.original.title}`}
                />
              }
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <PencilIcon aria-hidden="true" />
                编辑待办
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon aria-hidden="true" />
                删除待办
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
  return (
    <>
      <WorkbenchNavigation
        title="待办清单"
        activeItem={listId ? `list:${listId}` : `view:${currentView?.id ?? ""}`}
        onItemChange={changeNavigation}
        sections={[
          {
            id: "views",
            title: "智能视图",
            action: (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="新建视图"
                disabled={status !== "ready"}
                onClick={() => setEditingView("new")}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            ),
            items: compiledViews.map(({ view, error }) => ({
              id: `view:${view.id}`,
              label: view.name,
              icon: <ViewIcon name={view.icon} />,
              ...(error ? {} : { badge: counts[`view:${view.id}`] ?? 0 }),
            })),
          },
          {
            id: "lists",
            title: "清单",
            action: (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="新建清单"
                title="新建清单"
                disabled={status !== "ready"}
                onClick={() => setEditingList("new")}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            ),
            items: data.todoLists.map((list) => ({
              id: `list:${list.id}`,
              label: list.name,
              icon:
                list.id === INBOX_ID ? (
                  <InboxIcon aria-hidden="true" />
                ) : (
                  <ListTodoIcon aria-hidden="true" />
                ),
              badge: counts[`list:${list.id}`] ?? 0,
            })),
          },
        ]}
      />
      <WorkbenchScreen
        title={title}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="更多待办操作"
                    title="更多操作"
                    disabled={status !== "ready"}
                  />
                }
              >
                <MoreHorizontalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!listId && currentView && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setEditingView(currentView)}
                    >
                      <PencilIcon aria-hidden="true" />
                      编辑视图
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={data.todoViews.length <= 1}
                      onClick={() => setDeleting("view")}
                    >
                      <Trash2Icon aria-hidden="true" />
                      {data.todoViews.length <= 1
                        ? "至少保留一个视图"
                        : "删除视图"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {currentList && currentList.id !== INBOX_ID && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setEditingList(currentList)}
                    >
                      <PencilIcon aria-hidden="true" />
                      重命名清单
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleting("list")}
                    >
                      <Trash2Icon aria-hidden="true" />
                      删除清单
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setPrioritiesOpen(true)}>
                  <Settings2Icon aria-hidden="true" />
                  管理优先级
                </DropdownMenuItem>
                <TodoImport />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              onClick={() => setEditing("new")}
              disabled={status !== "ready"}
            >
              <PlusIcon aria-hidden="true" />
              新增待办
            </Button>
          </>
        }
      >
        <TodoState>
          <RecordsGrid
            fillHeight
            title={title}
            icon={<ListTodoIcon className="size-4" aria-hidden="true" />}
            records={records}
            loading={page.status === "loading"}
            server={{
              total: page.total,
              pagination,
              onPaginationChange: setPagination,
              sorting: [],
              onSortingChange: () => {},
            }}
            columns={columns}
            leadingContent={
              <>
                <form className="flex items-center gap-2" onSubmit={quickAdd}>
                  <Input
                    aria-label="快速添加待办"
                    disabled={busyIds.includes("task:create")}
                    placeholder="添加待办…"
                    value={quickTitle}
                    maxLength={200}
                    onChange={(event) => setQuickTitle(event.target.value)}
                  />
                  <Button
                    type="submit"
                    size="default"
                    disabled={
                      !quickTitle.trim() || busyIds.includes("task:create")
                    }
                  >
                    添加
                  </Button>
                </form>
              </>
            }
            toolbar={
              <>
                <Input
                  aria-label="搜索待办"
                  placeholder="搜索待办、标签或步骤…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full sm:w-56"
                />
                <div className="w-36">
                  <Choice
                    value={sort ?? currentView?.sort ?? "due"}
                    onChange={setSort}
                    options={[
                      { value: "due", label: "按截止日期" },
                      { value: "priority", label: "按优先级" },
                      { value: "newest", label: "按创建时间" },
                    ]}
                    label="待办排序"
                  />
                </div>
                <RuleFilters
                  fields={fields}
                  query={query}
                  onQueryChange={setQuery}
                  labels={TODO_FILTER_LABELS}
                />
              </>
            }
            empty={
              <EmptyState
                title={
                  page.status === "error"
                    ? "待办读取失败"
                    : search || query.rules.length
                      ? "没有匹配的待办"
                      : "暂无待办"
                }
                action={
                  page.status === "error"
                    ? "重试"
                    : search || query.rules.length
                      ? "清除筛选"
                      : "新增待办"
                }
                onAction={
                  page.status === "error"
                    ? page.retry
                    : search || query.rules.length
                      ? clearFilters
                      : () => setEditing("new")
                }
              />
            }
          />
        </TodoState>
      </WorkbenchScreen>
      {target && (
        <TodoEditor
          key={`${target === "new" ? "new" : target.id}:${editorRevision}`}
          todo={target === "new" ? undefined : target}
          listId={currentList?.id ?? INBOX_ID}
          defaults={defaults}
          onClose={closeEditor}
          onReload={() => {
            if (target !== "new") {
              setEditing(
                data.todos.find((todo) => todo.id === target.id) ?? null
              )
              setEditorRevision((value) => value + 1)
            }
          }}
        />
      )}
      {editingList && (
        <ListDialog
          source={editingList === "new" ? undefined : editingList}
          onClose={() => setEditingList(null)}
        />
      )}
      {editingView && (
        <ViewDialog
          source={editingView === "new" ? undefined : editingView}
          onClose={() => setEditingView(null)}
          onSaved={(view) => {
            setParams({ view: view.id })
            clearFilters()
            setSort(null)
          }}
        />
      )}
      {prioritiesOpen && (
        <PriorityDialog onClose={() => setPrioritiesOpen(false)} />
      )}
      <DeleteConfirm
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting === "view"
            ? "删除这个视图？"
            : deleting === "list"
              ? "删除这个清单？"
              : "删除这条待办？"
        }
        description={
          deleting === "view"
            ? `“${currentView?.name ?? ""}”`
            : deleting === "list"
              ? `${counts[`listTotal:${listId}`] ?? 0} 项待办将移入收集箱。`
              : `“${deleting?.title ?? ""}”`
        }
        onConfirm={async () => {
          const saved =
            deleting === "view" && currentView
              ? await deleteTodoView(currentView)
              : deleting === "list"
                ? await deleteTodoList(listId ?? "")
                : deleting && deleting !== "view"
                  ? await deleteTodo(deleting)
                  : false
          if (saved && deleting === "list") setParams({ list: INBOX_ID })
          if (saved && deleting === "view") {
            const remaining = data.todoViews.find(
              (v) => v.id !== currentView?.id
            )
            if (remaining) setParams({ view: remaining.id })
            clearFilters()
            setSort(null)
          }
          return saved
        }}
      />
    </>
  )
}
