import { useMemo, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router"
import {
  CalendarDaysIcon,
  CheckCheckIcon,
  FlagIcon,
  InboxIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  Trash2Icon,
  MoreHorizontalIcon,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Badge } from "@/components/reui/badge"
import { Filters } from "@/components/reui/filters/filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type { FilterField } from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Choice,
  EmptyState,
  WorkbenchNavigation,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { DeleteConfirm, ListDialog } from "@/features/workbench/dialogs"
import { EQUALITY_OPERATORS, matchesQuery } from "@/features/workbench/filters"
import { type Todo } from "@/features/workbench/model"
import { RecordHint, RecordsGrid } from "@/features/workbench/records-grid"
import { updateWorkbench, useWorkbench } from "@/features/workbench/store"
import {
  completeTask,
  INBOX_ID,
  inTaskView,
  newTask,
  offsetDate,
  PRIORITIES,
  removeList,
  sortTasks,
  TASK_VIEWS,
} from "../task-rules"
import { useToday } from "../use-today"
import { TodoEditor } from "./todo-editor"

/** 智能视图只派生任务；清单、日期计划和截止日期保持各自含义。 */
export function Todos() {
  const { data } = useWorkbench()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const listId = params.get("list")
  const view = TASK_VIEWS.some((item) => item.id === params.get("view"))
    ? params.get("view")!
    : "all"
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("due")
  const [query, setQuery] = useState(() => createFilterQuery())
  const [editing, setEditing] = useState<Todo | "new" | null>(null)
  const [editingList, setEditingList] = useState<
    { id: string; name: string } | "new" | null
  >(null)
  const [deleting, setDeleting] = useState<Todo | "list" | null>(null)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickError, setQuickError] = useState("")
  const currentList = data.todoLists.find((list) => list.id === listId)
  const target =
    editing ?? data.todos.find((todo) => todo.id === params.get("task")) ?? null
  const title = listId
    ? (currentList?.name ?? "清单不存在")
    : TASK_VIEWS.find((item) => item.id === view)!.label
  const tags = [...new Set(data.todos.flatMap((todo) => todo.tags))].sort()
  const fields: FilterField[] = [
    {
      id: "status",
      label: "完成状态",
      type: "select",
      operators: EQUALITY_OPERATORS,
      options: [
        { value: "pending", label: "未完成" },
        { value: "done", label: "已完成" },
      ],
    },
    {
      id: "priority",
      label: "优先级",
      type: "select",
      operators: EQUALITY_OPERATORS,
      options: PRIORITIES,
    },
    {
      id: "tags",
      label: "标签",
      type: "select",
      operators: EQUALITY_OPERATORS,
      options: tags.map((tag) => ({ value: tag, label: tag })),
    },
  ]
  const defaults: Partial<Todo> = listId
    ? {}
    : view === "myday"
      ? { plannedFor: today || null }
      : view === "today"
        ? { dueDate: today || null }
        : view === "important"
          ? { priority: 2 }
          : view === "upcoming"
            ? { dueDate: today ? offsetDate(today, 1) : null }
            : {}
  const records = useMemo(
    () =>
      sortTasks(
        data.todos.filter(
          (todo) =>
            (listId ? todo.listId === listId : inTaskView(todo, view, today)) &&
            `${todo.title} ${todo.note} ${todo.tags.join(" ")} ${todo.steps.map((step) => step.title).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            matchesQuery(query, {
              status: todo.done ? "done" : "pending",
              priority: String(todo.priority),
              tags: todo.tags,
            })
        ),
        sort
      ),
    [data.todos, listId, view, today, search, query, sort]
  )
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
    setSearch("")
    setQuery(createFilterQuery())
    setParams(
      TASK_VIEWS.some((item) => item.id === id)
        ? id === "all"
          ? {}
          : { view: id }
        : { list: id }
    )
  }
  const quickAdd = (event: FormEvent) => {
    event.preventDefault()
    try {
      const task = newTask(
        quickTitle.trim(),
        currentList?.id ?? INBOX_ID,
        defaults
      )
      if (
        !updateWorkbench((current) => ({
          ...current,
          todos: [task, ...current.todos],
        }))
      ) {
        setQuickError("添加失败，请重试。")
        return
      }
      setQuickTitle("")
      setQuickError("")
      setSearch("")
      setQuery(createFilterQuery())
      if (["completed", "overdue"].includes(view) && !listId)
        setParams({ list: INBOX_ID })
      toast.success("待办已添加")
    } catch {
      setQuickError("请输入 1～200 字的待办内容。")
    }
  }
  const columns: ColumnDef<DataGridFeatures, Todo>[] = [
    {
      id: "done",
      header: "完成",
      size: 52,
      enableResizing: false,
      meta: { headerClassName: "text-center", cellClassName: "text-center" },
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Checkbox
            aria-label={`${row.original.done ? "取消完成" : "完成"}：${row.original.title}`}
            checked={row.original.done}
            onCheckedChange={(done) =>
              updateWorkbench((current) => ({
                ...current,
                todos: current.todos.map((todo) =>
                  todo.id === row.original.id
                    ? completeTask(todo, done, new Date().toISOString())
                    : todo
                ),
              }))
            }
          />
        </div>
      ),
    },
    {
      accessorKey: "title",
      header: "待办内容",
      size: 320,
      enableResizing: false,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to={`?${new URLSearchParams({ ...Object.fromEntries(params), task: row.original.id })}`}
            className={`min-w-0 truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring ${row.original.done ? "text-muted-foreground line-through" : "text-foreground"}`}
          >
            {row.original.title}
          </Link>
          {row.original.note.trim() && (
            <RecordHint label={`查看备注：${row.original.title}`}>
              {row.original.note}
            </RecordHint>
          )}
        </div>
      ),
    },
    {
      id: "tags",
      header: "标签",
      size: 120,
      enableResizing: false,
      cell: ({ row }) => (
        <span
          className="block truncate text-sm text-muted-foreground"
          title={row.original.tags.join("、")}
        >
          {row.original.tags.join("、") || "—"}
        </span>
      ),
    },
    {
      id: "steps",
      header: "步骤",
      size: 120,
      enableResizing: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.steps.length > 0
            ? `${row.original.steps.filter((step) => step.done).length}/${row.original.steps.length}`
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "priority",
      header: "优先级",
      size: 120,
      enableResizing: false,
      cell: ({ row }) =>
        row.original.priority === 4 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <Badge
            variant={
              row.original.priority === 1
                ? "destructive-light"
                : row.original.priority === 2
                  ? "warning-light"
                  : row.original.priority === 3
                    ? "primary-light"
                    : "secondary"
            }
          >
            {
              PRIORITIES.find(
                (option) => option.value === String(row.original.priority)
              )?.label
            }
          </Badge>
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
      meta: { headerClassName: "text-center" },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant={row.original.plannedFor === today ? "secondary" : "ghost"}
            aria-label={`${row.original.plannedFor === today ? "移出" : "加入"}我的一天：${row.original.title}`}
            aria-pressed={row.original.plannedFor === today}
            disabled={row.original.done || !today}
            onClick={() =>
              updateWorkbench((current) => ({
                ...current,
                todos: current.todos.map((todo) =>
                  todo.id === row.original.id
                    ? {
                        ...todo,
                        plannedFor: todo.plannedFor === today ? null : today,
                      }
                    : todo
                ),
              }))
            }
          >
            <SunIcon aria-hidden="true" />
          </Button>
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
        activeItem={listId ?? view}
        onItemChange={changeNavigation}
        sections={[
          {
            id: "views",
            title: "智能视图",
            items: TASK_VIEWS.map((item) => ({
              ...item,
              icon:
                item.id === "myday" ? (
                  <SunIcon aria-hidden="true" />
                ) : item.id === "important" ? (
                  <FlagIcon aria-hidden="true" />
                ) : item.id === "completed" ? (
                  <CheckCheckIcon aria-hidden="true" />
                ) : (
                  <ListTodoIcon aria-hidden="true" />
                ),
              badge: data.todos.filter(
                (todo) =>
                  inTaskView(todo, item.id, today) &&
                  (item.id === "completed" || !todo.done)
              ).length,
            })),
          },
          {
            id: "lists",
            title: "清单",
            items: data.todoLists.map((list) => ({
              id: list.id,
              label: list.name,
              icon:
                list.id === INBOX_ID ? (
                  <InboxIcon aria-hidden="true" />
                ) : (
                  <ListTodoIcon aria-hidden="true" />
                ),
              badge: data.todos.filter(
                (todo) => todo.listId === list.id && !todo.done
              ).length,
            })),
          },
        ]}
      />
      <WorkbenchScreen
        title={title}
        actions={
          <>
            {currentList && currentList.id !== INBOX_ID && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="清单操作"
                    />
                  }
                >
                  <MoreHorizontalIcon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditingList(currentList)}>
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingList("new")}
            >
              新建清单
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing("new")}>
              <PlusIcon aria-hidden="true" />
              新增待办
            </Button>
          </>
        }
      >
        <form className="flex items-center gap-2" onSubmit={quickAdd}>
          <Input
            aria-label="快速添加待办"
            placeholder="添加待办…"
            value={quickTitle}
            maxLength={200}
            onChange={(event) => setQuickTitle(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!quickTitle.trim()}>
            <PlusIcon aria-hidden="true" />
            添加
          </Button>
        </form>
        {quickError && (
          <p role="alert" className="text-sm text-destructive">
            {quickError}
          </p>
        )}
        <RecordsGrid
          title={title}
          icon={<ListTodoIcon className="size-4" aria-hidden="true" />}
          records={records}
          columns={columns}
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
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "due", label: "按截止日期" },
                    { value: "priority", label: "按优先级" },
                    { value: "newest", label: "按创建时间" },
                  ]}
                  label="待办排序"
                />
              </div>
              <Filters
                fields={fields}
                query={query}
                onQueryChange={setQuery}
                size="sm"
                labels={{ addFilter: "筛选", clear: "清除" }}
              />
            </>
          }
          empty={
            <EmptyState
              title={
                search || query.rules.length ? "没有匹配的待办" : "暂无待办"
              }
              action={search || query.rules.length ? "清除筛选" : "新增待办"}
              onAction={
                search || query.rules.length
                  ? clearFilters
                  : () => setEditing("new")
              }
            />
          }
        />
      </WorkbenchScreen>
      {target && (
        <TodoEditor
          key={target === "new" ? "new" : target.id}
          todo={target === "new" ? undefined : target}
          listId={currentList?.id ?? INBOX_ID}
          defaults={defaults}
          onClose={closeEditor}
        />
      )}
      {editingList && (
        <ListDialog
          source={editingList === "new" ? undefined : editingList}
          onClose={() => setEditingList(null)}
        />
      )}
      <DeleteConfirm
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting === "list" ? "删除这个清单？" : "删除这条待办？"}
        description={
          deleting === "list"
            ? `${data.todos.filter((todo) => todo.listId === listId).length} 项待办将移入收集箱。`
            : `“${deleting?.title ?? ""}”`
        }
        onConfirm={() => {
          const saved = updateWorkbench((current) =>
            deleting === "list"
              ? removeList(current, listId ?? "")
              : {
                  ...current,
                  todos: current.todos.filter(
                    (todo) => todo.id !== deleting?.id
                  ),
                }
          )
          if (saved && deleting === "list") setParams({ list: INBOX_ID })
          return saved
        }}
      />
    </>
  )
}
