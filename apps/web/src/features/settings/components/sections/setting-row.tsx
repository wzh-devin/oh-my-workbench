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
        className="gap-3 py-4 first:pt-0 last:pb-0 @md/field-group:grid @md/field-group:grid-cols-[12rem_minmax(0,1fr)] @md/field-group:gap-6 @md/field-group:has-[>[data-slot=field-content]]:items-center"
      >
        <div className="min-w-0">
          {labelFor ? (
            <FieldLabel htmlFor={labelFor}>{title}</FieldLabel>
          ) : (
            <FieldTitle>{title}</FieldTitle>
          )}
        </div>
        <FieldContent className="min-w-0">
          <div className="flex w-full min-w-0 items-center">{children}</div>
        </FieldContent>
      </Field>
      {!last && <FieldSeparator />}
    </>
  )
}
