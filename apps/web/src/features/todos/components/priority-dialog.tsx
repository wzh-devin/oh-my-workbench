import { useCallback, useMemo, useState, type FormEvent } from "react"
import { type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useTable, type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { GripVerticalIcon } from "lucide-react"
import {
  ColorPicker,
  ColorPickerContent,
  ColorPickerTrigger,
  ColorPickerSwatch,
  formatColor,
  type ColorPickerI18nOverrides,
} from "@/components/reui/color-picker"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import {
  DataGridTableDndRows,
  DataGridTableDndRowHandle,
} from "@/components/reui/data-grid/data-grid-table-dnd-rows"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import type { TodoPriority } from "../configuration"
import { saveTodoPriorities, useTodos } from "../store"

const COLOR_LABELS: ColorPickerI18nOverrides = {
  labels: {
    placeholder: "选择颜色",
    panelLabel: "选择颜色",
    openPicker: "打开颜色选择器",
    area: "颜色",
    hue: "色相",
    saturation: "饱和度",
    brightness: "亮度",
    lightness: "明度",
    chroma: "彩度",
    red: "红色通道",
    green: "绿色通道",
    blue: "蓝色通道",
    alpha: "不透明度",
    hex: "HEX 色值",
    format: "颜色格式",
    eyeDropper: "屏幕取色",
    copy: "复制颜色",
    copied: "已复制",
    clear: "清除颜色",
    swatches: "常用颜色",
  },
  functions: { getColorName: (color) => formatColor(color, "hex") },
}

export function PriorityBadge({
  priority,
}: {
  priority: TodoPriority | undefined
}) {
  return priority ? (
    <span className="inline-flex max-w-full items-center gap-2 text-sm">
      <ColorPickerSwatch color={priority.color} shape="circle" />
      <span className="truncate">{priority.name}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
}

/** 名称、颜色与拖动顺序统一保存；失败保留草稿，稳定 value 不随排序改变。 */
export function PriorityDialog({ onClose }: { onClose: () => void }) {
  const { data, busyIds } = useTodos()
  const [priorities, setPriorities] = useState(() =>
    data.todoPriorities.map((p) => ({ ...p }))
  )
  const [dragging, setDragging] = useState(false)
  const pending = busyIds.includes("import") || busyIds.includes("priorities")
  const conflict = priorities.some(
    (p) =>
      data.todoPriorities.find((latest) => latest.value === p.value)
        ?.version !== p.version
  )
  const change = useCallback(
    (value: number, changes: Partial<TodoPriority>) =>
      setPriorities((rows) =>
        rows.map((p) => (p.value === value ? { ...p, ...changes } : p))
      ),
    []
  )
  const columns = useMemo<ColumnDef<DataGridFeatures, TodoPriority>[]>(
    () => [
      {
        id: "order",
        header: () => <span className="sr-only">排序</span>,
        size: 32,
        cell: () => <DataGridTableDndRowHandle disabled={pending} />,
      },
      {
        accessorKey: "name",
        header: "名称",
        size: 160,
        meta: { fillWidth: true, headerClassName: "text-center" },
        cell: ({ row }) => (
          <Input
            aria-label={`优先级 ${row.original.value} 名称`}
            placeholder="例如：紧急"
            maxLength={24}
            required
            value={row.original.name}
            onChange={(event) =>
              change(row.original.value, { name: event.target.value })
            }
          />
        ),
      },
      {
        accessorKey: "color",
        header: "颜色",
        size: 128,
        meta: { headerClassName: "text-center" },
        cell: ({ row }) => (
          <ColorPicker
            key={row.original.version}
            defaultValue={row.original.color}
            onValueCommit={(color) => {
              if (color) change(row.original.value, { color })
            }}
            format="hex"
            disabled={pending}
            aria-label={`${row.original.name}颜色`}
            i18n={COLOR_LABELS}
          >
            <ColorPickerTrigger size="default" className="w-full" />
            <ColorPickerContent />
          </ColorPicker>
        ),
      },
    ],
    [change, pending]
  )
  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: priorities,
    getRowId: (p) => p.id,
    manualPagination: true,
    defaultColumn: { enableSorting: false, enableResizing: false },
  })
  /** 只在放下时调整数组；当前数据解析索引，取消拖动不改草稿。 */
  const reorder = ({ active, over }: DragEndEvent) => {
    setDragging(false)
    if (pending || !over || active.id === over.id) return
    setPriorities((rows) => {
      const from = rows.findIndex((p) => p.id === active.id),
        to = rows.findIndex((p) => p.id === over.id)
      return from < 0 || to < 0 ? rows : arrayMove(rows, from, to)
    })
  }
  /** 校验完整四档后批量提交，旧版本由服务端原子拒绝。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const names = priorities.map((p) => p.name.trim())
    if (
      names.some((name) => !name || [...name].length > 24) ||
      new Set(names).size !== 4
    ) {
      toast.error("请填写互不重复的名称，每个最多 24 字")
      return
    }
    if (await saveTodoPriorities(priorities)) {
      toast.success("优先级已更新")
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending && !dragging) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!pending}
        className="sm:max-w-xl"
        onKeyDown={(event) => {
          // 拖动键交给 dnd-kit，避免 Dialog 在到达 document 前拦截它们。
          if (
            dragging &&
            ["ArrowUp", "ArrowDown", "Space", "Enter", "Escape"].includes(
              event.code
            )
          )
            event.preventBaseUIHandler()
        }}
      >
        <DialogHeader>
          <DialogTitle>管理优先级</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={submit}
          noValidate
        >
          <fieldset disabled={pending} className="min-w-0">
            <DataGrid
              table={table}
              recordCount={priorities.length}
              tableLayout={{
                dense: true,
                rowBorder: true,
                rowsDraggable: true,
              }}
              tableClassNames={{ base: "min-w-80" }}
              i18n={{
                labels: {
                  dragToReorderRow: "拖动调整优先级顺序",
                  reorderingUnavailable: "暂时无法调整顺序",
                  empty: "暂无优先级",
                  loading: "加载中",
                },
              }}
            >
              <DataGridScrollArea orientation="horizontal">
                <DataGridTableDndRows<TodoPriority>
                  dataIds={priorities.map((p) => p.id)}
                  handleDragEnd={reorder}
                  onDragStart={() => setDragging(true)}
                  onDragCancel={() => setDragging(false)}
                  sortingStrategy={verticalListSortingStrategy}
                  dropIndicator={false}
                  renderDragOverlay={(row) => (
                    <Card size="sm" className="w-fit max-w-full min-w-48">
                      <CardContent className="flex items-center gap-3">
                        <GripVerticalIcon
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <PriorityBadge priority={row.original} />
                      </CardContent>
                    </Card>
                  )}
                  accessibility={{
                    screenReaderInstructions: {
                      draggable:
                        "按空格开始拖动，使用上下方向键调整位置，空格放下，Escape 取消。",
                    },
                    announcements: {
                      onDragStart: () => "开始调整优先级顺序",
                      onDragOver: ({ over }) =>
                        over
                          ? `目标位置：${priorities.findIndex((p) => p.id === over.id) + 1}`
                          : "",
                      onDragEnd: () => "顺序已调整，保存后生效",
                      onDragCancel: () => "已取消调整",
                    },
                  }}
                />
              </DataGridScrollArea>
            </DataGrid>
          </fieldset>
          <DialogFooter>
            {conflict && (
              <Button
                type="button"
                variant="outline"
                disabled={pending || dragging}
                onClick={() =>
                  setPriorities(data.todoPriorities.map((p) => ({ ...p })))
                }
              >
                重新加载
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending || dragging}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || dragging}>
              {pending ? "保存中…" : "保存优先级"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
