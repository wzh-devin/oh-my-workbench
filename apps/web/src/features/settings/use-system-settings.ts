import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  systemSettingsApi,
  SystemSettingsError,
  type SystemSetting,
  type SystemSettingDraft,
} from "./system-settings"

/** 系统配置按版本保存；读取失败或冲突时保留草稿，退出后取消请求。 */
export const useSystemSettings = () => {
  const [setting, setSetting] = useState<SystemSetting | null>(null)
  const [draft, setDraft] = useState<SystemSettingDraft>({
    converterUrl: "",
    pushSubject: "",
  })
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const dirty = useRef(false)
  const saving = useRef<AbortController | null>(null)

  useEffect(() => () => saving.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    void systemSettingsApi.get(controller.signal).then(
      (saved) => {
        if (controller.signal.aborted) return
        setSetting(saved)
        if (!dirty.current)
          setDraft({
            converterUrl: saved.converterUrl,
            pushSubject: saved.pushSubject,
          })
        setStatus("ready")
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus("error")
        toast.error(
          error instanceof Error ? error.message : "读取系统配置失败，请重试"
        )
      }
    )
    return () => controller.abort()
  }, [revision])

  const reload = () => {
    setStatus("loading")
    setRevision((value) => value + 1)
  }
  const update = (field: keyof SystemSettingDraft, value: string) => {
    dirty.current = true
    setDraft((current) => ({ ...current, [field]: value }))
  }
  /** 失败保留草稿；冲突刷新版本后仍由用户决定是否再次提交。 */
  const save = async () => {
    if (!setting || status !== "ready" || saving.current) return
    const controller = new AbortController()
    saving.current = controller
    setPending(true)
    try {
      const saved = await systemSettingsApi.save(
        { ...draft, version: setting.version },
        controller.signal
      )
      if (controller.signal.aborted) return
      setSetting(saved)
      setDraft({
        converterUrl: saved.converterUrl,
        pushSubject: saved.pushSubject,
      })
      dirty.current = false
      toast.success("系统配置已保存")
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof SystemSettingsError && error.status === 409) reload()
      toast.error(
        error instanceof Error ? error.message : "保存系统配置失败，请重试"
      )
    } finally {
      if (saving.current === controller) saving.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return { setting, draft, status, pending, reload, update, save }
}
