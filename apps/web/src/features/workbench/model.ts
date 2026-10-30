import { z } from "zod"
import { todoSchema } from "@/features/todos/model"
import type { MailOverview, MailNotification } from "@/features/mail/model"
export { todoSchema } from "@/features/todos/model"

const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "日期格式不正确")
const connectionStatus = z.enum(["connected", "error", "paused"])
export const personalProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入显示名称")
    .max(100, "显示名称最多 100 字"),
  email: z.union([z.email("请输入有效的邮箱地址"), z.literal("")]),
})
const preferencesSchema = z.object({
  assetLayout: z.enum(["list", "grid"]).default("list"),
  notifications: z
    .object({
      todos: z.boolean().default(true),
      mail: z.boolean().default(true),
      connections: z.boolean().default(true),
    })
    .prefault({}),
})
const namedRecord = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
})
const accountSchema = namedRecord.extend({
  provider: z.enum(["QQ", "Gmail"]),
  email: z.email("请输入有效的邮箱地址"),
  status: connectionStatus,
  lastSync: timestamp.nullable(),
  error: z.string().nullable(),
})
const storageSchema = namedRecord.extend({
  endpoint: z.url().refine((value) => {
    const url = new URL(value)
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  }, "请输入不含凭证或查询参数的 HTTP(S) 服务地址"),
  bucket: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, "Bucket 格式不正确"),
  status: connectionStatus,
  lastSync: timestamp.nullable(),
  error: z.string().nullable(),
})

const assetLocation = {
  parentId: z.string().min(1).nullable().default(null),
  starred: z.boolean().default(false),
  trashedAt: timestamp.nullable().default(null),
  updatedAt: timestamp.nullable().default(null),
  lastOpenedAt: timestamp.nullable().default(null),
}
const assetFolderSchema = namedRecord.extend({
  name: z.string().min(1).max(200),
  connectionId: z.string().min(1),
  createdAt: timestamp,
  ...assetLocation,
})

export const accountInputSchema = accountSchema.pick({
  name: true,
  provider: true,
  email: true,
})
export const storageInputSchema = storageSchema.pick({
  name: true,
  endpoint: true,
  bucket: true,
})
export const workbenchSchema = z
  .object({
    version: z.literal(1),
    profile: personalProfileSchema.prefault({ name: "我的账户", email: "" }),
    preferences: preferencesSchema.prefault({}),
    notificationReadIds: z.array(z.string()).default([]),
    todoLists: z.array(namedRecord),
    todos: z.array(todoSchema),
    accounts: z.array(accountSchema),
    messages: z.array(
      z.object({
        id: z.string(),
        accountId: z.string(),
        sender: z.string(),
        address: z.email(),
        subject: z.string(),
        preview: z.string(),
        body: z.string(),
        receivedAt: timestamp,
        read: z.boolean(),
        starred: z.boolean(),
        attachments: z.array(
          z.object({ name: z.string(), content: z.string() })
        ),
      })
    ),
    connections: z.array(storageSchema),
    assetFolders: z.array(assetFolderSchema).default([]),
    pendingFileDeletes: z.array(z.string().min(1)).default([]),
    assets: z.array(
      z.object({
        id: z.string(),
        connectionId: z.string(),
        name: z.string(),
        size: z.number().nonnegative(),
        type: z.string(),
        createdAt: timestamp,
        origin: z.enum(["sample", "upload"]),
        ...assetLocation,
      })
    ),
  })
  .refine((value) => {
    const listIds = new Set(value.todoLists.map((record) => record.id))
    const accountIds = new Set(value.accounts.map((record) => record.id))
    const storageIds = new Set(value.connections.map((record) => record.id))
    return (
      value.todos.every((record) => listIds.has(record.listId)) &&
      value.messages.every((record) => accountIds.has(record.accountId)) &&
      [...value.assets, ...value.assetFolders].every((record) =>
        storageIds.has(record.connectionId)
      )
    )
  }, "记录关联的来源不存在")
  .refine((value) => {
    const folderMap = new Map(
      value.assetFolders.map((folder) => [folder.id, folder])
    )
    const entries = [...value.assets, ...value.assetFolders]
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      return false
    return entries.every((entry) => {
      const visited = new Set([entry.id])
      let parentId = entry.parentId
      while (parentId) {
        const parent = folderMap.get(parentId)
        if (
          !parent ||
          parent.connectionId !== entry.connectionId ||
          visited.has(parentId) ||
          visited.size > 64
        )
          return false
        visited.add(parentId)
        parentId = parent.parentId
      }
      return true
    })
  }, "文件目录无效或包含循环关联")

export type Workbench = z.infer<typeof workbenchSchema> & {
  mailSummary?: MailOverview
  mailNotifications?: MailNotification[]
}
export type Todo = Workbench["todos"][number]
export type MailAccount = Workbench["accounts"][number]
export type Message = Workbench["messages"][number]
export type StorageConnection = Workbench["connections"][number]
export type Asset = Workbench["assets"][number]
export type AssetFolder = Workbench["assetFolders"][number]
export type ConnectionStatus = z.infer<typeof connectionStatus>

