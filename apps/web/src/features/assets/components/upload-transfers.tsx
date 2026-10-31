import { useRef, useState } from "react"
import {
  ArrowUpDownIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"
import { createFilterQuery } from "@/components/reui/filters/filters-query"
import { RuleFilters } from "@/components/shared/rule-filters"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/features/workbench/components"
import { useAssets } from "../store"
import { filterUploadTasks, uploadFilterFields } from "../upload-filters"
import {
  cancelUpload,
  continueUpload,
  clearFinishedUploads,
  pauseUpload,
  refreshUpload,
  resumeUpload,
  useUploadQueue,
} from "../upload-queue"
import { UploadTaskRow } from "./upload-task-row"

/** 弹窗随内容收缩，长列表内部滚动；关闭和筛选均不影响传输。 */
export function UploadTransfers({
  open,
  onOpenChange,
  onUpload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: () => void
}) {
  const tasks = useUploadQueue(),
    { busyIds, overview } = useAssets()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState(createFilterQuery)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const reselectInput = useRef<HTMLInputElement>(null),
    reselect = useRef<{ id: string; name?: string }>({ id: "" })
  const active = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled"
  )
  const finished = tasks.filter(
    (task) => task.status === "completed" || task.status === "cancelled"
  )
  const filtered = filterUploadTasks(tasks, query, search)
  const groups = [
    { value: "all", label: "全部", records: filtered },
    {
      value: "active",
      label: "进行中",
      records: filtered.filter(
        (task) => !["completed", "cancelled"].includes(task.status)
      ),
    },
    {
      value: "finished",
      label: "已结束",
      records: filtered.filter((task) =>
        ["completed", "cancelled"].includes(task.status)
      ),
    },
  ]
  const hasFilters = !!search || query.rules.length > 0
  const resetFilters = () => {
    setSearch("")
    setQuery(createFilterQuery())
  }
  const openUploader = () => {
    setTab("all")
    resetFilters()
    onUpload()
  }
  const perform = async (id: string, action: () => Promise<unknown>) => {
    setPendingIds((ids) => [...ids, id])
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "传输操作失败")
    } finally {
      setPendingIds((ids) => ids.filter((value) => value !== id))
    }
  }
  const resume = (id: string, needsFile: boolean, name?: string) => {
    if (needsFile) {
      reselect.current = { id, name }
      reselectInput.current?.click()
    } else
      void perform(id, () =>
        name === undefined ? resumeUpload(id) : continueUpload(id, name)
      )
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setTab("all")
          onOpenChange(true)
        }}
      >
        <ArrowUpDownIcon aria-hidden="true" />
        传输{active.length ? ` ${active.length}` : ""}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setTab("all")
          onOpenChange(next)
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(36rem,calc(100dvh-2rem))] flex-col sm:max-w-2xl"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>传输任务</DialogTitle>
          </DialogHeader>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(String(value))}
            className="min-h-0 flex-1 gap-4"
          >
            <div className="flex shrink-0 flex-col gap-3">
              <TabsList variant="line">
                {groups.map(({ value, label, records }) => (
                  <TabsTrigger key={value} value={value}>
                    {label}{" "}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {records.length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex min-w-0 items-center gap-2">
                <InputGroup className="min-w-0 flex-1">
                  <InputGroupAddon>
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="搜索传输文件"
                    placeholder="搜索文件名"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </InputGroup>
                <RuleFilters
                  fields={uploadFilterFields(overview.connections)}
                  query={query}
                  onQueryChange={setQuery}
                />
              </div>
            </div>
            {groups.map(({ value, records }) => (
              <TabsContent
                key={value}
                value={value}
                className="min-h-0 overflow-y-auto"
              >
                {records.length ? (
                  <ul
                    className="divide-y"
                    aria-label={
                      value === "all"
                        ? "全部传输"
                        : value === "active"
                          ? "进行中的传输"
                          : "已结束的传输"
                    }
                  >
                    {records.map((task) => (
                      <UploadTaskRow
                        key={task.id}
                        task={task}
                        pending={
                          pendingIds.includes(task.id) ||
                          busyIds.includes(`upload-control:${task.id}`)
                        }
                        onPause={() =>
                          void perform(task.id, () => pauseUpload(task.id))
                        }
                        onResume={() => resume(task.id, task.needsFile)}
                        onContinue={(name) =>
                          resume(task.id, task.needsFile, name)
                        }
                        onCancel={() =>
                          void perform(task.id, () => cancelUpload(task.id))
                        }
                        onRefresh={() =>
                          void perform(task.id, () => refreshUpload(task.id))
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title={
                      hasFilters
                        ? "没有匹配的传输"
                        : value === "all"
                          ? "暂无传输任务"
                          : value === "active"
                            ? "暂无进行中的传输"
                            : "暂无已结束的传输"
                    }
                    action={
                      hasFilters
                        ? "清除筛选"
                        : tasks.length
                          ? "查看全部"
                          : "上传文件"
                    }
                    onAction={() => {
                      if (hasFilters) resetFilters()
                      else if (tasks.length) setTab("all")
                      else openUploader()
                    }}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
          {!!tasks.length && (
            <DialogFooter className="shrink-0 sm:justify-between">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!finished.length}
                onClick={clearFinishedUploads}
              >
                <Trash2Icon aria-hidden="true" />
                清除已结束
              </Button>
              <Button type="button" size="sm" onClick={openUploader}>
                <UploadIcon aria-hidden="true" />
                上传文件
              </Button>
            </DialogFooter>
          )}
          <input
            ref={reselectInput}
            type="file"
            className="sr-only"
            aria-label="选择续传原文件"
            onChange={(event) => {
              const file = event.target.files?.[0],
                { id, name } = reselect.current
              if (file)
                void perform(id, () =>
                  name === undefined
                    ? resumeUpload(id, file)
                    : continueUpload(id, name, file)
                )
              event.target.value = ""
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
