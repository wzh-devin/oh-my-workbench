import { type ReactNode } from "react"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** The one header band every page section uses: title over a one-clause
 *  description, actions trailing, wrapping under the title when narrow.
 *  Sized as the block's FrameHeader: py-2, a 14px semibold title. */
export function SectionHeader({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children?: ReactNode
}) {
  return (
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-2 [.border-b]:pb-2">
      <div className="flex min-w-0 flex-col gap-px">
        <CardTitle className="text-sm leading-5 font-semibold">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {children}
    </CardHeader>
  )
}
