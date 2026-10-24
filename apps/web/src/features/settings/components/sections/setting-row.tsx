"use client"

import { type ReactNode } from "react"
import { cn } from "cn"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { InfoIcon } from "lucide-react"

interface SettingRowProps {
  title: string
  description?: ReactNode
  children: ReactNode
  align?: "center" | "start"
  className?: string
  last?: boolean
  stacked?: boolean
  labelFor?: string
  contentClassName?: string
  titleLeading?: ReactNode
  titleAddon?: ReactNode
  titleInfo?: string
}

export function SettingRow({
  title,
  description,
  children,
  align = "center",
  className,
  last,
  stacked,
  labelFor,
  contentClassName,
  titleLeading,
  titleAddon,
  titleInfo,
}: SettingRowProps) {
  return (
    <>
      <Field
        orientation={stacked ? "vertical" : "responsive"}
        className={cn(
          "gap-4 px-4 py-2.5 @md/field-group:gap-12",
          align === "start"
            ? "@md/field-group:has-[>[data-slot=field-content]]:items-start"
            : "@md/field-group:has-[>[data-slot=field-content]]:items-center",
          className
        )}
      >
        <div
          className={cn(
            "flex w-full min-w-0 flex-col gap-0.5",
            stacked
              ? "max-w-none"
              : "@md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pr-6"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            {titleLeading ? (
              <span className="shrink-0" aria-hidden="true">
                {titleLeading}
              </span>
            ) : null}
            {labelFor ? (
              <FieldLabel htmlFor={labelFor} className="capitalize">
                {title}
              </FieldLabel>
            ) : (
              <FieldTitle className="capitalize">{title}</FieldTitle>
            )}
            {titleInfo ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={`${title} info`}
                    />
                  }
                >
                  <InfoIcon aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs p-3">
                  <p className="text-sm leading-5">{titleInfo}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
            {titleAddon}
          </div>

          {description ? (
            <FieldDescription className="text-sm leading-6">
              {description}
            </FieldDescription>
          ) : null}
        </div>

        <FieldContent
          className={cn(
            "w-full min-w-0",
            stacked
              ? "max-w-none"
              : "@md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pl-2",
            contentClassName
          )}
        >
          <div className="flex w-full justify-start">{children}</div>
        </FieldContent>
      </Field>

      {!last ? <FieldSeparator /> : null}
    </>
  )
}
