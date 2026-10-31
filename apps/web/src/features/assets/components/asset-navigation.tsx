import { useEffect, useId } from "react"
import { cn } from "cn"
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import {
  FolderIcon,
  FolderOpenIcon,
  HardDriveIcon,
  Trash2Icon,
  PlusIcon,
  MoreHorizontalIcon,
  ChevronDownIcon,
} from "lucide-react"
import { Tree, TreeItem } from "@/components/reui/tree"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import {
  InnerNavButton,
  InnerNavGroup,
  InnerNavLabel,
  innerNavRowClassName,
} from "@/components/app-shell/inner-sidebar-nav"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import type { AssetView } from "../model"
import { AssetViewIcon } from "./view-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useSidebar } from "@/components/ui/sidebar"
import type { Workbench } from "@/features/workbench/model"
import { folderTrail, trashedEntryIds } from "../asset-rules"

type DirectoryNode = {
  name: string
  children: string[]
  connectionId: string
  folderId: string | null
  storage?: boolean
}

/** 树节点沿用普通导航行，展开箭头靠右，顶层图标和文字保持对齐。 */
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
  // 一次索引目录关系，避免每个节点重新扫描整棵树。
  const children = new Map<string, string[]>()
  for (const folder of [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN", { numeric: true })
  )) {
    const key = `${folder.connectionId}:${folder.parentId ?? "root"}`
    const siblings = children.get(key) ?? []
    siblings.push(`folder:${folder.id}`)
    children.set(key, siblings)
  }
  const childrenOf = (sourceId: string, folderId: string | null) =>
    children.get(`${sourceId}:${folderId ?? "root"}`) ?? []
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
              <span
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  innerNavRowClassName(item.isSelected()),
                  "min-w-0 in-focus-visible:ring-3 in-focus-visible:ring-ring/50"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <InnerNavLabel
                    item={{
                      label: node.name,
                      icon: (
                        <Icon
                          aria-hidden="true"
                          className={
                            node.storage
                              ? undefined
                              : "text-amber-500 dark:text-amber-400"
                          }
                        />
                      ),
                    }}
                    truncate={false}
                  />
                </span>
                {item.isFolder() && (
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn(
                      "ml-auto size-4",
                      !item.isExpanded() && "-rotate-90"
                    )}
                  />
                )}
              </span>
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
  views,
  onEditView,
  onDeleteView,
  onAddView,
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
  views: AssetView[]
  onEditView: (view: AssetView) => void
  onDeleteView: (view: AssetView) => void
  onAddView: () => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
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
          <InnerNavGroup
            title="视图"
            separated={false}
            action={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="新建视图"
                onClick={onAddView}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            }
          >
            {views.map((saved) => (
              <div key={saved.id} className="flex min-w-0 items-center gap-1">
                <InnerNavButton
                  item={{
                    label: saved.name,
                    icon: <AssetViewIcon name={saved.icon} />,
                  }}
                  isActive={
                    (view === saved.id || view === saved.builtinKey) &&
                    connectionId === "all"
                  }
                  onClick={() => navigate("all", null, saved.id)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`管理视图：${saved.name}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditView(saved)}>
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={views.length <= 1}
                      onClick={() => onDeleteView(saved)}
                    >
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
                label: "回收站",
                icon: <Trash2Icon aria-hidden="true" />,
              }}
              isActive={view === "trash"}
              onClick={() => navigate("all", null, "trash")}
            />
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
