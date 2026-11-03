export type SourceSelection = { value: string; start: number; end: number }
export type MarkdownCommand =
  | "undo"
  | "redo"
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "bullet"
  | "ordered"
  | "task"
  | "quote"
  | "block"
  | "rule"
  | "link"
  | "unlink"
  | "table"

const replace = (
  source: SourceSelection,
  from: number,
  to: number,
  text: string,
  start = 0,
  end = text.length
): SourceSelection => ({
  value: source.value.slice(0, from) + text + source.value.slice(to),
  start: from + start,
  end: from + end,
})

function wrap(source: SourceSelection, marker: string, placeholder: string) {
  const { value, start, end } = source
  const text = value.slice(start, end)
  const matching = (before: string, after: string) => {
    if (marker === "*")
      return (
        (before.match(/\*+$/)?.[0].length ?? 0) % 2 === 1 &&
        (after.match(/^\*+/)?.[0].length ?? 0) % 2 === 1
      )
    return before.endsWith(marker) && after.startsWith(marker)
  }
  if (
    (marker === "*"
      ? matching(text.match(/^\*+/)?.[0] ?? "", text.match(/\*+$/)?.[0] ?? "")
      : text.startsWith(marker) && text.endsWith(marker)) &&
    text.length >= marker.length * 2
  )
    return replace(
      source,
      start,
      end,
      text.slice(marker.length, -marker.length)
    )
  if (matching(value.slice(0, start), value.slice(end)))
    return replace(source, start - marker.length, end + marker.length, text)
  const content = text.trim() || placeholder
  const leading = text.match(/^\s*/)?.[0] ?? ""
  const trailing = text.trim() ? (text.match(/\s*$/)?.[0] ?? "") : ""
  return replace(
    source,
    start,
    end,
    leading + marker + content + marker + trailing,
    leading.length + marker.length,
    leading.length + marker.length + content.length
  )
}

function lineRange({ value, start, end }: SourceSelection) {
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end
  const next = value.indexOf("\n", last)
  return { from, to: next < 0 ? value.length : next }
}

function lines(
  source: SourceSelection,
  transform: (line: string, index: number) => string
) {
  const { from, to } = lineRange(source)
  const old = source.value.slice(from, to).split("\n")
  const next = old.map(transform)
  const position = (offset: number) => {
    let before = from,
      after = from
    for (let i = 0; i < old.length; i++) {
      if (offset <= before + old[i].length)
        return (
          after +
          Math.max(
            0,
            Math.min(
              next[i].length,
              offset - before + next[i].length - old[i].length
            )
          )
        )
      before += old[i].length + 1
      after += next[i].length + 1
    }
    return after - 1
  }
  return {
    value:
      source.value.slice(0, from) + next.join("\n") + source.value.slice(to),
    start: position(source.start),
    end: position(source.end),
  }
}

function insertBlock(source: SourceSelection, text: string) {
  const before = source.value.slice(0, source.start)
  const after = source.value.slice(source.end)
  const prefix =
    before && !before.endsWith("\n\n")
      ? before.endsWith("\n")
        ? "\n"
        : "\n\n"
      : ""
  const suffix =
    after && !after.startsWith("\n\n")
      ? after.startsWith("\n")
        ? "\n"
        : "\n\n"
      : ""
  return replace(
    source,
    source.start,
    source.end,
    prefix + text + suffix,
    prefix.length,
    prefix.length + text.length
  )
}

