import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** 构建数据与发布说明共用解析，错误在发布前暴露。 */
// shortcut: 仅解析版本/分类标题和单行列表，需要块级内容时扩展。
function parseChangelog(source) {
  const releases = []
  let release
  let section
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("## ")) {
      const match =
        /^## \[(Unreleased|v\d+\.\d+\.\d+)\](?:\((https:\/\/[^\s)]+)\))?(?: - (\d{4}-\d{2}-\d{2}))?$/.exec(
          line
        )
      if (!match) throw new Error(`更新日志版本标题无效：${line}`)
      const [, label, url, date] = match
      const version = label.replace(/^v/, "")
      if (releases.some((item) => item.version === version))
        throw new Error(`更新日志版本重复：${version}`)
      if (version === "Unreleased" ? date || releases.length : !date)
        throw new Error(`更新日志版本日期或顺序无效：${version}`)
      if (
        date &&
        (!Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      )
        throw new Error(`更新日志日期无效：${date}`)
      const previous = releases.at(-1)
      if (
        previous &&
        previous.version !== "Unreleased" &&
        version.localeCompare(previous.version, "en", { numeric: true }) >= 0
      )
        throw new Error("更新日志必须按版本倒序排列")
      if (url && (new URL(url).username || new URL(url).password))
        throw new Error("更新日志版本链接不能包含凭据")
      release = {
        version,
        url: url ?? null,
        date: date ?? null,
        sections: [],
        body: [],
      }
      releases.push(release)
      section = undefined
    } else if (release) {
      if (/^\[[^\]]+\]:\s/.test(line)) continue
      if (line.startsWith("### ")) {
        section = { title: line.slice(4).trim(), items: [] }
        if (!section.title) throw new Error("更新日志分类不能为空")
        release.sections.push(section)
      } else if (/^[-*] /.test(line)) {
        if (!section || !line.slice(2).trim())
          throw new Error("更新日志条目需要分类和正文")
        section.items.push(line.slice(2).trim())
      } else if (line.trim()) {
        throw new Error(`更新日志仅支持分类标题与单行列表：${line}`)
      }
      release.body.push(line)
    }
  }
  return releases
}

function releaseIndex(releases, version) {
  const match = /^v?(\d+\.\d+\.\d+)$/.exec(version)
  if (!match) throw new Error(`发布版本号无效：${version}`)
  const index = releases.findIndex((item) => item.version === match[1])
  if (index < 0)
    throw new Error(`CHANGELOG.md 缺少版本 ${version}，请先整理对应的更新记录`)
  if (!releases[index].sections.some((section) => section.items.length))
    throw new Error(`更新日志版本 ${version} 没有内容`)
  return index
}

/** 发布构建只携带当前及更早记录；开发环境可查看待发布内容。 */
export function buildChangelog(source, version) {
  const releases = parseChangelog(source)
  const selected = version
    ? releases.slice(releaseIndex(releases, version))
    : releases
  return {
    version: version ? `v${version.replace(/^v/, "")}` : "开发版",
    releases: selected
      .filter((release) =>
        release.sections.some((section) => section.items.length)
      )
      .map(({ version, url, date, sections }) => ({
        version,
        url,
        date,
        sections: sections.filter((section) => section.items.length),
      })),
  }
}

export function releaseNotes(source, version) {
  const releases = parseChangelog(source)
  return releases[releaseIndex(releases, version)].body.join("\n").trim()
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const source = readFileSync(
      new URL("../CHANGELOG.md", import.meta.url),
      "utf8"
    )
    process.stdout.write(`${releaseNotes(source, process.argv[2] ?? "")}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  }
}
