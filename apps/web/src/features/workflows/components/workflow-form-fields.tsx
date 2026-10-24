import { Controller, useWatch, type Control } from "react-hook-form"

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
import { TEAM_MEMBERS } from "@/lib/workspace/team"

import {
  ALERT_CHANNEL,
  ENVIRONMENT_OPTIONS,
  TRIGGER_OPTIONS,
  TRIGGER_SOURCE,
} from "./sheet-data"
import { OwnerFace } from "./value-faces"
import { type WorkflowFormValues } from "./workflow-schema"

const OWNER_OPTIONS = TEAM_MEMBERS.map((member) => ({
  value: member.name,
  label: member.name,
}))

/** The fields a save writes; history, steps and the secret are not in the form. */
export function sameDraft(a: WorkflowFormValues, b: WorkflowFormValues) {
  return (
    a.name === b.name &&
    a.environment === b.environment &&
    a.trigger === b.trigger &&
    a.cadence === b.cadence &&
    a.owner === b.owner &&
    a.alertOnFailure === b.alertOnFailure
  )
}

/** The Settings tab's workflow form; the steps are left to the editor. The
 *  sheet owns the form and its schema; this lays the fields out. */
export function WorkflowFormFields({
  idPrefix,
  control,
}: {
  idPrefix: string
  control: Control<WorkflowFormValues>
}) {
  const trigger = useWatch({ control, name: "trigger" })
  const source = TRIGGER_SOURCE[trigger || "Event"]

  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Workflow</FieldLegend>
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
                  placeholder="Refund Requests"
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
            name="cadence"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  className="leading-none"
                  htmlFor={`${idPrefix}-cadence`}
                >
                  Fires
                </FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-cadence`}
                  aria-invalid={fieldState.invalid}
                  placeholder={source.placeholder}
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
        <FieldLegend variant="label">Run</FieldLegend>
        <FieldGroup className="gap-3">
          <div className="grid gap-3 min-[360px]:grid-cols-2">
            <Controller
              name="trigger"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="leading-none"
                    htmlFor={`${idPrefix}-trigger`}
                  >
                    Trigger
                  </FieldLabel>
                  <Select
                    name={field.name}
                    value={field.value || null}
                    items={TRIGGER_OPTIONS}
                    onValueChange={(next) => {
                      const match = TRIGGER_OPTIONS.find(
                        (option) => option.value === next
                      )
                      if (match) field.onChange(match.value)
                    }}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      id={`${idPrefix}-trigger`}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Choose a trigger" />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {TRIGGER_OPTIONS.map((option) => (
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
              name="owner"
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
                    value={field.value || null}
                    items={OWNER_OPTIONS}
                    onValueChange={(next) => {
                      const match = OWNER_OPTIONS.find(
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
                      {field.value ? (
                        <SelectValue>
                          <OwnerFace owner={field.value} />
                        </SelectValue>
                      ) : (
                        <SelectValue placeholder="Choose an owner" />
                      )}
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {OWNER_OPTIONS.map((option) => (
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
                    Notifies {ALERT_CHANNEL} after three failed runs in a row.
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
