"use client"

import { type ReactNode } from "react"

import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"

export function SettingGroup({
  legend,
  children,
}: {
  legend: string
  children: ReactNode
}) {
  return (
    <FieldSet className="gap-0">
      <FieldLegend className="sr-only">{legend}</FieldLegend>
      {/* List */}
      <FieldGroup className="gap-0">{children}</FieldGroup>
    </FieldSet>
  )
}
