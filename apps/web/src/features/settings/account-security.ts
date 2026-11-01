import { z } from "zod"

const password = z
  .string()
  .min(6, "密码至少需要 6 个字符")
  .max(24, "密码不能超过 24 个字符")
export const changePasswordSchema = z
  .object({
    currentPassword: password,
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  })
  .transform(({ currentPassword, newPassword }) => ({
    currentPassword,
    newPassword,
  }))

const accountSecuritySchema = z.object({ passwordSet: z.boolean() })
export type AccountSecurity = z.infer<typeof accountSecuritySchema>

/** 与认证接口使用同一响应信封；密码只随当前请求发送。 */
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
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new Error(
      response.status === 401
        ? "请先登录后再试"
        : failure.success
          ? failure.data.message
          : "账号安全服务暂不可用，请重试"
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("安全信息格式不正确，请重试")
  return parsed.data.data
}

export const accountSecurityApi = {
  get: (signal?: AbortSignal) =>
    request("", accountSecuritySchema, undefined, signal),
  changePassword: async (values: Record<string, string>) => {
    const parsed = changePasswordSchema.safeParse(values)
    if (!parsed.success)
      throw new Error(parsed.error.issues[0]?.message ?? "请检查输入内容")
    await request(
      "/password",
      z.object({ token: z.string().min(1) }),
      parsed.data
    )
  },
}
