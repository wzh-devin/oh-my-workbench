import type { ReactNode } from "react"

export function SettingsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col">
      {children}
    </section>
  )
}
