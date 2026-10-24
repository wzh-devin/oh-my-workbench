"use client"

import { Badge } from "@/components/reui/badge"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Field, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"

import { LANDING_VIEW_OPTIONS, ROLE_OPTIONS, WORKSPACE_IDENTITY } from "./data"
import { ImageUploadField } from "./image-upload-field"
import {
  AdvancedSelectField,
  CompactSelectField,
  TimezoneComboboxField,
} from "./profile-form-fields"
import { PROFILE_DEFAULTS, profileSchema } from "./profile-schema"
import { SettingGroup } from "./setting-group"
import { SettingRow } from "./setting-row"
import { SettingsSection, SettingsSectionStack } from "./settings-section"

export function ProfileTabContent() {
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: PROFILE_DEFAULTS,
    // These settings apply as they are edited; there is no Save. So a field
    // is checked when it is left, then again on every change.
    mode: "onTouched",
  })

  return (
    // Submitting has nothing to send: it checks every field and moves focus
    // to the first one in error.
    <form
      id="settings-profile-form"
      noValidate
      onSubmit={form.handleSubmit(() => undefined)}
    >
      <SettingsSectionStack>
        <SettingsSection title="Personal details">
          <SettingGroup
            legend="Personal details"
            description="Profile identity fields."
          >
            <SettingRow
              title="Profile photo"
              description="Shown in approvals, mentions, and member lists."
              labelFor="settings-photo"
            >
              <ImageUploadField
                ariaLabel="Upload profile photo"
                inputId="settings-photo"
                variant="avatar"
                defaultImage={WORKSPACE_IDENTITY.avatarSrc}
                alt={WORKSPACE_IDENTITY.profileName}
              />
            </SettingRow>

            <SettingRow
              title="Full name"
              description="Used on assignments and reviews."
              labelFor="settings-full-name"
            >
              <Controller
                name="fullName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      id="settings-full-name"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>

            <SettingRow
              title="Email address"
              description="Primary sign-in and alert email."
              labelFor="settings-email"
              titleAddon={<Badge variant="success-light">Verified</Badge>}
            >
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      id="settings-email"
                      type="email"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>

            <SettingRow
              title="Username"
              description="Used in mentions and shared links."
              labelFor="settings-username"
              last
            >
              <Controller
                name="username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <InputGroup className="w-full">
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>@</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="settings-username"
                        aria-invalid={fieldState.invalid}
                      />
                    </InputGroup>
                    <FieldDescription>
                      Used in mentions, profile links, and shared comments.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>

        <SettingsSection title="Profile details">
          <SettingGroup
            legend="Profile details"
            description="Role and timezone."
          >
            <SettingRow
              title="Role"
              description="Public title shown on shared workspace surfaces."
            >
              <CompactSelectField
                id="settings-role"
                options={ROLE_OPTIONS}
                defaultValue={ROLE_OPTIONS[0]}
              />
            </SettingRow>

            <SettingRow
              title="Timezone"
              description="Used in review schedules and run times."
              last
            >
              <Controller
                name="timezone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="w-full" data-invalid={fieldState.invalid}>
                    <TimezoneComboboxField
                      ref={field.ref}
                      name={field.name}
                      id="settings-timezone"
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>

        <SettingsSection title="Display preferences">
          <SettingGroup
            legend="Display preferences"
            description="Where the workspace opens for you."
          >
            <SettingRow
              title="Landing view"
              description="Open into the most useful workspace view."
              last
            >
              <AdvancedSelectField
                id="settings-landing-view"
                options={LANDING_VIEW_OPTIONS}
                defaultValue={LANDING_VIEW_OPTIONS[1]}
              />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
      </SettingsSectionStack>
    </form>
  )
}
