import {
  memo,
  useId,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { COMPOSER_PLACEHOLDER, SOURCES } from "./data"
import {
  promptDefaultValues,
  promptSchema,
  type PromptValues,
} from "./prompt-schema"
import { PlusIcon, ArrowUpIcon } from "lucide-react"

/**
 * One box: the question, the way to send it, and a menu for what the assistant
 * may read. The draft lives with the caller, so hiding the window never loses it.
 */
export const Composer = memo(function Composer({
  value,
  onValueChange,
  sources,
  onSourcesChange,
  streaming,
  onSend,
  onStop,
  textareaRef,
}: {
  value: string
  onValueChange: (value: string) => void
  /** SOURCES ids attached to the next question. */
  sources: string[]
  onSourcesChange: (sources: string[]) => void
  /** True from the moment a question is sent until its answer settles. */
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}) {
  const inputId = useId()
  const errorId = useId()
  const form = useForm<PromptValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: promptDefaultValues,
    // The draft lives with the caller, which also empties it once a question
    // goes, so the form follows that value instead of keeping its own.
    values: { prompt: value },
  })

  // Only a question with text in it gets here, trimmed by the schema.
  function onSubmit({ prompt }: PromptValues) {
    onSend(prompt)
  }

  function send() {
    // While an answer is in flight the only primary action is Stop, so Enter
    // and the form must not slip a second question past it.
    if (streaming) return
    // The send control never disables, so an empty press says what is missing
    // and puts the caret back in the box rather than doing nothing at all.
    void form.handleSubmit(onSubmit)()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line. An IME candidate window also
    // fires Enter, and committing a word there must not post the message.
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return
    event.preventDefault()
    send()
  }

  function toggleSource(id: string, attached: boolean) {
    // Kept in SOURCES order, so the ids a turn stores never depend on click order.
    onSourcesChange(
      SOURCES.map((source) => source.id).filter((sourceId) =>
        sourceId === id ? attached : sources.includes(sourceId)
      )
    )
  }

  return (
    <form onSubmit={submit}>
      <Controller
        name="prompt"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={inputId} className="sr-only">
              Ask a question
            </FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                {...field}
                id={inputId}
                ref={(node) => {
                  // The form focuses the box on an empty send; the caller's ref
                  // focuses it from outside.
                  field.ref(node)
                  if (textareaRef) textareaRef.current = node
                }}
                onChange={(event) => {
                  field.onChange(event)
                  onValueChange(event.target.value)
                }}
                onKeyDown={handleKeyDown}
                placeholder={COMPOSER_PLACEHOLDER}
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? errorId : undefined}
                // Starts two lines tall and grows with the text, capped so the
                // thread never loses the window.
                className="field-sizing-content max-h-32 min-h-14"
              />

              <InputGroupAddon align="block-end" className="justify-between">
                <DropdownMenu>
                  {/* The span is load bearing: rendering the menu trigger as the
                  tooltip trigger merges away its keyboard open behaviour. */}
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex" />}>
                      <DropdownMenuTrigger
                        render={
                          <InputGroupButton
                            size="icon-sm"
                            aria-label="Attach context"
                          />
                        }
                      >
                        <PlusIcon aria-hidden="true" />
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Attach context</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    className="w-60"
                  >
                    {/* The label names the group, so each row reads with it. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>
                        Read With This Question
                      </DropdownMenuLabel>
                      {SOURCES.map((source) => (
                        <DropdownMenuCheckboxItem
                          key={source.id}
                          checked={sources.includes(source.id)}
                          onCheckedChange={(checked) =>
                            toggleSource(source.id, checked)
                          }
                          closeOnClick={false}
                        >
                          {source.icon}
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm">
                              {source.chip}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {source.hint}
                            </span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {streaming ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onStop}
                  >
                    Stop
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="submit"
                          size="icon-sm"
                          aria-label="Send question"
                          className="rounded-full"
                        />
                      }
                    >
                      <ArrowUpIcon aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent className="flex items-center gap-1.5">
                      Send
                      <Kbd>Enter</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
              </InputGroupAddon>
            </InputGroup>
            {fieldState.invalid && (
              <FieldError id={errorId} errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />
    </form>
  )
})
