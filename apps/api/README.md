# Go API

## 启动

需要 Go 1.26.5、PostgreSQL 和 Redis。在本目录按 `.env.example` 配置 `.env`，已有进程环境变量优先。

```sh
go run ./cmd/server
```

此命令不监视文件变化。修改 Go 代码或迁移后，需停止并重新启动 API；根目录的 `pnpm dev` 也不会自动重启 Go 进程。Vite 的前端热更新不代表后端已更新，联调时应确认实际 API 进程已加载当前代码，并从页面验证保存与刷新。

只有一个 `cmd/server` 入口。启动时复用现有数据库连接池执行 Goose 迁移，成功后连接 Redis 并启动 Gin；失败则退出。直接运行构建后的二进制执行相同流程。

```text
cmd/server/main.go
  → internal/app.Run
    → database.InitDatabase
    → migrations.Up
    → cache.InitRedis
    → app.newRouter / Gin
```

## 数据库迁移

Goose v3.29.0 作为 Go 库使用，无需安装迁移 CLI。`migrations/*.sql` 通过标准库 `go:embed` 编译进二进制，运行时不依赖 SQL 文件所在目录。

Goose 自动创建 `goose_db_version` 并记录已执行版本，重复启动只执行新增迁移。使用官方 PostgreSQL session advisory lock，多个实例不会同时执行迁移。每个 SQL 迁移默认在事务中执行，失败不记录成功版本。

### 新增表或字段

1. 修改对应业务模块（如 `internal/modules/auth/model.go`）中的 GORM 模型。
2. 在 `migrations/` 新增时间戳命名的 SQL 文件，例如 `20261029120000_add_user_avatar.sql`。
3. 编写并审查 SQL，在隔离数据库验证后随代码保留。
4. 启动服务，Goose 自动应用未完成的迁移。

```sql
-- +goose Up
ALTER TABLE omw_user ADD COLUMN avatar_url text;
```

Goose 负责执行和版本记录，不根据 GORM 模型生成 SQL。已执行的迁移文件不修改，后续变更新增文件。版本表记录执行历史，不校验已执行 SQL 的内容变更。

业务表沿用应用生成 BIGINT ID、TIMESTAMPTZ 时间字段；不引入 CHECK、外键或数据库枚举。Goose 自带版本表使用工具原生结构。

### 已有数据库

初始迁移用于空业务库。如果数据库已手工建表或由其他迁移工具管理，应先核对表结构并按 Goose 官方方式建立基线，再启动新服务。不要删除业务表、改写已执行迁移或直接把其他工具的版本记录当成 Goose 记录。启动程序不会自动认领已有表，也不会清理旧工具的元数据。

## 命令

| 命令 | 用途 |
| --- | --- |
| `go run ./cmd/server` | 执行待完成迁移并启动服务 |
| `go build -o bin/server ./cmd/server` | 构建 `bin/server`，包含 SQL 文件 |
| `./bin/server` | 运行构建后的服务 |
| `gofmt -w cmd internal migrations` | 格式化 Go 源码 |
| `go vet ./...` | 静态检查 |
| `go test ./...` | 运行测试 |

本地 PostgreSQL 集成测试通过 `TEST_DATABASE_URL` 指定隔离测试库：

```sh
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5432/workbench_test?sslmode=disable TEST_REDIS_ADDR=127.0.0.1:6379 go test -race ./...
```

## 目录

```text
cmd/server/main.go          程序入口
internal/
  app/                      启动编排、依赖组装、总路由
  config/                   应用配置
  modules/
    auth/                   认证：routes、handler、service、repository、model、dto、errors
    todos/                  待办：清单、步骤、日期、标签、来源和旧数据导入
  platform/
    database/               PostgreSQL 连接
    cache/                  Redis 连接
  shared/                   password、token、idgen、response
migrations/
  migrations.go             嵌入 SQL 和执行迁移
  *.sql                     版本化 SQL
```

