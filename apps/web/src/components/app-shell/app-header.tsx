"use client"

import { Suspense } from "react"
import { Link } from "react-router"
import { useLocation, useSearchParams } from "react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Logo } from "@/components/shared/logo"
import { NAV_ITEMS, type InnerNavItem, type NavItem } from "./data"
import { HeaderActionsSlot } from "./header-actions"
import { readRecordParams, RECORD_LISTS } from "./record-link"
import { RocketIcon } from "lucide-react"

// ── Page Breadcrumb ──
// A Breadcrumb of route links, built from the route: the section's name
// alone (the rail already shows where it sits, so a crumb back to the first
// section only repeated it), and section › page where the section panel's
// items are routes of their own (Settings › General).

function PageBreadcrumb({
  section,
  page,
}: {
  section: NavItem | undefined
  page: InnerNavItem | undefined
}) {
  const home = NAV_ITEMS[0]

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {section && page ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={section.href} />}>
                {section.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{page.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">
              {(section ?? home).label}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// An editor opened on one record (from Workflows or Agents) names it: the list
// it came from, then the record. The plain trail is the fallback.
function RecordBreadcrumb({
  section,
  page,
}: {
  section: NavItem | undefined
  page: InnerNavItem | undefined
}) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const record = readRecordParams(pathname, params)

  if (!record) return <PageBreadcrumb section={section} page={page} />

  const list = RECORD_LISTS[record.kind]

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={list.list} />}>
            {list.label}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{record.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// ── App Header ──

interface AppHeaderProps {
  /** The active section, from the route */
  section: NavItem | undefined
  /** The section panel's item the route opens, where items are routes */
  page?: InnerNavItem
}

export function AppHeader({ section, page }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full items-center gap-2 border-b border-border bg-background ps-3 pe-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
        {/* Mobile sidebar trigger, at the header's one button size. */}
        <SidebarTrigger size="icon" className="md:hidden" />
        {/* Below md the rail's logo lives here, not in the drawer. The
              trigger's 16px icon sits in a 32px button, so -ml-2 takes back
              its 8px of padding: 8px of air on both sides of the logo. */}
        <span className="-ml-2 shrink-0 md:hidden">
          <Logo />
        </span>

        <Suspense fallback={<PageBreadcrumb section={section} page={page} />}>
          <RecordBreadcrumb section={section} page={page} />
        </Suspense>
      </div>

      {/* Right actions: Publish, or the page's own actions where its section
          owns them (pageActions in NAV_ITEMS). */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {section?.pageActions ? (
          <HeaderActionsSlot />
        ) : (
          <Button variant="default">
            <RocketIcon aria-hidden="true" />
            {/* sr-only, not hidden: the button keeps its accessible name
                while giving the trail its pixels back on a phone */}
            <span className="sr-only sm:not-sr-only">Publish</span>
          </Button>
        )}
      </div>
    </header>
  )
}
