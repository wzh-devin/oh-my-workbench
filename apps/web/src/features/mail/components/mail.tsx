import { useCallback, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"
import {
  MailIcon,
  ArchiveIcon,
  CheckCheckIcon,
  EllipsisIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
} from "lucide-react"
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table"
import { Badge } from "@/components/reui/badge"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { RuleFilters } from "@/components/shared/rule-filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  WorkbenchNavigation,
  EmptyState,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { ConnectionsTable } from "@/features/workbench/connections-table"
import { RecordHint, RecordsGrid } from "@/features/workbench/records-grid"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { mailFilterFields } from "./filter-fields"
import { useMessagePage } from "../use-message-page"
import { formatMailTime } from "../model"
import { mailFilterRule } from "../filters"
import type { Message } from "../model"
import {
  bulkMailMessages,
  changeMailMessage,
  loadMail,
  syncMailAccount,
  useMail,
} from "../store"
import { MailAccountDialog } from "./account-dialog"
import { MailDetail } from "./mail-detail"
import { MailProviderIcon } from "./mail-provider-icon"

/** Query one server page; shared totals and account navigation use the complete overview. */
export function Mail() {
  const mail = useMail()
  const accounts = mail.overview.accounts
  const [params, setParams] = useSearchParams()
  const accountId = params.get("account") ?? "all"
  const syncing = accounts.some(
    (account) =>
      (accountId === "all" || account.id === accountId) &&
      (account.syncing || mail.busyIds.includes(`sync:${account.id}`))
  )
  const view =
    params.get("view") === "accounts"
      ? "accounts"
      : params.get("view") === "archived"
        ? "archived"
        : "inbox"
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState(() => createFilterQuery())
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([])
  const rule = useMemo(() => mailFilterRule(query), [query])
  const fields = useMemo(() => mailFilterFields(accounts), [accounts])
  const sort =
    sorting[0]?.id === "subject"
      ? "subject"
      : sorting[0]?.desc === false
        ? "oldest"
        : "newest"
  const scope = {
    accountId,
    searchText: search,
    filterQuery: rule,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    sort,
    archived: view === "archived",
  } as const
  const resetPage = useCallback(
    () => setPagination((current) => ({ ...current, pageIndex: 0 })),
    []
  )
  const { result, status, retry } = useMessagePage(
    scope,
    mail.revision,
    view !== "accounts" && mail.status === "ready",
    resetPage,
    mail.userId
  )
  const bulk = async (action: "read" | "archive-read") => {
    try {
      const filterQuery = mailFilterRule(query, true)
      const saved = await bulkMailMessages({ ...scope, filterQuery }, action)
      if (saved)
        toast.success(
          `已${action === "read" ? "标记已读" : "归档"} ${saved.affected} 封邮件`
        )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "请检查筛选条件")
    }
  }
  const clearFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
    resetPage()
  }
  const refresh = () => {
    for (const account of accounts.filter(
      (item) => item.enabled && (accountId === "all" || accountId === item.id)
    ))
      void syncMailAccount(account.id)
  }
  const columns: ColumnDef<DataGridFeatures, Message>[] = [
    {
      id: "starred",
      header: "星标",
      size: 52,
      meta: { align: "center" },
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${row.original.starred ? "取消星标" : "添加星标"}：${row.original.subject}`}
          aria-pressed={row.original.starred}
          disabled={mail.busyIds.includes(row.original.id)}
          onClick={() =>
            void changeMailMessage(row.original, {
              starred: !row.original.starred,
            })
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
          className="block truncate text-sm"
          title={`${row.original.sender} <${row.original.address}>`}
        >
          {row.original.sender}
        </span>
      ),
    },
    {
      accessorKey: "subject",
      header: "邮件主题",
      size: 320,
      enableSorting: true,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to={`?${new URLSearchParams({ ...Object.fromEntries(params), message: row.original.id })}`}
            className="min-w-0 truncate text-sm underline-offset-4 hover:underline"
            title={row.original.subject}
          >
            {row.original.subject || "无主题"}
          </Link>
          {row.original.preview && (
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
          {accounts.find((item) => item.id === row.original.accountId)?.name}
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
      size: 200,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatMailTime(row.original.receivedAt)}
        </span>
      ),
    },
    {
      id: "attachments",
      header: "附件",
      size: 80,
      meta: { align: "center" },
      cell: ({ row }) =>
        row.original.attachmentCount ? (
          <span className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <PaperclipIcon className="size-3.5" aria-hidden="true" />
            {row.original.attachmentCount}
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
                badge: mail.overview.unread,
              },
              {
                id: "archived",
                label: "归档",
                icon: <ArchiveIcon aria-hidden="true" />,
              },
            ],
          },
          {
            id: "accounts",
            title: "邮箱",
            items: accounts.map((account) => ({
              id: account.id,
              label: account.name,
              icon: <MailProviderIcon provider={account.provider} />,
              badge: account.unread,
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
                badge: accounts.length,
              },
            ],
          },
        ]}
        activeItem={
          view === "accounts"
            ? "accounts"
            : view === "archived"
              ? "archived"
              : accountId
        }
        onItemChange={(id) => {
          resetPage()
          setParams(
            id === "accounts"
              ? { view: "accounts" }
              : id === "archived"
                ? { view: "archived" }
                : id === "all"
                  ? {}
                  : { account: id }
          )
        }}
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
                !accounts.some(
                  (item) =>
                    item.enabled &&
                    (accountId === "all" || item.id === accountId)
                )
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
        {mail.status === "loading" ? (
          <div
            className="flex flex-col gap-3"
            role="status"
            aria-label="正在读取邮箱"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : mail.status === "error" ? (
          <EmptyState
            title="邮箱加载失败"
            action="重试"
            onAction={() => void loadMail()}
          />
        ) : view === "accounts" ? (
          <ConnectionsTable
            kind="mail"
            onEdit={(source) => setConfiguring(source.id)}
            onAdd={() => setConfiguring("new")}
          />
        ) : (
          <RecordsGrid
            title={
              view === "archived"
                ? "归档"
                : (accounts.find((item) => item.id === accountId)?.name ??
                  "收件箱")
            }
            icon={<MailIcon className="size-4" aria-hidden="true" />}
            records={result.messages}
            columns={columns}
            loading={status === "loading"}
            server={{
              total: result.total,
              pagination,
              onPaginationChange: setPagination,
              sorting,
              onSortingChange: setSorting,
            }}
            leadingContent={
              status === "error" && result.messages.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retry}
                >
                  重试
                </Button>
              ) : undefined
            }
            toolbar={
              <>
                <Input
                  aria-label="搜索邮件"
                  placeholder="搜索主题、发件人…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    resetPage()
                  }}
                  className="w-full sm:w-56"
                />
                <RuleFilters
                  fields={fields}
                  query={query}
                  onQueryChange={(next) => {
                    setQuery(next)
                    resetPage()
                  }}
                  labels={{
                    filtersLabel: "邮件规则",
                    builderEmpty: "全部邮件",
                    showRecords: "筛选邮件",
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label="邮件功能"
                      />
                    }
                  >
                    <EllipsisIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={
                        !result.total || mail.busyIds.includes("messages:bulk")
                      }
                      onClick={() => void bulk("read")}
                    >
                      <CheckCheckIcon aria-hidden="true" />
                      全部已读
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={
                        !result.total ||
                        view === "archived" ||
                        mail.busyIds.includes("messages:bulk")
                      }
                      onClick={() => void bulk("archive-read")}
                    >
                      <ArchiveIcon aria-hidden="true" />
                      归档已读邮件
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
            empty={
              <EmptyState
                title={status === "error" ? "邮件加载失败" : "这里还没有邮件"}
                action={
                  status === "error"
                    ? "重试"
                    : accounts.length
                      ? "清除筛选"
                      : "添加邮箱"
                }
                onAction={
                  status === "error"
                    ? retry
                    : accounts.length
                      ? clearFilters
                      : () => setConfiguring("new")
                }
              />
            }
          />
        )}
      </WorkbenchScreen>
      <MailDetail
        key={mail.userId}
        id={params.get("message")}
        onClose={() => {
          const next = new URLSearchParams(params)
          next.delete("message")
          setParams(next)
        }}
      />
      {configuring && (
        <MailAccountDialog
          source={accounts.find((account) => account.id === configuring)}
          onClose={() => setConfiguring(null)}
        />
      )}
    </>
  )
}
