import type { RefObject } from "react"
import { APP_CHANGELOG } from "@/lib/release-notes"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { ChangelogInline, ChangelogLink } from "./changelog-inline"

const historyUrl =
  "https://github.com/wzh-devin/oh-my-workbench/blob/main/CHANGELOG.md"

function HistoryLink() {
  return (
    <Button
      nativeButton={false}
      role="link"
      render={<a href={historyUrl} target="_blank" rel="noopener noreferrer" />}
      variant="outline"
      size="sm"
    >
      查看完整记录
    </Button>
  )
}

/** 日志随当前构建携带，菜单关闭后焦点仍可返回头像。 */
export function ChangelogDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: RefObject<HTMLButtonElement | null>
}) {
  const { version, releases } = APP_CHANGELOG
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        finalFocus={returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>更新日志</DialogTitle>
          <p className="text-xs text-muted-foreground">当前版本 {version}</p>
        </DialogHeader>
        <div className="min-h-0 scroll-content overflow-y-auto">
          {releases.length ? (
            <div className="flex flex-col gap-6">
              {releases.map((release, index) => (
                <div key={release.version} className="flex flex-col gap-6">
                  {index > 0 && <Separator />}
                  <section
                    className="flex flex-col gap-4"
                    aria-label={
                      release.version === "Unreleased"
                        ? "待发布"
                        : `v${release.version}`
                    }
                  >
                    <div className="flex items-center gap-2">
                      <ChangelogLink href={release.url}>
                        <Badge variant="outline">
                          {release.version === "Unreleased"
                            ? "待发布"
                            : `v${release.version}`}
                        </Badge>
                      </ChangelogLink>
                      {release.date && (
                        <time
                          dateTime={release.date}
                          className="text-xs text-muted-foreground"
                        >
                          {release.date}
                        </time>
                      )}
                    </div>
                    {release.sections.map((section) => (
                      <div key={section.title} className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">{section.title}</h3>
                        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                          {section.items.map((item, itemIndex) => (
                            <li key={itemIndex} className="break-words">
                              <ChangelogInline source={item} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无更新记录</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <HistoryLink />
              </EmptyContent>
            </Empty>
          )}
        </div>
        {releases.length > 0 && (
          <DialogFooter>
            <HistoryLink />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
