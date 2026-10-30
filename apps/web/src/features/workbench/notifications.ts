import type { Workbench } from "./model"

export type WorkbenchNotification = {
  id: string
  kind: "todos" | "mail" | "connections"
  title: string
  body: string
  href: string
  unread: boolean
}

/** 通知随来源状态派生，已读回执独立于任务完成和邮件阅读。 */
export function getNotifications(
  data: Workbench,
  today: string
): WorkbenchNotification[] {
  const records: (Omit<WorkbenchNotification, "unread"> & {
    unread?: boolean
  })[] = []
  const enabled = data.preferences.notifications
  if (enabled.connections) {
    for (const [kind, sources] of [
      ["mail", data.accounts],
      ["storage", data.connections],
    ] as const) {
      for (const source of sources.filter(
        (record) => record.status === "error"
      )) {
        records.push({
          id: `${kind}:${source.id}:${source.lastSync}:${source.error}`,
          kind: "connections",
          title: kind === "mail" ? "邮箱连接异常" : "存储连接异常",
          body: source.name,
          href:
            kind === "mail"
              ? "/mail?view=accounts"
              : "/assets?view=connections",
        })
      }
    }
  }
  if (enabled.todos && today) {
    for (const todo of data.todos
      .filter(
        (record) => !record.done && record.dueDate && record.dueDate <= today
      )
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))) {
      const overdue = todo.dueDate! < today
      records.push({
        id: `todo:${todo.id}:${todo.dueDate}:${overdue ? "overdue" : "today"}`,
        kind: "todos",
        title: overdue ? "待办已逾期" : "待办今日到期",
        body: todo.title,
        href: `/todos?task=${encodeURIComponent(todo.id)}`,
      })
    }
  }
  if (enabled.mail) {
    if (data.mailNotifications) {
      for (const notification of data.mailNotifications)
        records.push({
          id: `mail-notice:${notification.id}`,
          kind: "mail",
          title: "收到邮件",
          body: notification.subject,
          href: `/mail?message=${encodeURIComponent(notification.messageId)}`,
          unread: notification.readAt === null,
        })
    } else {
      for (const message of data.messages
        .filter((record) => !record.read)
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))) {
        records.push({
          id: `mail:${message.id}:${message.receivedAt}`,
          kind: "mail",
          title: "未读邮件",
          body: message.subject,
          href: `/mail?message=${encodeURIComponent(message.id)}`,
        })
      }
    }
  }
  const readIds = new Set(data.notificationReadIds)
  return records.map((record) => ({
    ...record,
    unread: record.unread ?? !readIds.has(record.id),
  }))
}
