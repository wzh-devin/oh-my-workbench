# 规则要求
1. 如果没有明确要求，严禁开启使用多智能体，可以询问，但不能自己做决定
2. 严禁自己主动提交git记录，我审查之后，会明确说明提交与否
3. 不要自己主观臆测新增git工作树
4. 删除多余的标语、说明文字和次要标签。如果删除完界面就看不懂，说明布局本身就有问题，需要重新设计。
5. 每次修改都需要兼顾用户体验、开发体验和 AI Agent 的使用体验，三个都要变好，而且不能破坏现有功能。
6. `apps/*` 和 `packages/*` 的自动化测试均集中放在所属子项目根目录的 `test/<模块>/`，例如 `apps/api/test/<模块>/xxx_test.go`、`apps/web/test/<模块>/xxx.test.tsx`、`packages/<包名>/test/<模块>/xxx.test.ts`；测试辅助代码、mock、fixtures及测试专用脚本也放在对应 `test/` 内。禁止在业务源码中散放测试文件，禁止另建并存的 `tests/` 或 `__tests__/`。Go 测试通过导出接口或 HTTP 入口验证，不为测试搬动业务源码或专门开放私有实现。测试文件继续保留本地、不提交；业务试运行功能不属于自动化测试。

前端源码位于 `apps/web/src/`；下文的 `components/ui`、`components/reui` 等源码路径均相对此目录。ReUI/shadcn CLI 从 `apps/web/` 运行。

规则筛选器统一使用 `components/shared/rule-filters.tsx` 的 `RuleFilters`，以视图规则编辑器为样式基准；默认弹出式，视图表单使用 `mode="inline"`。业务页面只传 `fields`、`query`、`onQueryChange` 及必要的业务文案，不另写面板、操作栏或通用筛选文案。新增组合规则时直接计算规则树，禁止展平后丢失 AND/OR 与嵌套语义。

<!-- BEGIN:reui-agent-rules -->
## ReUI design rules (every UI edit, follow-ups included)

This project uses an existing design system: ReUI on shadcn/ui. Keep its look. Generic frontend advice (vary fonts or themes, gradients, page-load or staggered reveals, "2-3 intentional motions", Framer Motion) does not apply here, and other design skills lose where they disagree.

1. Use installed components first (`components/ui`, `components/reui`): tables `data-grid`, filtering `filters`, boards `kanban`, modals `Dialog` or `AlertDialog`, toasts `sonner`. Never set height, radius, padding, shadow or motion on them; use `size`, `variant`, `spacing`.
2. Color: semantic tokens. State: `<Badge variant="success-light">` from `@/components/reui/badge` at default size, or Alert variants. Raw palette only for categorical identity, with its `dark:` pair.
3. Spacing: `gap-*` on the parent: `gap-1` to `gap-2` in a row, `gap-3` to `gap-4` between groups, `gap-6` to `gap-8` between sections. Type: `text-sm` body, `text-xs` meta, nothing smaller; never resize FrameTitle or CardTitle.
4. Motion: installed parts already animate; never retime them. Yours: hover `transition-colors`; reveal `duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]`; transform and opacity only; never `transition-all`, bounce, or a stagger on table rows or lists of 20+; at most 1 entrance per view; `MotionConfig reducedMotion="user"` plus `motion-reduce:`.
5. Every data region: empty state with an action, `Skeleton` loading, inline error with Retry.
6. Before UI code, write the plan from `.agents/skills/reui/SKILL.md` in your reply. Before you finish, run its self-check on the files you changed and fix every hit (2 rounds at most). Full rules: `.agents/skills/reui/SKILL.md`. If that folder is missing, call the `reui` MCP tool `get_agent_skill`.

Managed by the ReUI installer. Edits between the markers are replaced on the next run.
<!-- END:reui-agent-rules -->
