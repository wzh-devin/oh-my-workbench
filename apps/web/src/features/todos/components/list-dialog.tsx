import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"
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
import { useWorkbench } from "@/features/workbench/store"
import { saveTodoList, useTodos } from "../store"

/** 清单校验通过后保存到服务端，失败保留输入与弹窗。 */
export function ListDialog({
  source,
  onClose,
}: {
  source?: { id: string; name: string }
  onClose: () => void
}) {
  const id = useId()
  const { busyIds } = useTodos()
  const pending = busyIds.includes(source?.id ?? "list:create")
  const { data } = useWorkbench()
  const [name, setName] = useState(source?.name ?? "")
  /** 服务端保存失败时保留名称，禁止等待期间更改已提交字段。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error("请输入清单名称。")
      return
    }
    if (
      data.todoLists.some(
        (record) => record.name === name.trim() && record.id !== source?.id
      )
    ) {
      toast.error("已有同名清单，请换一个名称。")
      return
    }
    if (await saveTodoList(name.trim(), source?.id)) {
      toast.success(source ? "清单已更新" : "清单已创建")
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{source ? "重命名清单" : "新建清单"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field>
            <FieldLabel htmlFor={id}>清单名称</FieldLabel>
            <Input
              disabled={pending}
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              placeholder="阅读计划"
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {source ? "保存清单" : "创建清单"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
