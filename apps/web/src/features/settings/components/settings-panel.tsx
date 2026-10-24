"use client"

import { type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import {
  AUDIT_RETENTION_OPTIONS,
  BILLING_CYCLE_OPTIONS,
  CONCURRENCY_OPTIONS,
  CREATIVITY_OPTIONS,
  MODEL_OPTIONS,
  RETRY_OPTIONS,
  SESSION_DURATION_OPTIONS,
  STEP_TIMEOUT_OPTIONS,
  VERIFICATION_OPTIONS,
  type SelectOption,
  type SettingsItem,
} from "./data"
import {
  AI_MODELS_DEFAULTS,
  aiModelsSchema,
  type AiModelsValues,
} from "./sections/ai-models-schema"
import {
  BILLING_DEFAULTS,
  billingSchema,
  type BillingValues,
} from "./sections/billing-schema"
import { GeneralTabContent } from "./sections/general-tab"
import { IntegrationsTabContent } from "./sections/integrations-tab"
import { MembersTabContent } from "./sections/members-tab"
import { ProfileTabContent } from "./sections/profile-tab"
import { WebhooksTabContent } from "./sections/webhooks-tab"
import { CompactSelectField } from "./sections/profile-form-fields"
import { SettingGroup } from "./sections/setting-group"
import { SettingRow } from "./sections/setting-row"
import {
  SettingsSection,
  SettingsSectionStack,
} from "./sections/settings-section"
import { SettingsHeaderActions } from "./settings-actions"

// One panel per settings route, all in the same format. The tabs are the
// shell's section panel here, so the routes switch panels.

// ── Building blocks ──

/** The option a select starts on, as the block's selects take it. */
function pick(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value) ?? options[0]
}

// ── Panels ──

// The panels with text to type are forms. Their settings apply as they are
// edited, with no Save, so a field is checked when it is left and on every
// change after that ("onTouched"). Submitting has nothing to send: it only
// checks every field and focuses the first one in error.

function BillingPanel() {
  const form = useForm<BillingValues>({
    resolver: zodResolver(billingSchema),
    defaultValues: BILLING_DEFAULTS,
    mode: "onTouched",
  })

  return (
    <form
      id="settings-billing-form"
      noValidate
      onSubmit={form.handleSubmit(() => undefined)}
    >
      <SettingsSectionStack>
        <SettingsSection title="Billing Profile">
          <SettingGroup
            legend="Billing Profile"
            description="Invoice delivery and plan defaults."
          >
            <SettingRow
              title="Billing Email"
              description="Finance inbox for invoices and receipts."
              labelFor="settings-billing-email"
            >
              <Controller
                name="billingEmail"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      id="settings-billing-email"
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
              title="Billing Cycle"
              description="Default cadence for subscription charges."
              labelFor="settings-billing-cycle"
            >
              <CompactSelectField
                id="settings-billing-cycle"
                options={BILLING_CYCLE_OPTIONS}
                defaultValue={pick(BILLING_CYCLE_OPTIONS, "annual")}
              />
            </SettingRow>
            <SettingRow
              last
              title="Tax ID"
              description="Displayed on generated invoices."
              labelFor="settings-tax-id"
            >
              <Controller
                name="taxId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      id="settings-tax-id"
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
        <SettingsSection title="Usage Limits">
          <SettingGroup
            legend="Usage Limits"
            description="Keep a runaway workflow from running up the bill."
          >
            <SettingRow
              title="Monthly Run Cap"
              description="Runs past this number wait until the next cycle."
              labelFor="settings-run-cap"
            >
              <Controller
                name="monthlyRunCap"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id="settings-run-cap"
                        inputMode="numeric"
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>runs</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>
            <SettingRow
              last
              title="Overage Alert"
              description="Email owners at 80% and 100% of the cap."
              labelFor="settings-overage-alert"
            >
              <Switch id="settings-overage-alert" defaultChecked />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
      </SettingsSectionStack>
    </form>
  )
}

