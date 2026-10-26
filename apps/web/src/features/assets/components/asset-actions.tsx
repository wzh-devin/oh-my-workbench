import {
  CopyIcon,
  DownloadIcon,
  FolderInputIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Asset } from "@/features/workbench/model"
import type { AssetEntry } from "../asset-rules"
import type { AssetAction } from "./asset-dialogs"

export function AssetActions({
  entry,
  trash,
  onAction,
  onDownload,
  onStar,
  onTrash,
  onRestore,
  onDelete,
  onLocate,
  onDetails,
}: {
  entry: AssetEntry
  trash: boolean
  onAction: (action: AssetAction) => void
  onDownload: (asset: Asset) => void
  onStar: (entry: AssetEntry) => void
  onTrash: (ids: string[]) => void
  onRestore: (ids: string[]) => void
  onDelete: (ids: string[]) => void
  onLocate: (entry: AssetEntry) => void
  onDetails: (entry: AssetEntry) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {!trash && entry.kind === "file" && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`下载：${entry.name}`}
          onClick={() => onDownload(entry)}
        >
          <DownloadIcon aria-hidden="true" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`文件操作：${entry.name}`}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {trash ? (
            <>
              <DropdownMenuItem onClick={() => onRestore([entry.id])}>
                <RotateCcwIcon aria-hidden="true" />
                恢复
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete([entry.id])}
              >
                <Trash2Icon aria-hidden="true" />
                彻底删除
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => onAction({ mode: "rename", ids: [entry.id] })}
              >
                <PencilIcon aria-hidden="true" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAction({ mode: "move", ids: [entry.id] })}
              >
                <FolderInputIcon aria-hidden="true" />
                移动到
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAction({ mode: "copy", ids: [entry.id] })}
              >
                <CopyIcon aria-hidden="true" />
                复制到
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStar(entry)}>
                <StarIcon aria-hidden="true" />
                {entry.starred ? "取消收藏" : "收藏"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLocate(entry)}>
                <FolderInputIcon aria-hidden="true" />
                打开所在位置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onTrash([entry.id])}
              >
                <Trash2Icon aria-hidden="true" />
                移入回收站
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={() => onDetails(entry)}>
            <InfoIcon aria-hidden="true" />
            详情
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
