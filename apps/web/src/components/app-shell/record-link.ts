// ── Record Links ──
// A list page opens one of its records in an editor by URL: the record's id
// and name ride in the query, and the header names the record in its trail
// with a crumb back to the list. The name travels with the id because records
// created in the browser exist only in that page's state.

export type RecordKind = "workflow" | "agent"

export const RECORD_LISTS: Record<
  RecordKind,
  { editor: string; list: string; label: string }
> = {
  workflow: {
    editor: "/workflow-editor",
    list: "/workflows",
    label: "Workflows",
  },
  agent: { editor: "/agent-builder", list: "/agents", label: "Agents" },
}

export function recordEditorHref(
  kind: RecordKind,
  record: { id: string; name: string }
) {
  const params = new URLSearchParams({ [kind]: record.id, name: record.name })
  return `${RECORD_LISTS[kind].editor}?${params}`
}

/** The record an editor route was opened on, or null. */
export function readRecordParams(
  pathname: string,
  params: URLSearchParams
): { kind: RecordKind; id: string; name: string } | null {
  for (const kind of Object.keys(RECORD_LISTS) as RecordKind[]) {
    if (pathname !== RECORD_LISTS[kind].editor) continue

    const id = params.get(kind)
    const name = params.get("name")?.trim()
    return id && name ? { kind, id, name } : null
  }

  return null
}
