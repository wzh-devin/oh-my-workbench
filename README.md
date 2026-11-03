<div align="center">

<a href="https://github.com/wzh-devin/oh-my-workbench">
  <img src="apps/web/public/logo.svg" alt="Oh My Workbench Logo" width="112" height="112" />
</a>

<h1>Oh My Workbench</h1>

<p>一个可自托管的个人工作台，集中管理待办、邮箱与文件资产。</p>

<p>
  <a href="https://github.com/wzh-devin/oh-my-workbench/tags"><img src="https://img.shields.io/github/v/tag/wzh-devin/oh-my-workbench?label=version&amp;style=flat-square" alt="最新版本" /></a>
  <a href="https://github.com/wzh-devin/oh-my-workbench/actions/workflows/release.yaml"><img src="https://img.shields.io/github/actions/workflow/status/wzh-devin/oh-my-workbench/release.yaml?label=build&amp;style=flat-square" alt="发布构建状态" /></a>
  <a href="https://github.com/wzh-devin/oh-my-workbench/commits/main"><img src="https://img.shields.io/github/last-commit/wzh-devin/oh-my-workbench?style=flat-square" alt="最近提交" /></a>
  <a href="https://github.com/wzh-devin/oh-my-workbench/stargazers"><img src="https://img.shields.io/github/stars/wzh-devin/oh-my-workbench?style=flat-square" alt="GitHub Stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT 许可证" /></a>
</p>

<p>
  <a href="#功能概览">功能概览</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能配置">功能配置</a> ·
  <a href="#开发指南">开发指南</a> ·
  <a href="#生产部署">部署指南</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="apps/api/README.md">开发文档</a> ·
  <a href="https://github.com/wzh-devin/oh-my-workbench/issues">问题反馈</a>
</p>

</div>

## 功能概览

| 模块         | 功能                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| 工作台       | 查看待办、邮件与文件的汇总信息和近期活动                                                    |
| 待办         | 清单、每日计划、截止日期、优先级、标签、步骤、自定义规则视图，以及邮件关联任务              |
| 邮箱         | 接入 QQ / Gmail 收件箱，自动同步、搜索筛选、阅读、星标、归档、附件下载与来信通知            |
| 文件资产     | 接入 S3 / MinIO，管理目录、上传下载、分片续传、移动复制、收藏、回收站、自定义视图与文件预览 |
| 资源与编辑器 | 资源关系图、工作流画布与 Agent 配置编辑                                                     |
| 账号与设置   | 管理员初始化、密码登录、会话管理、修改密码、主题偏好与按服务配置网络代理                    |

待办、邮箱、文件资产及网络代理配置由 API 持久化。工作流与 Agent 部分提供前端编辑和交互演示，尚未接入后端执行服务。邮箱的阅读、星标与归档是工作台内的状态，不修改远端邮箱。

## 技术栈

项目采用 pnpm workspace 管理 React 前端与 Go API，使用 PostgreSQL 保存业务数据、Redis 管理登录会话，文件内容存储在兼容 S3 的对象存储中。

| 层级       | 技术                                              |
| ---------- | ------------------------------------------------- |
| 前端       | React 19、TypeScript、Vite、React Router          |
| 界面       | Tailwind CSS 4、ReUI、shadcn/ui、Base UI          |
| 可视化     | React Flow、Recharts                              |
| 后端       | Go、Gin、GORM、Goose                              |
| 数据与存储 | PostgreSQL、Redis、S3 兼容对象存储                |
| 开发工具   | pnpm workspace、ESLint、Prettier、Vitest、Go test |

## 快速开始

