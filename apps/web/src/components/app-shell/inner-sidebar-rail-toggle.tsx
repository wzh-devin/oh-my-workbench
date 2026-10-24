"use client"

import { cn } from "cn"

import { useInnerSidebar } from "./inner-sidebar"

// ── Inner Sidebar Rail Toggle ──

export function InnerSidebarRailToggle({ absent }: { absent?: boolean }) {
  const { isOpen, toggle } = useInnerSidebar()

  // A section without a panel has nothing to collapse or expand.
  if (absent) return null

  return (
    <button
      type="button"
      aria-label={isOpen ? "Collapse inner sidebar" : "Expand inner sidebar"}
      onClick={toggle}
      className={cn(
        "group/rail fixed z-30 hidden h-12 w-7 cursor-pointer items-center pl-2 outline-none lg:flex",
        "top-1/2 -translate-y-1/2",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "focus-visible:rounded-sm",
        "transition-[left] duration-200 ease-linear motion-reduce:transition-none"
      )}
      style={{
        left: isOpen
          ? "calc(var(--sidebar-width-inner) + var(--sidebar-width))"
          : "var(--sidebar-width)",
      }}
    >
      <span className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "block h-2 w-0.5 bg-foreground/40",
            "rounded-t-full",
            "origin-bottom transition-all duration-100 ease-linear",
            isOpen
              ? "group-hover/rail:rotate-40 group-hover/rail:bg-foreground/60"
              : "group-hover/rail:-rotate-40 group-hover/rail:bg-foreground/60"
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "block h-2 w-0.5 bg-foreground/40",
            "rounded-b-full",
            "origin-top transition-all duration-100 ease-linear",
            isOpen
              ? "group-hover/rail:-rotate-40 group-hover/rail:bg-foreground/60"
              : "group-hover/rail:rotate-40 group-hover/rail:bg-foreground/60"
          )}
        />
      </span>

      <span
        className={cn(
          "absolute left-full -ml-2 border border-border bg-foreground px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-background shadow-xs shadow-black/5",
          "rounded-md",
          "pointer-events-none -translate-x-0.5 opacity-0 transition-all duration-200 ease-out",
          "group-hover/rail:translate-x-0 group-hover/rail:opacity-100"
        )}
      >
        {isOpen ? "Collapse" : "Expand"}
      </span>
    </button>
  )
}
