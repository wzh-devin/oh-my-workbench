import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { connectPreviewScroll } from "./preview-scroll"
import { decoratePreviewCodeBlocks } from "./preview-code-blocks"
import { updatePreviewDocument } from "./preview-document"

const PREVIEW_POLICY =
  "default-src 'none'; script-src 'none'; img-src https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/** 清洗Markdown后放入无脚本沙箱；仅允许HTTP(S)图片，外链由用户主动打开。 */
export function MarkdownPreview({
  markdown,
  title = "Markdown 预览",
  active = true,
  live = false,
}: {
  markdown: string
  title?: string
  active?: boolean
  live?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [html, setHtml] = useState<{ policy: string; document: string } | null>(
    null
  )
  const latestHtml = useRef("")
  const frame = useRef<HTMLIFrameElement>(null)
  const disconnect = useRef<() => void>(() => {})
  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    frame.current = element
    if (!element) disconnect.current()
  }, [])
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const syncFrame = useCallback(() => {
    const target = frame.current?.contentDocument
    if (!target || !latestHtml.current) return
    try {
      updatePreviewDocument(target, latestHtml.current)
      disconnect.current()
      if (frame.current)
        disconnect.current = connectPreviewScroll(frame.current)
    } catch {
      setFailed(true)
    }
  }, [])
  useEffect(() => {
    if (!active) return
    let mounted = true
    const timer = setTimeout(
      async () => {
        setFailed(false)
        try {
          const renderer = new marked.Renderer()
          renderer.image = ({ href, title, text }) => {
            const image = document.createElement("img")
            image.setAttribute("data-note-image", href)
            image.alt = text
            if (title) image.title = title
            return image.outerHTML
          }
          const source = marked.parse(markdown, {
            async: false,
            gfm: true,
            renderer,
          })
          const root = DOMPurify.sanitize(source, {
            RETURN_DOM: true,
            FORBID_TAGS: [
              "video",
              "audio",
              "iframe",
              "object",
              "embed",
              "form",
              "link",
              "style",
              "svg",
              "math",
            ],
            FORBID_ATTR: [
              "src",
              "srcset",
              "style",
              "action",
              "formaction",
              "autofocus",
            ],
          })
          if (!(root instanceof HTMLElement)) throw new Error("预览文档无效")
          for (const image of root.querySelectorAll("img")) {
            try {
              const href = image.getAttribute("data-note-image")
              if (!href) throw new Error()
              const url = new URL(href, window.location.href)
              if (
                !["https:", "http:"].includes(url.protocol) ||
                url.username ||
                url.password
              )
                throw new Error()
              for (const attribute of Array.from(image.attributes))
                if (!["alt", "title"].includes(attribute.name))
                  image.removeAttribute(attribute.name)
              image.setAttribute("referrerpolicy", "no-referrer")
              image.setAttribute("loading", "lazy")
              image.setAttribute("decoding", "async")
              image.src = url.href
            } catch {
              image.remove()
            }
          }
          for (const input of root.querySelectorAll("input")) {
            if (input.type === "checkbox") input.disabled = true
            else input.remove()
          }
          for (const list of root.querySelectorAll("ul")) {
            if (
              Array.from(list.children).every((item) =>
                item.firstElementChild?.matches('input[type="checkbox"]')
              )
            )
              list.setAttribute("data-task-list", "")
          }
          for (const anchor of root.querySelectorAll("a")) {
            try {
              const url = new URL(anchor.getAttribute("href") ?? "")
              if (!["https:", "http:"].includes(url.protocol)) throw new Error()
              anchor.target = "_blank"
              anchor.rel = "noopener noreferrer"
              anchor.referrerPolicy = "no-referrer"
            } catch {
              anchor.replaceWith(...anchor.childNodes)
            }
          }
          for (const image of root.querySelectorAll("img")) {
            if (image.closest("a[href]")) continue
            const link = document.createElement("a")
            link.href = image.src
            link.target = "_blank"
            link.rel = "noopener noreferrer"
            link.setAttribute("referrerpolicy", "no-referrer")
            link.className = "note-image-link"
            link.setAttribute("aria-label", `查看原图：${image.alt || "图片"}`)
            link.title = "点击查看原图"
            image.replaceWith(link)
            link.append(image)
          }
          await decoratePreviewCodeBlocks(root, resolvedTheme === "dark")
          if (!mounted) return
          const style = getComputedStyle(document.body)
          const background =
            style.getPropertyValue("--card").trim() || style.backgroundColor
          const css = `
          html{overflow:hidden;color-scheme:${resolvedTheme === "dark" ? "dark" : "light"};--card:${background};--muted:${style.getPropertyValue("--muted").trim() || "color-mix(in srgb,currentColor 5%,transparent)"};--border:${style.getPropertyValue("--border").trim() || "color-mix(in srgb,currentColor 15%,transparent)"};--muted-foreground:${style.getPropertyValue("--muted-foreground").trim() || style.color};--ring:${style.getPropertyValue("--ring").trim() || style.color};--radius:${style.getPropertyValue("--radius").trim() || "0.625rem"};--radius-lg:${style.getPropertyValue("--radius-lg").trim() || "var(--radius)"}}
          body{display:flow-root;box-sizing:border-box;margin:0;padding:4px;font:14px/1.8 system-ui;overflow-wrap:anywhere;color:${style.color};background:${background}}
          img{display:block;max-width:100%;max-height:320px;width:auto;height:auto;object-fit:contain}
          .note-image-link{display:block;width:fit-content;max-width:100%;cursor:zoom-in}
          body>*{margin:0}body>*+*{margin-top:16px}h1,h2,h3{font-weight:600;line-height:1.4;letter-spacing:-.025em}
          h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}
          h1:not(:first-child),h2:not(:first-child),h3:not(:first-child){margin-top:28px}
          .code-block{min-width:0;margin-inline:0;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);overflow:hidden}
          .code-block figcaption{display:flex;align-items:center;min-height:36px;box-sizing:border-box;padding:0 12px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--muted) 60%,transparent);color:var(--muted-foreground);font:12px/1.5 ui-monospace,monospace}
          pre{margin:0;overflow:auto;padding:12px;line-height:24px;white-space:pre;overflow-wrap:normal;tab-size:4;scrollbar-width:thin}
          pre:focus-visible{outline:2px solid var(--ring);outline-offset:-2px}pre code{background:none;padding:0}
          code{font-size:14px;font-family:ui-monospace,monospace}p code,li code{background:color-mix(in srgb,currentColor 5%,transparent);padding:2px 4px}
          table{border-collapse:collapse;display:block;overflow:auto;width:100%}td,th{border:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:8px 12px}th{font-weight:500;background:color-mix(in srgb,currentColor 5%,transparent)}
          a{color:inherit;text-decoration:underline;text-underline-offset:3px}a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
          blockquote{border-left:2px solid color-mix(in srgb,currentColor 20%,transparent);padding-left:16px;margin-left:0}
          li+li{margin-top:4px}li>p{margin:0}hr{border:0;border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);margin-block:24px}
          ul,ol{padding-left:24px}ul[data-task-list]{list-style:none;padding-left:0}li>input[type="checkbox"]{margin:0 8px 0 0}
        `
          const nextHtml =
            `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}"><style>` +
            css +
            "</style>" +
            root.innerHTML
          if (mounted) {
            if (latestHtml.current === nextHtml) return
            latestHtml.current = nextHtml
            const target = frame.current?.contentDocument
            if (target) updatePreviewDocument(target, nextHtml)
            setHtml((previous) =>
              previous?.policy === PREVIEW_POLICY
                ? previous
                : { policy: PREVIEW_POLICY, document: nextHtml }
            )
          }
        } catch {
          if (mounted) setFailed(true)
        }
      },
      live && frame.current ? 150 : 0
    )
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [markdown, resolvedTheme, revision, active, live])
  if (failed)
    return (
      <div role="status" className="flex flex-col gap-3">
        <p>预览失败</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRevision((value) => value + 1)}
        >
          重试
        </Button>
      </div>
    )
  if (html?.policy !== PREVIEW_POLICY)
    return (
      <Skeleton
        role="status"
        className="min-h-0 flex-1"
        aria-label="正在生成预览"
      />
    )
  return (
    <ScrollArea aria-label={`${title}区`} className="min-h-0 min-w-0 flex-1">
      <div className="min-h-full p-3">
        <iframe
          key={PREVIEW_POLICY}
          ref={attachFrame}
          title={title}
          // 父页面原位更新清洗后的DOM；子文档始终禁止脚本、表单和顶层导航。
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={html.document}
          onLoad={syncFrame}
          className="block w-full border-0"
        />
      </div>
    </ScrollArea>
  )
}
