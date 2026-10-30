import type {
  FilterField,
  FilterEditorProps,
} from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EQUALITY_OPERATORS } from "@/features/workbench/filters"
import type { MailAccount } from "../model"

/** 使用本地日期控件，提交时转为带时区的时间戳。 */
function MailTimeEditor({
  value,
  onValueChange,
  commit,
  cancel,
}: FilterEditorProps) {
  const text = typeof value === "string" ? value : ""
  const date = text ? new Date(text) : null
  const valid = date && !Number.isNaN(date.getTime())
  const local = valid
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19)
    : ""
  return (
    <div className="flex flex-col gap-3 p-3">
      <Input
        type="datetime-local"
        step="1"
        aria-label="条件收件时间"
        placeholder="选择收件时间"
        value={local}
        onChange={(event) =>
          onValueChange(
            event.target.value ? new Date(event.target.value).toISOString() : ""
          )
        }
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!valid}
          onClick={() => commit(text)}
        >
          应用
        </Button>
      </div>
    </div>
  )
}

/** 字段只描述编辑方式；实际规则由后端通用引擎验证后转为 SQL。 */
export const mailFilterFields = (accounts: MailAccount[]): FilterField[] => [
  ...[
    {
      id: "read",
      label: "阅读状态",
      options: [
        { value: "unread", label: "未读" },
        { value: "read", label: "已读" },
      ],
    },
    {
      id: "starred",
      label: "星标",
      options: [
        { value: "yes", label: "有星标" },
        { value: "no", label: "无星标" },
      ],
    },
    {
      id: "hasAttachment",
      label: "附件",
      options: [
        { value: "yes", label: "有附件" },
        { value: "no", label: "无附件" },
      ],
    },
    {
      id: "accountId",
      label: "来源邮箱",
      options: accounts.map((a) => ({ value: a.id, label: a.name })),
    },
  ].map((field): FilterField => ({
    ...field,
    type: "select",
    operators: EQUALITY_OPERATORS,
    placeholder: `选择${field.label}`,
  })),
  ...[
    { id: "sender", label: "发件人" },
    { id: "address", label: "发件地址" },
    { id: "subject", label: "邮件主题" },
  ].map((field): FilterField => ({
    ...field,
    type: "text",
    placeholder: `输入${field.label}`,
    operators: [
      ...EQUALITY_OPERATORS,
      { value: "contains", label: "包含", inverse: "not_contains" },
      { value: "not_contains", label: "不包含", inverse: "contains" },
    ],
  })),
  {
    id: "receivedAt",
    label: "收件时间",
    type: "text",
    editor: MailTimeEditor,
    placeholder: "选择收件时间",
    valueText: ({ value }) =>
      typeof value === "string"
        ? new Date(value).toLocaleString("zh-CN", { hour12: false })
        : "选择收件时间",
    operators: [
      { value: "gte", label: "不早于" },
      { value: "lt", label: "早于" },
      { value: "lte", label: "不晚于" },
      { value: "gt", label: "晚于" },
    ],
  },
]
