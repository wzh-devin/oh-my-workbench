# 通用规则引擎

独立 Go 核心，只接受数据并返回判断结果或决策输出。无数据库、HTTP、Todo、全局缓存依赖，只使用标准库。

## 目录

```text
internal/shared/rules/
├── engine.go               # 公开 API 与生命周期
├── types.go                # 公共类型、扩展契约
├── internal/
│   ├── syntax/             # 规则与 schema 协议
│   ├── codec/              # JSON、重复键与结构检查
│   ├── compiler/           # schema 绑定、完整校验、编译
│   ├── value/              # 不可变值、精确十进制、日期时间
│   ├── operator/           # 注册、比较、文本、集合操作符
│   ├── eval/               # 程序、单次执行状态、成本、追踪
│   ├── decision/           # 决策集与命中策略
│   └── diagnostic/         # 结构化错误与限制
└── README.md
```

测试与所属包同目录；公开 API 集成与基准测试在根包。测试、JSON 示例与独立试验工具仅保留本地，由 Git 忽略。

## 调用 API

```go
schema, err := rules.DecodeSchema(schemaJSON)
if err != nil { return err }
engine, err := rules.NewEngine(rules.Config{Schema: schema})
if err != nil { return err }
program, err := engine.Compile(ruleJSON)
if err != nil { return err }
bindings, err := engine.BindJSON(factsJSON, contextJSON)
if err != nil { return err }
result, err := program.Evaluate(ctx, bindings, rules.EvalOptions{Trace: true})
if err != nil { return err }
fmt.Println(result.Matched)
```

实际 import 路径为 `github.com/devin/oh-my-workbench/api/internal/shared/rules`。Engine 固化 schema、操作符和限制；规则编译一次即可复用。Bindings 独立于具体规则，可以供同一个 Engine 的多个程序复用；不可跨 Engine 使用。

Engine、Program、Bindings 均可并发复用。每次执行单独分配状态，返回的 trace 和决策输出不共享内部存储。修改最初传入的 schema map 不影响已经创建的 Engine。自定义操作符自身必须保持纯函数、线程安全。

## 协议

```json
{
  "schemaVersion": 1,
  "root": {
    "kind": "condition",
    "op": "gte",
    "args": [
      { "kind": "fact", "path": "age" },
      { "kind": "constant", "value": 18 }
    ]
  }
}
```

| kind | 属性 | 含义 |
|---|---|---|
| constant | value: boolean | 固定结果 |
| all | children: Node[] | 全部满足，遇到 false 短路 |
| any | children: Node[] | 任意满足，遇到 true 短路 |
| not | child: Node | 单个子规则取反 |
| condition | op: string, args: Operand[] | 具体条件判断 |

分组至少一个子节点；无条件匹配请显式使用 `constant true`。编译检查所有分支，短路不会隐藏无效配置。只接受 `condition`，不接受旧讨论中的 `test`。

参数只有三种：`fact` 读取 facts，`context` 读取显式上下文，`constant` 使用字面值。参数中的 constant 可以是数值、字符串等；作为规则节点时只能是布尔值。日期、时间与空数组常量需要声明类型：

```json
{ "kind": "constant", "type": "date", "value": "2026-10-29" }
```

```json
{ "kind": "constant", "type": "string[]", "value": [] }
```

## Schema 与值语义

```json
{
  "facts": {
    "account.age": { "type": "number", "required": true },
    "name": { "type": "string", "nullable": true },
    "tags": { "type": "string[]" }
  },
  "context": {
    "today": { "type": "date", "required": true }
  }
}
```

`account.age` 对应输入 `{"account":{"age":20}}`；路径不支持数组下标、通配符或对象键中的点。段名由字母/下划线开头，随后允许数字。不能同时声明一个标量及其子路径。输入中未声明的额外字段被忽略，仍受 JSON 体积、深度、字符串等限制约束。

类型为 `boolean`、`string`、`number`、`date`、`timestamp` 及它们的 `[]` 数组。数组同构且不包含 null；不支持对象比较或隐式转换。`"20"` 不等于数值 `20`。

- 缺失的 required 字段：绑定失败。
- 缺失的可选字段：保留 Missing，`exists` 返回 false；其他操作符读取时报错。用 `all(exists(...), condition(...))` 显式保护。
- null：只有 nullable 字段可以接收；`exists` 为 true，`is_null` 为 true，`is_empty` 为 false。
- `eq`/`ne` 支持 null 判断；其他比较、包含与集合谓词遇到 null 返回 false。
- `is_empty` 只判断空字符串或空数组；空格不为空。
- 字符串比较区分大小写，按 UTF-8 字典顺序；没有地区排序或自动 trim。
- 数值按精确十进制比较，`1`、`1.00`、`1e0` 等价，超过 2^53 的整数不会丢失精度。数字文本至多 256 字节，原始指数限制为 ±10000；不执行浮点算术。
- date 为 `YYYY-MM-DD`；timestamp 为 RFC3339、最多纳秒精度，按瞬时时间比较。时间只在绑定/编译阶段解析；今天、当前时间和业务时区由调用方确定后传入 context。

