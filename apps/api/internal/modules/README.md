# 业务模块目录

`assets`、`auth`、`mail`、`notes`、`settings`、`todos` 采用相同结构，模块根目录只保留说明文档。

```text
<module>/
  domain/        模型、输入输出、错误与不依赖 IO 的共用规则
  handler/       HTTP 参数、响应、会话读取和 routes.go
  service/       业务校验、流程编排、外部服务与后台任务
  repository/    PostgreSQL、Redis、事务和持久化查询
```

依赖方向为 `handler → service → repository → domain`；Handler、Service 可以直接使用 Domain。Domain 不依赖其余三层，Repository 不依赖 Service 或 Handler。跨模块认证身份统一由 `auth/handler.CurrentUserID` 读取。

- 路由放在 `handler/routes.go`，应用组装位于 `internal/app`。
- 数据库连接保持为 Repository 的私有字段；所有 SQL、GORM、Redis 读写及事务只放在 `repository/`。
- 多层使用的类型、错误和纯校验函数放在 `domain/`，避免向上引用；HTTP 专用输入和外部协议细节留在对应层。
- 资产 S3/转换器、邮箱 IMAP/Web Push 及 Worker 由 `service/` 管理。后台任务沿用 Service 的生命周期。
- 每层内部按业务职责命名，如 `repository/entries.go`、`repository/uploads.go`、`service/body_cache.go`；不再重复目录名作为文件前缀。
- 系统配置统一存入 `omw_system_setting`，由 `settings/repository/settings.go` 按用户和键存取；具体配置的校验、编码和加密留在消费方，代理业务与邮箱租约事务使用同模块的 `proxy.go`。
- 测试统一放在 `apps/api/test/<模块>/`，测试辅助代码和 fixtures 也集中在该目录；通过导出接口或 HTTP 入口验证，不在业务层目录散放测试文件，不为测试专门开放私有实现。

新增业务模块沿用此结构，在 `internal/app` 显式组装和挂载，不新增注册框架或根目录类型别名。

从 `apps/api` 运行 `go vet ./...`、`go build ./...`。
