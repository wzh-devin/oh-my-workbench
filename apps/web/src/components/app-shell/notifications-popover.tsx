"use client"

import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { Badge } from "@/components/reui/badge"
import { Rating } from "@/components/reui/rating"
import { cn } from "cn"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useSidebar } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  NOTIFICATIONS,
  type Notification,
  type NotificationAvatar,
  type NotificationType,
  type NotificationVariant,
} from "./data"
import { toast } from "sonner"
import {
  MessageSquareIcon,
  PaperclipIcon,
  UserPlusIcon,
  CreditCardIcon,
  ShieldAlertIcon,
  SparklesIcon,
  RocketIcon,
  ActivityIcon,
  AlertCircleIcon,
  CircleCheckIcon,
  LinkIcon,
  StarIcon,
  ThumbsUpIcon,
  UsersIcon,
  SmileIcon,
  CalendarIcon,
  DownloadIcon,
  CheckCheckIcon,
  BellIcon,
} from "lucide-react"

const NOTIFICATION_ICONS: Record<NotificationType, ReactNode> = {
  mention: <MessageSquareIcon aria-hidden="true" />,
  comment: <MessageSquareIcon aria-hidden="true" />,
  share: <PaperclipIcon aria-hidden="true" />,
  invite: <UserPlusIcon aria-hidden="true" />,
  billing: <CreditCardIcon aria-hidden="true" />,
  security: <ShieldAlertIcon aria-hidden="true" />,
  feature: <SparklesIcon aria-hidden="true" />,
  deployment: <RocketIcon aria-hidden="true" />,
  usage: <ActivityIcon aria-hidden="true" />,
  system: <AlertCircleIcon aria-hidden="true" />,
  task: <CircleCheckIcon aria-hidden="true" />,
  approval: <CircleCheckIcon aria-hidden="true" />,
  integration: <LinkIcon aria-hidden="true" />,
  achievement: <StarIcon aria-hidden="true" />,
  feedback: <ThumbsUpIcon aria-hidden="true" />,
  team_join: <UsersIcon aria-hidden="true" />,
  reaction: <SmileIcon aria-hidden="true" />,
  review: <StarIcon aria-hidden="true" />,
  event: <CalendarIcon aria-hidden="true" />,
}

const VARIANT_COLORS: Record<NotificationVariant, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
}

// ── Notification Avatar Group ──

function NotifAvatarGroup({
  members,
  count,
}: {
  members: NotificationAvatar[]
  count?: number
}) {
  return (
    <AvatarGroup className="mt-1.5 -space-x-1">
      {members.map((m) => (
        <Avatar key={m.src} className="size-5">
          <AvatarImage src={m.src} alt={m.fallback} />
          <AvatarFallback className="text-[9px]">{m.fallback}</AvatarFallback>
        </Avatar>
      ))}
      {count && count > 0 ? (
        <AvatarGroupCount className="size-5 text-[9px] leading-none">
          +{count}
        </AvatarGroupCount>
      ) : null}
    </AvatarGroup>
  )
}

// ── Segmented Meta Badge ──

function MetaBadge({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center overflow-hidden rounded-sm border border-border/60 text-[10px] font-medium">
      <span className="flex h-full items-center border-r border-border/50 bg-muted/60 px-1.5 leading-none text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "flex h-full items-center px-1.5 leading-none",
          color || "text-foreground"
        )}
      >
        {value}
      </span>
    </span>
  )
}

// ── Mini Progress Bar ──

function MiniProgress({
  label,
  value,
  variant = "default",
}: {
  /** Accessible name: what the bar measures */
  label: string
  value: number
  variant?: "default" | "success"
}) {
  const indicatorColor =
    variant === "success"
      ? "**:data-[slot=progress-indicator]:bg-success"
      : value >= 80
        ? "**:data-[slot=progress-indicator]:bg-warning"
        : "**:data-[slot=progress-indicator]:bg-primary"

  return (
    <div className="relative mt-1.5 h-1 overflow-hidden rounded-full bg-muted/55">
      <div
        className="pointer-events-none absolute inset-0 text-muted-foreground opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 4px)",
        }}
      />
      <Progress
        value={value}
        aria-label={label}
        className={cn(
          "absolute inset-0 gap-0",
          "**:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent",
          "**:data-[slot=progress-indicator]:rounded-none",
          indicatorColor
        )}
      />
    </div>
  )
}

