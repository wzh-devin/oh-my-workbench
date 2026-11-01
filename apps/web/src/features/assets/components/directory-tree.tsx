import { useEffect, useId } from "react"
import { useTree } from "@headless-tree/react"
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDriveIcon,
} from "lucide-react"
import { cn } from "cn"
import { Tree, TreeItem } from "@/components/reui/tree"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  InnerNavLabel,
  innerNavRowClassName,
} from "@/components/app-shell/inner-sidebar-nav"

export type DirectoryNode = {
  name: string
  children: string[]
  storage?: boolean
}

/** 侧栏与目标目录共用行样式、右侧展开按钮和原生树键盘交互。 */
export function DirectoryTree({
  nodes,
  rootId,
  selectedId,
  expandedIds,
  onSelect,
  label,
}: {
  nodes: Record<string, DirectoryNode>
  rootId: string
  selectedId: string | null
  expandedIds: string[]
  onSelect: (id: string) => void
  label: string
}) {
  const labelId = useId()
  const tree = useTree<DirectoryNode>({
    rootItemId: rootId,
    initialState: { expandedItems: expandedIds, focusedItem: selectedId },
    state: {
      selectedItems: selectedId && nodes[selectedId] ? [selectedId] : [],
    },
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().children.length > 0,
    dataLoader: {
      getItem: (id) => nodes[id] ?? nodes[rootId],
      getChildren: (id) => nodes[id]?.children ?? [],
    },
    onPrimaryAction: (item) => onSelect(item.getId()),
    features: [syncDataLoaderFeature, hotkeysCoreFeature, selectionFeature],
  })
  const structure = JSON.stringify(nodes)
  useEffect(() => {
    tree.rebuildTree()
  }, [tree, structure])
  const expandedKey = expandedIds.join("|")
  useEffect(() => {
    for (const id of expandedKey.split("|").filter(Boolean))
      tree.getItemInstance(id).expand()
  }, [tree, expandedKey])
  return (
    <>
      <span id={labelId} className="sr-only">
        {label}
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
            <div
              key={item.getId()}
              role="presentation"
              className="relative flex min-w-0 items-center"
            >
              <TreeItem
                item={item}
                type="button"
                className="min-w-0 flex-1 text-start"
              >
                <span
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    innerNavRowClassName(item.isSelected()),
                    "min-w-0 in-focus-visible:ring-3 in-focus-visible:ring-ring/50"
                  )}
                >
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
                  {item.isFolder() && (
                    <span
                      aria-hidden="true"
                      className="ml-auto size-7 shrink-0"
                    />
                  )}
                </span>
              </TreeItem>
              {item.isFolder() && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  tabIndex={-1}
                  className="absolute right-0 z-30 hover:bg-transparent dark:hover:bg-transparent"
                  aria-label={`${item.isExpanded() ? "收起" : "展开"}：${node.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    item.setFocused()
                    item.getElement()?.focus()
                    if (item.isExpanded()) item.collapse()
                    else item.expand()
                  }}
                >
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={item.isExpanded() ? undefined : "-rotate-90"}
                  />
                </Button>
              )}
            </div>
          )
        })}
      </Tree>
    </>
  )
}
