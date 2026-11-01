# Flowly / oh-my-workbench

一个可自托管的个人工作台，将待办、邮箱、文件资产和资源关系集中在同一界面中，并提供工作流与 Agent 的可视化编辑入口。

项目采用 pnpm workspace 管理 React 前端与 Go API，使用 PostgreSQL 保存业务数据、Redis 管理登录会话，文件内容存储在兼容 S3 的对象存储中。

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [功能配置](#功能配置)
- [开发指南](#开发指南)
- [生产部署](#生产部署)
- [相关文档](#相关文档)
- [许可](#许可)

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

| 变量                            | 用途                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL 连接串，数据库和账号需事先创建                   |
| `REDIS_ADDR` / `REDIS_PASSWORD` | Redis 地址及密码，无密码时留空                              |
| `WORKER_ID`                     | 可选，默认 `1`；多实例部署时各实例使用不同的 `0–1023` 编号 |
| `COOKIE_SECURE`                 | 本地 HTTP 使用 `false`，生产 HTTPS 使用 `true`              |

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

应用镜像已内置 Office 预览与缩略图服务，默认地址无需修改。本地开发或手动部署可使用[独立预览 Compose 配置](apps/api/deploy/gotenberg/compose.yaml)，并在“设置 → 通用”填写 API 可访问的转换服务地址；具体方法见[资产服务配置](apps/api/internal/modules/assets/README.md#连接与运行)。未部署转换服务时，文件仍可上传和下载。

### 网络代理

在「设置 → 网络代理」中分别配置 QQ 邮箱、Gmail、系统通知、对象存储和文件转换的 SOCKS5 代理，保存后无需重启 API。本机与私网地址保持直连。

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

### 手动部署

在仓库根目录构建并启动 API：

```sh
pnpm build
pnpm start
```

Go 服务只提供 API。手动部署时还需要托管 `apps/web/dist`、配置 SPA 回退和同域 `/api` 代理，并按[资产配置说明](apps/api/internal/modules/assets/README.md#连接与运行)部署文件转换服务。生产 HTTPS 使用 `COOKIE_SECURE=true`；在公开访问前完成管理员初始化。

`pnpm start` 以 `apps/api` 为工作目录。直接运行二进制时，也需使用该工作目录，以正确读取根目录 `.env.local`。

## 相关文档

- [环境变量示例](.env.example)
- [API 启动、数据库迁移与邮箱配置](apps/api/README.md)
- [后端业务模块规范](apps/api/internal/modules/README.md)
- [资产配置、文件预览与运行维护](apps/api/internal/modules/assets/README.md)
- [通用规则引擎](apps/api/internal/shared/rules/README.md)
- [项目开发规范](AGENTS.md)

## 许可

本项目采用 [MIT 许可证](LICENSE)。第三方依赖遵循各自的许可证。
