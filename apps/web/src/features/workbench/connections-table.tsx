import { useState, type ReactNode } from "react"
import {
  PencilIcon,
  PlayIcon,
  PauseIcon,
  RefreshCwIcon,
  MailIcon,
  HardDriveIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState, StatusBadge } from "./components"
import {
  formatTime,
  type ConnectionStatus,
  type MailAccount,
  type StorageConnection,
} from "./model"
import { RecordHint, RecordsGrid } from "./records-grid"
import { refreshConnection, useWorkbench } from "./store"
import {
  saveAssetConnection,
  useAssets,
  loadAssets,
} from "@/features/assets/store"
import { toast } from "sonner"
import { saveMailAccount } from "@/features/mail/store"
import { MailProviderIcon } from "@/features/mail/components/mail-provider-icon"

type ConnectionRow = {
  id: string
  name: string
  source: string
  bucket?: string
  provider: string
  status: ConnectionStatus
  lastSync: string | null
  error: string | null
  syncing?: boolean
}

/** 连接管理复用现有 DataGrid，分类交给 AppShell 左侧导航。 */
export function ConnectionsTable({
  kind,
  onEdit,
  onAdd,
}: {
  kind: "mail" | "storage"
  onEdit: (source: MailAccount | StorageConnection) => void
  onAdd: () => void
}) {
  const { data, busyIds } = useWorkbench()
  const assetState = useAssets()
  const loadingFailed = kind === "storage" && assetState.status === "error"
  const [search, setSearch] = useState("")
  const rows: ConnectionRow[] =
    kind === "mail"
      ? data.accounts.map((record) => ({ ...record, source: record.email }))
      : data.connections.map((record) => ({
          ...record,
          source: record.endpoint,
          provider: "S3 / MinIO",
        }))
  const records = rows.filter((record) =>
    `${record.name} ${record.source} ${record.bucket ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const toggle = (id: string) => {
    if (kind === "mail") {
      const account = data.accounts.find((item) => item.id === id)
      if (account)
        void saveMailAccount(
          {
            name: account.name,
            enabled: !account.enabled,
            version: account.version,
          },
          id
        )
      return
    }
    const connection = data.connections.find((record) => record.id === id)
    if (connection)
      void saveAssetConnection(
        {
          name: connection.name,
          endpoint: connection.endpoint,
          bucket: connection.bucket,
          region: connection.region ?? "",
          prefix: connection.prefix ?? "workbench",
          enabled: connection.status === "paused",
          accessKey: "",
          secretKey: "",
          version: connection.version,
        },
        id
      ).catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "更新连接失败")
      )
  }

  const columns: ColumnDef<DataGridFeatures, ConnectionRow>[] = [
    {
      accessorKey: "name",
      header: kind === "mail" ? "邮箱名称" : "存储名称",
      enableSorting: true,
      size: 160,
      cell: ({ row }) => (
        <span
          className="block truncate text-sm font-normal"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "provider",
      header: "服务",
      size: 120,
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {(row.original.provider === "QQ" ||
            row.original.provider === "Gmail") && (
            <MailProviderIcon provider={row.original.provider} />
          )}
          {row.original.provider}
        </span>
      ),
    },
    {
      accessorKey: "source",
      header: kind === "mail" ? "邮箱地址" : "Endpoint",
      size: 240,
      meta: { fillWidth: true },
      cell: ({ row }) => (
        <span
          className="block truncate text-sm text-muted-foreground"
          title={row.original.source}
        >
          {row.original.source}
        </span>
      ),
    },
    ...(kind === "storage"
      ? [
          {
            accessorKey: "bucket",
            header: "Bucket",
            size: 160,
            cell: ({ row }) => (
              <span
                className="block truncate text-sm text-muted-foreground"
                title={row.original.bucket}
              >
                {row.original.bucket}
              </span>
            ),
          } satisfies ColumnDef<DataGridFeatures, ConnectionRow>,
        ]
      : []),
    {
      accessorKey: "status",
      header: "状态",
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <StatusBadge status={row.original.status} />
          {row.original.error && (
            <RecordHint label={`查看连接错误：${row.original.name}`}>
              {row.original.error}
            </RecordHint>
          )}
        </div>
      ),
    },
    {
      accessorKey: "lastSync",
      header: "最近更新",
      enableSorting: true,
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatTime(row.original.lastSync)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      size: 80,
      meta: { align: "center" },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`连接操作：${row.original.name}`}
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const source =
                  kind === "mail"
                    ? data.accounts.find(
                        (record) => record.id === row.original.id
                      )
                    : data.connections.find(
                        (record) => record.id === row.original.id
                      )
                if (source) onEdit(source)
              }}
            >
              <PencilIcon aria-hidden="true" />
              编辑连接
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                busyIds.includes(row.original.id) ||
                busyIds.includes(`sync:${row.original.id}`) ||
                row.original.syncing ||
                row.original.status === "paused"
              }
              onClick={() => {
                void refreshConnection(kind, row.original.id)
              }}
            >
              <RefreshCwIcon aria-hidden="true" />
              {row.original.status === "error" ? "重试连接" : "同步连接"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busyIds.includes(row.original.id)}
              onClick={() => toggle(row.original.id)}
            >
              {row.original.status === "paused" ? (
                <PlayIcon aria-hidden="true" />
              ) : (
                <PauseIcon aria-hidden="true" />
              )}
              {row.original.status === "paused" ? "恢复连接" : "暂停连接"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  const icon: ReactNode =
    kind === "mail" ? (
      <MailIcon className="size-4" aria-hidden="true" />
    ) : (
      <HardDriveIcon className="size-4" aria-hidden="true" />
    )
  return (
    <RecordsGrid
      fillHeight
      title={kind === "mail" ? "邮箱账号" : "存储连接"}
      icon={icon}
      records={records}
      columns={columns}
      loading={kind === "storage" && assetState.status === "loading"}
      toolbar={
        <>
          <Input
            aria-label="搜索连接"
            placeholder="搜索名称或地址…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full sm:w-56"
          />
        </>
      }
      empty={
        <EmptyState
          title={
            loadingFailed
              ? "存储连接读取失败"
              : rows.length
                ? "没有匹配的连接"
                : kind === "storage"
                  ? "暂时没有配置存储"
                  : "还没有配置连接"
          }
          action={
            loadingFailed
              ? "重试"
              : rows.length
                ? "清除搜索"
                : kind === "storage"
                  ? "配置存储"
                  : "添加连接"
          }
          onAction={
            loadingFailed
              ? () => void loadAssets()
              : rows.length
                ? () => setSearch("")
                : onAdd
          }
        />
      }
    />
  )
}
