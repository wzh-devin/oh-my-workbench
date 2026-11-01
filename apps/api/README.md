# Go API

## 启动

需要 Go 1.26.5、PostgreSQL 和 Redis。复制项目根目录的 `.env.example` 为根目录的 `.env.local` 并填写配置，已有进程环境变量优先。后端不再保留单独的环境文件；以下 Go 命令从 `apps/api` 运行，根目录的 pnpm 启动命令已使用此工作目录。

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

1. 修改对应业务模块（如 `internal/modules/auth/domain/model.go`）中的 GORM 模型。
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
    auth/                   认证：管理员初始化、登录和会话
    todos/                  待办：清单、步骤、日期、标签、来源和旧数据导入
    mail/                   邮箱：账号、只读收信、通知、推送和后台监听
    assets/                 资产：连接、目录、上传、预览和后台恢复
    <module>/domain/        模型、输入输出、错误和共用纯规则
    <module>/handler/       HTTP 接口与 routes.go
    <module>/service/       业务编排、外部服务与后台任务
    <module>/repository/    数据库访问、查询和事务
  platform/
    database/               PostgreSQL 连接
    cache/                  Redis 连接
  shared/                   password、token、idgen、response
migrations/
  migrations.go             嵌入 SQL 和执行迁移
  *.sql                     版本化 SQL
