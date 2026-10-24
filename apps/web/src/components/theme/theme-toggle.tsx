"use client"

// The catalog's standard theme control: a three-way segmented radio group over
// the shadcn Button primitive. Light, dark and system are all reachable in one
// click, and "system" stays selectable, which a two-state switch cannot express.
//
// Mount it wherever the template's chrome puts it. It reads and writes
// next-themes directly, so it needs no props and no wiring.

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useMounted } from "@/hooks/use-mounted"
import { cn } from "@/lib/utils"

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  // `theme` is undefined until next-themes has read localStorage, which happens
  // after hydration. Rendering "system" until then keeps the server HTML and
  // the first client render identical; the real value lands one tick later.
  const current = mounted ? (theme ?? "system") : "system"

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5"
    >
      {THEMES.map(({ value, label, Icon }) => {
        const active = current === value

        return (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="icon-xs"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "rounded-full",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </Button>
        )
      })}
    </div>
  )
}
