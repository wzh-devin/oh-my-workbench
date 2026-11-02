import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { activateResource } from "@/lib/requests/invalidation"
import { toast } from "sonner"
import { Link, useSearchParams } from "react-router"
import { cn } from "cn"
import {
  ArrowDownAZIcon,
  ArrowLeftIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Grid2X2Icon,
  HardDriveIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import type { CellContext, SortingState } from "@tanstack/react-table"
import { RuleFilters } from "@/components/shared/rule-filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { ConnectionsTable } from "@/features/workbench/connections-table"
import {
  Choice,
  EmptyState,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { ConnectionDialog } from "@/features/workbench/dialogs"
import { formatSize, type StorageConnection } from "@/features/workbench/model"
import {
  RecordsGrid,
  type RecordColumn,
} from "@/features/workbench/records-grid"
import {
  downloadAsset,
  refreshConnection,
  useWorkbench,
} from "@/features/workbench/store"
import {
  assetEntries,
  assetHref,
  assetKind,
  folderTrail,
  trashedEntryIds,
  type AssetEntry,
} from "../asset-rules"
import { recordOpened, starEntries, retryAssetThumbnail } from "../store"
import { useAssetOperations } from "../use-asset-operations"
import { droppedFiles } from "../file-drop"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { fileNameParts } from "../file-name"
import { InlineRename, type RenameDraft } from "./inline-rename"
import { AssetActions } from "./asset-actions"
import { AssetThumbnail } from "./asset-thumbnail"
import {
  AssetActionDialog,
  AssetDeleteDialog,
  AssetDetails,
  type AssetAction,
} from "./asset-dialogs"
import { AssetNavigation } from "./asset-navigation"
import { AssetPreview } from "./asset-preview"
import { UploadDialog } from "./upload-dialog"
import { UploadTransfers } from "./upload-transfers"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useAssets,
  loadAssets,
  rememberEntries,
  deleteAssetView,
} from "../store"
import { useAssetQuery } from "../use-asset-query"
import { VirtualAssetGrid } from "./virtual-asset-grid"
import { assetRuleFields, assetQueryToRule } from "../view-rules"
import { AssetImportDialog } from "./import-dialog"
import { AssetViewDialog } from "./view-dialog"
import { assetApi } from "../api"
import type { AssetView } from "../model"
import { DeleteConfirm } from "@/features/workbench/dialogs"

export { assetKind } from "../asset-rules"
const VIEW_NAMES: Record<string, string> = {
  files: "全部文件",
  recent: "最近访问",
  starred: "收藏",
  trash: "回收站",
}

// 下拉排序与表头共享同一个排序状态，切换布局不改变查询顺序。
// 列渲染器身份稳定，查询刷新与操作状态变化不会卸载菜单或重命名草稿。
const AssetCellContext = createContext<{
  name: (entry: AssetEntry) => ReactNode
  actions: (entry: AssetEntry) => ReactNode
} | null>(null)
function AssetNameCell({ row }: CellContext<DataGridFeatures, AssetEntry>) {
  return useContext(AssetCellContext)?.name(row.original)
}
function AssetActionsCell({ row }: CellContext<DataGridFeatures, AssetEntry>) {
  return useContext(AssetCellContext)?.actions(row.original)
}

const SORT_OPTIONS = [
  { value: "name", label: "名称升序", column: "name", desc: false },
  { value: "name-desc", label: "名称降序", column: "name", desc: true },
  { value: "date", label: "最近修改", column: "time", desc: true },
  { value: "date-asc", label: "最早修改", column: "time", desc: false },
  { value: "size", label: "大小降序", column: "size", desc: true },
  { value: "size-asc", label: "大小升序", column: "size", desc: false },
]

const EntryIcon = ({
  entry,
  large = false,
}: {
  entry: AssetEntry
  large?: boolean
}) => {
  if (entry.kind === "file")
    return <AssetThumbnail entry={entry} large={large} />
  return (
    <FolderIcon
      aria-hidden="true"
      className={cn(
        "shrink-0 text-amber-500 dark:text-amber-400",
        large ? "size-14" : "size-4"
      )}
    />
  )
}

/** 目录状态由 URL 定位，列表、网格、预览及批量操作共用同一资产快照。 */
export function Assets() {
  const { data: baseData, busyIds } = useWorkbench()
  const {
    status,
    overview,
    userId,
    revision,
    entries: cachedEntries,
  } = useAssets()
  const data = {
    ...baseData,
    assets: [
      ...new Map(
        [
          ...baseData.assets,
          ...cachedEntries.filter((entry) => entry.kind === "file"),
        ].map((entry) => [entry.id, entry])
      ).values(),
    ],
    assetFolders: [
      ...new Map(
        [
          ...cachedEntries.filter((entry) => entry.kind === "folder"),
          ...baseData.assetFolders,
        ].map((entry) => [entry.id, entry])
      ).values(),
    ],
  }
  useEffect(() => {
    const release = activateResource("assets")
    if (userId) void loadAssets()
    return release
  }, [userId])
  const [params, setParams] = useSearchParams()
  const connectionId = params.get("connection") ?? "all"
  const parentId = params.get("folder")
  const viewParam =
    params.get("view") ??
    (connectionId === "all" && !parentId
      ? (overview.views.find((record) => record.builtinKey === "files")?.id ??
        overview.views[0]?.id ??
        "files")
      : "files")
  const savedView = overview.views.find(
    (record) => record.id === viewParam || record.builtinKey === viewParam
  )
  const view = savedView?.builtinKey ?? viewParam
  const [editingView, setEditingView] = useState<AssetView | "new" | null>(null)
  const [deletingView, setDeletingView] = useState<AssetView | null>(null)
  const [importing, setImporting] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const layout =
    (params.get("layout") ?? data.preferences.assetLayout) === "grid"
      ? "grid"
      : "list"
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState(() => createFilterQuery())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [configuring, setConfiguring] = useState<
    StorageConnection | "new" | null
  >(null)
  const [upload, setUpload] = useState<{
    files?: File[]
  } | null>(null)
  const [transfersOpen, setTransfersOpen] = useState(false)
  const [action, setAction] = useState<AssetAction | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [renaming, setRenaming] = useState<RenameDraft | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [failedFile, setFailedFile] = useState<string | null>(null)
  const { run, download, remove, restore, busy, error, clearError } =
    useAssetOperations(() => setSelectedIds([]))
  const connection = data.connections.find(
    (source) => source.id === connectionId
  )
  const trail = folderTrail(data, parentId)
  const trashIds = trashedEntryIds(data)
  const entries = assetEntries(data)
  const folder = data.assetFolders.find(
    (entry) =>
      entry.id === parentId &&
      entry.connectionId === connectionId &&
      !trashIds.has(entry.id)
  )
  // 尚未配置是正常空态，不发起文件查询或深链详情请求。
  const hasStorage = overview.connections.length > 0
  const needsStorage = status === "ready" && !hasStorage
  const invalidView =
    status === "ready" &&
    connectionId === "all" &&
    !parentId &&
    !["trash", "connections"].includes(view) &&
    !savedView
  const invalidLocation =
    invalidView ||
    (status === "ready" &&
      view === "files" &&
      ((connectionId !== "all" && !connection) || (!!parentId && !folder)))
  const searching = !!search.trim() || query.rules.length > 0
  const firstSort = sorting[0]
  const tableSort = firstSort
    ? ({
        name: firstSort.desc ? "name-desc" : "name",
        size: firstSort.desc ? "size" : "size-asc",
        time: firstSort.desc ? "date" : "date-asc",
      }[firstSort.id] ?? "")
    : ""
  const result = useAssetQuery(
    {
      connectionId,
      parentId,
      viewId:
        connectionId === "all" &&
        !parentId &&
        view !== "trash" &&
        view !== "connections"
          ? (savedView?.id ?? (/^[1-9]\d*$/.test(view) ? view : ""))
          : "",
      trash: view === "trash",
      search,
      filterQuery: assetQueryToRule(query, false),
      sort: tableSort,
      cursorMode: true,
      pageSize: 50,
    },
    status === "ready" &&
      hasStorage &&
      view !== "connections" &&
      !invalidLocation
  )
  const records = result.entries
  const fileId = params.get("file")
  const fileInQuery = records.some((entry) => entry.id === fileId)
  const fileError = !!fileId && failedFile === fileId && !fileInQuery
  useEffect(() => {
    const legacyFolder =
      parentId && !/^[1-9]\d*$/.test(parentId) ? parentId : null
    const requestedId = fileId ?? legacyFolder
    if (!requestedId || !userId || !hasStorage) return
    // 已鉴权列表包含文件时复用元数据；深链不在当前批次中才补读详情。
    if (!legacyFolder && (fileInQuery || result.status === "loading")) return
    const controller = new AbortController()
    void assetApi
      .entry(requestedId, controller.signal)
      .then((entry) => {
        if (!controller.signal.aborted) {
          setFailedFile(null)
          rememberEntries([entry], userId)
          if (entry.id !== requestedId)
            setParams(
              (current) => {
                const next = new URLSearchParams(current)
                next.set("connection", entry.connectionId)
                if (entry.kind === "file") {
                  next.set("file", entry.id)
                  if (entry.parentId) next.set("folder", entry.parentId)
                  else next.delete("folder")
                } else next.set("folder", entry.id)
                next.delete("view")
                return next
              },
              { replace: true }
            )
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailedFile(requestedId)
        toast.error(error instanceof Error ? error.message : "文件不可用", {
          id: "asset-file",
          action: { label: "重试", onClick: () => void loadAssets(true) },
        })
      })
    return () => controller.abort()
  }, [
    fileId,
    parentId,
    userId,
    revision,
    hasStorage,
    setParams,
    fileInQuery,
    result.status,
  ])
  const selected = records.filter((entry) => selectedIds.includes(entry.id))
  const selectedKeys = selected.map((entry) => entry.id)
  const previewFile = data.assets.find(
    (asset) =>
      asset.id === params.get("file") &&
      !trashIds.has(asset.id) &&
      !("hidden" in asset && asset.hidden)
  )
  const detail = entries.find((entry) => entry.id === detailId)
  const title =
    folder?.name ??
    connection?.name ??
    savedView?.name ??
    VIEW_NAMES[view] ??
    "文件资产"
  const LocationIcon = folder ? FolderOpenIcon : HardDriveIcon
  const canUpload = data.connections.some(
    (source) => source.status === "connected"
  )
  const uploadTarget =
    connection ??
    data.connections.find((source) => source.status === "connected")

  const navigate = (
    sourceId: string,
    folderId: string | null = null,
    nextView = "files"
  ) => {
    result.retry()
    const next = new URLSearchParams()
    if (sourceId !== "all") next.set("connection", sourceId)
    if (folderId) next.set("folder", folderId)
    if (nextView !== "files") next.set("view", nextView)
    if (layout !== data.preferences.assetLayout) next.set("layout", layout)
    setSearch("")
    setQuery(createFilterQuery())
    setSelectedIds([])

    setSorting([])
    setRenaming(null)
    clearError()
    setParams(next)
  }
  const locate = (entry: AssetEntry) => {
    setDetailId(null)
    if (trashIds.has(entry.id)) navigate("all", null, "trash")
    else navigate(entry.connectionId, entry.parentId)
  }
  const openUpload = (files?: File[]) => {
    if (canUpload) setUpload({ files })
    else setConfiguring("new")
  }
  const openEntry = (entry: AssetEntry) => {
    if (view === "trash") setDetailId(entry.id)
    else if (entry.kind === "folder") {
      navigate(entry.connectionId, entry.id)
      void run(() => recordOpened(entry.id))
    } else {
      const next = new URLSearchParams(params)
      next.set("file", entry.id)
      setParams(next)
    }
  }
  const entryHref = (entry: AssetEntry) => {
    const href =
      entry.kind === "file"
        ? assetHref(entry)
        : `/assets?${new URLSearchParams({ connection: entry.connectionId, folder: entry.id })}`
    return layout === data.preferences.assetLayout
      ? href
      : `${href}&layout=${layout}`
  }
  const toggleSelected = (id: string, checked: boolean) => {
    // 保持服务端每批200项契约，连续加载后不能产生无法提交的选择。
    if (checked && !selectedIds.includes(id) && selectedIds.length >= 200) {
      toast.error("每次最多选择 200 项", { id: "asset-selection" })
      return
    }
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((key) => key !== id)
    )
  }
  const selectable = records.slice(0, 200)
  const allSelected =
    selectable.length > 0 &&
    selectable.every((entry) => selectedIds.includes(entry.id))
  const selectAll = (
    <Checkbox
      aria-label={
        records.length > 200 ? "选择前200个已加载文件" : "选择已加载文件"
      }
      checked={allSelected}
      indeterminate={selected.length > 0 && !allSelected}
      onCheckedChange={(checked) =>
        setSelectedIds(checked ? selectable.map((entry) => entry.id) : [])
      }
    />
  )
  const actionsFor = (entry: AssetEntry) => (
    <AssetActions
      entry={entry}
      trash={view === "trash"}
      onAction={setAction}
      onRename={(record) =>
        setRenaming({
          id: record.id,
          value:
            record.kind === "file"
              ? fileNameParts(record.name).stem
              : record.name,
          pending: false,
          error: "",
        })
      }
      onDownload={download}
      onStar={(record) => {
        void run(() => starEntries([record.id], !record.starred))
      }}
      onTrash={remove}
      onRestore={restore}
      onDelete={setDeleteIds}
      onLocate={locate}
      onDetails={(record) => setDetailId(record.id)}
      onThumbnailRetry={(record) => {
        void run(() => retryAssetThumbnail(record.id), "已加入生成队列")
      }}
    />
  )
  const nameFor = (entry: AssetEntry, preview = false) => (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        preview && renaming?.id === entry.id && "flex-col"
      )}
    >
      {(!preview || renaming?.id === entry.id) && (
        <EntryIcon entry={entry} large={preview} />
      )}
      {renaming?.id === entry.id ? (
        <InlineRename
          key={entry.id}
          entry={entry}
          draft={renaming}
          onChange={(changes) =>
            setRenaming((current) =>
              current?.id === entry.id ? { ...current, ...changes } : current
            )
          }
          onClose={() => {
            setRenaming((current) =>
              current?.id === entry.id ? null : current
            )
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  `[data-asset-name-id="${entry.id}"]`
                )
                ?.focus()
            )
          }}
        />
      ) : view === "trash" ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          className={cn(
            "min-w-0 font-normal",
            preview ? "w-full justify-center" : "justify-start"
          )}
          onClick={() => setDetailId(entry.id)}
        >
          <span className="truncate">{entry.name}</span>
        </Button>
      ) : (
        <Link
          className={cn(
            "min-w-0 text-sm font-normal transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring",
            preview
              ? "flex w-full flex-col items-center gap-4 text-center"
              : "truncate"
          )}
          title={entry.name}
          data-asset-name-id={entry.id}
          to={entryHref(entry)}
          onClick={(event) => {
            if (
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault()
              openEntry(entry)
            }
          }}
        >
          {preview && <EntryIcon entry={entry} large />}
          <span className="w-full truncate">{entry.name}</span>
        </Link>
      )}
      {!preview && entry.starred && (
        <StarIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="已收藏"
        />
      )}
    </div>
  )
  const columns: RecordColumn<AssetEntry>[] = [
    {
      id: "select",
      header: () => selectAll,
      size: 48,
      cell: ({ row }) => (
        <Checkbox
          aria-label={`选择：${row.original.name}`}
          checked={selectedIds.includes(row.original.id)}
          onCheckedChange={(checked) =>
            toggleSelected(row.original.id, checked)
          }
        />
      ),
    },
    {
      accessorKey: "name",
      header: "文件名称",
      enableSorting: true,
      size: 300,
      meta: { fillWidth: true },
      cell: AssetNameCell,
    },
    {
      id: "kind",
      header: "类型",
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.kind === "folder" ? "文件夹" : assetKind(row.original)}
        </span>
      ),
    },
    {
      id: "size",
      accessorFn: (entry) => (entry.kind === "file" ? entry.size : 0),
      header: "大小",
      enableSorting: true,
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.kind === "file" ? formatSize(row.original.size) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "connectionId",
      header: "所属存储",
      size: 160,
      cell: ({ row }) => {
        const source = data.connections.find(
          (connection) => connection.id === row.original.connectionId
        )
        return (
          <span
            className="block truncate text-sm text-muted-foreground"
            title={source?.name}
          >
            {source?.name ?? "—"}
          </span>
        )
      },
    },
    {
      id: "time",
      accessorFn: (entry) =>
        view === "trash"
          ? (entry.trashedAt ?? entry.createdAt)
          : view === "recent"
            ? (entry.lastOpenedAt ?? entry.createdAt)
            : (entry.updatedAt ?? entry.createdAt),
      enableSorting: true,
      header:
        view === "trash"
          ? "删除时间"
          : view === "recent"
            ? "访问时间"
            : "修改时间",
      dataType: "datetime",
    },
    {
      id: "actions",
      header: "操作",
      size: 96,
      meta: { align: "center" },
      cell: AssetActionsCell,
    },
  ]
  const clearFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
  }
  const empty = (
    <EmptyState
      icon={
        searching ? SearchIcon : view === "files" ? FolderOpenIcon : undefined
      }
      title={
        searching
          ? "没有匹配的文件"
          : view === "trash"
            ? "回收站为空"
            : view === "starred"
              ? "暂无收藏"
              : view === "recent"
                ? "暂无访问记录"
                : "文件夹为空"
      }
      action={
        searching ? "清除筛选" : view === "files" ? undefined : "查看全部文件"
      }
      onAction={
        searching
          ? clearFilters
          : view === "files"
            ? undefined
            : () => navigate("all")
      }
    />
  )
  const panelState = needsStorage ? (
    <EmptyState
      title="暂时没有配置存储"
      action="配置存储"
      onAction={() => setConfiguring("new")}
    />
  ) : invalidLocation ? (
    <EmptyState
      title={invalidView ? "视图不可用" : "目录不可用"}
      action="返回全部文件"
      onAction={() => navigate("all")}
    />
  ) : status === "error" || result.status === "error" ? (
    <EmptyState
      title="文件读取失败"
      action="重试"
      onAction={() => {
        void loadAssets()
        result.retry()
      }}
    />
  ) : undefined
  const loading =
    !panelState && (status === "loading" || result.status === "loading")
  // 操作与恢复入口常驻工具栏；选中数量只更新固定宽度的数字，不插入页面区块。
  const batchActions = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="批量文件操作"
            disabled={
              !selected.length &&
              !error &&
              !(fileError && fileId) &&
              connection?.status !== "error"
            }
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
        操作
        <span
          className="w-5 text-xs tabular-nums"
          role="status"
          aria-label={`已选 ${selected.length} 项`}
        >
          {selected.length}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {view === "trash" ? (
          <>
            <DropdownMenuItem
              disabled={busy || !selected.length}
              onClick={() => restore(selectedKeys)}
            >
              <RotateCcwIcon aria-hidden="true" />
              恢复
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={busy || !selected.length}
              onClick={() => setDeleteIds(selectedKeys)}
            >
              <Trash2Icon aria-hidden="true" />
              彻底删除
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              disabled={
                busy ||
                !selected.length ||
                selected.some((entry) => entry.kind === "folder")
              }
              onClick={() => {
                void run(
                  async () => {
                    for (const entry of selected)
                      if (entry.kind === "file") await downloadAsset(entry)
                  },
                  undefined,
                  "下载失败"
                )
              }}
            >
              <DownloadIcon aria-hidden="true" />
              下载
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !selected.length}
              onClick={() => setAction({ mode: "move", ids: selectedKeys })}
            >
              <FolderInputIcon aria-hidden="true" />
              移动
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !selected.length}
              onClick={() => setAction({ mode: "copy", ids: selectedKeys })}
            >
              <CopyIcon aria-hidden="true" />
              复制
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !selected.length}
              onClick={() => {
                void run(() =>
                  starEntries(
                    selectedKeys,
                    !selected.every((entry) => entry.starred)
                  )
                )
              }}
            >
              <StarIcon aria-hidden="true" />
              {selected.length && selected.every((entry) => entry.starred)
                ? "取消收藏"
                : "收藏"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={busy || !selected.length}
              onClick={() => remove(selectedKeys)}
            >
              <Trash2Icon aria-hidden="true" />
              移入回收站
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!selected.length}
          onClick={() => setSelectedIds([])}
        >
          <XIcon aria-hidden="true" />
          取消选择
        </DropdownMenuItem>
        {(error || (fileError && fileId) || connection?.status === "error") && (
          <DropdownMenuSeparator />
        )}
        {error && (
          <DropdownMenuItem disabled={busy} onClick={error.retry}>
            <RotateCcwIcon aria-hidden="true" />
            重试操作
          </DropdownMenuItem>
        )}
        {fileError && fileId && (
          <DropdownMenuItem onClick={() => void loadAssets(true)}>
            <RotateCcwIcon aria-hidden="true" />
            重试文件
          </DropdownMenuItem>
        )}
        {connection?.status === "error" && (
          <DropdownMenuItem
            disabled={busyIds.includes(connection.id)}
            onClick={() => void refreshConnection("storage", connection.id)}
          >
            <RotateCcwIcon aria-hidden="true" />
            重试连接
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const toolbar = (
    <>
      <Input
        disabled={needsStorage || invalidLocation}
        aria-label="搜索文件"
        placeholder="搜索文件名称…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)

          setSelectedIds([])
        }}
        className="w-full sm:w-52"
      />
      <RuleFilters
        disabled={needsStorage || invalidLocation}
        fields={assetRuleFields(overview.connections, overview.folders)}
        query={query}
        onQueryChange={(next) => {
          setQuery(next)

          setSelectedIds([])
        }}
      />
      {layout === "grid" && view !== "recent" && view !== "trash" && (
        <div className="flex items-center gap-1">
          <ArrowDownAZIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Choice
            label="文件排序"
            value={tableSort || savedView?.sort || "name"}
            onChange={(value) => {
              const option = SORT_OPTIONS.find(
                (option) => option.value === value
              )
              if (option) setSorting([{ id: option.column, desc: option.desc }])

              setSelectedIds([])
            }}
            options={SORT_OPTIONS}
          />
        </div>
      )}
      {batchActions}
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="文件视图"
      >
        {[
          { id: "list", label: "列表视图", icon: ListIcon },
          { id: "grid", label: "网格视图", icon: Grid2X2Icon },
        ].map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            size="icon-sm"
            variant={layout === id ? "secondary" : "ghost"}
            aria-label={label}
            aria-pressed={layout === id}
            onClick={() => {
              const next = new URLSearchParams(params)
              if (id === data.preferences.assetLayout) next.delete("layout")
              else next.set("layout", id)
              setParams(next, { replace: true })
            }}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </div>
    </>
  )
  return (
    <AssetCellContext value={{ name: nameFor, actions: actionsFor }}>
      <AssetNavigation
        data={data}
        status={status}
        connectionId={connectionId}
        parentId={parentId}
        view={view}
        onNavigate={navigate}
        onAdd={() => setConfiguring("new")}
        views={overview.views}
        onAddView={() => setEditingView("new")}
      />
      <WorkbenchScreen
        title="资产"
        actions={
          <>
            {savedView && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="更多视图操作"
                      title="更多操作"
                      disabled={status !== "ready"}
                    />
                  }
                >
                  <MoreHorizontalIcon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditingView(savedView)}>
                    <PencilIcon aria-hidden="true" />
                    编辑视图
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={overview.views.length <= 1}
                    onClick={() => setDeletingView(savedView)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {overview.views.length <= 1
                      ? "至少保留一个视图"
                      : "删除视图"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <UploadTransfers
              open={transfersOpen}
              onOpenChange={setTransfersOpen}
              onUpload={() => {
                setTransfersOpen(false)
                openUpload()
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasStorage}
              onClick={() => setImporting(true)}
            >
              导入
            </Button>
            <div
              className={
                view === "connections"
                  ? "flex items-center gap-2"
                  : "hidden items-center gap-2 sm:flex"
              }
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfiguring("new")}
              >
                <PlusIcon aria-hidden="true" />
                添加存储
              </Button>
              {view !== "connections" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={invalidLocation || !data.connections.length}
                    onClick={() => setAction({ mode: "new", ids: [] })}
                  >
                    <FolderPlusIcon aria-hidden="true" />
                    新建文件夹
                  </Button>
                </>
              )}
            </div>
            {view !== "connections" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="sm:hidden"
                        aria-label="更多资产操作"
                      />
                    }
                  >
                    <MoreHorizontalIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={invalidLocation || !data.connections.length}
                      onClick={() => setAction({ mode: "new", ids: [] })}
                    >
                      <FolderPlusIcon aria-hidden="true" />
                      新建文件夹
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfiguring("new")}>
                      <PlusIcon aria-hidden="true" />
                      添加存储
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="sm"
                  disabled={invalidLocation || !hasStorage}
                  onClick={() => openUpload()}
                >
                  <UploadIcon aria-hidden="true" />
                  上传
                </Button>
              </>
            )}
          </>
        }
      >
        {view === "connections" ? (
          <ConnectionsTable
            kind="storage"
            onEdit={(source) => {
              if ("endpoint" in source) setConfiguring(source)
            }}
            onAdd={() => setConfiguring("new")}
          />
        ) : (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files"))
                event.preventDefault()
            }}
            onDrop={(event) => {
              if (
                event.dataTransfer.types.includes("Files") &&
                !invalidLocation
              ) {
                event.preventDefault()
                const transfer = event.dataTransfer
                void run(async () => {
                  const files = await droppedFiles(transfer)
                  if (files.length) openUpload(files)
                })
              }
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="返回上级目录"
                disabled={
                  !parentId && connectionId === "all" && view === "files"
                }
                onClick={() =>
                  parentId
                    ? navigate(connectionId, folder?.parentId ?? null)
                    : navigate("all")
                }
              >
                <ArrowLeftIcon aria-hidden="true" />
              </Button>
              <Breadcrumb aria-label="文件路径">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {view === "files" && connectionId === "all" ? (
                      <BreadcrumbPage>全部文件</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        render={
                          <Link
                            to="/assets"
                            onClick={(event) => {
                              event.preventDefault()
                              navigate("all")
                            }}
                          />
                        }
                      >
                        全部文件
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {view !== "files" ? (
                    <>
                      {savedView?.name !== "全部文件" && (
                        <>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            <BreadcrumbPage>
                              {savedView?.name ?? VIEW_NAMES[view]}
                            </BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {connection && (
                        <>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            {parentId ? (
                              <BreadcrumbLink
                                render={
                                  <Link
                                    to={`/assets?connection=${encodeURIComponent(connectionId)}`}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      navigate(connectionId)
                                    }}
                                  />
                                }
                              >
                                {connection.name}
                              </BreadcrumbLink>
                            ) : (
                              <BreadcrumbPage>{connection.name}</BreadcrumbPage>
                            )}
                          </BreadcrumbItem>
                        </>
                      )}
                      {trail.map((ancestor, index) => (
                        <Fragment key={ancestor.id}>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            {index === trail.length - 1 ? (
                              <BreadcrumbPage>{ancestor.name}</BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink
                                render={
                                  <Link
                                    to={`/assets?connection=${encodeURIComponent(connectionId)}&folder=${encodeURIComponent(ancestor.id)}`}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      navigate(connectionId, ancestor.id)
                                    }}
                                  />
                                }
                              >
                                {ancestor.name}
                              </BreadcrumbLink>
                            )}
                          </BreadcrumbItem>
                        </Fragment>
                      ))}
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <RecordsGrid
              title={title}
              icon={<LocationIcon className="size-4" aria-hidden="true" />}
              records={records}
              loading={loading}
              fillHeight
              // 连续加载只改变内容，列表/网格共享游标、排序与选择。
              autoPageSize={false}
              server={{
                sorting,
                onSortingChange: setSorting,
              }}
              continuous={{
                hasMore: result.hasMore,
                loading: result.loadingMore,
                error: result.moreError,
                onLoadMore: result.loadMore,
              }}
              columns={columns}
              toolbar={toolbar}
              empty={empty}
            >
              {(scrollElement) =>
                panelState ??
                (layout === "grid" ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      {selectAll}
                      <span>
                        {records.length > 200 ? "选择前 200 项" : "全选已加载"}
                      </span>
                    </div>
                    {loading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : records.length ? (
                      <VirtualAssetGrid
                        entries={records}
                        scrollElement={scrollElement}
                        renderItem={(entry) => (
                          <div
                            role="listitem"
                            key={entry.id}
                            className={cn(
                              "flex min-w-0 flex-col gap-4 p-3",
                              selectedIds.includes(entry.id) && "bg-accent"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  aria-label={`选择：${entry.name}`}
                                  checked={selectedIds.includes(entry.id)}
                                  onCheckedChange={(checked) =>
                                    toggleSelected(entry.id, checked)
                                  }
                                />
                                {entry.starred && (
                                  <StarIcon
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-label="已收藏"
                                  />
                                )}
                              </div>
                              {actionsFor(entry)}
                            </div>
                            <div className="flex min-w-0 flex-col items-center gap-4">
                              {view === "trash" && (
                                <EntryIcon entry={entry} large />
                              )}
                              <div className="w-full min-w-0">
                                {nameFor(entry, true)}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {entry.kind === "file"
                                  ? `${assetKind(entry)} · ${formatSize(entry.size)}`
                                  : "文件夹"}
                              </p>
                            </div>
                          </div>
                        )}
                      />
                    ) : (
                      empty
                    )}
                  </>
                ) : undefined)
              }
            </RecordsGrid>
          </div>
        )}
      </WorkbenchScreen>
      {importing && <AssetImportDialog onClose={() => setImporting(false)} />}
      {editingView && (
        <AssetViewDialog
          view={editingView === "new" ? undefined : editingView}
          onClose={() => setEditingView(null)}
        />
      )}
      {deletingView && (
        <DeleteConfirm
          open
          onOpenChange={(open) => {
            if (!open) setDeletingView(null)
          }}
          title={`删除视图“${deletingView.name}”？`}
          description="文件会保留。"
          onConfirm={async () => {
            await deleteAssetView(deletingView)
            if (savedView?.id === deletingView.id)
              navigate(
                "all",
                null,
                overview.views.find((record) => record.id !== deletingView.id)
                  ?.id ?? "files"
              )
            return true
          }}
        />
      )}
      {configuring && (
        <ConnectionDialog
          source={configuring === "new" ? undefined : configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
      {upload && (
        <UploadDialog
          connectionId={uploadTarget?.id ?? "all"}
          parentId={view === "files" ? parentId : null}
          initialFiles={upload.files}
          onClose={() => setUpload(null)}
          onQueued={() => setTransfersOpen(true)}
        />
      )}
      {action && (
        <AssetActionDialog
          action={action}
          data={data}
          connectionId={connectionId}
          parentId={parentId}
          onClose={() => {
            setAction(null)
            setSelectedIds([])
          }}
        />
      )}
      {deleteIds && (
        <AssetDeleteDialog
          ids={deleteIds}
          onClose={() => {
            setDeleteIds(null)
            setSelectedIds([])
          }}
        />
      )}
      {detail && (
        <AssetDetails
          entry={detail}
          data={data}
          onClose={() => setDetailId(null)}
          onLocate={locate}
          onDownload={download}
        />
      )}
      {previewFile && (
        <AssetPreview
          key={`${previewFile.id}:${previewFile.name}:${previewFile.type}`}
          asset={previewFile}
          files={records.filter(
            (entry) => entry.kind === "file" && view !== "trash"
          )}
          onChange={(id) => {
            const next = new URLSearchParams(params)
            next.set("file", id)
            setParams(next, { replace: true })
          }}
          onClose={() => {
            const next = new URLSearchParams(params)
            next.delete("file")
            setParams(next, { replace: true })
          }}
          onDownload={download}
        />
      )}
    </AssetCellContext>
  )
}
