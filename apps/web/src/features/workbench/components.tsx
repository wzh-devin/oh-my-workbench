import { useId, type ReactNode } from "react"
import { InboxIcon, RefreshCwIcon } from "lucide-react"

import { HeaderActions } from "@/components/app-shell/header-actions"
import type { InnerNavSection } from "@/components/app-shell/data"
import { InnerPanel } from "@/components/app-shell/inner-panel"
import { InnerSidebarNav } from "@/components/app-shell/inner-sidebar-nav"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSidebar } from "@/components/ui/sidebar"
import { type ConnectionStatus } from "./model"
import { loadWorkbench, useWorkbench } from "./store"

/** 将分类数据放入现有 AppShell 导航，复用编辑器侧栏的分组与选中样式。 */
export function WorkbenchNavigation({
  title,
  sections,
  activeItem,
  onItemChange,
}: {
  title: string
  sections: InnerNavSection[]
  activeItem: string
  onItemChange: (id: string) => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <InnerPanel>
      <div className="shrink-0 border-b border-border p-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="max-h-full min-h-0 grow">
        <ScrollArea className="scroll-fade-y h-full grow">
          <InnerSidebarNav
            sections={sections}
            activeItem={activeItem}
            onItemChange={(id) => {
              onItemChange(id)
              if (isMobile) setOpenMobile(false)
            }}
          />
        </ScrollArea>
      </div>
    </InnerPanel>
  )
}

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <Badge
      variant={
        status === "connected"
          ? "success-light"
          : status === "error"
            ? "destructive-light"
            : "secondary"
      }
    >
      {status === "connected" ? "正常" : status === "error" ? "异常" : "已暂停"}
    </Badge>
  )
}

export function EmptyState({
  title,
  action,
  onAction,
}: {
  title: string
  action: string
  onAction: () => void
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" size="sm" onClick={onAction}>
          {action}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** 保留加载骨架与恢复入口，错误由store通知，不覆盖已加载的内容。 */
export function WorkbenchState({ children }: { children: ReactNode }) {
  const { status } = useWorkbench()
  if (status === "loading")
    return (
      <div
        role="status"
        aria-label="正在读取工作台"
        className="flex flex-col gap-4"
      >
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  if (status === "error")
    return (
      <Button type="button" variant="outline" size="sm" onClick={loadWorkbench}>
        <RefreshCwIcon aria-hidden="true" />
        重新加载工作台
      </Button>
    )
  return children
}

/** 延续原页面的全宽主体与顶栏操作，页面标题交给既有面包屑。 */
export function WorkbenchScreen({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <HeaderActions>{actions}</HeaderActions>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <h1 id={titleId} className="sr-only">
          {title}
        </h1>
        <WorkbenchState>{children}</WorkbenchState>
      </div>
    </section>
  )
}

export function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  label: string
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger size="default" aria-label={label} className="w-full">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
