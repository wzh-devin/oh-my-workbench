import type { ReactNode } from "react"
import { cn } from "cn"

import { Item } from "@/components/ui/item"

export function ProfileIconContainer({
  children,
  className,
  compact = false,
}: {
  children: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <Item
      className={cn(
        "flex shrink-0 items-center justify-center border-2 border-background bg-muted p-0 text-accent-foreground shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-4",
        compact ? "size-7" : "size-10.5",
        className
      )}
    >
      {children}
    </Item>
  )
}
