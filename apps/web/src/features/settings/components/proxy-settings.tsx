import { type FormEvent, useId, useState } from "react"
import { RefreshCwIcon } from "lucide-react"
import { HeaderActions } from "@/components/app-shell/header-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PROXY_SERVICES, type ProxyService } from "../proxy-settings"
import { useProxySettings } from "../use-proxy-settings"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import { SettingsSection } from "./sections/settings-section"

/** 按服务独立配置代理；编辑时不回填凭证，恢复直连需要显式操作。 */
export function ProxySettings() {
  const { proxies, status, pending, reload, save } = useProxySettings()
  const [editing, setEditing] = useState<ProxyService | null>(null)
  const [address, setAddress] = useState("")
  const id = useId()
  const target = proxies.find((proxy) => proxy.service === editing)
  const label = PROXY_SERVICES.find(
    (service) => service.value === editing
  )?.label

  /** 关闭编辑器即清除地址草稿，避免代理凭证留在页面状态。 */
  const close = () => {
    setEditing(null)
    setAddress("")
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (target && address.trim() && (await save(target, address))) close()
  }

  return (
    <>
      <HeaderActions>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={status === "error" ? "重试加载代理配置" : "刷新代理配置"}
          disabled={status === "loading" || pending}
          onClick={reload}
        >
          <RefreshCwIcon aria-hidden="true" />
        </Button>
      </HeaderActions>
      <div aria-busy={status === "loading"}>
        <SettingsSection title="网络代理设置">
          <SettingGroup legend="网络代理设置">
            {PROXY_SERVICES.map((service, index) => {
              const setting = proxies.find(
                (proxy) => proxy.service === service.value
              )
              return (
                <SettingRow
                  key={service.value}
                  title={service.label}
                  last={index === PROXY_SERVICES.length - 1}
                >
                  <div className="flex w-full min-w-0 items-center gap-2">
                    {!setting ? (
                      status === "loading" ? (
                        <Skeleton
                          className="h-7 w-full"
                          aria-label={`正在读取${service.label}代理`}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )
                    ) : (
                      <>
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                          title={setting.address || "直连"}
                        >
                          {setting.address || "直连"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`配置${service.label}代理`}
                          disabled={status !== "ready" || pending}
                          onClick={() => {
                            setAddress("")
                            setEditing(service.value)
                          }}
                        >
                          配置
                        </Button>
                      </>
                    )}
                  </div>
                </SettingRow>
              )
            })}
          </SettingGroup>
        </SettingsSection>
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) close()
        }}
      >
        <DialogContent aria-describedby={undefined} showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{label}代理</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={id}>代理地址</FieldLabel>
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                placeholder="socks5h://127.0.0.1:7890"
                value={address}
                maxLength={2048}
                disabled={pending}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
            <DialogFooter>
              {target?.configured && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || status !== "ready"}
                  onClick={async () => {
                    if (await save(target, "")) close()
                  }}
                >
                  恢复直连
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={close}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={pending || status !== "ready" || !address.trim()}
              >
                {pending ? "保存中" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
