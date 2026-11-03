import {
  highlightCode,
  resolveCodeBlockLanguage,
} from "@/components/reui/code-block/code-block-highlight"

/** 仅把已清洗代码的文本交给现有高亮器，不把用户内容拼入 HTML 或样式。 */
export async function decoratePreviewCodeBlocks(
  root: HTMLElement,
  dark: boolean
) {
  let budget = 50_000
  for (const pre of root.querySelectorAll("pre")) {
    const code = pre.firstElementChild
    if (!(code instanceof HTMLElement) || code.tagName !== "CODE") continue
    const source = code.textContent ?? ""
    const language = Array.from(code.classList)
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length)
    const label = language || "纯文本"
    const block = document.createElement("figure")
    block.className = "code-block"
    const caption = document.createElement("figcaption")
    caption.textContent = label
    pre.replaceWith(block)
    block.append(caption, pre)
    pre.tabIndex = 0
    pre.setAttribute("role", "region")
    pre.setAttribute("aria-label", `${label} 代码`)
    pre.dir = "ltr"

    // shortcut: 大块或压缩代码保留原文；需要全量高亮时再迁移到 Worker。
    if (
      !resolveCodeBlockLanguage(language) ||
      source.length > budget ||
      source.split("\n").some((line) => line.length > 2_000)
    )
      continue
    budget -= source.length
    try {
      const lines = await highlightCode(source, { language })
      if (lines.map((line) => line.text).join("\n") !== source) continue
      const content = document.createDocumentFragment()
      for (const [index, line] of lines.entries()) {
        if (index > 0) content.append(document.createTextNode("\n"))
        for (const token of line.tokens) {
          const color = dark ? (token.colorDark ?? token.color) : token.color
          if (!color && !token.fontStyle) {
            content.append(document.createTextNode(token.content))
            continue
          }
          const span = document.createElement("span")
          span.textContent = token.content
          if (color) span.style.color = color
          if (token.fontStyle === "italic") span.style.fontStyle = "italic"
          if (token.fontStyle === "bold") span.style.fontWeight = "bold"
          if (token.fontStyle === "underline")
            span.style.textDecoration = "underline"
          content.append(span)
        }
      }
      code.replaceChildren(content)
    } catch {
      // 语言包失败不影响正文阅读，原始代码仍在文档中。
    }
  }
}
