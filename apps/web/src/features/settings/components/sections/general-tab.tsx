"use client"

import { useState } from "react"
import { Badge } from "@/components/reui/badge"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  DATE_FORMAT_OPTIONS,
  INVITE_DOMAINS,
  LANGUAGE_OPTIONS,
  WORKSPACE_IDENTITY,
} from "./data"
import { GENERAL_DEFAULTS, generalSchema } from "./general-schema"
import {
  AdvancedSelectField,
  CompactSelectField,
  TimezoneComboboxField,
  WorkspaceDomainField,
} from "./profile-form-fields"
import { SettingGroup } from "./setting-group"
import { SettingRow } from "./setting-row"
import { SettingsSection, SettingsSectionStack } from "./settings-section"
import { XIcon, PlusIcon } from "lucide-react"

export function GeneralTabContent() {
  const [inviteDomains, setInviteDomains] = useState(INVITE_DOMAINS)
  const form = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: GENERAL_DEFAULTS,
    // These settings apply as they are edited; there is no Save. So a field
    // is checked when it is left, then again on every change.
    mode: "onTouched",
  })

  return (
    // Submitting has nothing to send: it checks every field and moves focus
    // to the first one in error.
    <form
      id="settings-general-form"
      noValidate
      onSubmit={form.handleSubmit(() => undefined)}
    >
      <SettingsSectionStack>
        <SettingsSection title="Workspace basics">
          <SettingGroup
            legend="Workspace basics"
            description="Workspace naming, routing, and invite domain settings."
          >
            <SettingRow
              title="Workspace name"
              description="Used in shared pages and invites."
              labelFor="settings-workspace-name"
            >
              <Controller
                name="workspaceName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      id="settings-workspace-name"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Appears in invite flows and the workspace switcher.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>

            <SettingRow
              title="Workspace domain"
              description="Keep the public URL short and clear."
              labelFor="settings-workspace-domain"
              titleInfo="This slug is used for invites, shared links, and your public workspace URL."
              titleAddon={<Badge variant="success-light">Connected</Badge>}
            >
              <Controller
                name="workspaceSlug"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <WorkspaceDomainField
                      {...field}
                      id="settings-workspace-domain"
                      prefix={WORKSPACE_IDENTITY.domainPrefix}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      New invite and share links will use this slug.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>

            <SettingRow
              title="Invite domains"
              description="Allow signups from trusted company domains."
              align="start"
              last
            >
              <Field className="w-full gap-3">
                <div className="flex w-full flex-wrap items-center gap-2">
                  {inviteDomains.map((domain) => (
                    <Badge key={domain} variant="outline" className="gap-0.5">
                      {domain}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-3 hover:bg-transparent"
                        aria-label={`Remove ${domain}`}
                        onClick={() =>
                          setInviteDomains((current) =>
                            current.filter((item) => item !== domain)
                          )
                        }
                      >
                        <XIcon aria-hidden="true" className="size-3" />
                      </Button>
                    </Badge>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="[&_svg]:size-3.5"
                    onClick={() =>
                      toast.info("Domain review requested", {
                        closeButton: true,
                        description:
                          "An owner approves a new invite domain before it is used.",
                      })
                    }
                  >
                    <PlusIcon aria-hidden="true" className="size-3.5" />
                    Add domain
                  </Button>
                </div>
                <FieldDescription>
                  Only trusted company domains are auto-approved for invites.
                </FieldDescription>
              </Field>
            </SettingRow>
          </SettingGroup>
        </SettingsSection>

        <SettingsSection title="Regional preferences">
          <SettingGroup
            legend="Regional preferences"
            description="Localization and formatting preferences."
          >
            <SettingRow
              title="Language and timezone"
              description="Keep the workspace readable for the whole team."
              align="start"
            >
              <FieldGroup className="w-full gap-3">
                <Field>
                  <FieldLabel htmlFor="settings-language">Language</FieldLabel>
                  <AdvancedSelectField
                    id="settings-language"
                    options={LANGUAGE_OPTIONS}
                    defaultValue={LANGUAGE_OPTIONS[0]}
                  />
                  <FieldDescription>
                    Sets shared UI copy for this workspace.
                  </FieldDescription>
                </Field>

                <Controller
                  name="timezone"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="settings-timezone">
                        Timezone
                      </FieldLabel>
                      <TimezoneComboboxField
                        ref={field.ref}
                        name={field.name}
                        id="settings-timezone"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldDescription>
                        Schedules and cron triggers run on this clock.
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </SettingRow>

            <SettingRow
              title="Date format"
              description="Keep reports and summaries consistent."
              last
            >
              <Field className="w-full">
                <CompactSelectField
                  id="settings-date-format"
                  options={DATE_FORMAT_OPTIONS}
                  defaultValue={DATE_FORMAT_OPTIONS[0]}
                />
                <FieldDescription>
                  Applies to exports, reports, and activity tables.
                </FieldDescription>
              </Field>
            </SettingRow>
          </SettingGroup>
        </SettingsSection>

        <SettingsSection title="Editor behavior">
          <SettingGroup
            legend="Editor behavior"
            description="Keyboard and editor defaults."
          >
            <SettingRow
              title="Snap steps to grid"
              description="Line steps up on the canvas as you drag them."
              labelFor="settings-send-enter"
            >
              <Switch id="settings-send-enter" />
            </SettingRow>

            <SettingRow
              title="Confirm before delete"
              description="Ask before a step or an agent is removed."
              labelFor="settings-markdown"
            >
              <Switch id="settings-markdown" defaultChecked />
            </SettingRow>

            <SettingRow
              title="Compact tables"
              description="Fit more rows in run and agent lists."
              labelFor="settings-compact-tables"
              last
            >
              <Switch id="settings-compact-tables" defaultChecked />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
      </SettingsSectionStack>
    </form>
  )
}