```

模块职责与依赖规范见 [业务模块目录](internal/modules/README.md)。

参考：[Goose](https://github.com/pressly/goose)、[Goose Provider 与 PostgreSQL 锁](https://pressly.github.io/goose/documentation/provider/)。

## 管理员初始化与登录

首次部署打开前端 `/login`，页面通过 `GET /api/auth/status` 检查初始化状态。未初始化时打开管理员配置 Dialog；提交 `POST /api/auth/initSystemAdmin`，以事务锁原子创建管理员和初始化记录，重复初始化返回 409。已有管理员也会关闭初始化入口，不覆盖已有账号。

初始化完成后使用用户名和密码调用 `POST /api/auth/login`。用户名 1–64 字符，密码 6–24 字符；错误密码和停用账号返回 401。连续 10 次失败后，该用户名最多限制 60 秒，返回 429。`GET /api/auth/me` 校验 JWT、Redis 会话和当前账号状态；`POST /api/auth/logout` 撤销该会话并删除 Cookie。所有响应使用现有 `code/message/data` 信封，BIGINT 用户 ID 按字符串返回。

浏览器会话使用 HttpOnly、SameSite=Lax Cookie，有效期 12 小时；JWT 不写入前端存储。API 调用方可以继续使用 login 返回的 token 作为 Bearer 令牌。写接口检查 Origin/Host，反向代理应保留公网 Host。

根目录 [Dockerfile](../../Dockerfile) 和 [docker-compose.yaml](../../docker-compose.yaml) 提供包含前端与文件预览的应用镜像，Docker 统一入口为 `8080`，具体用法见[生产部署](../../README.md#docker-compose-部署)。

API 固定监听 `:11990`；应用镜像通过 Nginx 对外提供 `8080`，例如用 `18080:8080` 调整宿主机端口。`COOKIE_SECURE` 在 API 中默认 true，根 Compose 为 HTTP 访问设为 false；HTTPS 部署设置 true。初次部署应先限制入口并完成管理员配置，再对外开放。Go 仅提供 API，前端静态文件和 SPA fallback 由镜像内 Nginx 或手动部署的 Web 服务器提供。

账号安全页仅保留修改密码。`GET /api/account/security` 返回 `data: {"passwordSet": true}`；`POST /api/account/security/password` 接收 `currentPassword`、`newPassword`（均为 6–24 字符），只修改会话所属用户。确认密码由前端校验，不发送到后端。当前密码错误、相同新密码或输入无效返回 400；每用户每 60 秒最多 10 次改密请求，超限返回 429。并发冲突返回 409，重新登录后重试。

密码成功写入时原子增加 `omw_user.session_version`；所有旧 Cookie/Bearer 会话随即失效，当前请求换发 HttpOnly Cookie，并在 `data.token` 返回对应 Bearer 令牌。旧 Redis 会话缺省版本为 0，迁移后首次改密前继续有效；已有用户名、密码摘要及业务数据保持不变。新会话先写入 Redis 的未来版本，再以旧哈希和旧版本比较更新数据库，Redis 失败时不修改密码；未提交的未来会话不通过鉴权。迁移 `20261101190000_password_session_version.sql` 由启动自动执行，部署时所有 API 实例须更新，旧版本不识别会话版本。邮箱验证与 MFA 暂缓，不展示未接通的入口。

认证集成测试额外要求 `TEST_REDIS_ADDR`。测试创建独立 PostgreSQL schema，清空指定 Redis 的 database 15，必须使用隔离测试服务；未提供两个测试变量时跳过认证集成测试。

## 模块路由与数据库边界

`app/router.go` 只创建 Gin、安装公共中间件、组装依赖并挂载模块。具体接口放在模块的 `handler/routes.go`，通过 `Handler.RegisterRoutes(*gin.RouterGroup)` 注册；Todo 挂载到带会话校验的 `/api/todos` 分组。

Handler 负责 HTTP 协议；Service 负责业务校验和流程编排；所有 SQL/GORM 及 Redis 读写必须放在 `repository/`。事务和用户行锁由 Repository 提供，Service 在事务内调用仓储方法。禁止在 Service 中声明 Repository 方法来绕过目录边界。

## 邮箱与来信通知

支持 QQ、Gmail 的 INBOX；用户填写显示名称、完整邮箱地址、QQ 授权码或 Gmail 应用专用密码。主机分别为 imap.qq.com / imap.gmail.com，端口 993，强制校验证书的 TLS。Gmail 应用密码要求账号支持并开启两步验证；本轮不包含 OAuth、自定义服务器、发信或远端删除。

首次启动在数据库迁移完成后自动初始化登录签名、邮箱/资产凭证加密与 Web Push 密钥，保存至 `omw_system_setting` 的系统作用域（`user_id=0`、`key=system.runtime`）。初始化不依赖管理员已创建，并发启动仅使用数据库胜出的同一份配置，重启不重新生成。管理员在“设置 → 通用”填写推送联系地址（例如 `mailto:admin@example.com`）；留空时浏览器推送关闭，邮箱和站内通知仍可使用。普通配置保存后供所有实例按使用时读取，无需重启。

系统配置只使用数据库，不读取旧密钥环境变量或本地密钥文件，也无需运行 Go 命令。内部密钥不经管理接口返回，不提供网页重置入口；备份和恢复必须包含系统配置记录，数据库配置损坏时拒绝重新生成。

后台与网页生命周期独立。账号启用后每实例每5秒协调监听租约；每账号只有一个有效监听者，每10秒续租，失效或暂停后旧事务拒绝写入。优先采用 IMAP IDLE，同时每30秒退出并补查，避免服务商漏发实时事件后长时间等待；不支持 IDLE 时同样每30秒检查。网络错误按2、4、8…60秒退避重连，服务重启根据持久化游标补拉。手动同步复用同一个队列与监听者。

初始化先记录 UIDVALIDITY / UIDNEXT 边界，历史回填与实时增量分离，每批最多100封且新信优先。历史回填不产生新信通知。邮件、附件元数据、通知、投递任务和游标同事务提交，失败可重放；唯一键阻止重复邮件和通知。UIDVALIDITY变化后建立当前代次索引，旧缓存保留且不混入普通列表。

列表只返回邮件头并由服务端分页、搜索、排序；筛选复用通用规则文档，保留 AND/OR/NOT，允许阅读/星标/附件布尔值、发件人/地址/主题文本、来源邮箱等值和收件时间比较。正文按需缓存文本与原始 HTML v2（解码前后上限8MiB），HTML 优先于 MIME 的纯文本备选；前端用 DOMPurify 清理，再由 sandbox iframe 和 CSP 隔离。命中任何版本的正文缓存都立即返回；旧缓存异步升级，单消费者、32条排队上限、同邮件去重、每次最长45秒，退出时取消，失败保留原文供下次重试。首次无缓存才同步访问远端。附件不存二进制，通过已鉴权的邮件与MIME部件定位流式下载；未缓存内容依赖远端邮件仍可访问。BODY.PEEK与只读选择不修改原邮箱，工作台阅读/星标独立保存并使用version防止覆盖。

同步邮件头使用 `BODY.PEEK[HEADER]` 读取完整头部，经已安装的 go-message 解析后复用原消息/附件映射，不依赖厂商生成的 `ENVELOPE` 字符串，也不使用可能返回空内容的 `HEADER.FIELDS` 投影。地址解析后再解码引号内的 MIME 显示名称，支持 UTF-8、GBK 等已有字符集。UID、INTERNALDATE、FLAGS、RFC822.SIZE 与 BODYSTRUCTURE 继续在同一次 FETCH 中读取；每批100封、游标提交与失败保留规则不变，不跳过邮件。完整原始头不会返回前端或写入日志。

所有接口安装现有会话校验，身份只能取服务端；JSON业务ID为字符串，复用code/message/data信封：

| 方法 | /api/mail 下的路径 | 用途 |
| --- | --- | --- |
| GET / POST | /accounts | 列表 / 验证并添加 |
| PATCH | /accounts/:id | 名称、凭证、自动同步、来信通知；携带version |
| POST | /accounts/:id/sync | 202返回已有或新建同步任务 |
| GET | /sync-jobs/:id | 任务状态与处理数量 |
| POST | /messages/query | accountId/searchText/filterQuery/page/pageSize/sort/archived/afterId |
| POST | /messages/bulk | 同列表筛选范围，action 为 read 或 archive-read；返回 affected |
| GET / PATCH | /messages/:id | 详情 / 阅读星标、归档恢复与version |
| GET | /attachments/:id/download | 安全附件下载 |
| GET | /overview | 全量计数、按上海日期聚合的活动、最近100封邮件头与通知 |
| GET | /events | SSE失效通知；重连读取数据库状态 |
| GET | /notifications?before=:id | 每页100条，before为上一页末尾ID |
| PATCH | /notifications/read | ids数组或all:true；通知已读独立于邮件已读 |
| PUT | /preferences | enabled控制全局邮件通知 |
| GET | /push/config | 公开VAPID公钥和邮箱配置状态 |
| POST / DELETE | /push/subscriptions | 注册 / 解绑当前浏览器订阅 |

查询例：POST /api/mail/messages/query，提交 {"accountId":"all","searchText":"项目","page":1,"pageSize":20,"sort":"newest"}。返回 {"code":0,"message":"success","data":{"messages":[],"total":0}}。pageSize最多100，sort为newest/oldest/subject；filterQuery采用共享schemaVersion:1规则。PATCH邮件提交 {"version":1,"read":true}；陈旧版本409，越权记录404。

数据库字段、默认值和索引见 migrations/20261030120000_mail.sql：

| 表 | 职责与关键索引 |
| --- | --- |
| omw_mail_account | 账号、密文、开关、版本、连接状态、监听租约；用户＋小写邮箱唯一 |
| omw_mail_mailbox | INBOX代次、历史边界/游标、实时游标；账号＋文件夹唯一 |
| omw_mail_message | 邮件头、正文缓存、本地状态；文件夹＋UIDVALIDITY＋UID唯一，用户/账号/收信时间索引 |
| omw_mail_attachment | MIME部件与文件名/类型/传输编码/大小；邮件＋部件唯一 |
| omw_mail_sync_job | 同步来源、状态、计数与错误；每账号最多一个queued/running任务 |
| omw_mail_notification | 来信事件与通知已读；用户＋邮件唯一 |
| omw_push_subscription | 浏览器endpoint、公钥、auth及绑定用户；endpoint唯一 |
| omw_mail_push_delivery | 按订阅投递、租约、重试；通知＋订阅唯一，待处理时间部分索引 |

Web Push由两条后台消费者领取数据库任务，失败指数退避，最多10次；404/410停用失效订阅。投递至少一次，通知使用稳定tag收敛重复显示，不承诺网络端到端exactly-once。站内SSE仅刷新状态，避免与系统推送重复弹通知。payload不携带主题、发件人或正文，打开后仍须登录。现有通知设置保存到服务端，关闭时取消待发任务；退出登录先解绑当前浏览器，不影响其他设备。

生产必须使用 HTTPS，浏览器仅在用户点击“开启系统通知”后请求授权。Service Worker 路径 /mail-worker.js，作用域 /，不缓存API或邮件；反向代理应关闭 /api/mail/events 的缓冲。网页关闭后仍可接收推送，浏览器退出、休眠、系统勿扰或推送网络受限时不保证即时到达。服务器需要能访问对应IMAP及浏览器推送服务，Gmail或部分推送服务的网络可达性需在实际部署环境验证。

出站代理在“设置 → 网络代理”中按当前用户分别配置 QQ 邮箱、Gmail、系统通知、对象存储和文件转换，支持 `socks5://` / `socks5h://`。未配置或恢复直连仅影响对应服务，无需重启 API；不再读取 `MAIL_PROXY_URL` 或 `OUTBOUND_PROXY_URL`。回环/私有 IP 与 localhost、local/internal/lan 域名直连；PostgreSQL、Redis 和浏览器连接沿用原配置。代理失败不回退直连；TLS、DNS/IP 与目标限制保持生效。

