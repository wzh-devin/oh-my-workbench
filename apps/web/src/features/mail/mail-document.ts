import DOMPurify from "dompurify"

/** 清理完整邮件文档；兼容性由 DOMPurify 维护，资源访问由 iframe CSP 限制。 */
export const buildMailDocument = (source: string) => {
  const root = DOMPurify.sanitize(source, {
    USE_PROFILES: { html: true },
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
    ADD_ATTR: ["target"],
    FORBID_TAGS: [
      "base",
      "link",
      "meta",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["autofocus"],
  })
  if (!(root instanceof HTMLElement)) return { srcDoc: undefined }
  const doc = root.ownerDocument
  const head = root.querySelector("head")!
  const body = root.querySelector("body")!

  for (const link of root.querySelectorAll("a[href],area[href]")) {
    const href = link.getAttribute("href")!.trim()
    if (href.startsWith("#")) {
      link.removeAttribute("target")
      continue
    }
    // 不让相对地址落到工作台路由，也不允许邮件控制当前窗口。
    if (!/^(https?:|mailto:|tel:)/i.test(href)) link.removeAttribute("href")
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noopener noreferrer")
  }

  const charset = doc.createElement("meta")
  charset.setAttribute("charset", "utf-8")
  const policy = doc.createElement("meta")
  policy.httpEquiv = "Content-Security-Policy"
  policy.content =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; base-uri 'none'; form-action 'none'"
  const referrer = doc.createElement("meta")
  referrer.name = "referrer"
  referrer.content = "no-referrer"
  const viewport = doc.createElement("meta")
  viewport.name = "viewport"
  viewport.content = "width=device-width, initial-scale=1"
  const style = doc.createElement("style")
  style.textContent =
    "html{color-scheme:light;background:#fff;color:#111}body{margin:0;overflow-wrap:anywhere;font:14px/1.7 system-ui,sans-serif}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}"
  // 可信策略必须在邮件自带样式和资源之前；不把完整 HTML 再嵌入另一个 body。
  head.prepend(charset, policy, referrer, viewport, style)
  return {
    srcDoc:
      body.textContent?.trim() || body.children.length
        ? `<!doctype html>${root.outerHTML}`
        : undefined,
  }
}