使用 Docker 时可直接按 [Docker Compose 部署](#docker-compose-部署)操作，无需在宿主机安装 Node.js、pnpm 或 Go。以下步骤用于本地开发。

### 环境要求

| 依赖       | 要求                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Node.js    | 推荐使用 [.nvmrc](.nvmrc) 指定的 `22.23.4`；其他版本需满足 [package.json](package.json) 中的 `engines.node` |
| pnpm       | `12.6.0`，由根目录 `packageManager` 固定                                                                    |
| Go         | `1.26.5` 或兼容的更新版本，以 [go.mod](apps/api/go.mod) 为准                                                |
| PostgreSQL | 准备业务数据库，应用账号需有建表权限；`pg_trgm` 扩展需由应用账号或管理员安装                                |
| Redis      | 准备可访问的 Redis 服务，用于登录会话                                                                       |

对象存储、邮箱和文件转换服务按需配置，不是启动基础工作台的前提。

### 1. 安装依赖

获取源码后，在仓库根目录执行以下命令。使用其他 Node.js 管理工具时，切换到对应版本即可。

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
```

### 2. 配置环境

首次配置时，将示例复制到根目录的 `.env.local`；已有配置请直接编辑该文件。

```sh
cp -n .env.example .env.local
```

根据本机服务填写配置，完整选项见 [.env.example](.env.example)：

| 变量                            | 用途                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL 连接串，数据库和账号需事先创建                  |
| `REDIS_ADDR` / `REDIS_PASSWORD` | Redis 地址及密码，无密码时留空                             |
| `WORKER_ID`                     | 可选，默认 `1`；多实例部署时各实例使用不同的 `0–1023` 编号 |
| `COOKIE_SECURE`                 | 本地 HTTP 使用 `false`，生产 HTTPS 使用 `true`             |

API 固定监听 `:11990`；应用镜像通过 Nginx 对外提供 `8080`，可用 `18080:8080` 调整宿主机端口。

本地部署连接配置统一放在仓库根目录，进程环境变量优先于 `.env.local`。该文件不应提交到版本库。内部密钥首次启动自动生成并保存到 PostgreSQL，后续启动和多实例共用数据库中的值。

### 3. 启动服务

确认 PostgreSQL 和 Redis 已启动，然后在仓库根目录运行：

```sh
pnpm dev
```

- 前端：[http://127.0.0.1:3000](http://127.0.0.1:3000)。
- API：`http://localhost:11990`，前端通过 Vite 将 `/api` 请求代理到该服务。
- 首次访问登录页时创建管理员，完成后使用该账号登录。
- 按 `Ctrl+C` 停止前后端进程。

API 启动时自动执行 Goose 数据库迁移，无需单独安装迁移 CLI。连接已有业务库前，请先阅读[数据库迁移说明](apps/api/README.md#数据库迁移)。

## 功能配置

### 邮箱与通知

邮箱凭证加密密钥与 Web Push 密钥在首次启动时自动生成并入库，无需额外运行命令。管理员在“设置 → 通用”填写推送联系地址，例如 `mailto:admin@example.com`，保存后生效。留空时不开启浏览器推送，邮箱和站内通知仍可使用。

在邮箱页面添加 QQ 邮箱授权码或 Gmail 应用专用密码。系统通知需要浏览器授权，生产环境使用 HTTPS。详细配置与网络要求见[邮箱与来信通知](apps/api/README.md#邮箱与来信通知)。

### 对象存储与文件预览

在资产页面添加 S3 / MinIO 连接，填写 Endpoint、已有 Bucket、Region、访问凭证和管理前缀。工作台不会自动创建 Bucket，连接账号需具备对应前缀的对象读写与分片上传权限。

填写连接的“公开访问端点”后，API 鉴权并签发15分钟链接，由浏览器直接从私有存储预览和下载；原图在链接有效期内复用浏览器缓存。留空继续由工作台转发。支持路径和虚拟主机寻址，其他存储按其 S3 兼容接口配置；跨域 PDF/文本预览需配置 CORS，详见[签名分发配置](apps/api/internal/modules/assets/README.md#私有文件签名分发)。

应用镜像已内置 Office 预览与缩略图服务，默认地址无需修改。本地开发或手动部署可使用[独立预览 Compose 配置](apps/api/deploy/gotenberg/compose.yaml)，并在“设置 → 通用”填写 API 可访问的转换服务地址；具体方法见[资产服务配置](apps/api/internal/modules/assets/README.md#连接与运行)。未部署转换服务时，文件仍可上传和下载。

### 网络代理

在「设置 → 网络代理」中分别配置 QQ 邮箱、Gmail、系统通知、对象存储和文件转换的 SOCKS5 代理，保存后无需重启 API。本机与私网地址保持直连。

业务列表按需加载，Todo、邮件、资产的复杂分页统一使用 `POST .../page`，筛选树放在 JSON 请求体；配置、详情和统计分别读取。接口契约与请求时机见 [API 开发文档](apps/api/README.md#业务接口与请求时机)。

## 开发指南

### 项目结构

```text
apps/
  web/
    src/
      app/             路由、布局、全局 Provider 与样式
      pages/           页面入口
      features/        按业务组织的组件与规则
      components/      应用外壳、共享组件、ui 与 reui 组件
      hooks/           通用 Hooks
      lib/             通用工具与工作区数据
    public/            静态资源
  api/
    cmd/               API 入口与辅助命令
    internal/
      app/             启动、依赖组装与总路由
      config/          环境配置
      modules/         auth、todos、mail、assets、settings 业务模块
      platform/        数据库、缓存与出站网络
      shared/          通用规则、认证与响应工具
    migrations/        嵌入式 SQL 迁移
    deploy/            文件转换服务部署配置
```

前端页面入口放在 `pages`，业务逻辑放在 `features/<feature>`，跨页面能力放在 `components`、`hooks` 或 `lib`。后端按 `handler → service → repository` 分层，数据库访问集中在 Repository。项目规范见 [AGENTS.md](AGENTS.md)，后端规范见[业务模块目录](apps/api/internal/modules/README.md)。

### 常用命令

以下命令均在仓库根目录执行：

| 命令                | 用途                                                  |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | 同时启动前端和 API                                    |
| `pnpm dev:web`      | 仅启动前端                                            |
| `pnpm dev:api`      | 仅启动 API                                            |
| `pnpm build`        | 构建前端 `apps/web/dist` 与 API `apps/api/bin/server` |
| `pnpm start`        | 启动构建后的 API                                      |
| `pnpm typecheck`    | 前端类型检查与 Go 静态检查                            |
| `pnpm lint`         | 执行 ESLint 检查                                      |
| `pnpm test`         | 运行 Vitest 与 Go 测试                                |
| `pnpm test:watch`   | 以监听模式运行前端测试                                |
| `pnpm format`       | 格式化应用 TypeScript 与 CSS                          |
| `pnpm format:check` | 检查应用 TypeScript 与 CSS 格式                       |

Vite 支持前端热更新；Go 开发命令不监听文件变化，修改后端代码、迁移或 API 环境配置后需手动重启。前端连接其他 API 时，可通过进程环境变量 `API_PROXY_TARGET` 指定代理目标。

Go 集成测试使用 `TEST_DATABASE_URL` 和 `TEST_REDIS_ADDR` 指向隔离服务；认证测试会清空指定 Redis 的 database 15，不应使用共享或生产 Redis。测试配置见 [API 开发文档](apps/api/README.md#命令)。

### 界面组件

界面沿用 ReUI / shadcn/ui 设计系统，优先复用 `apps/web/src/components/ui` 和 `apps/web/src/components/reui` 中的组件。shadcn CLI 从 `apps/web` 运行，该目录的 `components.json` 定义了注册表与路径别名。

## 生产部署

### Docker Compose 部署

应用镜像包含前端、Go API、Gotenberg / LibreOffice、libvips、FFmpeg 和中文字体。文件预览与缩略图在同一应用容器中运行，Compose 默认另外启动 PostgreSQL 和 Redis，也可连接外部服务。

安装支持 BuildKit 的 Docker 与 Docker Compose V2 后，在仓库根目录运行：

```sh
docker compose up -d --build
```

访问 <http://localhost:8080> 并创建管理员。首次部署先限制入口，完成管理员初始化后再对公网开放。首次启动自动迁移数据库并生成内部密钥，不需要复制 `.env.example` 或运行 Go 命令。新数据库默认指向镜像内的 `http://127.0.0.1:13039`，无需再启动独立预览服务。对象存储仍在资产页面配置，地址需从应用容器中可达；`127.0.0.1` 表示应用容器自身。

```sh
# 查看应用日志
docker compose logs -f app

# 更新源码后重新构建并启动
docker compose up -d --build

# 停止服务，保留数据卷
docker compose down
```

外部只映射应用的 `8080` 端口；修改 `docker-compose.yaml` 中 `ports` 左侧数字即可调整宿主机端口。数据库和 Redis 使用容器内连接，不映射到宿主机。前端深链接、`/api` 反向代理、上传和邮件 SSE 由镜像内的 Nginx 处理。

PostgreSQL 和 Redis 分别保存到 `postgres_data`、`redis_data` 命名卷；`docker compose down -v` 会删除这两个卷。备份时保留 PostgreSQL 的系统配置记录以及对象存储内容。复用已有数据库时，可在“设置 → 通用”将转换地址改为 `http://127.0.0.1:13039`，使用内置预览。

默认应用配额为 2 GiB 内存、2 CPU，临时文件位于有界 `/tmp`。镜像包含 Office 运行环境，首次构建和下载较大；可按负载调整 Compose 的资源限制。

公网 HTTPS 部署时，在应用前放置 TLS 反向代理，保留公网 `Host`，并关闭邮件 SSE 的代理缓冲。通过环境变量重新创建应用容器以启用 Secure Cookie：

```sh
COOKIE_SECURE=true docker compose up -d
```

#### 使用外部 PostgreSQL 和 Redis

Compose 可通过现有的 `DATABASE_URL`、`REDIS_ADDR`、`REDIS_PASSWORD` 指定外部服务；未填写时使用内置服务。将外部连接填写到根目录 `.env.local`，例如：

```dotenv
DATABASE_URL='postgres://user:password@pg-host:5432/workbench?sslmode=require'
REDIS_ADDR=redis-host:6379
REDIS_PASSWORD='your-redis-password'
COOKIE_SECURE=false
```

Redis 无密码时留空；HTTPS 部署设置 `COOKIE_SECURE=true`。PostgreSQL 数据库与账号需事先创建。然后只启动应用，跳过内置数据库和 Redis：

```sh
docker compose --env-file .env.local up -d --build --no-deps app
```

后续更新也使用这条命令。`.env.local` 必须通过 `--env-file` 显式传入 Compose；已有 shell 环境变量优先。主机名必须能从容器中访问，`127.0.0.1` 指应用容器自身；Docker Desktop 连接宿主机服务可使用 `host.docker.internal`。切换连接不会迁移数据或停止已运行的内置服务；已有部署按需先运行 `docker compose stop postgres redis`，原数据卷会保留。

也可直接运行应用镜像，不需要密钥目录挂载：

```sh
docker build -t oh-my-workbench:local .
docker run -d --name oh-my-workbench -p 8080:8080 \
  -e DATABASE_URL='postgres://user:password@db-host:5432/workbench?sslmode=disable' \
  -e REDIS_ADDR='redis-host:6379' \
  -e COOKIE_SECURE=false \
  oh-my-workbench:local
```

Redis 有密码时另传 `REDIS_PASSWORD`。单实例默认 `WORKER_ID=1`，多实例需分别指定不同编号并连接同一业务数据库。

### Markdown 记事本

记事本提供笔记本、日记与凭证模板、标签、收藏、加锁、自动保存、版本恢复和回收站。正文与历史版本均加密保存；标题、标签、分类和时间是可检索元数据。普通笔记登录后可读，加锁笔记需再次验证登录密码，每次刷新或重新打开都需验证；当前编辑窗口内授权 5 分钟有效，自动保存无需重复输入。支持平台通行密钥（如 Mac Touch ID），绑定/移除在账号安全设置中完成。

笔记标题、笔记本和标签直接在紧凑信息栏编辑，加锁状态在详情顶栏切换，无需打开属性弹窗。

全部笔记和回收站为固定入口；收藏、加锁等自定义视图可以编辑图标、嵌套筛选规则和排序，至少保留一个自定义视图。侧栏只显示实际笔记本，未分类笔记仍可在全部笔记中访问。列表复用项目表格，加锁笔记显示元数据，验证成功后才打开详情抽屉。打开即显示左侧编辑、右侧实时预览，窄屏上下排列，无需切换视图。编辑区使用 Markdown 源码，格式工具栏作用于当前选区或所在行，支持撤销、重做；窄屏通过更多菜单访问其余操作。没有编辑方式切换，打开笔记不会自动重写正文。宽屏拖动中间分隔线可以调整左右比例（30%–70%），方向键调整、Home/End到边界，双击恢复等宽。

编辑和预览统一使用项目滚动组件，并按阅读进度双向联动。正文更新保留编辑光标与预览滚动；中文组词期间暂停更新预览。拖动分隔线保留编辑实例、光标和撤销历史，宽度比例保留在当前编辑会话。

预览代码块显示语言并按深浅主题高亮，长行在块内横向滚动，支持键盘操作。未知语言或超出高亮预算的代码保留完整原文。

图片使用 `![说明](图片地址)`，支持 HTTP(S) 或相对地址，宽度不超出内容栏，大图等比缩略，点击查看原图。普通 `[文字](地址)` 仍显示为链接。图片不发送页面来源。

首次启用前，从项目根运行：

```bash
node scripts/init-notes-key.mjs
```

命令独占创建 `.secrets/notes-keys.json`，已有文件不会覆盖，也不会输出密钥。该目录已被 Git 忽略。保留独立备份后启动或重启 API；缺失或损坏的密钥会使记事本拒绝读写，其他模块仍可用。

两个 Compose 文件将 `${NOTES_SECRETS_PATH:-./.secrets}` 只读挂载到 `/app/.secrets`；相对源目录相对于 Compose 文件。部署时将密钥文件放入所选目录，并确保容器 UID/GID `1001:1001` 可读，例如由管理员将目录设为 `0750`、文件设为 `0640`，属组设为 `1001`。部署服务器没有 Node.js 时，可在开发机生成后安全传送到部署目录，不将密钥加入镜像。设置可选的 `NOTES_SECRETS_PATH` 后重建应用容器。

正文不写入浏览器持久缓存，首版仅搜索标题与标签。加锁笔记导出需重新验证密码，导出文件包含明文。数据库和独立密钥需分开备份，恢复时二者必须匹配；修改登录密码不改变加密密钥。换钥时保留所有仍被正文和历史引用的旧 `key_id`，详见 [记事本模块说明](apps/api/internal/modules/notes/README.md)。服务端仍可解密，本功能不提供端到端加密。

### 文件日志

后端使用 Go 标准库 [log/slog](https://pkg.go.dev/log/slog)，通过 [lumberjack](https://github.com/natefinch/lumberjack) 轮转文件。完整日志以一行一条 JSON 写入文件，WARN/ERROR 同时输出到标准输出；网关不再重复输出 API 原始访问日志。本地位于 `apps/api/logs/`，镜像内位于 `/app/apps/api/logs/`。

| 文件                                   | 内容                                  |
| -------------------------------------- | ------------------------------------- |
| `api.log`                              | 请求、响应、SQL、业务错误、启动与关闭 |
| `renderer.log`                         | 缩略图服务启动和错误                  |
| `api-crash.log` / `renderer-crash.log` | Go 运行时未处理崩溃的原始堆栈         |

请求记录方法、路径、查询参数、客户端 IP、请求时间；响应记录状态码、结束时间、耗时、请求/响应体与字节数。响应头 `X-Request-ID` 对应日志中的 `request_id`，同一请求的 SQL 和错误也使用该编号。SQL 保留语句模板、参数、执行耗时及行数；慢于 200ms 标记为 WARN。内部错误记录原因、类型和当前调用栈，接口仍返回原有业务响应。

密码、令牌、Cookie、私钥、存储凭据和 URL 中的认证信息会脱敏；账户、系统密钥、存储连接及推送凭据相关 SQL 的参数整体隐藏。请求/响应体最多捕获 8KiB，超过上限或无效 JSON 只记省略原因；上传分片、文件下载及 SSE 不记录内容。请求采集不提前读取请求体，流式输出仍即时发送。崩溃日志保留运行时原始输出，文件权限为 `0600`。

单个结构化文件达到 50MiB 后轮转，最多保留 5 份历史文件，历史保留 7 天；崩溃文件在下次进程启动时检查大小并轮转。Compose 同时将 Docker 标准输出日志限制为每份 10MiB、最多 3 份。不同容器实例使用各自日志目录。

两个 Compose 配置默认使用持久日志卷，普通 `down/up` 保留日志。要直接写入宿主机目录，先准备权限，再在开发根目录的 `.env.local` 或服务器的 `.env` 设置可选的 `LOGS_PATH`：

```sh
sudo install -d -o 1001 -g 1001 -m 0750 /srv/oh-my-workbench/logs
```

```dotenv
LOGS_PATH=/srv/oh-my-workbench/logs
```

`LOGS_PATH` 仅供 Compose 选择挂载源，不传给应用。后续重建容器或 Action 更新部署文件时继续使用该目录。直接 `docker run` 时添加 `-v /srv/oh-my-workbench/logs:/app/apps/api/logs`。

独立缩略图 Compose 的日志位于 `/app/logs/`，使用 `thumbnail_logs` 持久卷；该镜像运行用户为 `65534:65534`，绑定宿主目录时使用对应权限。

```sh
sudo tail -f /srv/oh-my-workbench/logs/api.log
sudo cat /srv/oh-my-workbench/logs/api.log | jq 'select(.request_id == "实际请求编号")'
```

### GitHub Actions 发布与部署

推送 `vX.Y.Z` 标签会触发 [release.yaml](.github/workflows/release.yaml)。流程先确认标签格式及对应提交已进入 `main`，再构建 `linux/amd64`、`linux/arm64` 镜像，从 [CHANGELOG.md](CHANGELOG.md) 提取对应版本内容创建或更新 GitHub Release，然后部署应用。镜像同时发布：

```text
ghcr.io/wzh-devin/oh-my-workbench:vX.Y.Z
ghcr.io/wzh-devin/oh-my-workbench:latest
```

普通 `main` 推送不部署。版本标签不要重复使用；`latest` 指向最近发布的构建。发布流程串行执行，正在进行的部署不会被新标签自动取消。

#### 服务器准备

服务器安装 Docker、支持 `up --wait` 的 Compose V2 和 Bash，SSH 部署账号需要有 Docker 执行权限及部署目录的写权限。服务器只运行应用，PostgreSQL、Redis 使用已有外部服务。

在部署目录（默认 `/opt/oh-my-workbench`）创建 `.env`，填写外部连接：

```dotenv
DATABASE_URL='postgres://user:password@pg-host:5432/workbench?sslmode=require'
REDIS_ADDR=redis-host:6379
REDIS_PASSWORD='your-redis-password'
COOKIE_SECURE=true
```

将文件权限设为 `600`。HTTP 部署使用 `COOKIE_SECURE=false`。这些值仅保存在服务器，Action 不上传或覆盖环境文件。部署脚本优先读取 `.env`，不存在时兼容已有的 `.env.local`；两者同时存在时使用 `.env`，配置错误时不会回退到另一份文件。本地开发仍使用仓库根目录的 `.env.local`。

同一服务器的 PostgreSQL、Redis、Mihomo 等共享中间件统一接入独立的 `infra` Docker 网络，由基础设施创建（`docker network create infra`），各项目在 Compose 中以 `external: true` 引用。业务应用按需加入，使用 `postgresql:5432`、`redis:6379` 等服务名连接。

在工作台部署目录创建 `compose.override.yaml`，接入已有的 `infra` 网络：

```yaml
networks:
  default:
    external: true
    name: infra
```

部署脚本自动合并该文件，Action 不上传或覆盖它。手动执行 Compose 时也需添加 `-f compose.yaml -f compose.override.yaml`。容器中的 `127.0.0.1` 指向容器自身，无法访问只绑定宿主机回环地址的数据库服务。

Mihomo 接入 `infra` 且允许局域网连接后，应用的代理设置可填写 `socks5h://mihomo:7890`；其他业务容器也可保留自身网络，同时加入 `infra` 使用这些中间件。

#### GitHub 配置

在仓库 **Settings → Environments → production** 中配置以下 Secrets（也可使用仓库级 Actions Secrets）：

| Secret               | 内容                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `NETBIRD_SETUP_KEY`  | CI 专用 NetBird Setup Key，使用 Reusable 类型并开启 Ephemeral Peers                          |
| `DEPLOY_HOST`        | 服务器的 NetBird IP 或可通过该网络访问的域名，例如 `100.105.58.148`                          |
| `DEPLOY_USER`        | SSH 部署账号                                                                                 |
| `DEPLOY_PASSWORD`    | SSH 账号密码；与 `DEPLOY_SSH_KEY` 二选一                                                     |
| `DEPLOY_SSH_KEY`     | 该账号的无口令 SSH 私钥，对应公钥预先加入服务器 authorized_keys；与 `DEPLOY_PASSWORD` 二选一 |
| `DEPLOY_KNOWN_HOSTS` | 经可信渠道核对的服务器 known_hosts 完整记录；非 22 端口使用 `[host]:port` 记录               |

使用用户名和密码时，配置 `DEPLOY_USER`、`DEPLOY_PASSWORD` 即可选择密码认证，服务器需允许 SSH 密码登录。同时配置密码和私钥时优先使用私钥。

部署任务先启动 NetBird `0.80.0` 客户端，连接 `https://netbird.devin.wang`，等待 `DEPLOY_HOST:DEPLOY_PORT` 可达后才执行 SSH。在 NetBird 控制台为 Setup Key 配置 CI 专用自动分组，访问策略需允许该分组访问目标服务器的 TCP 部署端口；如启用节点审批，需允许 CI 节点完成审批。任务成功、失败或取消时都会清理客户端和本地 Key 文件；Ephemeral Peers 用于自动清理离线临时节点。参见 [NetBird Setup Key 配置](https://docs.netbird.io/manage/peers/register-machines-using-setup-keys)。

所有部署 Secrets 必须属于工作流使用的 `production` 环境，或配置为仓库级 Actions Secrets；放在其他环境（例如 `HOME_DEPLOY`）中不会被该任务读取。

可选 Variables：`DEPLOY_PATH` 默认 `/opt/oh-my-workbench`，`DEPLOY_PORT` 默认 `22`。无需配置 GHCR 密码：构建使用自动提供的 `GITHUB_TOKEN`，部署通过只读的短期 Token 拉取镜像，服务器临时登录文件退出后删除。手动拉取私有包时需要自行登录 GHCR，也可将包设为公开；详见 [GHCR 权限与认证](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)。

#### 发布

发布前按[更新日志模板](.github/CHANGELOG_TEMPLATE.md)将 [CHANGELOG.md](CHANGELOG.md) 的待发布内容整理为与标签一致的版本节，填写实际发布日期，并链接到上一版本的比较。分类使用 `Features`、`Bug Fixes`、`Performance Improvements` 等英文三级标题，说明保留中文；条目使用单行列表，标明模块，有真实关联时附上 Issue、PR 和提交短哈希链接。缺少对应版本或格式错误会使构建失败。根文件保留当前版本系列，历史较多后按大版本归档。

```markdown
## [v1.1.0](https://github.com/wzh-devin/oh-my-workbench/compare/v1.0.2...v1.1.0) - YYYY-MM-DD

### Bug Fixes

- **资产：** 描述修复的问题，并附上真实关联链接。
```

应用左下角头像菜单中的「更新日志」展示当前安装版本的说明与历史记录。正式版本号来自镜像构建标签，开发或未指定 `APP_VERSION` 的本地构建显示「开发版」；手动构建可用 `APP_VERSION=v1.1.0 pnpm build` 或 `docker build --build-arg APP_VERSION=v1.1.0 .` 指定版本。

修改日志后需重启前端开发服务以重新读取内容。可先运行 `node scripts/changelog.mjs v1.1.0` 预览该版本的 GitHub Release 正文。

将代码提交并推送到 `main` 后，创建并推送版本标签，例如：

```sh
git push origin main
git tag v1.1.0
git push origin v1.1.0
```

修改工作流后需要推送指向新提交的版本标签；仅重新运行旧任务仍使用原版工作流。通常使用新的版本号；复用已有版本号会更新标签指向，并替换同名版本镜像。

Action 将该版本的生产 Compose 和部署脚本通过 SSH 传到部署目录；Compose 固定为本次版本镜像。服务器依次执行：

```sh
docker compose --env-file .env pull
docker compose --env-file .env down
docker compose --env-file .env up -d --no-build --pull never --wait --wait-timeout 180
```

拉取失败不会停止当前应用；`down` 不删除数据卷。`down/up` 之间会有短暂停机。最后核对实际镜像 ID、容器健康、前端、API 和两类预览服务；失败时 Action 报错并显示容器状态，应用日志留在服务器查看。服务器无需 Git、Node.js 或 Go。

### 手动部署

在仓库根目录构建并启动 API：

```sh
pnpm build
pnpm start
```

Go 服务只提供 API。手动部署时还需要托管 `apps/web/dist`、配置 SPA 回退和同域 `/api` 代理，并按[资产配置说明](apps/api/internal/modules/assets/README.md#连接与运行)部署文件转换服务。生产 HTTPS 使用 `COOKIE_SECURE=true`；在公开访问前完成管理员初始化。

`pnpm start` 以 `apps/api` 为工作目录。直接运行二进制时，也需使用该工作目录，以正确读取根目录 `.env.local`。

## 相关文档

- [更新日志模板与发布检查](.github/CHANGELOG_TEMPLATE.md)
- [环境变量示例](.env.example)
- [API 启动、数据库迁移与邮箱配置](apps/api/README.md)
- [后端业务模块规范](apps/api/internal/modules/README.md)
- [资产配置、文件预览与运行维护](apps/api/internal/modules/assets/README.md)
- [通用规则引擎](apps/api/internal/shared/rules/README.md)
- [项目开发规范](AGENTS.md)

## 许可

本项目采用 [MIT 许可证](LICENSE)。第三方依赖遵循各自的许可证。
