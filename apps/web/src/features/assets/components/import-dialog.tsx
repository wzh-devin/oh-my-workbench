import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Choice } from "@/features/workbench/components"
import { getWorkbench } from "@/features/workbench/store"
import { useAssets } from "../store"
import { importLegacyConnection } from "../legacy-import"

/** 导入前明确选择旧来源和真实目标，失败不删除浏览器副本。 */
export function AssetImportDialog({ onClose }: { onClose: () => void }) {
  const old = getWorkbench(),
    { overview } = useAssets()
  const sources = old.connections.filter(
    (connection) =>
      old.assetFolders.some(
        (folder) => folder.connectionId === connection.id
      ) ||
      old.assets.some(
        (asset) =>
          asset.connectionId === connection.id && asset.origin === "upload"
      )
  )
  const targets = overview.connections.filter(
    (connection) => connection.status === "connected"
  )
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? ""),
    [targetId, setTargetId] = useState(targets[0]?.id ?? "")
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<[number, number] | null>(null)
  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await importLegacyConnection(sourceId, targetId, (completed, total) =>
        setProgress([completed, total])
      )
      toast.success("导入完成")
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败，请重试")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>导入本地数据</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>本地来源</FieldLabel>
            <Choice
              label="本地来源"
              value={sourceId}
              onChange={setSourceId}
              disabled={busy}
              options={sources.map((source) => ({
                value: source.id,
                label: source.name,
              }))}
            />
          </Field>
          <Field>
            <FieldLabel>目标存储</FieldLabel>
            <Choice
              label="目标存储"
              value={targetId}
              onChange={setTargetId}
              disabled={busy}
              options={targets.map((target) => ({
                value: target.id,
                label: target.name,
              }))}
            />
          </Field>
          {progress && (
            <span role="status" className="text-xs tabular-nums">
              {progress[0]} / {progress[1]}
            </span>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !sourceId || !targetId}
            onClick={() => void submit()}
          >
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
