import { TodoState } from "@/features/todos/components/todo-state"
import { useState } from "react"
import { cn } from "cn"
import { Link, useNavigate } from "react-router"
import {
  BellIcon,
  CheckCheckIcon,
  HardDriveIcon,
  ListTodoIcon,
  MailIcon,
  SettingsIcon,
} from "lucide-react"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useSidebar } from "@/components/ui/sidebar"
import { WorkbenchState } from "@/features/workbench/components"
import { getNotifications } from "@/features/workbench/notifications"
import { updateWorkbench, useWorkbench } from "@/features/workbench/store"
import { useToday } from "@/features/todos/use-today"
import {
  loadMoreMailNotifications,
  readMailNotifications,
  readAllMailNotifications,
  useMail,
  loadMail,
} from "@/features/mail/store"

const ICONS = {
  todos: ListTodoIcon,
  mail: MailIcon,
  connections: HardDriveIcon,
}

export function NotificationsPopover() {
  const mail = useMail()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const { data, status } = useWorkbench()
  const today = useToday()
  const records = status === "ready" ? getNotifications(data, today) : []
  const unread =
    records.filter((record) => record.unread && record.kind !== "mail").length +
    (data.preferences.notifications.mail
      ? (data.mailSummary?.notificationCount ??
        records.filter((record) => record.unread && record.kind === "mail")
          .length)
      : 0)
  const hasMoreMail =
    data.preferences.notifications.mail &&
    !!data.mailNotifications?.length &&
    (data.mailSummary?.notificationCount ?? 0) >
      data.mailNotifications.filter((notice) => notice.readAt === null).length
  function close() {
    setOpen(false)
    if (isMobile) setOpenMobile(false)
  }
  const markRead = async (ids: string[], all = false) => {
    const remote = ids
      .filter((id) => id.startsWith("mail-notice:"))
      .map((id) => id.slice("mail-notice:".length))
    if (all && data.mailSummary) {
      if (!(await readAllMailNotifications())) return false
    } else if (remote.length && !(await readMailNotifications(remote)))
      return false
    const localIds = ids.filter((id) => !id.startsWith("mail-notice:"))
    if (!localIds.length) return true
    return updateWorkbench((current) => ({
      ...current,
      notificationReadIds: [
        ...new Set([...current.notificationReadIds, ...localIds]),
      ],
    }))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={unread ? `打开通知，${unread} 条未读` : "打开通知"}
            className="relative mx-auto"
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={8}
        className="max-h-(--available-height) w-96 max-w-[calc(100vw-2rem)]"
      >
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2.5",
            records.length > 0 && "h-96"
          )}
        >
          <div className="flex shrink-0 items-center gap-2">
            <PopoverTitle>通知</PopoverTitle>
            {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="全部标为已读"
                disabled={!unread}
                onClick={() =>
                  void markRead(
                    records
                      .filter((record) => record.unread)
                      .map((record) => record.id),
                    true
                  )
                }
              >
                <CheckCheckIcon aria-hidden="true" />
              </Button>
              <Button
                nativeButton={false}
                role="link"
                render={<Link to="/settings/notifications" onClick={close} />}
                variant="ghost"
                size="icon-sm"
                aria-label="打开通知设置"
              >
                <SettingsIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {mail.status === "error" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadMail()}
              >
                重试邮件通知
              </Button>
            )}
            <WorkbenchState>
              <TodoState>
                {records.length ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {records.map((record) => {
                      const Icon = ICONS[record.kind]
                      return (
                        <li key={record.id}>
                          <Link
                            to={record.href}
                            className="flex items-start gap-3 p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={async (event) => {
                              event.preventDefault()
                              if (
                                record.unread &&
                                !(await markRead([record.id]))
                              )
                                return
                              close()
                              navigate(record.href)
                            }}
                          >
                            <Icon
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    record.kind === "connections"
                                      ? "destructive-light"
                                      : record.kind === "todos"
                                        ? "warning-light"
                                        : "secondary"
                                  }
                                >
                                  {record.title}
                                </Badge>
                                {record.unread && (
                                  <span className="text-xs text-muted-foreground">
                                    未读
                                  </span>
                                )}
                              </div>
                              <p className="line-clamp-2 text-sm break-words">
                                {record.body}
                              </p>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : mail.status === "loading" ? (
                  <div
                    role="status"
                    aria-label="正在读取邮件通知"
                    className="flex flex-col gap-3"
                  >
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : mail.status === "error" ? null : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BellIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>暂无通知</EmptyTitle>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        nativeButton={false}
                        role="link"
                        render={
                          <Link to="/settings/notifications" onClick={close} />
                        }
                        size="sm"
                        variant="outline"
                      >
                        通知设置
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </TodoState>
            </WorkbenchState>
            {hasMoreMail && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={mail.busyIds.includes("notifications:more")}
                onClick={() => void loadMoreMailNotifications()}
              >
                更早的邮件通知
              </Button>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
