import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { useTheme } from "next-themes"
import { DelimitedPreview } from "./delimited-preview"
export { parseDelimited } from "./delimited-preview"

/** Markdown 与着色代码在无脚本沙箱中显示，外链资源在清洗时移除。 */
export function TextPreview({
  name,
  text,
  onDownload,
}: {
  name: string
  text: string
  onDownload: () => void
}) {
  const [html, setHtml] = useState<string | null>(null),
    { resolvedTheme } = useTheme()
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  useEffect(() => {
    let active = true
    const render = async () => {
      let source: string | null = null
      if (extension === "md")
        source = await marked.parse(text, { async: false })
      else if (
        [
          "json",
          "js",
          "mjs",
          "cjs",
          "ts",
          "tsx",
          "jsx",
          "css",
          "py",
          "sh",
          "sql",
          "toml",
          "yaml",
          "yml",
          "go",
        ].includes(extension)
      ) {
        const { codeToHtml } = await import("shiki")
        source = await codeToHtml(text, {
          lang:
            (
              { mjs: "javascript", cjs: "javascript", yml: "yaml" } as Record<
                string,
                string
              >
            )[extension] ?? extension,
          theme: resolvedTheme === "dark" ? "github-dark" : "github-light",
        })
      }
      if (!active) return
      if (source === null) {
        setHtml(null)
        return
      }
      const safe = DOMPurify.sanitize(source, {
        FORBID_TAGS: [
          "img",
          "video",
          "audio",
          "iframe",
          "object",
          "embed",
          "form",
          "input",
          "link",
          "style",
        ],
        FORBID_ATTR: ["src", "href", "srcset"],
      })
      const colors =
        resolvedTheme === "dark"
          ? "color:#eee;background:#111"
          : "color:#222;background:#fff"
      setHtml(
        `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:14px/1.6 system-ui;margin:12px;overflow-wrap:anywhere;${colors}}pre{overflow:auto}code{font-size:14px}table{border-collapse:collapse}td,th{border:1px solid #888;padding:6px}</style>${safe}`
      )
    }
    void render().catch(() => {
      if (active) setHtml(null)
    })
    return () => {
      active = false
    }
  }, [text, extension, resolvedTheme])
  if (extension === "csv" || extension === "tsv") {
    return (
      <DelimitedPreview
        text={text}
        delimiter={extension === "csv" ? "," : "\t"}
        onDownload={onDownload}
      />
    )
  }

  if (html !== null)
    return (
      <iframe
        sandbox=""
        srcDoc={html}
        title="文本预览"
        className="min-h-0 w-full flex-1 border-0"
      />
    )
  return (
    <pre className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4 text-sm break-words whitespace-pre-wrap">
      {text || "（空文件）"}
    </pre>
  )
}
