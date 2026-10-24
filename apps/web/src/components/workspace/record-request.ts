"use client"

import { useCallback, useEffect, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router"

export type RecordRequest =
  { key: string; kind: "open"; id: string } | { key: string; kind: "create" }

// ── Record Requests ──
// Other pages link into a list by URL: `?open=<id>` opens that record's
// sheet (a notification, a Dashboard row), `?new=1` opens the create sheet
// (Dashboard's Add Workflow).

/**
 * 导航提交后消费一次 URL 打开请求，避免重复触发记录弹窗。
 * @param onRequest 由页面处理打开或创建记录的请求。
 * @return 不渲染额外界面。
 */
export function RecordRequestListener({
  onRequest,
}: {
  onRequest: (request: RecordRequest) => void
}) {
  const [params] = useSearchParams()

  const open = params.get("open")
  const create = params.get("new") === "1"
  const key = open ? `open:${open}` : create ? "create" : null

  // The page's handler opens a sheet, an update to the page, so it runs after
  // this render; the ref keeps the latest handler without re-firing on it.
  const handler = useRef(onRequest)
  useEffect(() => {
    handler.current = onRequest
  })

  useEffect(() => {
    if (open) handler.current({ key: `open:${open}`, kind: "open", id: open })
    else if (create) handler.current({ key: "create", kind: "create" })
    // Once per distinct request: `key` covers both values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}

/**
 * 关闭弹窗后清理路由请求，避免刷新时重新打开。
 * @return 与当前路由状态一致的清理回调。
 */
export function useClearRecordRequest() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  return useCallback(() => {
    const params = new URLSearchParams(search)
    if (params.has("open") || params.has("new")) {
      navigate(pathname, { replace: true, preventScrollReset: true })
    }
  }, [pathname, search, navigate])
}
