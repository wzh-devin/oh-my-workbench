import { MotionConfig } from "motion/react"
import { Outlet } from "react-router"

import { TopProgressBar } from "@/components/navigation/top-progress-bar"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { TodoSession } from "@/features/todos/session"
import { MailSession } from "@/features/mail/session"
import { disableMailPush } from "@/features/mail/push"
import { AuthProvider } from "@/features/auth/auth-context"
import { Toaster } from "@/components/ui/sonner"

export function AppProviders() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <TopProgressBar />
        <AuthProvider onBeforeLogout={disableMailPush}>
          <TodoSession />
          <MailSession />
          <Outlet />
        </AuthProvider>
        <Toaster
          position="top-center"
          offset={{ top: 66 }}
          mobileOffset={{ top: 58 }}
          toastOptions={{
            classNames: {
              toast: "items-center! gap-2! px-3! py-2!",
              icon: "ms-0! me-0!",
              title: "text-sm! leading-snug! font-medium!",
              description: "text-xs! leading-snug!",
            },
          }}
        />
      </MotionConfig>
    </ThemeProvider>
  )
}
