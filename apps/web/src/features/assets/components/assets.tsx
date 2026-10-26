import { Fragment, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  ArrowDownAZIcon,
  ArrowLeftIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Grid2X2Icon,
  HardDriveIcon,
  ImageIcon,
  ListIcon,
  MusicIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Filters } from "@/components/reui/filters/filters"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import type { FilterField } from "@/components/reui/filters/filters-types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConnectionsTable } from "@/features/workbench/connections-table"
import {
  Choice,
  EmptyState,
  WorkbenchScreen,
} from "@/features/workbench/components"
import { ConnectionDialog } from "@/features/workbench/dialogs"
import { EQUALITY_OPERATORS } from "@/features/workbench/filters"
import {
  formatSize,
  formatTime,
  type StorageConnection,
} from "@/features/workbench/model"
import { RecordsGrid } from "@/features/workbench/records-grid"
import {
  downloadAsset,
  refreshConnection,
  useWorkbench,
} from "@/features/workbench/store"
import {
  assetEntries,
  browseAssets,
  assetHref,
  assetKind,
  folderTrail,
  trashedEntryIds,
  type AssetEntry,
} from "../asset-rules"
import { recordOpened, starEntries } from "../asset-store"
import { useAssetOperations } from "../use-asset-operations"
import { droppedFiles } from "../file-drop"
import { AssetActions } from "./asset-actions"
import {
  AssetActionDialog,
  AssetDeleteDialog,
  AssetDetails,
  type AssetAction,
} from "./asset-dialogs"
import { AssetNavigation } from "./asset-navigation"
import { AssetPreview } from "./asset-preview"
import { UploadDialog } from "./upload-dialog"

export { assetKind } from "../asset-rules"
const FILTER_FIELDS: FilterField[] = [
  {
    id: "kind",
    label: "文件类型",
    type: "select",
    operators: EQUALITY_OPERATORS,
    options: [
      "文件夹",
      "文档",
      "表格",
      "图片",
      "视频",
      "音频",
      "压缩包",
      "其他",
    ].map((value) => ({ value, label: value })),
  },
]
const VIEW_NAMES: Record<string, string> = {
  files: "全部文件",
  recent: "最近访问",
  starred: "收藏",
  trash: "回收站",
}

/** 表头升降序均保留文件夹优先，避免目录混入文件排序。 */
const sortFileRows = (
  a: Row<DataGridFeatures, AssetEntry>,
  b: Row<DataGridFeatures, AssetEntry>,
  columnId: string
) => {
  if (a.original.kind !== b.original.kind) {
    const direction =
      a.table.getColumn(columnId)?.getIsSorted() === "desc" ? -1 : 1
    return (a.original.kind === "folder" ? -1 : 1) * direction
  }
  const left = a.getValue<string | number>(columnId)
  const right = b.getValue<string | number>(columnId)
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), "zh-CN", { numeric: true })
}

const EntryIcon = ({
  entry,
  large = false,
}: {
  entry: AssetEntry
  large?: boolean
}) => {
  const kind = entry.kind === "folder" ? "文件夹" : assetKind(entry)
  const Icon =
    kind === "文件夹"
      ? FolderIcon
      : kind === "图片"
        ? ImageIcon
        : kind === "视频"
          ? VideoIcon
          : kind === "音频"
            ? MusicIcon
            : FileIcon
  return (
    <Icon
      aria-hidden="true"
      className={
        large
          ? "size-12 text-muted-foreground"
          : "size-4 shrink-0 text-muted-foreground"
      }
    />
  )
}

