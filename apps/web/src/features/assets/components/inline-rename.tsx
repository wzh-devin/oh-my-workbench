import { useId, useRef } from "react"
import { toast } from "sonner"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { assetName, type AssetEntry } from "../asset-rules"
import { fileNameParts } from "../file-name"
import { renameEntry } from "../store"

export type RenameDraft = {
  id: string
  value: string
  pending: boolean
  error: string
}

/** 主文件名原位编辑，后缀只读；失败保留草稿供直接重试。 */
export function InlineRename({
  entry,
  draft,
  onChange,
  onClose,
}: {
  entry: AssetEntry
  draft: RenameDraft
  onChange: (next: Partial<Omit<RenameDraft, "id">>) => void
  onClose: () => void
}) {
  const { extension } =
    entry.kind === "file" ? fileNameParts(entry.name) : { extension: "" }
  const errorId = useId()
  const running = useRef(false),
    cancelled = useRef(false)
  const save = async () => {
    if (running.current || cancelled.current || draft.pending) return
    running.current = true
    onChange({ error: "" })
    try {
      if (!draft.value.trim()) throw new Error("请输入名称")
      const name = assetName(draft.value.trim() + extension)
      if (entry.kind === "file" && fileNameParts(name).extension !== extension)
        throw new Error("不能修改文件后缀名")
      if (name !== entry.name) {
        onChange({ pending: true })
        await renameEntry(entry.id, name)
        toast.success("名称已更新")
      }
      onClose()
    } catch (caught) {
      onChange({
        error: caught instanceof Error ? caught.message : "重命名失败，请重试",
      })
    } finally {
      running.current = false
      onChange({ pending: false })
    }
  }
  return (
    <div className="flex max-w-sm min-w-0 flex-1 flex-col gap-1">
      <InputGroup>
        <InputGroupInput
          aria-label={`重命名：${entry.name}`}
          aria-invalid={!!draft.error}
          aria-describedby={draft.error ? errorId : undefined}
          placeholder="请输入名称"
          value={draft.value}
          maxLength={200 - extension.length}
          disabled={draft.pending}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            onChange({ value: event.target.value, error: "" })
          }}
          onBlur={() => {
            void save()
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Enter") {
              event.preventDefault()
              event.stopPropagation()
              void save()
            }
            if (event.key === "Escape" && !draft.pending) {
              event.preventDefault()
              event.stopPropagation()
              cancelled.current = true
              onClose()
            }
          }}
        />
        {extension && (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{extension}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
      {draft.error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {draft.error}
        </p>
      )}
    </div>
  )
}
