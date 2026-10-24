"use client"

import { MemberManagementTable } from "./member-management-table"
import { SettingsSection } from "./settings-section"

export function MembersTabContent() {
  return (
    <SettingsSection title="Workspace Members" className="gap-4">
      <MemberManagementTable />
    </SettingsSection>
  )
}
