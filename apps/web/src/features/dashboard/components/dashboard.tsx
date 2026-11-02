import { useState } from "react"
import type { PaginationState, SortingState } from "@tanstack/react-table"
import {
  dashboardStatisticsSchema,
  dashboardPageSchema,
  dashboardIssuesSchema,
  emptyStatistics,
  emptyDashboardPage,
  emptyIssues,
  useWorkbenchQuery,
} from "@/features/workbench/remote"
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
import { StatCard, SegmentBar } from "./stat-cards"
import { SectionHeader } from "./section-header"
import { WorkbenchActivity } from "./workbench-activity"

import { updateTodo } from "@/features/todos/store"
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
  version: number
}

/** 保留原 Dashboard 的四指标、活动/待处理区与底部主列表，只替换业务内容。 */
export function Dashboard() {
  const { data, busyIds } = useWorkbench()
  const navigate = useNavigate()
  const [kind, setKind] = useState("all")
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([])
  const summary = useWorkbenchQuery(
    "/statistics",
    dashboardStatisticsSchema,
    emptyStatistics
  )
  const issueQuery = useWorkbenchQuery(
    "/issues",
    dashboardIssuesSchema,
    emptyIssues
  )
  const sort = sorting[0]
    ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}`
    : "timestamp:desc"
  const queryKey = JSON.stringify([kind, search, sort])
  const [previousQuery, setPreviousQuery] = useState(queryKey)
  if (previousQuery !== queryKey) {
    setPreviousQuery(queryKey)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }
  const params = new URLSearchParams({
    pageNum: String(pagination.pageIndex + 1),
    pageSize: String(pagination.pageSize),
    kind,
    search,
    sort,
  })
  const recentQuery = useWorkbenchQuery(
    `/records/page?${params}`,
    dashboardPageSchema,
    emptyDashboardPage
  )
  const stats = summary.data,
    pending = issueQuery.data.pending,
    issues = issueQuery.data.connections,
    healthy = stats.healthy
  const unread = stats.mail.unread,
    mailTotal = stats.mail.total,
    recent = recentQuery.data.records
  const activityData = {
    ...data,
    todos: [],
    messages: [],
    assets: [],
    todoSummary: stats.todos,
    mailSummary: { ...data.mailSummary!, ...stats.mail },
    assetSummary: { ...data.assetSummary!, ...stats.assets },
  }
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
                void updateTodo(
                  { id: row.original.todoId!, version: row.original.version },
                  { done }
                )
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
        <>
          {(summary.status === "error" || issueQuery.status === "error") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                summary.reload()
                issueQuery.reload()
              }}
            >
              重新加载工作台
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            nativeButton={false}
            render={<Link to="/todos" />}
          >
            <PlusIcon aria-hidden="true" />
            添加待办
          </Button>
        </>
      }
    >
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<ListTodoIcon aria-hidden="true" />}
            title="待完成事项"
            period="当前"
            value={
              summary.status === "loading" ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                String(stats.todos.pending)
              )
            }
            delta={null}
            basis={`${stats.todos.listCount} 个清单 · ${stats.todos.total} 项待办`}
            action={{ label: "处理待办", onClick: () => navigate("/todos") }}
          >
            <SegmentBar
              label="待办状态"
              segments={[
                {
                  key: "pending",
                  label: "待完成",
                  count: stats.todos.pending,
                  tone: "bg-muted-foreground/40",
                },
                {
                  key: "done",
                  label: "已完成",
                  count: stats.todos.total - stats.todos.pending,
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
              summary.status === "loading" ? (
                <Skeleton className="h-8 w-20" />
              ) : summary.status === "error" ? (
                "—"
              ) : (
                String(unread)
              )
            }
            delta={null}
            basis={`${stats.mail.accountCount} 个账号 · ${mailTotal} 封邮件`}
            action={{
              label: summary.status === "error" ? "重试" : "打开收件箱",
              onClick: () =>
                summary.status === "error"
                  ? summary.reload()
                  : navigate("/mail"),
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
            value={String(stats.assets.total)}
            delta={null}
            basis={`${stats.storageCount} 个存储 · ${formatSize(stats.assets.size)}`}
            action={{ label: "查看资产", onClick: () => navigate("/assets") }}
          >
            <SegmentBar
              label="文件来源"
              segments={[
                {
                  key: "sample",
                  label: "文档",
                  count: stats.assets.documents,
                  tone: "bg-muted-foreground/30",
                },
                {
                  key: "upload",
                  label: "其他",
                  count: stats.assets.total - stats.assets.documents,
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
            total={stats.connectionTotal}
            delta={null}
            basis={`${stats.connectionTotal} 个连接`}
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
          <WorkbenchActivity
            data={activityData}
            onEmpty={() => navigate("/todos")}
          />
          <Card className="min-w-0 gap-0 py-0">
            <SectionHeader
              title="需要处理"
              description={`${stats.todos.pending} 项待办 · ${issues.length} 个异常连接`}
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
                    to={`/todos?list=${encodeURIComponent(todo.listId ?? "list-inbox")}&task=${encodeURIComponent(todo.id)}`}
                    className="truncate text-sm font-normal hover:underline"
                  >
                    {todo.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {todo.listName}
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
          loading={recentQuery.status === "loading"}
          server={{
            total: recentQuery.data.total,
            pagination,
            onPaginationChange: setPagination,
            sorting,
            onSortingChange: setSorting,
          }}
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
              title={
                recentQuery.status === "error"
                  ? "记录读取失败"
                  : "没有匹配的记录"
              }
              action={recentQuery.status === "error" ? "重试" : "查看全部"}
              onAction={() => {
                if (recentQuery.status === "error") {
                  recentQuery.reload()
                  return
                }
                setKind("all")
                setSearch("")
              }}
            />
          }
        />
      </>
    </WorkbenchScreen>
  )
}
