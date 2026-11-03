/** 只接收MarkdownPreview完成清洗和高亮的文档，原位更新以避免iframe导航重置滚动。 */
export function updatePreviewDocument(target: Document, sanitizedHtml: string) {
  const next = new DOMParser().parseFromString(sanitizedHtml, "text/html")
  const viewport = target.scrollingElement ?? target.documentElement
  const top = viewport.scrollTop
  const left = viewport.scrollLeft
  const codeOffsets = Array.from(
    target.querySelectorAll("pre"),
    (pre) => pre.scrollLeft
  )
  const style =
    target.head.querySelector("style") ??
    target.head.appendChild(target.createElement("style"))
  style.textContent = next.head.querySelector("style")?.textContent ?? ""
  const images = new Map<string, HTMLImageElement[]>()
  for (const image of target.querySelectorAll("img")) {
    const group = images.get(image.src)
    if (group) group.push(image)
    else images.set(image.src, [image])
  }
  const content = target.importNode(next.body, true)
  for (const image of content.querySelectorAll("img")) {
    const existing = images.get(image.src)?.pop()
    if (!existing) continue
    existing.alt = image.alt
    existing.title = image.title
    image.replaceWith(existing)
  }
  target.body.replaceChildren(...content.childNodes)
  viewport.scrollTop = top
  viewport.scrollLeft = left
  for (const [index, pre] of target.querySelectorAll("pre").entries())
    pre.scrollLeft = codeOffsets[index] ?? 0
}
