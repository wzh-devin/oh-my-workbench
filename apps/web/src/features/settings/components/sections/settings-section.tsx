import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"

export function SettingsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col">
      <Card size="sm">
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