// ── Notification Item ──

type ItemHandlers = {
  /** Opens the page the notification is about, and marks it read */
  onOpen: (notification: Notification) => void
  onAction: (
    notification: Notification,
    action: NonNullable<Notification["actions"]>[number]
  ) => void
  onDownload: (notification: Notification) => void
}

function NotificationItem({
  notification,
  onOpen,
  onAction,
  onDownload,
}: { notification: Notification } & ItemHandlers) {
  const {
    type,
    variant = "info",
    title,
    body,
    time,
    unread,
    avatar,
    username,
    link,
    badge,
    actions,
    attachment,
    meta,
    progress,
    avatarGroup,
    avatarGroupCount,
    rating,
    eventDate,
    eventTime,
    progressVariant,
    resolved,
  } = notification

  const iconColor = VARIANT_COLORS[variant]
  const hasAvatar = Boolean(avatar)
  const hasActions = Boolean(actions?.length) && !resolved
  const hasInteractiveChildren = hasActions || Boolean(attachment)

  const content = (
    <>
      {/* Left column: Avatar or Icon */}
      <div className="shrink-0">
        {hasAvatar ? (
          <Avatar size="sm">
            <AvatarImage src={avatar?.src} alt={avatar?.fallback} />
            <AvatarFallback>{avatar?.fallback}</AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              "flex size-6 items-center justify-center [&_svg]:size-4",
              iconColor
            )}
          >
            {NOTIFICATION_ICONS[type]}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 pr-3">
          <p className="text-xs leading-snug text-foreground">
            {username && (
              <span className="font-medium text-primary">{username}</span>
            )}{" "}
            {hasAvatar ? (
              <>
                {title}{" "}
                {link && (
                  <span className="font-medium text-primary">{link}</span>
                )}
              </>
            ) : (
              <span className="font-medium">{title}</span>
            )}
          </p>
          {badge && (
            <Badge variant="outline" size="sm">
              {badge}
            </Badge>
          )}
        </div>

        {/* Body */}
        {body && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{body}</p>
        )}

        {/* Avatar group */}
        {avatarGroup && avatarGroup.length > 0 && (
          <NotifAvatarGroup members={avatarGroup} count={avatarGroupCount} />
        )}

        {/* Star rating */}
        {rating !== undefined && (
          <Rating
            rating={rating}
            size="sm"
            role="img"
            aria-label={`Rated ${rating} out of 5`}
            className="mt-0.5"
          />
        )}

        {/* Event date/time chip */}
        {(eventDate || eventTime) && (
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            <CalendarIcon
              aria-hidden="true"
              className="size-3 shrink-0 opacity-60"
            />
            {eventDate && (
              <span className="font-medium text-foreground">{eventDate}</span>
            )}
            {eventTime && <span className="opacity-70">{eventTime}</span>}
          </div>
        )}

        {/* Progress bar */}
        {progress !== undefined && (
          <MiniProgress
            label={title}
            value={progress}
            variant={progressVariant}
          />
        )}

        {/* Attachment */}
        {attachment && (
          <div className="flex items-center gap-1 py-1">
            <ButtonGroup>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onDownload(notification)}
              >
                <PaperclipIcon aria-hidden="true" />
                {attachment.name}
                <span className="opacity-60">({attachment.size})</span>
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label={`Download ${attachment.name}`}
                onClick={() => onDownload(notification)}
              >
                <DownloadIcon aria-hidden="true" />
              </Button>
            </ButtonGroup>
          </div>
        )}

        {/* Actions, or what they settled to */}
        {hasActions && (
          <div className="flex items-center gap-1 py-1">
            {actions?.map((action) => (
              <Button
                key={action.label}
                size="xs"
                variant={action.variant}
                onClick={() => onAction(notification, action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {resolved && (
          <Badge variant="success-light" size="sm" className="mt-0.5">
            <CircleCheckIcon aria-hidden="true" />
            {resolved}
          </Badge>
        )}

        {/* Timestamp + Meta badge on the same line */}
        <div className="flex items-center gap-2 pt-0.5">
          <p className="text-[11px] text-muted-foreground">{time}</p>
          {meta && (
            <MetaBadge
              label={meta.label}
              value={meta.value}
              color={meta.color}
            />
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="relative">
      {/* Unread indicator: top-right dot on the row */}
      {unread && (
        <span
          className="pointer-events-none absolute top-3 right-3 z-10 size-1.5 rounded-full bg-primary ring-1 ring-background"
          aria-hidden="true"
        />
      )}
      {hasInteractiveChildren ? (
        <div className="flex w-full items-start gap-2 p-2 text-left">
          {content}
        </div>
      ) : (
        <Button
          variant="ghost"
          aria-label={unread ? `Unread: ${title}` : undefined}
          className="h-auto w-full items-start justify-start rounded-none p-2 text-left font-normal whitespace-normal"
          onClick={() => onOpen(notification)}
        >
          {content}
        </Button>
      )}
    </div>
  )
}

function NotificationList({
  items,
  ...handlers
}: { items: Notification[] } & ItemHandlers) {
  return items.map((notification, index) => (
    <div key={notification.id}>
      <NotificationItem notification={notification} {...handlers} />
      {index < items.length - 1 && <Separator className="opacity-60" />}
    </div>
  ))
}

function MarkAllReadButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-60 hover:opacity-100"
              aria-label="Mark all as read"
              disabled={disabled}
              onClick={onClick}
            />
          }
        >
          <CheckCheckIcon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Mark all as read</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function UnreadCount({ count }: { count: number }) {
  return count > 0 ? (
    <Badge size="xs" className="rounded-full!">
      {count}
    </Badge>
  ) : null
}

// ── Notifications ──
// The bell at the foot of the rail and its popover: every notification in one
// scrolling list, newest first.

const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

export function NotificationsPopover() {
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const [items, setItems] = useState(NOTIFICATIONS)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const unreadCount = items.filter((n) => n.unread).length

  function update(id: string, patch: Partial<Notification>) {
    setItems((current) =>
      current.map((n) => (n.id === id ? { ...n, ...patch } : n))
    )
  }

  function markAllRead() {
    setItems((current) => current.map((n) => ({ ...n, unread: false })))
  }

  function go(href: string) {
    setPopoverOpen(false)
    if (isMobile) setOpenMobile(false)
    navigate(href)
  }

  const handlers: ItemHandlers = {
    onOpen: (notification) => {
      update(notification.id, { unread: false })
      if (notification.href) go(notification.href)
    },
    onAction: (notification, action) => {
      if (action.resolve) {
        update(notification.id, {
          unread: false,
          resolved: action.resolve.badge,
        })
        toast.success(action.resolve.toast, {
          icon: TOAST_SUCCESS_ICON,
          description: notification.body,
          closeButton: true,
        })
      } else if (action.href) {
        update(notification.id, { unread: false })
        go(action.href)
      }
    },
    onDownload: (notification) => {
      update(notification.id, { unread: false })
      toast.success("Download started", {
        icon: TOAST_SUCCESS_ICON,
        description: notification.attachment?.name,
        closeButton: true,
      })
    },
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              className="relative mx-auto [&_svg]:opacity-60 [&_svg]:hover:opacity-100"
            />
          }
        >
          <BellIcon aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute top-0.5 right-1 size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </PopoverTrigger>

        {/* app-shell-3 opens it below a bell in the sidebar header. Here the
            bell sits at the foot of the rail, above the user, so it opens
            beside the rail the way the user menu does. */}
        <PopoverContent
          side="right"
          align="end"
          sideOffset={8}
          aria-label="Notifications"
          className="w-80 gap-0 p-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">
                Notifications
              </span>
              <UnreadCount count={unreadCount} />
            </div>
            <MarkAllReadButton
              disabled={unreadCount === 0}
              onClick={markAllRead}
            />
          </div>

          {/* Content */}
          <div className="relative flex max-h-full">
            {/* Scrolls with no scrollbar; the edge with more to read fades. */}
            <ScrollArea className="scroll-fade-y max-h-[320px] grow">
              <NotificationList items={items} {...handlers} />
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
