import { Button } from "@/components/ui/button"

import { AuthLogo } from "./auth-logo"

export function AuthHeader({
  onCreateWorkspace,
}: {
  onCreateWorkspace: () => void
}) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6 lg:px-10">
      <AuthLogo />

      {/* Actions */}
      <div className="flex items-center gap-2 text-sm">
        <span className="hidden text-muted-foreground sm:inline">
          Not on Flowly yet?
        </span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={onCreateWorkspace}
        >
          Create a workspace
        </Button>
      </div>
    </header>
  )
}
