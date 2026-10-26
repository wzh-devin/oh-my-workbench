import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import {
  DownloadIcon,
  MailIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  XIcon,
  ListTodoIcon,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/reui/badge"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Filters } from "@/components/reui/filters/filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type { FilterField } from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  SHEET_SHELL,
  SHEET_FOOTER,
} from "@/features/settings/components/sections/sheet-parts"
import {
  WorkbenchNavigation,
  EmptyState,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { ConnectionsTable } from "@/features/workbench/connections-table"
import { ConnectionDialog } from "@/features/workbench/dialogs"
import { EQUALITY_OPERATORS, matchesQuery } from "@/features/workbench/filters"
import { saveBlob } from "@/features/workbench/local-files"
import {
  formatTime,
  type MailAccount,
  type Message,
  type StorageConnection,
} from "@/features/workbench/model"
import { RecordHint, RecordsGrid } from "@/features/workbench/records-grid"
import {
  refreshConnection,
  updateWorkbench,
  useWorkbench,
} from "@/features/workbench/store"
import { newTask } from "@/features/todos/task-rules"

const FILTER_FIELDS: FilterField[] = [
  {
    id: "read",
    label: "阅读状态",
    type: "select",
    operators: EQUALITY_OPERATORS,
    options: [
      { value: "unread", label: "未读" },
      { value: "read", label: "已读" },
    ],
  },
  {
    id: "starred",
    label: "星标",
    type: "select",
    operators: EQUALITY_OPERATORS,
    options: [
      { value: "yes", label: "有星标" },
      { value: "no", label: "无星标" },
    ],
  },
]

/** 分类放入既有左侧导航，邮件详情沿用浮动抽屉。 */
export function Mail() {
  const navigate = useNavigate()
  const { data, busyIds } = useWorkbench()
  const [params, setParams] = useSearchParams()
  const accountId = params.get("account") ?? "all"
  const view = params.get("view") === "accounts" ? "accounts" : "inbox"
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState(() => createFilterQuery())
  const [configuring, setConfiguring] = useState<
    MailAccount | StorageConnection | "new" | null
  >(null)
  const messages = useMemo(
    () =>
      data.messages
        .filter(
          (message) =>
            (accountId === "all" || message.accountId === accountId) &&
            `${message.subject} ${message.sender} ${message.address} ${message.preview}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            matchesQuery(query, {
              read: message.read ? "read" : "unread",
              starred: message.starred ? "yes" : "no",
            })
        )
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)),
    [accountId, data.messages, query, search]
  )
  const selected = data.messages.find(
    (record) =>
      record.id === params.get("message") &&
      (accountId === "all" || record.accountId === accountId)
  )
  const [heldMessage, setHeldMessage] = useState(selected)
  if (selected && selected !== heldMessage) setHeldMessage(selected)
  const detail = selected ?? heldMessage
  const linkedTask = data.todos.find(
    (todo) => todo.source?.kind === "mail" && todo.source.id === detail?.id
  )
  const convertToTask = () => {
    if (!detail) return
    if (linkedTask) {
      navigate(`/todos?task=${encodeURIComponent(linkedTask.id)}`)
      return
    }
    let taskId = ""
    if (
      updateWorkbench((current) => {
        const existing = current.todos.find(
          (todo) => todo.source?.kind === "mail" && todo.source.id === detail.id
        )
        if (existing) {
          taskId = existing.id
          return current
        }
        const title = detail.subject.trim().slice(0, 200) || "邮件待办"
        const task = newTask(title, undefined, {
          note: detail.body.slice(0, 2000),
          source: { kind: "mail", id: detail.id, label: title },
        })
        taskId = task.id
        return { ...current, todos: [task, ...current.todos] }
      })
    )
      toast.success("待办已添加", {
        action: {
          label: "查看",
          onClick: () => navigate(`/todos?task=${encodeURIComponent(taskId)}`),
        },
      })
  }
  const selectedId = selected?.id
  useEffect(() => {
    if (selectedId)
      updateWorkbench((current) =>
        current.messages.some(
          (record) => record.id === selectedId && !record.read
        )
          ? {
              ...current,
              messages: current.messages.map((record) =>
                record.id === selectedId ? { ...record, read: true } : record
              ),
            }
          : current
      )
  }, [selectedId])
  const closeMessage = () => {
    const next = new URLSearchParams(params)
    next.delete("message")
    setParams(next)
  }
  const visibleAccounts = data.accounts.filter(
    (record) => accountId === "all" || record.id === accountId
  )
  const syncing = visibleAccounts.some((record) => busyIds.includes(record.id))
  const refresh = () =>
    visibleAccounts
      .filter((record) => record.status !== "paused")
      .forEach((record) => {
        void refreshConnection("mail", record.id)
      })
  const clearFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
    setParams({})
  }
  const columns: ColumnDef<DataGridFeatures, Message>[] = [
    {
      id: "starred",
      header: "星标",
      size: 52,
      meta: { headerClassName: "text-center", cellClassName: "text-center" },
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${row.original.starred ? "取消星标" : "添加星标"}：${row.original.subject}`}
          aria-pressed={row.original.starred}
          onClick={() =>
            updateWorkbench((current) => ({
              ...current,
              messages: current.messages.map((record) =>
                record.id === row.original.id
                  ? { ...record, starred: !record.starred }
                  : record
              ),
            }))
          }
        >
          <StarIcon
            className={
              row.original.starred
                ? "fill-foreground text-foreground"
                : "text-muted-foreground"
            }
            aria-hidden="true"
          />
        </Button>
      ),
    },
    {
      accessorKey: "sender",
      header: "发件人",
      size: 160,
      cell: ({ row }) => (
        <span
          className="block truncate text-sm font-normal"
          title={`${row.original.sender} <${row.original.address}>`}
        >
          {row.original.sender}
        </span>
      ),
    },
    {
      accessorKey: "subject",
      header: "邮件主题",
      enableSorting: true,
      size: 320,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to={`?${new URLSearchParams({ ...Object.fromEntries(params), message: row.original.id })}`}
            className="min-w-0 truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            title={row.original.subject}
          >
            {row.original.subject}
          </Link>
          {row.original.preview.trim() && (
            <RecordHint label={`查看摘要：${row.original.subject}`}>
              {row.original.preview}
            </RecordHint>
          )}
        </div>
      ),
    },
    {
      accessorKey: "accountId",
      header: "来源邮箱",
      size: 120,
      cell: ({ row }) => (
        <span className="block truncate text-sm text-muted-foreground">
          {
            data.accounts.find((record) => record.id === row.original.accountId)
              ?.name
          }
        </span>
      ),
    },
    {
      id: "read",
      header: "状态",
      size: 120,
      cell: ({ row }) => (
        <Badge variant={row.original.read ? "secondary" : "primary-light"}>
          {row.original.read ? "已读" : "未读"}
        </Badge>
      ),
    },
    {
      accessorKey: "receivedAt",
      header: "收件时间",
      enableSorting: true,
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatTime(row.original.receivedAt)}
        </span>
      ),
    },
    {
      id: "attachments",
      header: "附件",
      size: 80,
      meta: { headerClassName: "text-center", cellClassName: "text-center" },
      cell: ({ row }) =>
        row.original.attachments.length > 0 ? (
          <span className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <PaperclipIcon className="size-3.5" aria-hidden="true" />
            {row.original.attachments.length}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
  ]
  return (
    <>
      <WorkbenchNavigation
        title="邮箱分类"
        sections={[
          {
            id: "mail",
            title: "邮件",
            items: [
              {
                id: "all",
                label: "收件箱",
                icon: <MailIcon aria-hidden="true" />,
                badge: data.messages.filter((message) => !message.read).length,
              },
            ],
          },
          {
            id: "accounts",
            title: "邮箱",
            items: data.accounts.map((account) => ({
              id: account.id,
              label: account.name,
              icon: <MailIcon aria-hidden="true" />,
              badge: data.messages.filter(
                (message) => message.accountId === account.id && !message.read
              ).length,
            })),
          },
          {
            id: "manage",
            title: "管理",
            items: [
              {
                id: "accounts",
                label: "邮箱账号",
                icon: <MailIcon aria-hidden="true" />,
                badge: data.accounts.length,
              },
            ],
          },
        ]}
        activeItem={view === "accounts" ? "accounts" : accountId}
        onItemChange={(id) =>
          setParams(
            id === "accounts"
              ? { view: "accounts" }
              : id === "all"
                ? {}
                : { account: id }
          )
        }
      />
      <WorkbenchScreen
        title="邮箱"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={
                syncing ||
                !visibleAccounts.some((record) => record.status !== "paused")
              }
            >
              <RefreshCwIcon aria-hidden="true" />
              {syncing ? "同步中" : "同步"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setConfiguring("new")}
            >
              <PlusIcon aria-hidden="true" />
              添加邮箱
            </Button>
          </>
        }
      >
        {view === "inbox" ? (
          <RecordsGrid
            title={
              data.accounts.find((account) => account.id === accountId)?.name ??
              "收件箱"
            }
            icon={<MailIcon className="size-4" aria-hidden="true" />}
            records={messages}
            columns={columns}
            toolbar={
              <>
                <Input
                  aria-label="搜索邮件"
                  placeholder="搜索主题、发件人…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full sm:w-56"
                />
                <Filters
                  fields={FILTER_FIELDS}
                  query={query}
                  onQueryChange={setQuery}
                  size="sm"
                  labels={{ addFilter: "筛选" }}
                />
              </>
            }
            empty={
              <EmptyState
                title="这里还没有邮件"
                action={data.accounts.length ? "查看全部邮件" : "添加邮箱"}
                onAction={
                  data.accounts.length
                    ? clearFilters
                    : () => setConfiguring("new")
                }
              />
            }
          />
        ) : (
          <ConnectionsTable
            kind="mail"
            onEdit={setConfiguring}
            onAdd={() => setConfiguring("new")}
          />
        )}
      </WorkbenchScreen>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeMessage()
        }}
      >
        <SheetContent
          className={SHEET_SHELL}
          style={{ "--sheet-width": "760px" } as CSSProperties}
          showCloseButton={false}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
            <div className="flex min-w-0 flex-col gap-2">
              <SheetTitle>{detail?.subject ?? "邮件详情"}</SheetTitle>
              <SheetDescription>
                {detail?.sender} · {detail?.address}
              </SheetDescription>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="关闭邮件"
              onClick={closeMessage}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {detail && (
              <article className="flex flex-col gap-6 px-5 py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {
                        data.accounts.find(
                          (record) => record.id === detail.accountId
                        )?.name
                      }
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(detail.receivedAt)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={detail.starred}
                    onClick={() =>
                      updateWorkbench((current) => ({
                        ...current,
                        messages: current.messages.map((record) =>
                          record.id === detail.id
                            ? { ...record, starred: !record.starred }
                            : record
                        ),
                      }))
                    }
                  >
                    <StarIcon aria-hidden="true" />
                    {detail.starred ? "取消星标" : "添加星标"}
                  </Button>
                </div>
                <p className="text-sm leading-7 wrap-anywhere whitespace-pre-wrap">
                  {detail.body}
                </p>
                {detail.attachments.length > 0 && (
                  <div className="flex flex-col gap-3 border-t pt-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <PaperclipIcon className="size-4" aria-hidden="true" />
                      附件 · {detail.attachments.length}
                    </p>
                    {detail.attachments.map((attachment) => (
                      <div
                        key={attachment.name}
                        className="flex min-w-0 items-center justify-between gap-3"
                      >
                        <span className="truncate text-sm">
                          {attachment.name}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            saveBlob(
                              new Blob([attachment.content], {
                                type: "text/plain;charset=utf-8",
                              }),
                              attachment.name
                            )
                          }
                        >
                          <DownloadIcon aria-hidden="true" />
                          下载
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )}
          </ScrollArea>
          <div className={SHEET_FOOTER}>
            <span className="mr-auto text-xs text-muted-foreground">
              {detail
                ? data.accounts.find((record) => record.id === detail.accountId)
                    ?.email
                : ""}
            </span>
            <Button type="button" size="sm" onClick={convertToTask}>
              <ListTodoIcon aria-hidden="true" />
              {linkedTask ? "查看待办" : "转为待办"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={closeMessage}
            >
              关闭
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {configuring && (
        <ConnectionDialog
          kind="mail"
          source={configuring === "new" ? undefined : configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
    </>
  )
}
