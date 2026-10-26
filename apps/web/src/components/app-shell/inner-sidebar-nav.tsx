import { useId, type ComponentProps, type ReactNode } from "react"
import { Link } from "react-router"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { type InnerNavItem, type InnerNavSection } from "./data"

// ── Inner Nav Button ──
// Also the row of a panel a page fills itself (the Workflow Editor's step
// library), so that panel reads as the shell's own: `children` trail the
// label, and any other Button prop passes through.

type InnerNavButtonProps = {
  item: Pick<InnerNavItem, "label" | "icon" | "badge">
  isActive?: boolean
} & Omit<ComponentProps<typeof Button>, "variant" | "size">

export function innerNavRowClassName(
  isActive: boolean,
  className?: Parameters<typeof cn>[number]
) {
  return cn(
    "w-full justify-start gap-2.5 text-[0.8rem] font-normal [&_svg:not([class*='size-'])]:size-4",
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:text-foreground",
    className
  )
}

export function InnerNavLabel({
  item,
  truncate = true,
}: {
  item: Pick<InnerNavItem, "label" | "icon" | "badge">
  truncate?: boolean
}) {
  return (
    <>
      <span className="size-4 shrink-0 opacity-70 [&_svg]:size-4">
        {item.icon}
      </span>
      <span
        className={truncate ? "truncate" : "whitespace-nowrap"}
        title={item.label}
      >
        {item.label}
      </span>
      {item.badge !== undefined && item.badge > 0 && (
        <Badge variant="outline" size="sm" className="ml-auto font-normal">
          {item.badge}
        </Badge>
      )}
    </>
  )
}

export function InnerNavButton({
  item,
  isActive = false,
  className,
  children,
  ...props
}: InnerNavButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-current={isActive ? "true" : undefined}
      className={innerNavRowClassName(isActive, className)}
      {...props}
    >
      <InnerNavLabel item={item} />
      {children}
    </Button>
  )
}

// ── Inner Nav Link ──
// The same row for an item with a route of its own. A real link, styled as
// the button: Base UI's Button must not render an <a>.

function InnerNavLink({
  item,
  href,
  isActive,
}: {
  item: InnerNavItem
  href: string
  isActive: boolean
}) {
  return (
    <Link
      to={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        innerNavRowClassName(isActive)
      )}
    >
      <InnerNavLabel item={item} />
    </Link>
  )
}

// ── Inner Nav Group ──
// A titled run of rows. Every group after the first is ruled off, by a
// separator that sits between the groups and not inside the second.

export function InnerNavGroup({
  title,
  separated,
  children,
}: {
  title: string
  separated: boolean
  children: ReactNode
}) {
  const titleId = useId()

  return (
    <>
      {separated && <Separator className="my-2" />}
      <div role="group" aria-labelledby={titleId}>
        <p
          id={titleId}
          className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground"
        >
          {title}
        </p>
        <div className="flex flex-col gap-0.5 px-2">{children}</div>
      </div>
    </>
  )
}

// ── Inner Nav List (Sectioned) ──

export function InnerSidebarNav({
  sections,
  activeItem,
  onItemChange,
}: {
  sections: InnerNavSection[]
  activeItem: string
  onItemChange: (id: string) => void
}) {
  return (
    <nav className="flex flex-col py-1">
      {sections.map((section, sectionIdx) => (
        <InnerNavGroup
          key={section.id}
          title={section.title}
          separated={sectionIdx > 0}
        >
          {section.items.map((item) =>
            item.href ? (
              <InnerNavLink
                key={item.id}
                item={item}
                href={item.href}
                isActive={activeItem === item.id}
              />
            ) : (
              <InnerNavButton
                key={item.id}
                item={item}
                isActive={activeItem === item.id}
                onClick={() => onItemChange(item.id)}
              />
            )
          )}
        </InnerNavGroup>
      ))}
    </nav>
  )
}
