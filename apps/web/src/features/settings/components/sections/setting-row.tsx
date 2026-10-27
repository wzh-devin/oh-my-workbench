import type { ReactNode } from "react"
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field"

export function SettingRow({
  title,
  labelFor,
  children,
  last,
}: {
  title: string
  labelFor?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <>
      <Field
        orientation="responsive"
        className="gap-4 px-4 py-2.5 @md/field-group:gap-12 @md/field-group:has-[>[data-slot=field-content]]:items-center"
      >
        <div className="flex w-full min-w-0 flex-col gap-0.5 @md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pr-6">
          {labelFor ? (
            <FieldLabel htmlFor={labelFor}>{title}</FieldLabel>
          ) : (
            <FieldTitle>{title}</FieldTitle>
          )}
        </div>
        <FieldContent className="w-full min-w-0 @md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pl-2">
          <div className="flex w-full justify-start">{children}</div>
        </FieldContent>
      </Field>
      {!last && <FieldSeparator />}
    </>
  )
}