/** 源码格式命令只修改选区或相关行，不经过富文本解析，保留其余原文。 */
export function sourceCommand(
  source: SourceSelection,
  command: MarkdownCommand,
  href = ""
): SourceSelection {
  if (["bold", "italic", "strike"].includes(command))
    return wrap(
      source,
      command === "bold" ? "**" : command === "italic" ? "*" : "~~",
      "文本"
    )
  if (command === "code") {
    const text = source.value.slice(source.start, source.end)
    let ticks = 1
    for (const [run] of text.matchAll(/`+/g))
      ticks = Math.max(ticks, run.length + 1)
    const marker = "`".repeat(ticks)
    const before = source.value.slice(0, source.start)
    const after = source.value.slice(source.end)
    const pad =
      /^`|`$/.test(text) || (text.trim() && /^ | $/.test(text)) ? " " : ""
    if (before.endsWith(marker + pad) && after.startsWith(pad + marker))
      return replace(
        source,
        source.start - marker.length - pad.length,
        source.end + marker.length + pad.length,
        text
      )
    const content = text || "代码"
    return replace(
      source,
      source.start,
      source.end,
      marker + pad + content + pad + marker,
      marker.length + pad.length,
      marker.length + pad.length + content.length
    )
  }
  if (command === "paragraph" || /^h[1-6]$/.test(command)) {
    const prefix =
      command === "paragraph" ? "" : "#".repeat(Number(command[1])) + " "
    return lines(source, (line) =>
      line.replace(/^(\s*)(?:#{1,6} )?/, "$1" + prefix)
    )
  }
  if (["bullet", "ordered", "task", "quote"].includes(command)) {
    const pattern =
      command === "quote"
        ? /^(\s*)> ?/
        : command === "task"
          ? /^(\s*)[-+*] \[[ xX]\] /
          : command === "ordered"
            ? /^(\s*)\d+[.)] /
            : /^(\s*)[-+*] (?!\[[ xX]\] )/
    const listPrefix = /^(\s*)(?:[-+*] (?:\[[ xX]\] )?|\d+[.)] )/
    const { from, to } = lineRange(source)
    const remove = source.value
      .slice(from, to)
      .split("\n")
      .every((item) => pattern.test(item))
    return lines(source, (line, index) => {
      if (remove) return line.replace(pattern, "$1")
      const content =
        command === "quote" ? line : line.replace(listPrefix, "$1")
      const prefix =
        command === "quote"
          ? "> "
          : command === "task"
            ? "- [ ] "
            : command === "ordered"
              ? `${index + 1}. `
              : "- "
      return content.replace(/^(\s*)/, "$1" + prefix)
    })
  }
  if (command === "block") {
    const { from, to } = lineRange(source)
    const text = source.value.slice(from, to)
    const before = source.value
      .slice(0, from)
      .match(/(?:^|\n)(`{3,}|~{3,})[^\n]*\n$/)
    if (before && source.value.slice(to).startsWith("\n" + before[1])) {
      const close = to + 1 + before[1].length
      if (close === source.value.length || source.value[close] === "\n") {
        const open =
          from - before[0].length + (before[0].startsWith("\n") ? 1 : 0)
        return replace(source, open, close, text)
      }
    }
    let length = 3
    for (const [run] of text.matchAll(/`+/g))
      length = Math.max(length, run.length + 1)
    const fence = "`".repeat(length)
    return replace(
      source,
      from,
      to,
      fence + "\n" + text + "\n" + fence,
      fence.length + 1,
      fence.length + 1 + text.length
    )
  }
  if (command === "rule") return insertBlock(source, "---")
  if (command === "table")
    return insertBlock(
      source,
      "| 标题 1 | 标题 2 | 标题 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |"
    )
  if (command === "link" || command === "unlink") {
    const { value, start, end } = source
    const existing = Array.from(
      value.matchAll(/\[([^[\]\n]*)\]\(([^\s)]*)\)/g)
    ).find(
      (match) => match.index <= start && match.index + match[0].length >= end
    )
    if (command === "unlink")
      return existing
        ? replace(
            source,
            existing.index,
            existing.index + existing[0].length,
            existing[1]
          )
        : source
    try {
      const url = new URL(href)
      if (!["http:", "https:"].includes(url.protocol)) return source
      const label = existing?.[1] || value.slice(start, end) || "链接文字"
      const address = url.href.replaceAll("(", "%28").replaceAll(")", "%29")
      const from = existing?.index ?? start
      return replace(
        source,
        from,
        existing ? from + existing[0].length : end,
        `[${label}](${address})`,
        1,
        label.length + 1
      )
    } catch {
      return source
    }
  }
  return source
}