function ExecutionPanel() {
  return (
    <SettingsSectionStack>
      <SettingsSection title="Run Defaults">
        <SettingGroup
          legend="Run Defaults"
          description="Applied to every step unless the step overrides them."
        >
          <SettingRow
            title="Step Timeout"
            description="A step that runs longer fails and follows the retry policy."
            labelFor="settings-step-timeout"
          >
            <CompactSelectField
              id="settings-step-timeout"
              options={STEP_TIMEOUT_OPTIONS}
              defaultValue={pick(STEP_TIMEOUT_OPTIONS, "5m")}
            />
          </SettingRow>
          <SettingRow
            title="Retry Policy"
            description="What happens when a step errors."
            labelFor="settings-retry-policy"
          >
            <CompactSelectField
              id="settings-retry-policy"
              options={RETRY_OPTIONS}
              defaultValue={pick(RETRY_OPTIONS, "exponential")}
            />
          </SettingRow>
          <SettingRow
            last
            title="Concurrent Runs"
            description="Runs past the limit queue until a slot frees up."
            labelFor="settings-concurrency"
          >
            <CompactSelectField
              id="settings-concurrency"
              options={CONCURRENCY_OPTIONS}
              defaultValue={pick(CONCURRENCY_OPTIONS, "50")}
            />
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      <SettingsSection title="Scheduling">
        <SettingGroup
          legend="Scheduling"
          description="When runs are allowed to start and who can enter again."
        >
          <SettingRow
            title="Quiet Hours"
            description="Hold scheduled runs overnight and start them at 8:00."
            labelFor="settings-quiet-hours"
          >
            <Switch id="settings-quiet-hours" defaultChecked />
          </SettingRow>
          <SettingRow
            title="Skip Weekends"
            description="Delays and waits pause on Saturday and Sunday."
            labelFor="settings-skip-weekends"
          >
            <Switch id="settings-skip-weekends" />
          </SettingRow>
          <SettingRow
            last
            title="Allow Re-Entry"
            description="A record can go through a workflow again after it finishes."
            labelFor="settings-re-entry"
          >
            <Switch id="settings-re-entry" />
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
    </SettingsSectionStack>
  )
}

function AiModelsPanel() {
  const form = useForm<AiModelsValues>({
    resolver: zodResolver(aiModelsSchema),
    defaultValues: AI_MODELS_DEFAULTS,
    mode: "onTouched",
  })

  return (
    <form
      id="settings-ai-models-form"
      noValidate
      onSubmit={form.handleSubmit(() => undefined)}
    >
      <SettingsSectionStack>
        <SettingsSection title="Default Model">
          <SettingGroup
            legend="Default Model"
            description="Used by every agent step that doesn't pick its own."
          >
            <SettingRow
              title="Model"
              description="Agents can override it per step."
              labelFor="settings-model"
            >
              <CompactSelectField
                id="settings-model"
                options={MODEL_OPTIONS}
                defaultValue={pick(MODEL_OPTIONS, "claude-sonnet-5-5")}
              />
            </SettingRow>
            <SettingRow
              title="Response Style"
              description="How much the model varies its answers."
              labelFor="settings-creativity"
            >
              <CompactSelectField
                id="settings-creativity"
                options={CREATIVITY_OPTIONS}
                defaultValue={pick(CREATIVITY_OPTIONS, "balanced")}
              />
            </SettingRow>
            <SettingRow
              last
              title="Monthly Budget"
              description="Agents fall back to a cheaper model past this spend."
              labelFor="settings-token-budget"
            >
              <Controller
                name="tokenBudget"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="settings-token-budget"
                        inputMode="decimal"
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>/ month</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
        <SettingsSection title="Guardrails">
          <SettingGroup
            legend="Guardrails"
            description="Checks that run before an agent acts on your data."
          >
            <SettingRow
              title="Approve Tool Calls"
              description="Pause the run for a person before an agent writes data."
              labelFor="settings-approve-tools"
              titleAddon={<Badge variant="warning-light">Recommended</Badge>}
            >
              <Switch id="settings-approve-tools" defaultChecked />
            </SettingRow>
            <SettingRow
              title="Redact Personal Data"
              description="Mask emails, phone numbers and card numbers in prompts."
              labelFor="settings-redact-pii"
            >
              <Switch id="settings-redact-pii" defaultChecked />
            </SettingRow>
            <SettingRow
              last
              title="Store Prompts"
              description="Keep prompts and outputs in run history for debugging."
              labelFor="settings-store-prompts"
            >
              <Switch id="settings-store-prompts" />
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
      </SettingsSectionStack>
    </form>
  )
}