## 内置操作符

| op | 参数 | 语义 |
|---|---|---|
| eq / ne | 同类型值，或与 null 比较 | 相等 / 不等；数组按顺序逐项比较 |
| gt / gte / lt / lte | 同类型的数值、字符串、日期或时间 | 大于 / 大于等于 / 小于 / 小于等于 |
| between | value, lower, upper | 闭区间，包含两个边界 |
| in / not_in | 标量, 同类型数组 | 标量在 / 不在数组中 |
| has_any | 数组 A, 数组 B | A 包含 B 中任意元素；B 为空时 false |
| has_all | 数组 A, 数组 B | A 包含 B 中全部元素；B 为空时 true，重复元素不要求重复次数 |
| contains | 字符串, 子串 | 包含子串 |
| exists | 任意参数 | 字段存在，包括值为 null |
| is_null | 任意参数 | 值为 null；Missing 报错 |
| is_empty | 字符串或数组 | 长度为零；null 为 false |

`in`、`not_in`、`has_any` 的右侧常量集合在编译时建立查找表。动态集合扫描；`has_all` 逐项检查，最坏 O(A×B)，受数组与成本上限限制。

## 扩展操作符

注册发生在创建 Engine 时，重名（包括覆盖内置操作符）会被拒绝。编译器只负责检查参数并生成执行函数；不要在编译或执行函数里做数据库/网络操作。

```go
startsWith := rules.Operator{
    Name: "text.starts_with",
    Compile: func(args []rules.Argument) (rules.Predicate, error) {
        if len(args) != 2 || args[0].Type() != rules.String || args[1].Type() != rules.String {
            return nil, fmt.Errorf("text.starts_with needs two strings")
        }
        left, right := args[0], args[1]
        return func(e *rules.Evaluation) (bool, error) {
            a, err := left.Read(e)
            if err != nil { return false, err }
            b, err := right.Read(e)
            if err != nil { return false, err }
            if err := e.Charge(int64(a.Len()+b.Len()+1)); err != nil { return false, err }
            if a.Type() == rules.Null || b.Type() == rules.Null { return false, nil }
            return strings.HasPrefix(a.Text(), b.Text()), nil
        }, nil
    },
}
engine, err := rules.NewEngine(rules.Config{Schema: schema, Operators: []rules.Operator{startsWith}})
```

`Argument.Constant()` 可在编译时获取固定值并预计算。`Argument.Read()` 保留 Missing 错误；仅在需要显式存在性检查时使用 `Optional()`。Value 不暴露可变的底层切片。

## 决策集

`Engine.CompileSet` 接收以下格式；每条 `condition` 使用相同的节点协议：

```json
{
  "schemaVersion": 1,
  "hitPolicy": "FIRST",
  "rules": [
    { "name": "fallback", "condition": { "kind": "constant", "value": true }, "output": { "level": "standard" } }
  ]
}
```

- `FIRST`：按声明顺序，返回第一个匹配项。
- `RULE_ORDER`：返回所有匹配项，保持声明顺序。
- `UNIQUE`：允许零或一个匹配项；多个匹配时报 `multiple_matches`。

规则名非空且唯一，output 必须存在，允许任意受限 JSON（包括 null）。输出只是数据，不自动发送消息或修改业务。执行失败时不能使用部分决策结果；API 返回诊断与 error，CLI 不向 stdout 输出成功结果。

## 限制、错误与追踪

默认限制：规则 1 MiB，facts+context 合计 1 MiB，规则深度 16，规则及参数共 4096 节点，决策集 128 条，数组 1024 项，字符串 16 KiB，成本 1,000,000，trace 4096 项。Config.Limits 可以覆盖；单次 EvalOptions.MaxCost 只能降低成本上限。最大可配置规则深度为 128。

成本是逻辑工作预算，不能换算成 CPU 时间。内置操作符按节点、字符、数值位数和集合遍历计费并检查 context；自定义操作符必须主动调用 `Charge` 并响应 context。无法强制中断不合作的 Go 函数，也不捕获其 panic。

错误可通过 `errors.As(err, &detail)` 获取 `*rules.Error` 的 `Code`、`Path`、`Message`；支持 Unwrap。取消可同时使用 `errors.Is(err, context.Canceled)`。协议拒绝重复键、未知属性、错误类型、未知字段/操作符和多份尾随 JSON。

Trace 默认关闭；开启后按执行完成顺序记录 matched/unmatched/skipped/error。达到上限时设置 traceTruncated，不改变判断结果；skipped 表示未执行，不代表 false。Trace 不包含输入数据。

## 验证

在 `apps/api/` 执行：

```bash
go vet ./internal/shared/rules/...
go build ./internal/shared/rules/...
```

当前规则与数据由本地 JSON 文件管理，持久化、发布版本与业务接入留给独立的上层模块。
