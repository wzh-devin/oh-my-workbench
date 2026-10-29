import { z } from "zod"

const userSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  username: z.string().min(1),
  email: z.string(),
  displayName: z.string(),
  isAdmin: z.boolean(),
})
export type AuthUser = z.infer<typeof userSchema>
export type Credentials = { username: string; password: string }

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = "AuthError"
  }
}

/** 在认证边界校验服务端信封；凭证只随当前请求发送。 */
const request = async <T>(
  path: string,
  schema: z.ZodType<T>,
  body?: Credentials | Record<string, never>,
  signal?: AbortSignal
): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`/api/auth/${path}`, {
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
    throw new Error("连接认证服务失败，请重试", { cause: error })
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = z
      .object({ message: z.string().min(1).max(200) })
      .safeParse(payload)
    throw new AuthError(
      error.success ? error.data.message : "认证服务暂不可用，请重试",
      response.status
    )
  }
  const parsed = z
    .object({ code: z.literal(0), data: schema })
    .safeParse(payload)
  if (!parsed.success) throw new Error("认证响应格式错误，请重试")
  return parsed.data.data
}

export const authApi = {
  status: (signal?: AbortSignal) =>
    request(
      "status",
      z.object({ initialized: z.boolean() }),
      undefined,
      signal
    ),
  initialize: (values: Credentials) =>
    request("initSystemAdmin", z.null(), values),
  login: (values: Credentials) =>
    request("login", z.object({ user: userSchema }), values),
  me: (signal?: AbortSignal) =>
    request(
      "me",
      z.object({ user: userSchema, expiresAt: z.number().int().positive() }),
      undefined,
      signal
    ),
  logout: () => request("logout", z.null(), {}),
}

/** 只恢复应用内路径，防止登录后的开放重定向和登录页循环。 */
export const loginDestination = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/dashboard"
  try {
    const destination = new URL(value, window.location.origin)
    if (
      destination.origin !== window.location.origin ||
      /^\/login(?:\/|$)/.test(destination.pathname)
    )
      return "/dashboard"
    return destination.pathname + destination.search + destination.hash
  } catch {
    return "/dashboard"
  }
}
