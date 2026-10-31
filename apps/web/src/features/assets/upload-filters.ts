import type {
  FilterField,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import { EQUALITY_OPERATORS, matchesQuery } from "@/features/workbench/filters"
import type { UploadTask } from "./upload-queue"

export const uploadStatusLabels: Record<UploadTask["status"], string> = {
  queued: "排队中",
  hashing: "准备中",
  uploading: "上传中",
  paused: "已暂停",
  conflict: "同名待确认",
  verifying: "上传中",
  completed: "已完成",
  error: "上传失败",
  cleaning: "结束中",
  cancelled: "已取消",
}

/** 复用工作台的查询树计算，保留嵌套 AND、OR 和单条取反。 */
export const filterUploadTasks = (
  tasks: UploadTask[],
  query: FilterQuery,
  search: string
) => {
  const keyword = search.trim().toLocaleLowerCase()
  return tasks.filter(
    (task) =>
      task.name.toLocaleLowerCase().includes(keyword) &&
      matchesQuery(query, {
        // 校验属于上传流程；前端展示与筛选共用用户可理解的状态。
        status: task.status === "verifying" ? "uploading" : task.status,
        connectionId: task.connectionId,
      })
  )
}

export const uploadFilterFields = (
  connections: { id: string; name: string }[]
): FilterField[] => [
  {
    id: "status",
    label: "传输状态",
    type: "select",
    operators: EQUALITY_OPERATORS,
    options: Object.entries(uploadStatusLabels)
      .filter(([value]) => value !== "verifying")
      .map(([value, label]) => ({ value, label })),
  },
  {
    id: "connectionId",
    label: "目标存储",
    type: "select",
    operators: EQUALITY_OPERATORS,
    options: connections.map(({ id, name }) => ({ value: id, label: name })),
  },
]
