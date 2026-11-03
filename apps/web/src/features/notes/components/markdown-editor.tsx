import { useState } from "react"
import { InputGroup } from "@/components/ui/input-group"
import {
  SourceMarkdownEditor,
  type SourceMarkdownEditorProps,
} from "./source-markdown-editor"
import { MarkdownPreview } from "./markdown-preview"

/** 源码是唯一编辑入口，右侧始终展示同一草稿的实时预览。 */
export function MarkdownEditor(
  props: Omit<SourceMarkdownEditorProps, "previewPane">
) {
  const [composing, setComposing] = useState(false)
  return (
    <InputGroup
      // 单个格式按钮不可用不代表整篇文档被禁用。
      className="@container min-h-0 flex-1 items-stretch bg-card has-disabled:bg-card has-disabled:opacity-100 dark:bg-card dark:has-disabled:bg-card"
      aria-label="Markdown 编辑器"
    >
      <SourceMarkdownEditor
        {...props}
        onComposition={(active) => {
          setComposing(active)
          props.onComposition(active)
        }}
        previewPane={
          <MarkdownPreview markdown={props.value} active={!composing} live />
        }
      />
    </InputGroup>
  )
}