function AuditLogPanel() {
  return (
    <SettingsSection title="Audit Retention">
      <SettingGroup
        legend="Audit Retention"
        description="Control audit history and export behavior."
      >
        <SettingRow
          title="Retention"
          description="How long audit events remain searchable."
          labelFor="settings-audit-retention"
        >
          <CompactSelectField
            id="settings-audit-retention"
            options={AUDIT_RETENTION_OPTIONS}
            defaultValue={pick(AUDIT_RETENTION_OPTIONS, "365")}
          />
        </SettingRow>
        <SettingRow
          title="Export Approval"
          description="Require owner approval for CSV exports."
          labelFor="settings-export-approval"
        >
          <Switch id="settings-export-approval" defaultChecked />
        </SettingRow>
        <SettingRow
          last
          title="Audit Note"
          description="Optional note attached to compliance exports."
          labelFor="settings-audit-note"
          align="start"
        >
          <Textarea
            id="settings-audit-note"
            className="min-h-24 resize-none"
            defaultValue="Exports are reviewed by workspace owners before sharing externally."
          />
        </SettingRow>
      </SettingGroup>
    </SettingsSection>
  )
}

function SecurityPanel() {
  return (
    <SettingsSectionStack>
      <SettingsSection title="Sign-In Methods">
        <SettingGroup
          legend="Sign-In Methods"
          description="Choose how members create and access accounts."
        >
          <SettingRow
            title="Email Sign-Up"
            description="Allow new members to register with email."
            labelFor="settings-email-signup"
          >
            <Switch id="settings-email-signup" defaultChecked />
          </SettingRow>
          <SettingRow
            title="Password Sign-In"
            description="Keep password login available for returning members."
            labelFor="settings-password"
          >
            <Switch id="settings-password" defaultChecked />
          </SettingRow>
          <SettingRow
            last
            title="Verification Method"
            description="Primary email verification experience."
            labelFor="settings-verification"
          >
            <CompactSelectField
              id="settings-verification"
              options={VERIFICATION_OPTIONS}
              defaultValue={pick(VERIFICATION_OPTIONS, "otp")}
            />
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
      <SettingsSection title="Session Policy">
        <SettingGroup
          legend="Session Policy"
          description="Manage sign-in lifetime and trusted devices."
        >
          <SettingRow
            title="Session Lifetime"
            description="Default duration before re-authentication."
            labelFor="settings-session-duration"
          >
            <CompactSelectField
              id="settings-session-duration"
              options={SESSION_DURATION_OPTIONS}
              defaultValue={pick(SESSION_DURATION_OPTIONS, "24h")}
            />
          </SettingRow>
          <SettingRow
            title="Trusted Devices"
            description="Allow members to remember approved browsers."
            labelFor="settings-trusted-devices"
          >
            <Switch id="settings-trusted-devices" defaultChecked />
          </SettingRow>
          <SettingRow
            last
            title="Revoke On Password Change"
            description="End other sessions after password updates."
            labelFor="settings-revoke-sessions"
          >
            <Switch id="settings-revoke-sessions" defaultChecked />
          </SettingRow>
        </SettingGroup>
      </SettingsSection>
    </SettingsSectionStack>
  )
}

// Every section is drawn in the same format: cards of two-column rows.
// General, Members, Integrations and Profile have panels of their own
// (./sections); the rest are Flowly's settings set in the same rows.
const PANELS: Record<SettingsItem["value"], () => ReactNode> = {
  general: GeneralTabContent,
  members: MembersTabContent,
  billing: BillingPanel,
  execution: ExecutionPanel,
  "ai-models": AiModelsPanel,
  integrations: IntegrationsTabContent,
  webhooks: WebhooksTabContent,
  "audit-log": AuditLogPanel,
  profile: ProfileTabContent,
  security: SecurityPanel,
}

// ── Settings Panel ──

export function SettingsPanel({ item }: { item: SettingsItem }) {
  const Panel = PANELS[item.value]

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* The section is named by the panel beside it, so only assistive tech reads this. */}
      <h1 className="sr-only">{item.label} Settings</h1>
      <SettingsHeaderActions section={item.value} />
      <Panel />
    </div>
  )
}
