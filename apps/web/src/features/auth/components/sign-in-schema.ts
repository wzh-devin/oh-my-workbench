import * as z from "zod"

export const signInSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "请输入用户名")
    .max(64, "用户名不能超过 64 个字符"),
  password: z
    .string()
    .min(6, "密码至少需要 6 个字符")
    .max(24, "密码不能超过 24 个字符"),
})

export const initializeSchema = signInSchema
  .extend({
    confirmPassword: z.string().min(1, "请再次输入密码"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  })

export type SignInValues = z.infer<typeof signInSchema>
export type InitializeValues = z.infer<typeof initializeSchema>
export const signInDefaultValues: SignInValues = { username: "", password: "" }
