"use client"

import { useState } from "react"
import { useNavigate } from "react-router"
import { Badge } from "@/components/reui/badge"
import {
  CircleCheckIcon,
  CreditCardIcon,
  LogOutIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ThemeToggle } from "@/components/theme/theme-toggle"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"

import { USER } from "./data"

const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
)

// ── Nav User ──
// The account menu at the foot of the rail: the signed-in member, links to
// their own settings, the theme and sign out.

export function NavUser() {
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const [signOutOpen, setSignOutOpen] = useState(false)

  // The menu holds no links of its own (the CLI-owned menu has no link
  // item), so its rows route. On a phone the drawer goes with the menu.
  function go(href: string) {
    if (isMobile) setOpenMobile(false)
    navigate(href)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open account menu for ${USER.name}`}
              className="mx-auto aria-expanded:not-hover:bg-transparent"
            />
          }
        >
          <Avatar className="size-6 rounded-md">
            <AvatarImage keepMounted src={USER.avatar} alt={USER.name} />
            {/* The kept image holds the box while it loads or after it fails,
              so the fallback lies over it instead of beside it. */}
            <AvatarFallback
              delay={600}
              className="absolute inset-0 bg-primary text-[10px] font-semibold text-primary-foreground"
            >
              {USER.initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        {/* Content */}
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={8}
          className="w-60"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
              <Avatar className="size-8 rounded-md">
                <AvatarImage keepMounted src={USER.avatar} alt={USER.name} />
                <AvatarFallback
                  delay={600}
                  className="absolute inset-0 bg-primary text-xs font-semibold text-primary-foreground"
                >
                  {USER.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {USER.name}
                </span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {USER.email}
                </span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => go("/settings/profile")}>
              <UserIcon aria-hidden="true" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/security")}>
              <ShieldCheckIcon aria-hidden="true" />
              Account Security
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/billing")}>
              <CreditCardIcon aria-hidden="true" />
              Billing
              <Badge variant="primary-light" size="xs" className="ml-auto">
                Pro
              </Badge>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            {/* The swatches set a value in place, so the menu outlives the click. */}
            <DropdownMenuItem
              closeOnClick={false}
              className="cursor-default focus:bg-transparent!"
            >
              <PaletteIcon aria-hidden="true" />
              Theme
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOutIcon aria-hidden="true" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu, which closes as the dialog opens. */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out?</AlertDialogTitle>
            <AlertDialogDescription>
              Runs and agents keep working while you are away. Sign in again to
              pick up where you left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setSignOutOpen(false)
                // No real session to end: signing out returns to /login.
                navigate("/login")
                toast.success("Signed out", {
                  icon: TOAST_SUCCESS_ICON,
                  description: `${USER.email} is signed out on this device.`,
                  closeButton: true,
                })
              }}
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
