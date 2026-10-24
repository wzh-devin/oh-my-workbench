"use client"

import { useState } from "react"

import { AuthFooter } from "./auth-footer"
import { AuthHeader } from "./auth-header"
import { CreateWorkspaceSheet } from "./create-workspace-sheet"
import { type LegalDoc } from "./data"
import { LegalSheet } from "./legal-sheet"
import { SignInForm } from "./sign-in-form"

export function Auth() {
  const [createOpen, setCreateOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)

  return (
    <div className="flex min-h-svh w-full flex-col">
      {/* Header */}
      <AuthHeader onCreateWorkspace={() => setCreateOpen(true)} />

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 sm:py-12">
        <SignInForm onOpenLegal={setLegalDoc} />
      </main>

      {/* Footer */}
      <AuthFooter />

      <CreateWorkspaceSheet open={createOpen} onOpenChange={setCreateOpen} />
      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  )
}