`omw_system_setting` 统一存储配置：`id,user_id,key,value,version,created_at,updated_at`，唯一索引为 `(user_id,key)`。代理使用 `network.proxy.qq/gmail/push/storage/converter` 键，敏感值 AES-GCM 加密，复用系统作用域中稳定的资产凭证密钥，响应仅回显去除凭证的地址。通用设置 Repository 负责按键存取、系统作用域原子初始化与版本保护，Service 负责校验和编排。旧代理表通过后续迁移原位转换，保留现有密文和版本；回滚遇到新增非代理设置会拒绝执行以避免数据丢失。认证接口为 `GET /api/settings/proxies` 和 `PUT /api/settings/proxies/:service`，保存需传 `proxyUrl`、`version`，冲突返回 409。

系统普通配置接口为 `GET /api/settings/system` 和 `PUT /api/settings/system`，仅真实管理员会话可访问。响应与保存字段为 `converterUrl`、`pushSubject`、`version`，不接受密钥或其他未知字段；版本冲突返回 409。转换地址只接受不含账号、路径、查询或片段的 HTTP(S) origin；推送联系地址可留空，非空时须为有效 mailto 或 HTTPS 地址。配置中的私钥与凭证密文随数据库一起保存，数据库完整泄露时也会暴露解密密钥，应保护数据库和备份的访问权限。

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


