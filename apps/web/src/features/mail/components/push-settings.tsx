import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SettingRow } from "@/features/settings/components/sections/setting-row"
import { disableMailPush, enableMailPush, pushSupported } from "../push"

/** Permission is requested only by the explicit enable button, never during page load. */
export function MailPushSettings() {
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!pushSupported()) return
    let alive = true
    void navigator.serviceWorker
      .getRegistration("/")
      .then((worker) => worker?.pushManager.getSubscription())
      .then(
        (subscription) => {
          if (alive) setEnabled(!!subscription)
        },
        () => {}
      )
    return () => {
      alive = false
    }
  }, [])
  const toggle = async () => {
    if (pending) return
    setPending(true)
    try {
      if (enabled) await disableMailPush()
      else await enableMailPush()
      setEnabled(!enabled)
      toast.success(enabled ? "系统通知已关闭" : "系统通知已开启")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "系统通知设置失败")
    } finally {
      setPending(false)
    }
  }
  return (
    <SettingRow title="系统通知" last>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void toggle()}
      >
        {pending ? "处理中" : enabled ? "关闭系统通知" : "开启系统通知"}
      </Button>
    </SettingRow>
  )
}
