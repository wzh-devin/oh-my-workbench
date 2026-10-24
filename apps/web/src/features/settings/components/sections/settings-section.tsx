"use client"

import { type ReactNode } from "react"
import { cn } from "cn"

import { Card, CardContent } from "@/components/ui/card"

// The profile-2 block's section, without its visible heading: the cards
// speak for themselves here, so the title only names the region for
// assistive tech.

interface SettingsSectionProps {
  title: string
  children: ReactNode
  className?: string
  surface?: "card" | "unstyled"
}

export function SettingsSection({
  title,
  children,
  className,
  surface = "card",
}: SettingsSectionProps) {
  return (
    <section aria-label={title} className={cn("flex flex-col", className)}>
      {surface === "card" ? (
        <Card className="gap-0 p-0">
          <CardContent className="p-0">{children}</CardContent>
        </Card>
      ) : (
        children
      )}
    </section>
  )
}

export function SettingsSectionStack({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>
}
