import { z } from "zod"

const systemSettingsSchema = z
  .object({
    converterUrl: z.string().min(1).max(2048),
    pushSubject: z.string().max(2048),
    version: z.number().int().positive(),
  })
  .strict()

export type SystemSetting = z.infer<typeof systemSettingsSchema>
export type SystemSettingDraft = Pick<
  SystemSetting,
  "converterUrl" | "pushSubject"
>

export class SystemSettingsError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/** 系统设置只传输普通字段；密钥不进入前端模型或本地存储。 */
const request = async (
  signal: AbortSignal,
  values?: SystemSetting
): Promise<SystemSetting> => {
  const response = await fetch("/api/settings/system", {
    method: values ? "PUT" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(values && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(systemSettingsSchema.parse(values)),
    }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new SystemSettingsError(
      failure.success ? failure.data.message : "系统配置暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: systemSettingsSchema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("系统配置响应无效，请重试")
  return parsed.data.data
}

export const systemSettingsApi = {
  get: (signal: AbortSignal) => request(signal),
  save: (values: SystemSetting, signal: AbortSignal) => request(signal, values),
}
