import { Controller, type Control } from "react-hook-form"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { type AgentSheetFormValues } from "./agent-schema"
import { type AgentFormValues } from "./agents-lib"
import {
  AGENT_MODEL_OPTIONS,
  AGENT_OWNER_OPTIONS,
  type AgentRecord,
} from "./data"
import {
  ALERT_CHANNEL,
  ENVIRONMENT_OPTIONS,
  type AgentDetails,
} from "./sheet-data"
import { OwnerFace } from "./value-faces"

export function toSheetFormValues(
  agent: AgentRecord,
  details: Pick<AgentDetails, "environment" | "alertOnFailure">
): AgentSheetFormValues {
  return {
    name: agent.name,
    environment: details.environment,
    monthlyBudget: String(agent.monthlyBudget),
    model: agent.model,
    ownerId: agent.owner.id,
    alertOnFailure: details.alertOnFailure,
  }
}

/** The list record's form values; description and status stay the record's,
 *  and a new agent starts as an undescribed Draft. */
export function toAgentFormValues(
  values: AgentSheetFormValues,
  agent: AgentRecord | null
): AgentFormValues {
  return {
    name: values.name.trim(),
    description: agent?.description ?? "",
    model: values.model,
    ownerId: values.ownerId,
    status: agent?.status ?? "Draft",
    monthlyBudget: values.monthlyBudget.trim(),
  }
}

/** The fields a save writes; tools, sessions and the key are not in the form. */
export function sameDraft(a: AgentSheetFormValues, b: AgentSheetFormValues) {
  return (
    a.name === b.name &&
    a.environment === b.environment &&
    a.monthlyBudget === b.monthlyBudget &&
    a.model === b.model &&
    a.ownerId === b.ownerId &&
    a.alertOnFailure === b.alertOnFailure
  )
}

/** The Settings tab's agent form; instructions and tools are left to the
 *  Builder. The sheet owns the form and its schema; this lays the fields out. */
export function AgentFormFields({
  idPrefix,
  control,
}: {
  idPrefix: string
  control: Control<AgentSheetFormValues>
}) {
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Agent</FieldLegend>
        <FieldGroup className="gap-3">
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  className="leading-none"
                  htmlFor={`${idPrefix}-name`}
                >
                  Name
                </FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-name`}
                  aria-invalid={fieldState.invalid}
                  placeholder="Refund Assistant"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="environment"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  className="leading-none"
                  id={`${idPrefix}-environment-label`}
                >
                  Environment
                </FieldLabel>
                <ToggleGroup
                  multiple={false}
                  value={[field.value]}
                  onValueChange={(value: string[]) => {
                    const match = ENVIRONMENT_OPTIONS.find(
                      (option) => option.value === value[0]
                    )
                    if (match) field.onChange(match.value)
                  }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-labelledby={`${idPrefix}-environment-label`}
                  aria-invalid={fieldState.invalid}
                  className="w-full"
                >
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className="flex-1 text-muted-foreground data-pressed:text-foreground"
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="monthlyBudget"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  className="leading-none"
                  htmlFor={`${idPrefix}-budget`}
                >
                  Monthly budget (USD)
                </FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-budget`}
                  aria-invalid={fieldState.invalid}
                  placeholder="500"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Runtime</FieldLegend>
        <FieldGroup className="gap-3">
          <div className="grid gap-3 min-[360px]:grid-cols-2">
            <Controller
              name="model"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="leading-none"
                    htmlFor={`${idPrefix}-model`}
                  >
                    Model
                  </FieldLabel>
                  <Select
                    name={field.name}
                    value={field.value || null}
                    items={AGENT_MODEL_OPTIONS}
                    onValueChange={(next) => {
                      const match = AGENT_MODEL_OPTIONS.find(
                        (option) => option.value === next
                      )
                      if (match) field.onChange(match.value)
                    }}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      id={`${idPrefix}-model`}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Choose a model" />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {AGENT_MODEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="ownerId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="leading-none"
                    htmlFor={`${idPrefix}-owner`}
                  >
                    Owner
                  </FieldLabel>
                  <Select
                    name={field.name}
                    value={field.value}
                    items={AGENT_OWNER_OPTIONS}
                    onValueChange={(next) => {
                      const match = AGENT_OWNER_OPTIONS.find(
                        (option) => option.value === next
                      )
                      if (match) field.onChange(match.value)
                    }}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      id={`${idPrefix}-owner`}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue>
                        <OwnerFace owner={field.value} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {AGENT_OWNER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <OwnerFace owner={option.value} />
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <Controller
            name="alertOnFailure"
            control={control}
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <FieldContent>
                  <FieldLabel
                    className="leading-none"
                    htmlFor={`${idPrefix}-alerts`}
                  >
                    Alert on failure
                  </FieldLabel>
                  <FieldDescription>
                    Notifies {ALERT_CHANNEL} after three failed sessions in a
                    row.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldContent>
                <Switch
                  ref={field.ref}
                  id={`${idPrefix}-alerts`}
                  size="sm"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </>
  )
}
