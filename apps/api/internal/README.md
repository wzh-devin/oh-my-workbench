# 后端目录与职责

```text
internal/
  app/                    数据库/缓存初始化、依赖装配、Gin 与 Worker 生命周期
  router/<模块>/          路由注册、身份读取、请求解码和 HTTP 响应
  service/<模块>/         业务校验、状态规则、跨表流程和后台任务
  service/s3/             可复用的 S3 客户端、分片、签名与安全连接
  repository/             表结构、TableName 与查询按去掉 omw_ 的表名同文件维护
  domain/
    <模块>/               跨层共用的纯业务规则、业务错误与常量
    req/<模块>/           HTTP 请求结构体与字段约束
    dto/<模块>/           内部传递的数据、缓存载荷、配置和授权内容流
    resp/<模块>/          独立的 HTTP 响应结构体
  platform/               数据库/Redis 连接、出站代理和日志
  shared/                 ID、密码、令牌、规则引擎与响应信封
```

业务模块为 auth、assets、mail、notes、settings、todos、workbench。依赖方向为 `router → service → repository → domain`，Router 与 Service 可以使用各类 Domain 数据；Domain 不依赖上述 IO 层。

## Router 与 Service

Router 同时保存路由注册和 HTTP 处理函数，不另设 Handler 层。`app/router.go` 创建 Gin、配置全局安全中间件并挂载各业务 Router；`router/<模块>` 解析路径、查询和请求体，读取身份，调用 Service，再设置状态码、Cookie、响应头或文件流。`gin.Context` 只在 Router 中使用。

Service 保留业务校验、流程和 Worker，SQL、GORM、Redis 操作全部放在 Repository。WebAuthn 等既有协议适配保留标准库 HTTP 请求边界，不把 Gin 引入 Service。资产对 S3 的凭证解密、引用、上传状态机和完整文件校验仍属于资产业务；S3 服务只接收独立存储配置与 Bucket/Key 等对象参数。

## Repository

`repository.New(db, redis)` 在 app 中统一构造 Store。各表入口例如 `store.User`、`store.AssetConnection`、`store.AssetEntry`、`store.TodoStep`；对应文件为 `user.go`、`asset_connection.go`、`asset_entry.go`、`todo_step.go`。Service 不再实例化其他业务模块的 Repository。

每个表文件同时定义表结构、TableName、对应 Repository 和关联原子操作，联表查询按主实体归属，不为了文件拆分拆散事务。`AssetEntry.Write`、`Todo.Write` 回调接收同一个事务作用域的 Store；其中所有表入口共享原来的 tx、用户锁与上下文，数据库/缓存句柄均私有。事务内不执行对象上传等网络传输。

Workbench 没有业务表，其 UNION、聚合和通知已读操作放在 `workbench_queries.go`；保留数据库排序与分页。Redis 不虚构表，按 `auth_session.go`、`mail_events.go`、`mail_body.go`、`note_access.go`、`note_ceremony.go` 组织。规则编译、游标等 SQL 辅助函数留在 Repository 对应查询文件。

## 数据类型

请求、响应和内部 DTO 分别维护，不嵌入 Repository 表模型，也不为每张表再建 entity 镜像。文件按实际业务内容命名，例如 `req/assets/connection.go`、`req/assets/upload.go`、`resp/assets/entry.go`、`dto/assets/statistics.go`；不使用 `dto.go`、`model.go`、`operations.go` 汇集不同职责。

`req` 中的命名类型统一使用 `XxxRequest`，`resp` 中统一使用 `XxxResponse`，包含内嵌结构和列表元素。名称表达业务用途，例如 `SaveAccountRequest`、`EntryPageRequest`、`NoteResponse`、`MessagePageResponse`；不再混用 `Input`、`View`、`Info`、`Result` 作为请求/响应类型后缀。类型改名时同步所有调用方，不保留旧名称别名，JSON 字段继续由标签和原有嵌入方式决定。

表模型、TableName 与查询在同一文件，关联行与分页查询结果随主表维护。DTO 保存内部传递的数据结构；跨层共用的名称校验、标识解析、预览规则和业务错误归 `domain/<模块>`，不依赖 IO。S3 协议错误随 `service/s3` 维护。结构自身的方法与结构放在一起；网络调用、数据库操作和业务编排仍归对应 Service 或 Repository。

资产和邮箱由 Router 的响应函数逐字段投影为 resp，不使用 JSON 往返转换；凭证、密文、租约和对象定位等内部字段不会加入公开结构。BIGINT 仍以字符串输出，资产 ParentID 的可空字符串、空数组/null 与省略字段契约保持原样。

测试及辅助工具统一放在 `apps/api/test/<模块>/`，保留本地并由根 `.gitignore` 忽略。验证使用 `go test -race ./...`、`go vet ./...`、`go build ./...`；表映射变更仍需新增 Goose 迁移。
