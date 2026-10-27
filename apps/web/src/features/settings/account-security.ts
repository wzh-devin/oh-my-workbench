import { z } from "zod"

const codeSchema = z.string().regex(/^\d{6}$/, "请输入 6 位验证码")
const password = z.string().min(1, "请输入当前密码").max(256)
export const securityFormSchemas = {
  email: z.object({
    email: z.string().trim().pipe(z.email("请输入有效的邮箱地址")),
    password: password.optional(),
  }),
  "verify-email": z.object({ code: codeSchema }),
  password: z
    .object({
      currentPassword: password.optional(),
      newPassword: z.string().min(1, "请输入新密码").max(256),
      confirmPassword: z.string(),
    })
    .refine(
      (value) => value.newPassword === value.confirmPassword,
      "两次密码不一致"
    )
    .transform(({ currentPassword, newPassword }) => ({
      currentPassword,
      newPassword,
    })),
  "disable-mfa": z.object({ password: password.optional(), code: codeSchema }),
}
export type SecurityAction = keyof typeof securityFormSchemas
const accountSecuritySchema = z
  .object({
    email: z.email().nullable(),
    emailVerified: z.boolean(),
    passwordSet: z.boolean(),
    mfaEnabled: z.boolean(),
  })
  .refine((account) => !account.emailVerified || !!account.email)
export type AccountSecurity = z.infer<typeof accountSecuritySchema>
const mfaSetupSchema = z.object({
  secret: z.string().min(1).max(128),
  qrCode: z
    .string()
    .max(200000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
})
export type MfaSetup = z.infer<typeof mfaSetupSchema>
const recoveryCodesSchema = z.object({
  recoveryCodes: z.array(z.string().min(1).max(100)).min(1).max(20),
})

/** 认证状态只认服务端响应，密码、验证码及 MFA 密钥不进入工作台存储。 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/account/security${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error("连接账号安全服务失败，请重试", { cause: error })
  }
  if (response.status === 404 || response.status === 501)
    throw new Error("账号安全服务暂不可用，请稍后重试")
  if (response.status === 401) throw new Error("请先登录后再试")
  const payload: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => null)
  if (!response.ok) {
    const failure = z
      .object({ error: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new Error(failure.success ? failure.data.error : "操作失败，请重试")
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new Error("安全信息格式不正确，请重试")
  return parsed.data
}

const ACTION_PATHS: Record<SecurityAction, string> = {
  email: "/email",
  "verify-email": "/email/verify",
  password: "/password",
  "disable-mfa": "/mfa/disable",
}
export const accountSecurityApi = {
  get: (signal?: AbortSignal) =>
    request("", accountSecuritySchema, undefined, signal),
  sendEmailCode: () => request("/email/code", z.void(), {}),
  submit: async (action: SecurityAction, values: Record<string, string>) => {
    const parsed = securityFormSchemas[action].safeParse(values)
    if (!parsed.success)
      throw new Error(parsed.error.issues[0]?.message ?? "请检查输入内容")
    await request(ACTION_PATHS[action], z.void(), parsed.data)
  },
  setupMfa: (signal?: AbortSignal) =>
    request("/mfa/setup", mfaSetupSchema, {}, signal),
  enableMfa: async (code: string) => {
    const parsed = codeSchema.safeParse(code)
    if (!parsed.success) throw new Error("请输入 6 位验证码")
    return request("/mfa/enable", recoveryCodesSchema, { code: parsed.data })
  },
}
