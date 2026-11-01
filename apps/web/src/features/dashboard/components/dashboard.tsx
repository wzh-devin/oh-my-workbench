import { useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  FilesIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MailIcon,
  NetworkIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Choice,
  EmptyState,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { formatSize } from "@/features/workbench/model"
import {
  RecordsGrid,
  type RecordColumn,
} from "@/features/workbench/records-grid"
import { refreshConnection, useWorkbench } from "@/features/workbench/store"
import { activeAssets, assetHref } from "@/features/assets/asset-rules"
import { StatCard, SegmentBar } from "./stat-cards"
import { SectionHeader } from "./section-header"
import { WorkbenchActivity } from "./workbench-activity"
import { sortTasks } from "@/features/todos/task-rules"

import { updateTodo } from "@/features/todos/store"
import { TodoState } from "@/features/todos/components/todo-state"
import { useMail, loadMail } from "@/features/mail/store"
import { Skeleton } from "@/components/ui/skeleton"

type RecentRecord = {
  id: string
  title: string
  kind: "todo" | "mail" | "asset"
  source: string
  status: string
  timestamp: string
  href: string
  todoId?: string
}

/** 保留原 Dashboard 的四指标、活动/待处理区与底部主列表，只替换业务内容。 */
export function Dashboard() {
  const { data, busyIds } = useWorkbench()
  const mail = useMail()
  const navigate = useNavigate()
  const [kind, setKind] = useState("all")
  const [search, setSearch] = useState("")
  const assets = activeAssets(data)
  const pending = sortTasks(
    data.todos.filter((record) => !record.done),
    "due",
    data.todoPriorities
  )
  const unread =
    data.mailSummary?.unread ??
    data.messages.filter((record) => !record.read).length
  const mailTotal = data.mailSummary?.total ?? data.messages.length
  const connections = [
    ...data.accounts.map((record) => ({
      ...record,
      kind: "mail" as const,
      href: `/mail?view=accounts`,
      source: record.email,
    })),
    ...data.connections.map((record) => ({
      ...record,
      kind: "storage" as const,
      href: `/assets?view=connections`,
      source: record.bucket,
    })),
  ]
  const issues = connections.filter((record) => record.status === "error")
  const healthy = connections.filter(
    (record) => record.status === "connected"
  ).length
  const recent: RecentRecord[] = [
    ...data.todos.map((record): RecentRecord => ({
      id: `todo-${record.id}`,
      title: record.title,
      kind: "todo",
      source:
        data.todoLists.find((list) => list.id === record.listId)?.name ?? "",
      status: record.done ? "已完成" : "待完成",
      timestamp: record.createdAt,
      href: `/todos?list=${encodeURIComponent(record.listId)}&task=${encodeURIComponent(record.id)}`,
      todoId: record.id,
    })),
    ...data.messages.map((record): RecentRecord => ({
      id: `mail-${record.id}`,
      title: record.subject,
      kind: "mail",
      source:
        data.accounts.find((account) => account.id === record.accountId)
          ?.name ?? "",
      status: record.read ? "已读" : "未读",
      timestamp: record.receivedAt,
      href: `/mail?message=${encodeURIComponent(record.id)}`,
    })),
    ...assets.map((record): RecentRecord => ({
      id: `asset-${record.id}`,
      title: record.name,
      kind: "asset",
      source:
        data.connections.find(
          (connection) => connection.id === record.connectionId
        )?.name ?? "",
      status: "已保存",
      timestamp: record.createdAt,
      href: assetHref(record),
    })),
  ]
    .filter(
      (record) =>
        (kind === "all" || record.kind === kind) &&
        `${record.title} ${record.source}`
          .toLowerCase()
          .includes(search.toLowerCase())
    )
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  const columns: RecordColumn<RecentRecord>[] = [
    {
      accessorKey: "title",
      header: "内容",
      enableSorting: true,
      size: 320,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <Link
          to={row.original.href}
          className="block truncate text-sm font-normal underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          title={row.original.title}
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: "kind",
      header: "类型",
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {{ todo: "待办", mail: "邮件", asset: "文件" }[row.original.kind]}
        </span>
      ),
    },
    {
      accessorKey: "source",
      header: "来源",
      size: 160,
      cell: ({ row }) => (
        <span
          className="block truncate text-sm text-muted-foreground"
          title={row.original.source}
        >
          {row.original.source}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 120,
      cell: ({ row }) =>
        row.original.todoId ? (
          <span className="flex items-center gap-2">
            <Checkbox
              aria-label={`${row.original.status === "已完成" ? "取消完成" : "完成"}：${row.original.title}`}
              checked={row.original.status === "已完成"}
              disabled={busyIds.includes(row.original.todoId!)}
              onCheckedChange={(done) => {
                const todo = data.todos.find(
                  (record) => record.id === row.original.todoId
                )
                if (todo) void updateTodo(todo, { done })
              }}
            />
            <Badge
              variant={
                row.original.status === "已完成" ? "success-light" : "secondary"
              }
            >
              {row.original.status}
            </Badge>
          </span>
        ) : (
          <Badge
            variant={
              row.original.status === "未读" ? "primary-light" : "secondary"
            }
          >
            {row.original.status}
          </Badge>
        ),
    },
    {
      accessorKey: "timestamp",
      header: "记录时间",
      enableSorting: true,
      dataType: "datetime",
    },
  ]
  return (
    <WorkbenchScreen
      title="Dashboard"
      actions={
        <Button
          type="button"
          size="sm"
          nativeButton={false}
          render={<Link to="/todos" />}
        >
          <PlusIcon aria-hidden="true" />
          添加待办
        </Button>
      }
    >
      <TodoState>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<ListTodoIcon aria-hidden="true" />}
            title="待完成事项"
            period="当前"
            value={String(pending.length)}
            delta={null}
            basis={`${data.todoLists.length} 个清单 · ${data.todos.length} 项待办`}
            action={{ label: "处理待办", onClick: () => navigate("/todos") }}
          >
            <SegmentBar
              label="待办状态"
              segments={[
                {
                  key: "pending",
                  label: "待完成",
                  count: pending.length,
                  tone: "bg-muted-foreground/40",
                },
                {
                  key: "done",
                  label: "已完成",
                  count: data.todos.length - pending.length,
                  tone: "bg-success",
                },
              ]}
            />
          </StatCard>
          <StatCard
            icon={<MailIcon aria-hidden="true" />}
            title="未读邮件"
            period="QQ / Gmail"
            value={
              mail.status === "loading" ? (
                <Skeleton className="h-8 w-20" />
              ) : mail.status === "error" ? (
                "—"
              ) : (
                String(unread)
              )
            }
            delta={null}
            basis={`${data.accounts.length} 个账号 · ${mailTotal} 封邮件`}
            action={{
              label: mail.status === "error" ? "重试" : "打开收件箱",
              onClick: () =>
                mail.status === "error" ? void loadMail() : navigate("/mail"),
            }}
          >
            <SegmentBar
              label="邮件阅读状态"
              segments={[
                {
                  key: "unread",
                  label: "未读",
                  count: unread,
                  tone: "bg-primary",
                },
                {
                  key: "read",
                  label: "已读",
                  count: mailTotal - unread,
                  tone: "bg-muted-foreground/30",
                },
              ]}
            />
          </StatCard>
          <StatCard
            icon={<FilesIcon aria-hidden="true" />}
            title="文件资产"
            period="S3 / MinIO"
            value={String(data.assetSummary?.total ?? assets.length)}
            delta={null}
            basis={`${data.connections.length} 个存储 · ${formatSize(data.assetSummary?.size ?? assets.reduce((sum, record) => sum + record.size, 0))}`}
            action={{ label: "查看资产", onClick: () => navigate("/assets") }}
          >
            <SegmentBar
              label="文件来源"
              segments={[
                {
                  key: "sample",
                  label: "文档",
                  count:
                    data.assetSummary?.documents ??
                    assets.filter((record) =>
                      /\.(md|txt|pdf|docx?)$/i.test(record.name)
                    ).length,
                  tone: "bg-muted-foreground/30",
                },
                {
                  key: "upload",
                  label: "其他",
                  count: data.assetSummary
                    ? data.assetSummary.total - data.assetSummary.documents
                    : assets.filter(
                        (record) => !/\.(md|txt|pdf|docx?)$/i.test(record.name)
                      ).length,
                  tone: "bg-primary",
                },
              ]}
            />
          </StatCard>
          <StatCard
            icon={<NetworkIcon aria-hidden="true" />}
            title="正常连接"
            period="当前"
            value={String(healthy)}
            total={connections.length}
            delta={null}
            basis={`${connections.length} 个连接`}
            action={{
              label: "查看资源总览",
              onClick: () => navigate("/workflows"),
            }}
          >
            <SegmentBar
              label="连接状态"
              segments={[
                {
                  key: "ok",
                  label: "正常",
                  count: healthy,
                  tone: "bg-success",
                },
                {
                  key: "error",
                  label: "异常",
                  count: issues.length,
                  tone: "bg-destructive",
                },
              ]}
            />
          </StatCard>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <WorkbenchActivity data={data} onEmpty={() => navigate("/todos")} />
          <Card className="min-w-0 gap-0 py-0">
            <SectionHeader
              title="需要处理"
              description={`${pending.length} 项待办 · ${issues.length} 个异常连接`}
            />
            <CardContent className="flex flex-col gap-3 py-4">
              {issues.map((connection) => (
                <div
                  key={connection.id}
                  className="flex min-w-0 items-center gap-3 border-b pb-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Link
                      to={connection.href}
                      className="truncate text-sm font-normal hover:underline"
                    >
                      {connection.name}
                    </Link>
                    <Badge variant="destructive-light">连接异常</Badge>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={`重试：${connection.name}`}
                    disabled={busyIds.includes(connection.id)}
                    onClick={() => {
                      void refreshConnection(connection.kind, connection.id)
                    }}
                  >
                    <RefreshCwIcon aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {pending.slice(0, 3).map((todo) => (
                <div
                  key={todo.id}
                  className="flex min-w-0 flex-col gap-2 border-b pb-3 last:border-b-0"
                >
                  <Link
                    to={`/todos?list=${encodeURIComponent(todo.listId)}&task=${encodeURIComponent(todo.id)}`}
                    className="truncate text-sm font-normal hover:underline"
                  >
                    {todo.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {
                      data.todoLists.find((list) => list.id === todo.listId)
                        ?.name
                    }
                    {todo.dueDate ? ` · ${todo.dueDate}` : ""}
                  </span>
                </div>
              ))}
              {!issues.length && !pending.length && (
                <EmptyState
                  title="暂时没有待处理事项"
                  action="新增待办"
                  onAction={() => navigate("/todos")}
                />
              )}
            </CardContent>
          </Card>
        </div>
        <RecordsGrid
          title="最近记录"
          icon={<LayoutDashboardIcon className="size-4" aria-hidden="true" />}
          records={recent}
          columns={columns}
          toolbar={
            <>
              <div className="w-36">
                <Choice
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "all", label: "全部内容" },
                    { value: "todo", label: "Todo" },
                    { value: "mail", label: "邮件" },
                    { value: "asset", label: "文件" },
                  ]}
                  label="记录类型"
                />
              </div>
              <Input
                aria-label="搜索最近记录"
                placeholder="搜索内容或来源…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full sm:w-56"
              />
            </>
          }
          empty={
            <EmptyState
              title="没有匹配的记录"
              action="查看全部"
              onAction={() => {
                setKind("all")
                setSearch("")
              }}
            />
          }
        />
      </TodoState>
    </WorkbenchScreen>
  )
}
