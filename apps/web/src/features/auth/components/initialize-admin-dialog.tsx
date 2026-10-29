import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authApi, AuthError } from "../auth-api"
import { initializeSchema, type InitializeValues } from "./sign-in-schema"

/** 首次部署完成管理员配置；成功后销毁密码表单并交回登录流程。 */
export function InitializeAdminDialog({
  onInitialized,
}: {
  onInitialized: (username: string) => void
}) {
  const form = useForm<InitializeValues>({
    resolver: zodResolver(initializeSchema),
    defaultValues: { username: "", password: "", confirmPassword: "" },
  })
  const { errors, isSubmitting } = form.formState

  /** 其他浏览器可能先完成初始化，冲突时以重新查询的系统状态为准。 */
  const initialize = async (values: InitializeValues) => {
    form.clearErrors("root")
    try {
      await authApi.initialize({
        username: values.username,
        password: values.password,
      })
      form.reset()
      onInitialized(values.username)
    } catch (error) {
      if (error instanceof AuthError && error.status === 409) {
        const status = await authApi.status().catch(() => null)
        if (status?.initialized) {
          form.reset()
          onInitialized("")
          return
        }
      }
      form.setError("root", {
        message: error instanceof Error ? error.message : "初始化失败，请重试",
      })
    }
  }

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_, details) => details.cancel()}
    >
      <DialogContent showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>初始化管理员</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(initialize)}
          noValidate
          aria-busy={isSubmitting}
        >
          <FieldGroup>
            {(
              [
                ["username", "用户名", "text", "username"],
                ["password", "密码", "password", "new-password"],
                ["confirmPassword", "确认密码", "password", "new-password"],
              ] as const
            ).map(([name, label, type, autoComplete]) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={`init-${name}`}>{label}</FieldLabel>
                <Input
                  {...form.register(name)}
                  id={`init-${name}`}
                  type={type}
                  placeholder={
                    name === "username"
                      ? "请输入管理员用户名"
                      : name === "password"
                        ? "请输入 6–24 个字符的密码"
                        : "请再次输入密码"
                  }
                  autoComplete={autoComplete}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={name === "username" ? 64 : 24}
                  required
                  disabled={isSubmitting}
                  aria-invalid={!!errors[name]}
                  aria-describedby={
                    errors[name] ? `init-${name}-error` : undefined
                  }
                />
                {errors[name] && (
                  <FieldError
                    id={`init-${name}-error`}
                    errors={[errors[name]]}
                  />
                )}
              </Field>
            ))}
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "正在配置…" : errors.root ? "重试" : "创建管理员"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