export const SAMPLE_CONTENT: Record<string, string> = {
  "asset-prd":
    "# 个人工作台 PRD\n\n版本：0.1\n\n- Todo 清单\n- 邮箱聚合\n- S3 文件管理\n- 资源可视化总览\n",
  "asset-notes": "# 项目讨论记录\n\n保持现有 ReUI 样式，先完成页面与交互。\n",
  "asset-budget":
    "项目,计划,进度\n个人工作台,前端原型,进行中\n邮件接入,QQ 与 Gmail,待接入\n",
  "asset-config":
    '{\n  "workspace": "个人工作台",\n  "storage": "S3 compatible",\n  "region": "us-east-1"\n}\n',
  "asset-archive": "归档清单\n2026-10：工作台需求与设计资料\n",
}

export const SEED_WORKBENCH = workbenchSchema.parse({
  version: 1,
  todoLists: [
    { id: "list-inbox", name: "收集箱" },
    { id: "list-work", name: "工作事项" },
    { id: "list-personal", name: "个人计划" },
    { id: "list-later", name: "稍后处理" },
  ],
  todos: [
    {
      id: "todo-1",
      listId: "list-work",
      title: "确认个人工作台的首版需求",
      dueDate: "2026-10-26",
      plannedFor: "2026-10-26",
      priority: 1,
      tags: ["规划", "工作台"],
      steps: [
        { id: "step-1", title: "核对主要使用流程", done: true },
        { id: "step-2", title: "整理验收清单", done: false },
      ],
      note: "梳理 Todo、邮箱、资产与 Dashboard 的主要流程。",
      done: false,
      createdAt: "2026-10-25T09:00:00+08:00",
    },
    {
      id: "todo-2",
      listId: "list-work",
      title: "整理项目资料并上传至 MinIO",
      dueDate: "2026-10-27",
      priority: 2,
      tags: ["资料"],
      note: "先归档需求文档和会议记录。",
      done: false,
      createdAt: "2026-10-25T08:45:00+08:00",
    },
    {
      id: "todo-3",
      listId: "list-work",
      title: "回复本周的项目进度邮件",
      dueDate: "2026-10-25",
      priority: 2,
      tags: ["沟通"],
      source: {
        kind: "mail",
        id: "message-1",
        label: "个人工作台 · 首版需求确认",
      },
      note: "核对里程碑和交付内容。",
      done: false,
      createdAt: "2026-10-24T17:20:00+08:00",
    },
    {
      id: "todo-4",
      listId: "list-work",
      title: "检查工作邮箱的连接状态",
      note: "",
      done: true,
      createdAt: "2026-10-24T15:00:00+08:00",
    },
    {
      id: "todo-5",
      listId: "list-personal",
      title: "阅读收藏的技术文章",
      note: "把值得保留的内容整理成笔记。",
      done: false,
      createdAt: "2026-10-24T12:00:00+08:00",
    },
    {
      id: "todo-6",
      listId: "list-personal",
      title: "整理本周学习笔记",
      note: "",
      done: true,
      createdAt: "2026-10-23T20:00:00+08:00",
    },
    {
      id: "todo-7",
      listId: "list-later",
      title: "评估邮件附件归档流程",
      note: "后续考虑把附件保存到指定存储。",
      done: false,
      createdAt: "2026-10-23T10:00:00+08:00",
    },
  ],
  accounts: [
    {
      id: "mail-qq",
      name: "工作邮箱",
      provider: "QQ",
      email: "work@qq.example",
      status: "connected",
      lastSync: "2026-10-25T09:41:00+08:00",
      error: null,
    },
    {
      id: "mail-gmail",
      name: "个人邮箱",
      provider: "Gmail",
      email: "personal@gmail.example",
      status: "connected",
      lastSync: "2026-10-25T09:38:00+08:00",
      error: null,
    },
    {
      id: "mail-backup",
      name: "备用邮箱",
      provider: "QQ",
      email: "archive@qq.example",
      status: "error",
      lastSync: "2026-10-24T16:20:00+08:00",
      error: "连接已过期",
    },
  ],
  messages: [
    {
      id: "message-1",
      accountId: "mail-qq",
      sender: "项目协作组",
      address: "project@example.com",
      subject: "个人工作台 · 首版需求确认",
      preview: "Todo、邮件与文件资产的主要使用流程已整理，请查收。",
      body: "你好，\n\n本次讨论已明确首版范围：Todo 清单、QQ / Gmail 邮件聚合、S3 文件管理，以及 Dashboard 和可视化总览。\n\n先完成前端页面与交互，继续沿用现有样式。附件为本次需求摘要，供你复核。\n\n项目协作组",
      receivedAt: "2026-10-25T09:40:00+08:00",
      read: false,
      starred: true,
      attachments: [
        {
          name: "需求摘要.md",
          content:
            "# 首版需求摘要\n\nTodo、QQ/Gmail、S3/MinIO、Dashboard、资源总览。\n版本：0.1",
        },
      ],
    },
    {
      id: "message-2",
      accountId: "mail-gmail",
      sender: "技术周刊",
      address: "digest@example.com",
      subject: "本周阅读：让日常工具更顺手",
      preview: "本期收录了三个关于个人效率工具的实践。",
      body: "你好，\n\n这周我们关注个人工具的使用体验：保持信息来源清楚、减少来回切换，以及让关键动作直接可达。\n\n可以把感兴趣的内容整理进自己的工作台。\n\n祝阅读愉快！",
      receivedAt: "2026-10-25T08:52:00+08:00",
      read: false,
      starred: false,
      attachments: [],
    },
    {
      id: "message-3",
      accountId: "mail-qq",
      sender: "设计评审",
      address: "design@example.com",
      subject: "ReUI 页面评审记录",
      preview: "保留现有应用外壳、卡片与紧凑的操作密度。",
      body: "你好，\n\n页面评审建议：\n1. 延续现有字体、色彩和组件。\n2. 空状态提供下一步操作。\n3. 连接异常时保留上一次成功获取的数据。\n4. 可视化节点直接跳转到对应功能。\n\n请在下次评审前完成调整。",
      receivedAt: "2026-10-24T17:15:00+08:00",
      read: false,
      starred: false,
      attachments: [],
    },
    {
      id: "message-4",
      accountId: "mail-gmail",
      sender: "资料订阅",
      address: "notes@example.com",
      subject: "你的资料整理清单",
      preview: "需求文档、会议记录和配置示例已准备好。",
      body: "你好，\n\n本周待归档：需求文档、讨论记录、配置文件。\n\n请在周五前完成整理。",
      receivedAt: "2026-10-24T14:30:00+08:00",
      read: true,
      starred: true,
      attachments: [
        {
          name: "资料清单.txt",
          content: "需求文档\n讨论记录\n配置示例\n",
        },
      ],
    },
    {
      id: "message-5",
      accountId: "mail-backup",
      sender: "归档提醒",
      address: "archive@example.com",
      subject: "十月资料归档提醒",
      preview: "请于月底前整理十月资料。",
      body: "你好，\n\n请于月底前整理十月项目资料，并核对归档目录与文件清单。",
      receivedAt: "2026-10-24T10:05:00+08:00",
      read: true,
      starred: false,
      attachments: [],
    },
    {
      id: "message-6",
      accountId: "mail-qq",
      sender: "每周回顾",
      address: "review@example.com",
      subject: "本周工作回顾",
      preview: "本周已完成基础布局和需求梳理。",
      body: "你好，\n\n本周进展：\n- 完成基础页面结构。\n- 明确个人工作台的首版范围。\n- 保持现有设计系统。\n\n下周继续完善各模块的使用流程。",
      receivedAt: "2026-10-23T18:00:00+08:00",
      read: true,
      starred: false,
      attachments: [],
    },
  ],
  connections: [
    {
      id: "storage-main",
      name: "MinIO · 工作资料",
      endpoint: "http://minio.example:9000",
      bucket: "workbench",
      status: "connected",
      lastSync: "2026-10-25T09:32:00+08:00",
      error: null,
    },
    {
      id: "storage-archive",
      name: "MinIO · 个人归档",
      endpoint: "https://archive.example.com",
      bucket: "personal-archive",
      status: "connected",
      lastSync: "2026-10-24T18:05:00+08:00",
      error: null,
    },
  ],
  assets: [
    {
      id: "asset-prd",
      connectionId: "storage-main",
      name: "个人工作台 PRD.md",
      size: new TextEncoder().encode(SAMPLE_CONTENT["asset-prd"]).length,
      type: "text/markdown",
      createdAt: "2026-10-25T09:30:00+08:00",
      origin: "sample",
    },
    {
      id: "asset-notes",
      connectionId: "storage-main",
      name: "项目讨论记录.md",
      size: new TextEncoder().encode(SAMPLE_CONTENT["asset-notes"]).length,
      type: "text/markdown",
      createdAt: "2026-10-24T16:20:00+08:00",
      origin: "sample",
    },
    {
      id: "asset-budget",
      connectionId: "storage-main",
      name: "项目进度.csv",
      size: new TextEncoder().encode(SAMPLE_CONTENT["asset-budget"]).length,
      type: "text/csv",
      createdAt: "2026-10-24T15:10:00+08:00",
      origin: "sample",
    },
    {
      id: "asset-config",
      connectionId: "storage-archive",
      name: "工作台配置.json",
      size: new TextEncoder().encode(SAMPLE_CONTENT["asset-config"]).length,
      type: "application/json",
      createdAt: "2026-10-24T11:45:00+08:00",
      origin: "sample",
    },
    {
      id: "asset-archive",
      connectionId: "storage-archive",
      name: "十月归档清单.txt",
      size: new TextEncoder().encode(SAMPLE_CONTENT["asset-archive"]).length,
      type: "text/plain",
      createdAt: "2026-10-23T18:05:00+08:00",
      origin: "sample",
    },
  ],
})

/** 统一各页面的时间格式，保留来源数据中的真实日期。 */
export const formatTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "尚未同步"

/** 展示文件实际字节数。 */
export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${bytes} B`
