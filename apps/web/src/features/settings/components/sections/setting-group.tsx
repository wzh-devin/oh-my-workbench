"use client"

import { type ReactNode } from "react"

import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"

export function SettingGroup({
  legend,
  description,
  children,
}: {
  legend: string
  description: string
  children: ReactNode
}) {
  return (
    <FieldSet className="gap-0">
      <FieldLegend className="sr-only">{legend}</FieldLegend>
      {/* Description */}
      <FieldDescription className="sr-only">{description}</FieldDescription>
      {/* List */}
      <FieldGroup className="gap-0">{children}</FieldGroup>
    </FieldSet>
  )
}
