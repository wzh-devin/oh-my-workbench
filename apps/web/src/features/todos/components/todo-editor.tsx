import { useId, useState, type CSSProperties, type FormEvent } from "react"
import { Link } from "react-router"
import {
  PlusIcon,
  Trash2Icon,
  XIcon,
  MailIcon,
  ListIcon,
  FlagIcon,
  CalendarIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Choice } from "@/features/workbench/components"
import { todoSchema, formatTime, type Todo } from "@/features/workbench/model"
import { useWorkbench } from "@/features/workbench/store"
import {
  SHEET_SHELL,
  SHEET_FOOTER,
} from "@/features/settings/components/sections/sheet-parts"
import { createTodo, updateTodo, useTodos } from "../store"
import { TodoDatePicker } from "./todo-date-picker"
import { PrioritySelect } from "./priority-select"

/** 详情沿用现有浮动 Sheet，提交前验证整个草稿，失败不关闭或丢弃输入。 */
export function TodoEditor({
  todo,
  listId,
  defaults,
  onClose,
  onReload,
}: {
  todo?: Todo
  listId: string
  defaults?: Partial<Todo>
  onReload: () => void
  onClose: () => void
}) {
  const id = useId()
  // 后台刷新不能为尚未重载的草稿换用新版本号。
  const [editingTodo] = useState(todo)
  const { data } = useWorkbench()
  const { busyIds } = useTodos()
  const pending =
    busyIds.includes("import") || busyIds.includes(todo?.id ?? "task:create")
  const [title, setTitle] = useState(todo?.title ?? "")
  const [note, setNote] = useState(todo?.note ?? "")
  const [list, setList] = useState(todo?.listId ?? defaults?.listId ?? listId)
  const [due, setDue] = useState(
    todo ? (todo.dueDate ?? "") : (defaults?.dueDate ?? "")
  )
  const [planned, setPlanned] = useState(
    todo ? todo.plannedFor : (defaults?.plannedFor ?? null)
  )
  const [priority, setPriority] = useState(
    String(todo?.priority ?? defaults?.priority ?? 4)
  )
  const [tags, setTags] = useState(todo?.tags.join("，") ?? "")
  const [steps, setSteps] = useState(todo?.steps ?? [])
  const [stepTitle, setStepTitle] = useState("")
  const [done, setDone] = useState(todo?.done ?? false)
  const labels = [
    ...new Set(
      tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ]
  const addStep = () => {
    if (!stepTitle.trim() || steps.length >= 50) return
    setSteps((current) => [
      ...current,
      { id: crypto.randomUUID(), title: stepTitle.trim(), done: false },
    ])
    setStepTitle("")
  }
  /** 校验完整草稿后提交服务端，等待期间冻结字段以避免后续输入被关闭操作丢弃。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!data.todoLists.some((record) => record.id === list)) {
      toast.error("请选择有效的清单。")
      return
    }
    if (stepTitle.trim()) {
      toast.error("请先添加或清空正在输入的步骤。")
      return
    }
    const parsed = todoSchema.safeParse({
      ...(editingTodo ?? {
        id: crypto.randomUUID(),
        done: false,
        createdAt: new Date().toISOString(),
      }),
      title,
      note: note.trim(),
      listId: list,
      dueDate: due || null,
      plannedFor: planned,
      priority: Number(priority),
      tags: labels,
      steps,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }
    const changes = {
      title: parsed.data.title,
      note: parsed.data.note,
      listId: parsed.data.listId,
      dueDate: parsed.data.dueDate,
      plannedFor: parsed.data.plannedFor,
      priority: parsed.data.priority,
      tags: parsed.data.tags,
      steps: parsed.data.steps,
      done,
    }
    if (
      editingTodo
        ? await updateTodo(editingTodo, changes)
        : await createTodo(changes)
    ) {
      if (!todo) toast.success("待办已添加")
      onClose()
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <SheetContent
        className={SHEET_SHELL}
        style={{ "--sheet-width": "640px" } as CSSProperties}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle>{todo ? "待办详情" : "新增待办"}</SheetTitle>
            {todo && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>创建于 {formatTime(todo.createdAt)}</span>
                {todo.completedAt && (
                  <span>完成于 {formatTime(todo.completedAt)}</span>
                )}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="关闭待办详情"
            onClick={onClose}
            disabled={pending}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={submit}
          noValidate
        >
          <ScrollArea className="min-h-0 flex-1">
            <fieldset
              disabled={pending}
              className="flex flex-col gap-6 px-5 py-5"
            >
              <Field>
                <FieldLabel htmlFor={`${id}-title`}>待办内容</FieldLabel>
                <Input
                  id={`${id}-title`}
                  placeholder="请输入待办名称"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  required
                  autoFocus
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={done} onCheckedChange={setDone} />
                  标记已完成
                </label>
              </div>
              <Separator />
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
                <FieldLabel className="text-muted-foreground">
                  <ListIcon className="size-4" aria-hidden="true" />
                  所属清单
                </FieldLabel>
                <div className="min-w-0">
                  <Choice
                    value={list}
                    onChange={setList}
                    options={data.todoLists.map((record) => ({
                      value: record.id,
                      label: record.name,
                    }))}
                    label="所属清单"
                  />
                </div>
                <FieldLabel
                  htmlFor={`${id}-date`}
                  className="text-muted-foreground"
                >
                  <CalendarIcon className="size-4" aria-hidden="true" />
                  截止日期
                </FieldLabel>
                <TodoDatePicker
                  id={`${id}-date`}
                  value={due}
                  onChange={setDue}
                />
                <FieldLabel
                  htmlFor={`${id}-planned`}
                  className="text-muted-foreground"
                >
                  <CalendarIcon className="size-4" aria-hidden="true" />
                  计划日期
                </FieldLabel>
                <TodoDatePicker
                  id={`${id}-planned`}
                  label="计划日期"
                  value={planned ?? ""}
                  onChange={(value) => setPlanned(value || null)}
                />
                <FieldLabel className="text-muted-foreground">
                  <FlagIcon className="size-4" aria-hidden="true" />
                  优先级
                </FieldLabel>
                <PrioritySelect
                  value={priority}
                  onChange={setPriority}
                  priorities={data.todoPriorities}
                  disabled={pending}
                />
              </div>
              <Separator />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">步骤</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {steps.filter((step) => step.done).length}/{steps.length}
                  </span>
                </div>
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <Checkbox
                      aria-label={`完成步骤：${step.title}`}
                      checked={step.done}
                      onCheckedChange={(checked) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, done: checked }
                              : item
                          )
                        )
                      }
                    />
                    <Input
                      aria-label={`步骤 ${index + 1}`}
                      placeholder="请输入步骤内容"
                      value={step.title}
                      maxLength={200}
                      onChange={(event) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, title: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`删除步骤 ${index + 1}`}
                      onClick={() =>
                        setSteps((current) =>
                          current.filter((item) => item.id !== step.id)
                        )
                      }
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="新增步骤"
                    value={stepTitle}
                    maxLength={200}
                    placeholder="添加步骤…"
                    onChange={(event) => setStepTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addStep()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!stepTitle.trim() || steps.length >= 50}
                    onClick={addStep}
                  >
                    <PlusIcon aria-hidden="true" />
                    添加步骤
                  </Button>
                </div>
              </div>
              <Separator />
              <Field>
                <FieldLabel htmlFor={`${id}-note`}>备注</FieldLabel>
                <Textarea
                  id={`${id}-note`}
                  placeholder="添加备注"
                  value={note}
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
              <Separator />
              <Field>
                <FieldLabel htmlFor={`${id}-tags`}>标签</FieldLabel>
                <Input
                  id={`${id}-tags`}
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  maxLength={250}
                  placeholder="工作，沟通"
                />
              </Field>
              {todo?.source && (
                <Button
                  type="button"
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      to={`/mail?message=${encodeURIComponent(todo.source.id)}`}
                    />
                  }
                >
                  <MailIcon aria-hidden="true" />
                  查看原邮件
                </Button>
              )}
            </fieldset>
          </ScrollArea>
          <div className={SHEET_FOOTER}>
            {todo &&
              data.todos.some(
                (latest) =>
                  latest.id === todo.id &&
                  latest.version !== editingTodo?.version
              ) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onReload}
                  disabled={pending}
                >
                  重新载入
                </Button>
              )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              保存待办
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
