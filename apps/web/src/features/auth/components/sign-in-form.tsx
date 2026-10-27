"use client"

import { useNavigate } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

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

import { AUTH_PROVIDERS, SIGNED_IN_HREF } from "./data"
import {
  signInDefaultValues,
  signInSchema,
  type SignInValues,
} from "./sign-in-schema"

export function SignInForm() {
  const navigate = useNavigate()
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: signInDefaultValues,
  })
  const { errors, isSubmitting } = form.formState

  function signIn() {
    // shortcut: 保留现有前端跳转；接入认证后端时替换为密码验证及 Google/GitHub OAuth。
    navigate(SIGNED_IN_HREF, { replace: true })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>登录</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={form.handleSubmit(signIn)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="auth-email">邮箱</FieldLabel>
              <Input
                {...form.register("email")}
                id="auth-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                required
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "auth-email-error" : undefined}
              />
              {errors.email && (
                <FieldError id="auth-email-error" errors={[errors.email]} />
              )}
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="auth-password">密码</FieldLabel>
              <Input
                {...form.register("password")}
                id="auth-password"
                type="password"
                autoComplete="current-password"
                required
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
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              登录
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
              disabled={isSubmitting}
              onClick={signIn}
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
