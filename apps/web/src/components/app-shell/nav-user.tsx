import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
  LogOutIcon,
  HistoryIcon,
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
import { useAuth } from "@/features/auth/auth-context"
import { SEED_WORKBENCH } from "@/features/workbench/model"
import { loadWorkbench, useWorkbench } from "@/features/workbench/store"
import { APP_CHANGELOG } from "@/lib/release-notes"
import { ChangelogDialog } from "./changelog-dialog"

/** 用户菜单使用真实会话身份，退出失败时保留当前页面并允许重试。 */
export function NavUser() {
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const { user, logout } = useAuth()
  const { data, status } = useWorkbench()
  const [loggingOut, setLoggingOut] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const profile = {
    name:
      data.profile.name === SEED_WORKBENCH.profile.name
        ? user?.displayName || user?.username || data.profile.name
        : data.profile.name,
    email: data.profile.email || user?.email || user?.username,
  }
  const initials = Array.from(profile.name).slice(0, 2).join("").toUpperCase()
  function go(href: string) {
    if (isMobile) setOpenMobile(false)
    navigate(href)
  }
  /** 撤销失败时保留当前会话，避免界面误显示已退出。 */
  const signOut = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logout()
      if (isMobile) setOpenMobile(false)
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出失败，请重试")
    } finally {
      setLoggingOut(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={menuTrigger}
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
            <DropdownMenuItem onClick={() => setChangelogOpen(true)}>
              <HistoryIcon aria-hidden="true" />
              更新日志
              <span className="ml-auto text-xs text-muted-foreground">
                {APP_CHANGELOG.version}
              </span>
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
            disabled={loggingOut}
            onClick={() => {
              void signOut()
            }}
          >
            <LogOutIcon aria-hidden="true" />
            {loggingOut ? "正在退出…" : "退出登录"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangelogDialog
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
        returnFocus={menuTrigger}
      />
    </>
  )
}
