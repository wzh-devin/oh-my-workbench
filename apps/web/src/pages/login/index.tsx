import { Auth } from "@/features/auth/components/auth"

// Sign in: it sits outside the (app) group, so the app shell does not mount
// around it.
export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <title>Sign In · Flowly</title>
      <Auth />
    </div>
  )
}