参考：[Goose](https://github.com/pressly/goose)、[Goose Provider 与 PostgreSQL 锁](https://pressly.github.io/goose/documentation/provider/)。

## 管理员初始化与登录

首次部署打开前端 `/login`，页面通过 `GET /api/auth/status` 检查初始化状态。未初始化时打开管理员配置 Dialog；提交 `POST /api/auth/initSystemAdmin`，以事务锁原子创建管理员和初始化记录，重复初始化返回 409。已有管理员也会关闭初始化入口，不覆盖已有账号。

初始化完成后使用用户名和密码调用 `POST /api/auth/login`。用户名 1–64 字符，密码 6–24 字符；错误密码和停用账号返回 401。连续 10 次失败后，该用户名最多限制 60 秒，返回 429。`GET /api/auth/me` 校验 JWT、Redis 会话和当前账号状态；`POST /api/auth/logout` 撤销该会话并删除 Cookie。所有响应使用现有 `code/message/data` 信封，BIGINT 用户 ID 按字符串返回。

浏览器会话使用 HttpOnly、SameSite=Lax Cookie，有效期 12 小时；JWT 不写入前端存储。API 调用方可以继续使用 login 返回的 token 作为 Bearer 令牌。写接口检查 Origin/Host，反向代理应保留公网 Host。

`HTTP_ADDR` 默认 `localhost:11990`；`COOKIE_SECURE` 默认 true。HTTP 本地开发需明确设置 `COOKIE_SECURE=false`，HTTPS 生产部署设置 true。初次部署应先限制入口并完成管理员配置，再对外开放。Go 仅提供 API，前端静态文件和 SPA fallback 由部署的 Web 服务器提供。

认证集成测试额外要求 `TEST_REDIS_ADDR`。测试创建独立 PostgreSQL schema，清空指定 Redis 的 database 15，必须使用隔离测试服务；未提供两个测试变量时跳过认证集成测试。

## 模块路由与数据库边界

`app/router.go` 只创建 Gin、安装公共中间件、组装依赖并挂载模块。具体接口放在模块的 `routes.go`，通过 `Handler.RegisterRoutes(*gin.RouterGroup)` 注册；Todo 挂载到带会话校验的 `/api/todos` 分组。

Handler 负责 HTTP 协议；Service 负责业务校验和流程编排；所有 SQL/GORM 及 Redis 读写必须放在 Repository 文件。事务和用户行锁由 Repository 提供，Service 在事务内调用仓储方法。禁止在 Service 中声明 Repository 方法来绕过文件边界。

## Todo

所有接口需要当前登录会话；用户身份只取服务端会话，不能通过请求指定。复用 `code/message/data` 信封，业务 ID 均为字符串；日期为 `YYYY-MM-DD`，时间为 RFC3339。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/todos` | 当前用户的清单、待办（含步骤）、视图和优先级一致性快照 |
| POST | `/api/todos/lists` | 创建清单，提交 `name` |
| PATCH | `/api/todos/lists/:id` | 重命名清单，提交 `name` |
| DELETE | `/api/todos/lists/:id` | 清单内待办移入收集箱，保留步骤 |
| POST | `/api/todos/tasks` | 创建待办，至少提交 `title` |
| PATCH | `/api/todos/tasks/:id` | 提交 `version` 和要修改的字段 |
| DELETE | `/api/todos/tasks/:id` | 提交 `version`，同时删除步骤 |
| POST | `/api/todos/import` | 导入旧 `{todoLists,todos}` 存档，按旧 ID 幂等处理 |
| POST | `/api/todos/views` | 创建视图，提交名称、图标、规则、关键词和排序 |
| PATCH | `/api/todos/views/:id` | 更新完整视图配置，同时提交 `version` |
| DELETE | `/api/todos/views/:id` | 提交 `version`，至少保留一个活动视图 |
| PUT | `/api/todos/priorities` | 按数组顺序批量保存四档名称、HEX 颜色及版本 |

收集箱是 `listId: null`，不创建默认清单记录。任务支持 `title`、`note`、`listId`、`done`、`priority`、`dueDate`、`plannedFor`、`tags`、`steps`；创建时可提供 `source: {kind:"mail",id,label}`，同一用户重复转同一来源返回原待办。PATCH 可用 null 清空日期或移入收集箱，省略字段保持原值。来源创建后不可修改。

步骤随父任务保存；已有步骤携带字符串 `id`，新增步骤省略 `id`，服务端分配 ID。完成任务同时完成步骤，重新打开保留步骤状态。任务写入和清单移动增加版本；陈旧版本返回 409，不覆盖后续修改。不存在或属于其他用户的记录均返回 404。

前端显式点击“导入本地待办”后才导入实际存档；导入成功或失败都保留浏览器原始备份，不自动上传内置样例。已导入记录不覆盖远端编辑。业务数据使用 PostgreSQL，Redis 仅继续承担认证会话与登录限流。

快照增加 `todoViews`、`todoPriorities`。首次初始化持久化“全部待办、我的一天、已逾期、已完成”，预置视图可以删除，删除记录不重新预置；删除视图不修改任务。所有配置写入在当前用户行锁事务中校验归属、版本和剩余视图数量。

视图配置包含 `name`、Lucide 图标标识 `icon`、通用规则文档 `filterQuery`、`searchText`、`sort`（`due/priority/newest`）。规则使用 `schemaVersion:1` 与 `root`，仅包含 `constant/all/any/not/condition` 五种节点，由独立的 `internal/shared/rules` 编译检查。Todo 限定状态、清单、优先级、标签、计划日期、截止日期六个字段；日期上下文使用浏览器本地的 `today/yesterday/tomorrow`。每用户最多 100 个活动视图，每条规则最多 32KiB、8 层、256 节点。

优先级提交 `{priorities:[{value,name,color,version},...]}`，必须包含稳定 `value=1..4` 各一次，数组下标为排序。名称各不相同、最多 24 字；颜色为不透明 `#RRGGBB`，返回时规范为小写，读取兼容既有颜色标识。修改名称、颜色和顺序不重写任务与规则引用。旧版本或任意一行失败时整批回滚。

首版按个人工作台规模批量读取完整快照；任务达到万级或响应超出预算时需升级服务端分页。两次增量迁移分别创建任务三表和配置两表，不修改旧表；回滚代码时保留已写入业务表。
