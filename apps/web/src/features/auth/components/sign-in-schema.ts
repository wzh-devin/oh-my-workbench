import * as z from "zod"

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "请输入邮箱")
    .max(254, "邮箱地址不能超过 254 个字符")
    .pipe(z.email("请输入有效的邮箱地址")),
  password: z.string().min(1, "请输入密码"),
})

export type SignInValues = z.infer<typeof signInSchema>

export const signInDefaultValues: SignInValues = { email: "", password: "" }
