import { Link } from "react-router"

import { buttonVariants } from "@/components/ui/button"

// Unmatched routes render outside the workspace shell.
// Kept plain on purpose: a template replaces it with a screen in its own voice.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <title>Page not found · Flowly</title>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Page not found
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          The page you were looking for does not exist or has moved.
        </p>
      </div>
      {/* A link that looks like a button: it navigates, so it stays an <a>
          and takes only the button's classes. */}
      <Link to="/dashboard" className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </main>
  )
}
