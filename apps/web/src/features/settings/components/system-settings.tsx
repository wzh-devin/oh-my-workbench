import { useId } from "react"
import { RefreshCwIcon, SaveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/features/auth/auth-context"
import { useSystemSettings } from "../use-system-settings"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"

/** 管理员编辑普通系统配置；重试与提交保持在原有表单布局中。 */
function SystemSettingsForm() {
  const { setting, draft, status, pending, reload, update, save } =
    useSystemSettings()
  const id = useId()
  const loading = status === "loading" && !setting
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="flex flex-col gap-4"
      aria-busy={status === "loading" || pending}
    >
      <SettingsSection title="系统配置">
        <SettingGroup legend="系统配置">
          <SettingRow title="转换服务地址" labelFor={`${id}-converter`}>
            {loading ? (
              <Skeleton
                className="h-8 w-full"
                role="status"
                aria-label="正在读取转换服务地址"
              />
            ) : (
              <Input
                id={`${id}-converter`}
                type="url"
                placeholder="http://gateway:8080"
                value={draft.converterUrl}
                required
                maxLength={2048}
                disabled={status !== "ready" || pending}
                onChange={(event) => update("converterUrl", event.target.value)}
              />
            )}
          </SettingRow>
          <SettingRow title="推送联系地址" labelFor={`${id}-push`} last>
            {loading ? (
              <Skeleton
                className="h-8 w-full"
                role="status"
                aria-label="正在读取推送联系地址"
              />
            ) : (
              <Input
                id={`${id}-push`}
                placeholder="mailto:admin@example.com"
                value={draft.pushSubject}
                maxLength={2048}
                disabled={status !== "ready" || pending}
                onChange={(event) => update("pushSubject", event.target.value)}
              />
            )}
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={status === "loading" || pending}
          onClick={reload}
        >
          <RefreshCwIcon aria-hidden="true" />
          {status === "error" ? "重试" : "刷新"}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={status !== "ready" || pending}
        >
          <SaveIcon aria-hidden="true" />
          {pending ? "保存中" : "保存系统配置"}
        </Button>
      </div>
    </form>
  )
}

/** 权限判断在表单挂载前完成，普通用户不请求系统配置。 */
export function SystemSettings() {
  const { user } = useAuth()
  return user?.isAdmin ? <SystemSettingsForm /> : null
}
