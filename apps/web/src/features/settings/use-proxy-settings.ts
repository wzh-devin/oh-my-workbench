import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  proxySettingsApi,
  ProxySettingsError,
  type ProxySetting,
} from "./proxy-settings"

/** 读取服务端代理配置，取消过期请求；保存失败保留草稿，冲突时刷新版本。 */
export const useProxySettings = () => {
  const [proxies, setProxies] = useState<ProxySetting[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const saving = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      saving.current?.abort()
    },
    []
  )
  useEffect(() => {
    const controller = new AbortController()
    void proxySettingsApi.get(controller.signal).then(
      (records) => {
        if (controller.signal.aborted) return
        setProxies(records)
        setStatus("ready")
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus("error")
        toast.error(
          error instanceof Error ? error.message : "读取代理设置失败，请重试"
        )
      }
    )
    return () => controller.abort()
  }, [revision])

  const reload = () => {
    setStatus("loading")
    setRevision((value) => value + 1)
  }

  /** 同一时刻只提交一次；页面退出后不写入状态或发出提示。 */
  const save = async (setting: ProxySetting, address: string) => {
    if (saving.current) return false
    const controller = new AbortController()
    saving.current = controller
    setPending(true)
    try {
      const saved = await proxySettingsApi.save(
        setting,
        address.trim(),
        controller.signal
      )
      if (controller.signal.aborted) return false
      setProxies((records) =>
        records.map((record) =>
          record.service === saved.service ? saved : record
        )
      )
      toast.success(saved.configured ? "代理已保存" : "已恢复直连")
      return true
    } catch (error) {
      if (controller.signal.aborted) return false
      if (error instanceof ProxySettingsError && error.status === 409) reload()
      toast.error(
        error instanceof Error ? error.message : "代理保存失败，请重试"
      )
      return false
    } finally {
      if (saving.current === controller) saving.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return { proxies, status, pending, reload, save }
}
