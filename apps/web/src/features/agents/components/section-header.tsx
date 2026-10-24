import { type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { UI_ICONS } from "./icons"

/** The band for a card nested inside the sheet: one line, the description
 *  moved into a hint beside the title. Sized as the block's FrameHeader:
 *  py-2, a 14px semibold title. */
export function HintHeader({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children?: ReactNode
}) {
  return (
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-2 [.border-b]:pb-2">
      <div className="flex min-w-0 items-center gap-0.5">
        <CardTitle className="truncate text-sm leading-5 font-semibold">
          {title}
        </CardTitle>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={hint}
                className="text-muted-foreground"
              />
            }
          >
            {UI_ICONS.info}
          </TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </CardHeader>
  )
}
