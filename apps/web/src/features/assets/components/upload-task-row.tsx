import {
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"
import { Badge } from "@/components/reui/badge"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { RecordHint } from "@/features/workbench/records-grid"
import { formatSize } from "@/features/workbench/model"
import type { UploadTask } from "../upload-queue"
import { uploadStatusLabels } from "../upload-filters"

/** 完成后仅保留文件与结果；字节传完仍需服务端确认，不能提前显示完成。 */
export function UploadTaskRow({
  task,
  pending,
  onPause,
  onResume,
  onCancel,
  onRefresh,
  onContinue,
}: {
  task: UploadTask
  pending: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRefresh: () => void
  onContinue: (name: string) => void
}) {
  const completed = task.status === "completed"
  const conflict = task.status === "conflict"
  const canPause = ["queued", "hashing", "uploading"].includes(task.status)
  const canResume = ["paused", "error", "cancelled"].includes(task.status)
  const confirming = task.status === "verifying" || task.status === "cleaning"
  const resumeLabel = task.needsFile
    ? "选择原文件"
    : task.serverStatus === "closed" || task.status === "cancelled"
      ? "重新上传"
      : task.status === "error"
        ? "重试"
        : "恢复"
  const phase =
    task.status === "cleaning" && task.cancelRequested
      ? "取消中"
      : uploadStatusLabels[task.status]
  const progress =
    task.status === "completed" || task.status === "verifying"
      ? 100
      : Math.min(100, Math.max(0, Math.round(task.progress * 100)))
  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-3",
        !completed && !conflict && "sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      )}
    >
      <FileTypeIcon file={task} size="sm" />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm" title={task.name}>
              {task.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatSize(task.size)}
              {!completed &&
              !conflict &&
              task.status !== "hashing" &&
              task.status !== "queued"
                ? ` · ${progress}%`
                : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1" role="status">
            <Badge
              variant={
                task.status === "completed"
                  ? "success-light"
                  : task.status === "error"
                    ? "destructive-light"
                    : task.status === "paused" || conflict
                      ? "warning-light"
                      : "primary-light"
              }
            >
              {phase}
            </Badge>
            {task.error && (
              <RecordHint label={`查看上传错误：${task.name}`}>
                {task.error}
              </RecordHint>
            )}
          </div>
        </div>
        {!completed && !conflict && (
          <Progress aria-label={`${task.name}：${phase}`} value={progress} />
        )}
      </div>
      {conflict && (
        <form
          className="col-start-2 flex min-w-0 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onContinue(
              String(new FormData(event.currentTarget).get("name") ?? "")
            )
          }}
        >
          <Input
            key={task.suggestedName}
            name="name"
            aria-label={`上传名称：${task.name}`}
            placeholder="输入上传后的文件名"
            defaultValue={task.suggestedName ?? task.name}
            required
            disabled={pending}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              <XIcon aria-hidden="true" />
              取消该文件上传
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              <PlayIcon aria-hidden="true" />
              继续上传
            </Button>
          </div>
        </form>
      )}
      {!completed && !conflict && (
        <div className="col-start-2 flex flex-wrap items-center justify-end gap-1 sm:col-start-3">
          {canPause && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onPause}
            >
              <PauseIcon aria-hidden="true" />
              暂停
            </Button>
          )}
          {canResume && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onResume}
            >
              {task.status === "error" || task.status === "cancelled" ? (
                <RotateCcwIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
              {resumeLabel}
            </Button>
          )}
          {(confirming || task.status === "error") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || !task.serverId}
              onClick={onRefresh}
            >
              <RefreshCwIcon aria-hidden="true" />
              刷新状态
            </Button>
          )}
          {!["completed", "cleaning", "cancelled"].includes(task.status) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              <XIcon aria-hidden="true" />
              取消
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
