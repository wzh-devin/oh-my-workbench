import { useNavigate } from "react-router"
import {
  LogOutIcon,
  PaletteIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useSidebar } from "@/components/ui/sidebar"
import { loadWorkbench, useWorkbench } from "@/features/workbench/store"

export function NavUser() {
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const { data, status } = useWorkbench()
  const profile = data.profile
  const initials = Array.from(profile.name).slice(0, 2).join("").toUpperCase()
  function go(href: string) {
    if (isMobile) setOpenMobile(false)
    navigate(href)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="打开用户菜单"
            className="mx-auto"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>
            <UserRoundIcon className="size-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-60 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex min-w-0 items-center gap-2">
            <Avatar>
              <AvatarFallback>
                {status === "ready" ? (
                  initials
                ) : (
                  <UserRoundIcon className="size-4" aria-hidden="true" />
                )}
              </AvatarFallback>
            </Avatar>
            {status === "loading" ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {status === "ready" ? profile.name : "个人账户"}
                </span>
                {status === "ready" && profile.email && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {profile.email}
                  </span>
                )}
              </div>
            )}
          </DropdownMenuLabel>
          {status === "error" && (
            <DropdownMenuItem onClick={loadWorkbench}>
              <RefreshCwIcon aria-hidden="true" />
              重新读取资料
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => go("/settings/profile")}>
            <UserRoundIcon aria-hidden="true" />
            个人资料
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/settings/security")}>
            <ShieldCheckIcon aria-hidden="true" />
            账号安全
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/settings/general")}>
            <SettingsIcon aria-hidden="true" />
            设置
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            closeOnClick={false}
            className="cursor-default focus:bg-transparent!"
          >
            <PaletteIcon aria-hidden="true" />
            主题
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (isMobile) setOpenMobile(false)
            navigate("/login", { replace: true })
          }}
        >
          <LogOutIcon aria-hidden="true" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
