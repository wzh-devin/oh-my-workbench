import { z } from "zod"

export const PROXY_SERVICES = [
  { value: "qq", label: "QQ 邮箱" },
  { value: "gmail", label: "Gmail" },
  { value: "push", label: "系统通知" },
  { value: "storage", label: "对象存储" },
  { value: "converter", label: "文件转换" },
] as const

const proxySettingSchema = z.object({
  service: z.enum(["qq", "gmail", "push", "storage", "converter"]),
  configured: z.boolean(),
  address: z.string().max(2048),
  version: z.number().int().nonnegative(),
})
export type ProxySetting = z.infer<typeof proxySettingSchema>
export type ProxyService = ProxySetting["service"]

export class ProxySettingsError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/** 代理凭证只提交给已登录的 API，不进入本地存储或响应模型。 */
const request = async <T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: { proxyUrl: string; version: number }
): Promise<T> => {
  const response = await fetch(`/api/settings/proxies${path}`, {
    method: body ? "PUT" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new ProxySettingsError(
      failure.success ? failure.data.message : "代理设置暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("代理设置响应无效，请重试")
  return parsed.data.data
}

export const proxySettingsApi = {
  get: (signal: AbortSignal) =>
    request(
      "",
      z
        .array(proxySettingSchema)
        .length(5)
        .refine(
          (proxies) => new Set(proxies.map((proxy) => proxy.service)).size === 5
        ),
      signal
    ),
  save: (setting: ProxySetting, proxyUrl: string, signal: AbortSignal) =>
    request(`/${setting.service}`, proxySettingSchema, signal, {
      proxyUrl,
      version: setting.version,
    }),
}
