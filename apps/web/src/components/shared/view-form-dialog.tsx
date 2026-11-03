import { useId, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** 视图表单共用布局和操作区，业务模块保留图标、规则、排序及保存逻辑。 */
export function ViewFormDialog({
  editing,
  pending,
  name,
  onNameChange,
  namePlaceholder,
  icons,
  rules,
  sort,
  recoveryAction,
  onSubmit,
  onClose,
}: {
  editing: boolean
  pending: boolean
  name: string
  onNameChange: (name: string) => void
  namePlaceholder: string
  icons: ReactNode
  rules: ReactNode
  sort: ReactNode
  recoveryAction?: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  const id = useId()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!pending}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>{editing ? "编辑视图" : "新建视图"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 min-w-0 flex-col gap-4"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="min-h-0 min-w-0 scroll-content overflow-y-auto">
            <fieldset
              disabled={pending}
              className="flex min-w-0 flex-col gap-4"
            >
              <Field>
                <FieldLabel htmlFor={id}>视图名称</FieldLabel>
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  maxLength={100}
                  placeholder={namePlaceholder}
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel>图标</FieldLabel>
                {icons}
              </Field>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-medium">规则</span>
                {rules}
              </div>
              <Field>
                <FieldLabel>排序</FieldLabel>
                {sort}
              </Field>
            </fieldset>
          </div>
          <DialogFooter className="shrink-0">
            {recoveryAction}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "保存视图" : "新建视图"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
