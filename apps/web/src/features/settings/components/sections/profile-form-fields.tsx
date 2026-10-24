"use client"

import { type ComponentProps } from "react"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { TIMEZONE_GROUPS, type SelectOption } from "./data"

export function AdvancedSelectField({
  id,
  options,
  defaultValue,
}: {
  id: string
  options: SelectOption[]
  defaultValue: SelectOption
}) {
  return (
    <Field className="w-full">
      <Select defaultValue={defaultValue} items={options}>
        <SelectTrigger id={id} className="w-full [&_small]:hidden">
          <SelectValue>
            {(item: SelectOption | null) =>
              item ? (
                <span className="flex flex-col items-start gap-px">
                  <span className="font-medium">{item.label}</span>
                  <small className="text-sm text-muted-foreground">
                    {item.description}
                  </small>
                </span>
              ) : null
            }
          </SelectValue>
        </SelectTrigger>

        <SelectContent align="end" className="w-(--anchor-width)">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option}
                className="[&_svg]:text-primary"
              >
                <span className="flex flex-col items-start gap-px">
                  <span className="font-medium">{option.label}</span>
                  <small className="text-sm text-muted-foreground">
                    {option.description}
                  </small>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export function CompactSelectField({
  id,
  options,
  defaultValue,
}: {
  id: string
  options: SelectOption[]
  defaultValue: SelectOption
}) {
  return (
    <Field className="w-full">
      <Select defaultValue={defaultValue} items={options}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(item: SelectOption | null) => item?.label ?? null}
          </SelectValue>
        </SelectTrigger>

        <SelectContent className="w-(--anchor-width)">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

/** The timezone combobox, held by the form around it. Clearing its input
 *  clears the value, which reaches the form as an empty string. */
export function TimezoneComboboxField({
  id,
  placeholder = "Select a timezone",
  value,
  onValueChange,
  ...inputProps
}: Omit<ComponentProps<typeof ComboboxInput>, "value" | "defaultValue"> & {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <Field className="w-full">
      <Combobox
        items={TIMEZONE_GROUPS}
        value={value || null}
        onValueChange={(next) => onValueChange(next ?? "")}
      >
        <ComboboxInput
          {...inputProps}
          id={id}
          placeholder={placeholder}
          className="w-full"
        />
        <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxEmpty>No timezones found.</ComboboxEmpty>
          <ComboboxList>
            {(group) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

export function WorkspaceDomainField({
  prefix,
  ...inputProps
}: ComponentProps<typeof InputGroupInput> & {
  prefix: string
}) {
  return (
    <InputGroup className="w-full">
      {/* List */}
      <InputGroupAddon align="inline-start">
        <InputGroupText>{prefix}/</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput {...inputProps} />
    </InputGroup>
  )
}
