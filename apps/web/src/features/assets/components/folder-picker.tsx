import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { AssetFolder } from "@/features/workbench/model"
import { folderTrail } from "../asset-rules"
import { DirectoryTree, type DirectoryNode } from "./directory-tree"

function FolderTree({
  folders,
  value,
  onSelect,
}: {
  folders: AssetFolder[]
  value: string
  onSelect: (id: string) => void
}) {
  const nodes: Record<string, DirectoryNode> = {
    "tree-root": { name: "目标目录", children: ["root"] },
    root: { name: "根目录", children: [] },
  }
  for (const folder of folders)
    nodes[folder.id] = { name: folder.name, children: [] }
  for (const folder of [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN", { numeric: true })
  ))
    nodes[folder.parentId ?? "root"]?.children.push(folder.id)
  return (
    <DirectoryTree
      nodes={nodes}
      rootId="tree-root"
      selectedId={value}
      expandedIds={[
        "root",
        ...folderTrail(
          { assetFolders: folders },
          value === "root" ? null : value
        )
          .slice(0, -1)
          .map((folder) => folder.id),
      ]}
      onSelect={onSelect}
      label="目标目录"
    />
  )
}

/** 调用方传入同一存储中允许选择的目录，根目录始终可选。 */
export function FolderPicker({
  folders,
  value,
  onChange,
  disabled,
}: {
  folders: AssetFolder[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected =
    value === "root"
      ? "根目录"
      : folders.find((folder) => folder.id === value)?.name
  const path = folderTrail(
    { assetFolders: folders },
    value === "root" ? null : value
  )
    .map((folder) => folder.name)
    .join(" / ")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full min-w-0 justify-between font-normal"
            aria-label="目标目录"
            title={path || selected}
            disabled={disabled}
          />
        }
      >
        <span className="truncate">{selected ?? "选择目录"}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="选择目标目录"
        className="max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-0"
      >
        <div className="min-h-0 overflow-auto">
          <FolderTree
            folders={folders}
            value={value}
            onSelect={(id) => {
              onChange(id)
              setOpen(false)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
