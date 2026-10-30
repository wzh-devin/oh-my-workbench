import { useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { buildMailDocument } from "../mail-document"

/** HTML 只进入无脚本、无同源权限的隔离文档；邮件样式不能影响工作台。 */
export function MailBody({
  text,
  html,
}: {
  text: string
  html?: string | null
}) {
  const document = useMemo(
    () => (html ? buildMailDocument(html) : undefined),
    [html]
  )
  return document?.srcDoc ? (
    <iframe
      title="邮件正文"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={document.srcDoc}
      className="min-h-40 w-full flex-1 border-0"
    />
  ) : (
    <ScrollArea className="min-h-0 flex-1">
      <p className="text-sm leading-7 wrap-anywhere whitespace-pre-wrap">
        {text || "（正文为空）"}
      </p>
    </ScrollArea>
  )
}
