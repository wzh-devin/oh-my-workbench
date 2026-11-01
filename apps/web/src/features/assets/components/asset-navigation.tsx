import { HardDriveIcon, Trash2Icon, PlusIcon } from "lucide-react"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import {
  InnerNavButton,
  InnerNavGroup,
} from "@/components/app-shell/inner-sidebar-nav"
import { Button } from "@/components/ui/button"
import { DirectoryTree } from "./directory-tree"
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
  return (
    <DirectoryTree
      nodes={directoryMap}
      rootId="root"
      selectedId={selectedId}
      expandedIds={[
        ...data.connections.map((source) => `storage:${source.id}`),
        ...ancestorIds,
      ]}
      label="存储目录"
      onSelect={(id) => {
        const node = directoryMap[id]
        onNavigate(node.connectionId, node.folderId)
      }}
    />
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
              <InnerNavButton
                key={saved.id}
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