邮箱列表首次加载显示骨架，SSE、焦点恢复与轮询触发的后台刷新保留当前数据。共享 RecordsGrid 根据实际行高、表头、页脚与视口计算默认页容量（1–100），骨架行不参与测量；手动选择 10/15/30/50/100 后不再自适应，自动值也保留在选择器中。

归档是工作台状态：收件箱排除已归档记录，归档目录可打开并移回收件箱，IMAP 原信不变。全部已读、归档已读邮件作用于当前账号、搜索、规则和归档视图的全部匹配项，不受页码或每页条数限制；一条集合 UPDATE 同时递增版本，仅更新需要改变状态的记录。已收到的通知回执保持独立。

新增迁移 `20261030140000_mail_views.sql` 需要数据库有创建受信扩展 `pg_trgm` 的权限。索引覆盖用户/归档/时间、用户/账号/归档/时间、覆盖汇总所需列的紧凑索引，以及发件人、地址、主题的 GIN trigram 查询；所有条件均绑定参数，规则限制 8 层/128 节点/8KiB。普通搜索忽略大小写，详细规则中的文本比较遵守通用引擎的大小写敏感语义。

查询返回 `nextAfter`；相邻下一页带 `afterId`，按时间+ID复合键定位，旧客户端不传时继续按页码 OFFSET 查询。主题排序也保留稳定 ID 次序。直接跳到未访问的深页及全量精确 COUNT 仍随匹配规模增长；少于3字符的任意子串不保证有效利用 trigram 索引。列表与总数在同一只读快照内返回，正文不进入分页响应。HTML 的 HTTP(S) 图片随详情自动加载，CID 内嵌图片暂不解析，链接通过显式点击打开独立页面。
