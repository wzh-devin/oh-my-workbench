"use client"

import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "../auth-context"
import { AUTH_PROVIDERS } from "./data"
import {
  signInDefaultValues,
  signInSchema,
  type SignInValues,
} from "./sign-in-schema"

/** 用户名密码认证失败时保留输入，成功后的导航由共享会话状态驱动。 */
export function SignInForm({
  username = "",
  disabled = false,
}: {
  username?: string
  disabled?: boolean
}) {
  const auth = useAuth()
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: signInDefaultValues,
  })
  const { errors, isSubmitting } = form.formState
  const busy = disabled || isSubmitting
  useEffect(() => {
    form.setValue("username", username)
    if (username) form.setFocus("password")
  }, [username, form])

  /** 会话确认前不离开表单，避免服务失败时丢失重试入口。 */
  const signIn = async (values: SignInValues) => {
    form.clearErrors("root")
    try {
      await auth.login(values)
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "登录失败，请重试",
      })
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>登录</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          onSubmit={form.handleSubmit(signIn)}
          noValidate
          aria-busy={isSubmitting}
        >
          <FieldGroup>
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="auth-username">用户名</FieldLabel>
              <Input
                {...form.register("username")}
                id="auth-username"
                placeholder="请输入用户名"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                required
                disabled={busy}
                aria-invalid={!!errors.username}
                aria-describedby={
                  errors.username ? "auth-username-error" : undefined
                }
              />
              {errors.username && (
                <FieldError
                  id="auth-username-error"
                  errors={[errors.username]}
                />
              )}
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="auth-password">密码</FieldLabel>
              <Input
                {...form.register("password")}
                id="auth-password"
                placeholder="请输入密码"
                type="password"
                autoComplete="current-password"
                maxLength={24}
                required
                disabled={busy}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "auth-password-error" : undefined
                }
              />
              {errors.password && (
                <FieldError
                  id="auth-password-error"
                  errors={[errors.password]}
                />
              )}
            </Field>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {isSubmitting ? "正在登录…" : "登录"}
            </Button>
          </FieldGroup>
        </form>
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">或</span>
          <Separator className="flex-1" />
        </div>
        <div className="grid gap-2">
          {AUTH_PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              className="w-full"
              disabled
              title="暂不可用"
            >
              {provider.logo}
              {provider.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
