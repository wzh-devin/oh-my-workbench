import { useEffect, useState, useRef, type CSSProperties } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  ListTodoIcon,
  StarIcon,
  XIcon,
} from "lucide-react"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  SHEET_SHELL,
  SHEET_FOOTER,
} from "@/features/settings/components/sections/sheet-parts"
import { createTodo, useTodos } from "@/features/todos/store"
import { formatMailTime } from "../model"
import { MailBody } from "./mail-body"
import { MailProviderIcon } from "./mail-provider-icon"
import { mailApi, downloadMailAttachment } from "../api"
import { saveBlob } from "@/features/workbench/local-files"
import { changeMailMessage, useMail } from "../store"
import type { Message } from "../model"

/** Detail requests are independent from pagination, including links opened from a notification. */
export function MailDetail({
  id,
  onClose,
}: {
  id: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const mail = useMail()
  const todos = useTodos()
  const [detail, setDetail] = useState<Message | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [retry, setRetry] = useState(0)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [previousId, setPreviousId] = useState(id)
  if (previousId !== id) {
    setPreviousId(id)
    if (id) {
      setDetail(null)
      setStatus("loading")
      setDownloading(null)
    }
  }
  const downloadController = useRef<AbortController | null>(null)
  useEffect(() => () => downloadController.current?.abort(), [id])
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void mailApi.message(id, controller.signal).then(
      async (message) => {
        if (controller.signal.aborted) return
        setDetail(message)
        setStatus("ready")
        if (!message.read) {
          const saved = await changeMailMessage(message, { read: true })
          if (saved && !controller.signal.aborted)
            setDetail({
              ...message,
              ...saved,
              body: message.body,
              bodyHtml: message.bodyHtml,
              attachments: message.attachments,
            })
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus("error")
        toast.error(error instanceof Error ? error.message : "读取邮件失败", {
          action: {
            label: "重试",
            onClick: () => setRetry((value) => value + 1),
          },
        })
      }
    )
    return () => controller.abort()
  }, [id, retry])
  const account = mail.overview.accounts.find(
    (item) => item.id === detail?.accountId
  )
  const linkedTask =
    detail?.todoId ??
    todos.data.todos.find(
      (todo) => todo.source?.kind === "mail" && todo.source.id === id
    )?.id
  const convertToTask = async () => {
    if (!detail) return
    if (linkedTask) {
      navigate(`/todos?task=${encodeURIComponent(linkedTask)}`)
      return
    }
    const title = detail.subject.trim().slice(0, 200) || "邮件待办"
    const task = await createTodo({
      title,
      note: detail.body.slice(0, 2000),
      source: { kind: "mail", id: detail.id, label: title },
    })
    if (task)
      toast.success("待办已添加", {
        action: {
          label: "查看",
          onClick: () => navigate(`/todos?task=${encodeURIComponent(task.id)}`),
        },
      })
  }
  return (
    <Sheet
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        className={`${SHEET_SHELL} motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-starting-style:translate-x-0`}
        style={{ "--sheet-width": "760px" } as CSSProperties}
        showCloseButton={false}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex min-w-0 flex-col gap-2">
            <SheetTitle>{detail?.subject || "邮件详情"}</SheetTitle>
            <SheetDescription>
              {detail ? `${detail.sender} · ${detail.address}` : " "}
            </SheetDescription>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="关闭邮件"
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {status === "loading" ? (
            <div
              className="flex flex-col gap-3 p-5"
              role="status"
              aria-label="正在读取邮件"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-5 w-full" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="p-5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setStatus("loading")
                  setRetry((value) => value + 1)
                }}
              >
                重试
              </Button>
            </div>
          ) : (
            detail && (
              <article className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {account && (
                        <MailProviderIcon provider={account.provider} />
                      )}
                      {account?.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatMailTime(detail.receivedAt)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={detail.starred}
                    disabled={mail.busyIds.includes(detail.id)}
                    onClick={async () => {
                      const saved = await changeMailMessage(detail, {
                        starred: !detail.starred,
                      })
                      if (saved)
                        setDetail((current) =>
                          current?.id === detail.id
                            ? {
                                ...current,
                                ...saved,
                                body: current.body,
                                bodyHtml: current.bodyHtml,
                                attachments: current.attachments,
                              }
                            : current
                        )
                    }}
                  >
                    <StarIcon aria-hidden="true" />
                    {detail.starred ? "取消星标" : "添加星标"}
                  </Button>
                </div>
                <MailBody
                  key={detail.id}
                  text={detail.body}
                  html={detail.bodyHtml}
                />
                {detail.attachments.length > 0 && (
                  <div className="flex shrink-0 flex-col gap-3 border-t pt-4">
                    {detail.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex min-w-0 items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileTypeIcon
                            file={{
                              name: attachment.name,
                              type: attachment.contentType,
                            }}
                          />
                          <span
                            className="truncate text-sm"
                            title={attachment.name}
                          >
                            {attachment.name}
                          </span>
                        </div>
                        <Button
                          type="button"
                          disabled={downloading !== null}
                          onClick={async () => {
                            const controller = new AbortController()
                            downloadController.current = controller
                            setDownloading(attachment.id)
                            try {
                              const blob = await downloadMailAttachment(
                                attachment.id,
                                controller.signal
                              )
                              if (!controller.signal.aborted) {
                                saveBlob(blob, attachment.name)
                                toast.success("下载已开始")
                              }
                            } catch (error) {
                              if (!controller.signal.aborted)
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "附件下载失败，请重试"
                                )
                            } finally {
                              if (!controller.signal.aborted)
                                setDownloading(null)
                            }
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <DownloadIcon aria-hidden="true" />
                          {downloading === attachment.id ? "下载中" : "下载"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          )}
        </div>
        <div className={SHEET_FOOTER}>
          <span className="mr-auto text-xs text-muted-foreground">
            {account?.email}
          </span>
          {detail && status === "ready" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mail.busyIds.includes(detail.id)}
              onClick={async () => {
                const saved = await changeMailMessage(detail, {
                  archived: !detail.archived,
                })
                if (saved) {
                  setDetail((current) =>
                    current?.id === detail.id
                      ? {
                          ...current,
                          ...saved,
                          body: current.body,
                          bodyHtml: current.bodyHtml,
                          attachments: current.attachments,
                        }
                      : current
                  )
                  toast.success(detail.archived ? "已移回收件箱" : "邮件已归档")
                }
              }}
            >
              {detail.archived ? (
                <ArchiveRestoreIcon aria-hidden="true" />
              ) : (
                <ArchiveIcon aria-hidden="true" />
              )}
              {detail.archived ? "移回收件箱" : "归档"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void convertToTask()}
            disabled={
              !detail ||
              todos.status !== "ready" ||
              todos.busyIds.includes("task:create")
            }
          >
            <ListTodoIcon aria-hidden="true" />
            {linkedTask ? "查看待办" : "转为待办"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
