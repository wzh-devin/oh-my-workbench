import { useEffect, useId } from "react"
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import {
  ClockIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDriveIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import {
  InnerNavButton,
  InnerNavGroup,
  InnerNavLabel,
  innerNavRowClassName,
} from "@/components/app-shell/inner-sidebar-nav"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useSidebar } from "@/components/ui/sidebar"
import type { Workbench } from "@/features/workbench/model"
import { assetEntries, folderTrail, trashedEntryIds } from "../asset-rules"

type DirectoryNode = {
  name: string
  children: string[]
  connectionId: string
  folderId: string | null
  storage?: boolean
}

/** 复用 ReUI c-tree-3 的单行目录结构及 Headless Tree 键盘、展开和选中行为。 */
function AssetDirectoryTree({
  data,
  connectionId,
  parentId,
  view,
  onNavigate,
}: {
  data: Workbench
  connectionId: string
  parentId: string | null
  view: string
  onNavigate: (
    connectionId: string,
    folderId?: string | null,
    view?: string
  ) => void
}) {
  const labelId = useId()
  const trashIds = trashedEntryIds(data)
  const folders = data.assetFolders.filter((folder) => !trashIds.has(folder.id))
  const childrenOf = (sourceId: string, folderId: string | null) =>
    folders
      .filter(
        (folder) =>
          folder.connectionId === sourceId && folder.parentId === folderId
      )
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
      .map((folder) => `folder:${folder.id}`)
  const directoryMap: Record<string, DirectoryNode> = {
    root: {
      name: "存储目录",
      children: data.connections.map((source) => `storage:${source.id}`),
      connectionId: "",
      folderId: null,
    },
  }
  data.connections.forEach((source) => {
    directoryMap[`storage:${source.id}`] = {
      name: source.name,
      children: childrenOf(source.id, null),
      connectionId: source.id,
      folderId: null,
      storage: true,
    }
  })
  folders.forEach((folder) => {
    directoryMap[`folder:${folder.id}`] = {
      name: folder.name,
      children: childrenOf(folder.connectionId, folder.id),
      connectionId: folder.connectionId,
      folderId: folder.id,
    }
  })
  const selectedId =
    view === "files" && connectionId !== "all"
      ? parentId
        ? `folder:${parentId}`
        : `storage:${connectionId}`
      : null
  const ancestorIds =
    connectionId === "all"
      ? []
      : [
          `storage:${connectionId}`,
          ...folderTrail(data, parentId)
            .slice(0, -1)
            .map((folder) => `folder:${folder.id}`),
        ]
  const tree = useTree<DirectoryNode>({
    rootItemId: "root",
    indent: 16,
    initialState: {
      expandedItems: [
        ...data.connections.map((source) => `storage:${source.id}`),
        ...ancestorIds,
      ],
    },
    state: {
      selectedItems: selectedId && directoryMap[selectedId] ? [selectedId] : [],
    },
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().children.length > 0,
    dataLoader: {
      getItem: (id) => directoryMap[id] ?? directoryMap.root,
      getChildren: (id) => directoryMap[id]?.children ?? [],
    },
    onPrimaryAction: (item) => {
      const node = item.getItemData()
      onNavigate(node.connectionId, node.folderId)
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, selectionFeature],
  })
  const structure = JSON.stringify(
    Object.entries(directoryMap).map(([id, node]) => [
      id,
      node.name,
      node.children,
    ])
  )
  useEffect(() => {
    tree.rebuildTree()
  }, [tree, structure])
  const ancestorKey = ancestorIds.join("|")
  useEffect(() => {
    for (const id of ancestorKey.split("|").filter(Boolean))
      tree.getItemInstance(id).expand()
  }, [tree, ancestorKey])
  return (
    <>
      <span id={labelId} className="sr-only">
        存储目录
      </span>
      <Tree
        tree={tree}
        indent={16}
        aria-labelledby={labelId}
        className="w-max min-w-full"
      >
        {tree.getItems().map((item) => {
          const node = item.getItemData()
          const Icon = node.storage
            ? HardDriveIcon
            : item.isExpanded() || item.isSelected()
              ? FolderOpenIcon
              : FolderIcon
          return (
            <TreeItem
              key={item.getId()}
              item={item}
              type="button"
              className="min-w-0 text-start"
              aria-current={
                item.getId() === selectedId ? "location" : undefined
              }
            >
              <TreeItemLabel
                className={innerNavRowClassName(
                  item.isSelected(),
                  "min-w-0 gap-1"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <InnerNavLabel
                    item={{
                      label: node.name,
                      icon: <Icon aria-hidden="true" />,
                    }}
                    truncate={false}
                  />
                </span>
              </TreeItemLabel>
            </TreeItem>
          )
        })}
      </Tree>
    </>
  )
}

/** 分类与目录树保留原 InnerPanel 分组和窄屏抽屉。 */
export function AssetNavigation({
  data,
  status,
  connectionId,
  parentId,
  view,
  onNavigate,
  onAdd,
}: {
  data: Workbench
  status: string
  connectionId: string
  parentId: string | null
  view: string
  onNavigate: (
    connectionId: string,
    folderId?: string | null,
    view?: string
  ) => void
  onAdd: () => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const trashIds = trashedEntryIds(data)
  const entries = assetEntries(data)
  const navigate = (
    id: string,
    folderId: string | null = null,
    nextView = "files"
  ) => {
    onNavigate(id, folderId, nextView)
    if (isMobile) setOpenMobile(false)
  }
  return (
    <InnerPanel>
      <div className="shrink-0 border-b border-border p-3">
        <h2 className="text-sm font-medium">资产分类</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="资产目录" className="flex flex-col py-1">
          <InnerNavGroup title="资产" separated={false}>
            {[
              {
                id: "files",
                label: "全部文件",
                icon: FileIcon,
                count: data.assets.filter((asset) => !trashIds.has(asset.id))
                  .length,
              },
              {
                id: "recent",
                label: "最近访问",
                icon: ClockIcon,
                count: entries.filter(
                  (entry) => !trashIds.has(entry.id) && entry.lastOpenedAt
                ).length,
              },
              {
                id: "starred",
                label: "收藏",
                icon: StarIcon,
                count: entries.filter(
                  (entry) => !trashIds.has(entry.id) && entry.starred
                ).length,
              },
              {
                id: "trash",
                label: "回收站",
                icon: Trash2Icon,
                count: entries.filter(
                  (entry) =>
                    entry.trashedAt &&
                    !folderTrail(data, entry.parentId).some(
                      (folder) => folder.trashedAt
                    )
                ).length,
              },
            ].map(({ id, label, icon: Icon, count }) => (
              <InnerNavButton
                key={id}
                item={{
                  label,
                  icon: <Icon aria-hidden="true" />,
                  badge: count,
                }}
                isActive={
                  view === id && (id !== "files" || connectionId === "all")
                }
                onClick={() => navigate("all", null, id)}
              />
            ))}
          </InnerNavGroup>
          <InnerNavGroup title="存储" separated>
            {status === "loading" ? (
              <Skeleton className="h-20 w-full" />
            ) : data.connections.length ? (
              <ScrollArea orientation="horizontal" className="w-full min-w-0">
                <AssetDirectoryTree
                  data={data}
                  connectionId={connectionId}
                  parentId={parentId}
                  view={view}
                  onNavigate={navigate}
                />
              </ScrollArea>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={onAdd}>
                添加存储
              </Button>
            )}
          </InnerNavGroup>
          <InnerNavGroup title="管理" separated>
            <InnerNavButton
              item={{
                label: "存储连接",
                icon: <HardDriveIcon aria-hidden="true" />,
                badge: data.connections.length,
              }}
              isActive={view === "connections"}
              onClick={() => navigate("all", null, "connections")}
            />
          </InnerNavGroup>
        </nav>
      </ScrollArea>
    </InnerPanel>
  )
}