/** 目录状态由 URL 定位，列表、网格、预览及批量操作共用同一资产快照。 */
export function Assets() {
  const { data, busyIds, status } = useWorkbench()
  const [params, setParams] = useSearchParams()
  const connectionId = params.get("connection") ?? "all"
  const parentId = params.get("folder")
  const viewParam = params.get("view") ?? "files"
  const view = ["files", "recent", "starred", "trash", "connections"].includes(
    viewParam
  )
    ? viewParam
    : "files"
  const layout = params.get("layout") === "grid" ? "grid" : "list"
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState(() => createFilterQuery())
  const [sort, setSort] = useState("name")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [configuring, setConfiguring] = useState<
    StorageConnection | "new" | null
  >(null)
  const [upload, setUpload] = useState<{
    files?: File[]
  } | null>(null)
  const [action, setAction] = useState<AssetAction | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const { run, download, remove, restore, busy, error, clearError } =
    useAssetOperations(() => setSelectedIds([]))
  const [gridPage, setGridPage] = useState(0)
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
  const invalidLocation =
    view === "files" &&
    ((connectionId !== "all" && !connection) || (!!parentId && !folder))
  const searching = !!search.trim() || query.rules.length > 0
  const records = browseAssets(data, {
    connectionId,
    parentId,
    view,
    search,
    query,
    sort,
  })
  const selected = records.filter((entry) => selectedIds.includes(entry.id))
  const selectedKeys = selected.map((entry) => entry.id)
  const previewFile = data.assets.find(
    (asset) => asset.id === params.get("file") && !trashIds.has(asset.id)
  )
  const detail = entries.find((entry) => entry.id === detailId)
  const title =
    folder?.name ?? connection?.name ?? VIEW_NAMES[view] ?? "文件资产"
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
    const next = new URLSearchParams()
    if (sourceId !== "all") next.set("connection", sourceId)
    if (folderId) next.set("folder", folderId)
    if (nextView !== "files") next.set("view", nextView)
    if (layout === "grid") next.set("layout", layout)
    setSearch("")
    setQuery(createFilterQuery())
    setSelectedIds([])
    setGridPage(0)
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
  const entryHref = (entry: AssetEntry) =>
    entry.kind === "file"
      ? assetHref(entry)
      : `/assets?${new URLSearchParams({ connection: entry.connectionId, folder: entry.id, ...(layout === "grid" ? { layout } : {}) })}`
  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((key) => key !== id)
    )
  const allSelected = records.length > 0 && selected.length === records.length
  const selectAll = (
    <Checkbox
      aria-label="选择全部文件"
      checked={allSelected}
      indeterminate={selected.length > 0 && !allSelected}
      onCheckedChange={(checked) =>
        setSelectedIds(checked ? records.map((entry) => entry.id) : [])
      }
    />
  )
  const actionsFor = (entry: AssetEntry) => (
    <AssetActions
      entry={entry}
      trash={view === "trash"}
      onAction={setAction}
      onDownload={download}
      onStar={(record) => {
        void run(() => starEntries([record.id], !record.starred))
      }}
      onTrash={remove}
      onRestore={restore}
      onDelete={setDeleteIds}
      onLocate={locate}
      onDetails={(record) => setDetailId(record.id)}
    />
  )
  const nameFor = (entry: AssetEntry) => (
    <div className="flex min-w-0 items-center gap-2">
      <EntryIcon entry={entry} />
      {view === "trash" ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="min-w-0 justify-start font-normal"
          onClick={() => setDetailId(entry.id)}
        >
          <span className="truncate">{entry.name}</span>
        </Button>
      ) : (
        <Link
          className="min-w-0 truncate text-sm font-normal transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          title={entry.name}
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
          {entry.name}
        </Link>
      )}
      {entry.starred && (
        <StarIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="已收藏"
        />
      )}
    </div>
  )
  const columns: ColumnDef<DataGridFeatures, AssetEntry>[] = [
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
      sortFn: sortFileRows,
      size: 300,
      meta: { fillWidth: true },
      cell: ({ row }) => nameFor(row.original),
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
      sortFn: sortFileRows,
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.kind === "file" ? formatSize(row.original.size) : "—"}
        </span>
      ),
    },
    ...(connectionId === "all"
      ? ([
          {
            accessorKey: "connectionId",
            header: "所属存储",
            size: 160,
            cell: ({ row }) => (
              <span
                className="block truncate text-sm text-muted-foreground"
                title={
                  data.connections.find(
                    (source) => source.id === row.original.connectionId
                  )?.name
                }
              >
                {data.connections.find(
                  (source) => source.id === row.original.connectionId
                )?.name ?? "—"}
              </span>
            ),
          },
          {
            id: "bucket",
            header: "Bucket",
            size: 160,
            cell: ({ row }) => (
              <span
                className="block truncate text-sm text-muted-foreground"
                title={
                  data.connections.find(
                    (source) => source.id === row.original.connectionId
                  )?.bucket
                }
              >
                {data.connections.find(
                  (source) => source.id === row.original.connectionId
                )?.bucket ?? "—"}
              </span>
            ),
          },
        ] as ColumnDef<DataGridFeatures, AssetEntry>[])
      : []),
    ...(searching || view !== "files"
      ? [
          {
            id: "path",
            header: "所在位置",
            size: 180,
            cell: ({ row }: { row: { original: AssetEntry } }) => (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="max-w-full min-w-0 justify-start font-normal"
                onClick={() => locate(row.original)}
              >
                <span
                  className="truncate"
                  title={folderTrail(data, row.original.parentId)
                    .map((entry) => entry.name)
                    .join(" / ")}
                >
                  {folderTrail(data, row.original.parentId)
                    .map((entry) => entry.name)
                    .join(" / ") || "根目录"}
                </span>
              </Button>
            ),
          },
        ]
      : []),
    {
      id: "time",
      accessorFn: (entry) =>
        view === "trash"
          ? (entry.trashedAt ?? entry.createdAt)
          : view === "recent"
            ? (entry.lastOpenedAt ?? entry.createdAt)
            : (entry.updatedAt ?? entry.createdAt),
      enableSorting: true,
      sortFn: sortFileRows,
      header:
        view === "trash"
          ? "删除时间"
          : view === "recent"
            ? "访问时间"
            : "修改时间",
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatTime(
            view === "trash"
              ? row.original.trashedAt
              : view === "recent"
                ? row.original.lastOpenedAt
                : (row.original.updatedAt ?? row.original.createdAt)
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      size: 96,
      meta: { headerClassName: "text-center", cellClassName: "text-center" },
      cell: ({ row }) => actionsFor(row.original),
    },
  ]
  const clearFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
    setGridPage(0)
  }
  const empty = (
    <EmptyState
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
        searching ? "清除筛选" : view === "files" ? "上传" : "查看全部文件"
      }
      onAction={
        searching
          ? clearFilters
          : view === "files"
            ? () => openUpload()
            : () => navigate("all")
      }
    />
  )
  const toolbar = (
    <>
      <Input
        aria-label="搜索文件"
        placeholder="搜索文件名称…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setGridPage(0)
          setSelectedIds([])
        }}
        className="w-full sm:w-52"
      />
      <Filters
        fields={FILTER_FIELDS}
        query={query}
        onQueryChange={(next) => {
          setQuery(next)
          setGridPage(0)
          setSelectedIds([])
        }}
        size="sm"
        labels={{ addFilter: "筛选" }}
      />
      {layout === "grid" && view !== "recent" && view !== "trash" && (
        <div className="flex items-center gap-1">
          <ArrowDownAZIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Choice
            label="文件排序"
            value={sort}
            onChange={(value) => {
              setSort(value)
              setGridPage(0)
            }}
            options={[
              { value: "name", label: "名称" },
              { value: "date", label: "最近修改" },
              { value: "size", label: "大小" },
            ]}
          />
        </div>
      )}
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
              if (id === "list") next.delete("layout")
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
  const page = Math.min(
    gridPage,
    Math.max(0, Math.ceil(records.length / 24) - 1)
  )
  return (
    <>
      <AssetNavigation
        data={data}
        status={status}
        connectionId={connectionId}
        parentId={parentId}
        view={view}
        onNavigate={navigate}
        onAdd={() => setConfiguring("new")}
      />
      <WorkbenchScreen
        title="资产"
        actions={
          <>
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
                    disabled={
                      invalidLocation ||
                      !data.connections.length ||
                      view !== "files"
                    }
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
                      disabled={
                        invalidLocation ||
                        !data.connections.length ||
                        view !== "files"
                      }
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
                  disabled={invalidLocation}
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
            className="flex min-w-0 flex-col gap-4"
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
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{VIEW_NAMES[view]}</BreadcrumbPage>
                      </BreadcrumbItem>
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
            {connection?.status === "error" && (
              <Alert variant="destructive">
                <AlertTitle>存储连接异常</AlertTitle>
                <AlertDescription>{connection.error}</AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyIds.includes(connection.id)}
                    onClick={() => {
                      void refreshConnection("storage", connection.id)
                    }}
                  >
                    重试
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>{error.title}</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={error.retry}
                  >
                    重试
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {invalidLocation ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>目录不可用</AlertTitle>
                <AlertAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("all")}
                  >
                    返回全部文件
                  </Button>
                </AlertAction>
              </Alert>
            ) : (
              <>
                {selected.length > 0 && (
                  <div
                    className="flex flex-wrap items-center gap-2"
                    aria-label="批量文件操作"
                  >
                    <span className="text-sm tabular-nums">
                      已选 {selected.length} 项
                    </span>
                    {view === "trash" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => restore(selectedKeys)}
                        >
                          <RotateCcwIcon aria-hidden="true" />
                          恢复
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteIds(selectedKeys)}
                        >
                          <Trash2Icon aria-hidden="true" />
                          彻底删除
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            busy ||
                            selected.some((entry) => entry.kind === "folder")
                          }
                          onClick={() => {
                            void run(
                              async () => {
                                for (const entry of selected) {
                                  if (entry.kind === "file")
                                    await downloadAsset(entry)
                                }
                              },
                              undefined,
                              "下载失败"
                            )
                          }}
                        >
                          <DownloadIcon aria-hidden="true" />
                          下载
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAction({ mode: "move", ids: selectedKeys })
                          }
                        >
                          移动
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAction({ mode: "copy", ids: selectedKeys })
                          }
                        >
                          复制
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
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
                          {selected.every((entry) => entry.starred)
                            ? "取消收藏"
                            : "收藏"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => remove(selectedKeys)}
                        >
                          <Trash2Icon aria-hidden="true" />
                          移入回收站
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="取消选择"
                      onClick={() => setSelectedIds([])}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                )}
                {layout === "list" ? (
                  <RecordsGrid
                    title={searching ? "搜索结果" : title}
                    icon={
                      searching ? (
                        <SearchIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <LocationIcon className="size-4" aria-hidden="true" />
                      )
                    }
                    records={records}
                    columns={columns}
                    toolbar={toolbar}
                    empty={empty}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          {selectAll}
                          <h2 className="text-sm font-medium">{title}</h2>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {records.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                          {toolbar}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {records.length ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {records
                            .slice(page * 24, (page + 1) * 24)
                            .map((entry) => (
                              <Card
                                key={entry.id}
                                size="sm"
                                className={
                                  selectedIds.includes(entry.id)
                                    ? "bg-accent"
                                    : undefined
                                }
                              >
                                <CardHeader>
                                  <div className="flex items-center justify-between gap-2">
                                    <Checkbox
                                      aria-label={`选择：${entry.name}`}
                                      checked={selectedIds.includes(entry.id)}
                                      onCheckedChange={(checked) =>
                                        toggleSelected(entry.id, checked)
                                      }
                                    />
                                    {actionsFor(entry)}
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  <div className="flex flex-col items-center gap-4">
                                    <EntryIcon entry={entry} large />
                                    <div className="w-full min-w-0">
                                      {nameFor(entry)}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {entry.kind === "file"
                                        ? `${assetKind(entry)} · ${formatSize(entry.size)}`
                                        : "文件夹"}
                                    </p>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      ) : (
                        empty
                      )}
                    </CardContent>
                    <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {records.length} 项
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={page === 0}
                          onClick={() => setGridPage(page - 1)}
                        >
                          上一页
                        </Button>
                        <span className="text-xs tabular-nums">
                          {page + 1} /{" "}
                          {Math.max(1, Math.ceil(records.length / 24))}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={(page + 1) * 24 >= records.length}
                          onClick={() => setGridPage(page + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </WorkbenchScreen>
      {configuring && (
        <ConnectionDialog
          kind="storage"
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
            (entry): entry is Extract<AssetEntry, { kind: "file" }> =>
              entry.kind === "file" && view !== "trash"
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
    </>
  )
}
