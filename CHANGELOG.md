# 更新日志

记录个人工作台每个版本中值得关注的变化，最新版本在前。未发布内容归入 `Unreleased`，发布前更新版本号和日期。

## [Unreleased](https://github.com/wzh-devin/oh-my-workbench/compare/v1.1.2...HEAD)

## [v1.1.2](https://github.com/wzh-devin/oh-my-workbench/compare/v1.1.1...v1.1.2) - 2026-11-09

### Code Refactoring

- **后端：** 按 router、service、repository 和 domain 集中职责，表结构与查询按表维护，统一 Request/Response 命名，并将通用 S3 服务独立维护，保留现有 HTTP 接口与数据格式。 ([f0fc64c](https://github.com/wzh-devin/oh-my-workbench/commit/f0fc64c3eb6492d234608339972360adc5d84c70))

### Bug Fixes

- **记事本：** 加密密钥统一存入系统设置表，空库首次启动自动初始化，重启和多实例复用；已有正文与历史版本使用原密钥迁入，不再依赖项目目录中的密钥文件。 ([f0fc64c](https://github.com/wzh-devin/oh-my-workbench/commit/f0fc64c3eb6492d234608339972360adc5d84c70))
- **部署：** 升级时在切换服务前迁移并验证原密钥，新版本健康后清理旧文件；迁移或预检失败保留旧服务，并修正发布镜像标签渲染。 ([f0fc64c](https://github.com/wzh-devin/oh-my-workbench/commit/f0fc64c3eb6492d234608339972360adc5d84c70))

### BREAKING CHANGES

- **记事本升级：** 停用独立密钥初始化脚本和 `notes-key-init` 命令；发布脚本自动迁移旧容器中的原密钥，源码或手动镜像升级需先通过 `notes-key-import` 标准输入导入原 keyring。 ([f0fc64c](https://github.com/wzh-devin/oh-my-workbench/commit/f0fc64c3eb6492d234608339972360adc5d84c70))

## [v1.1.1](https://github.com/wzh-devin/oh-my-workbench/compare/v1.1.0...v1.1.1) - 2026-11-03

### Bug Fixes

- **记事本部署：** 首次部署自动初始化独立密钥，修复上线后笔记本及笔记列表返回 503；已有密钥始终保留，有正文或历史却丢失密钥时禁止重新生成。

### Build System

- **发布检查：** 替换容器前检查密钥格式、历史密钥引用与应用读取权限；健康检查覆盖记事本就绪状态，避免服务可访问但记事本不可用。

## [v1.1.0](https://github.com/wzh-devin/oh-my-workbench/compare/v1.0.2...v1.1.0) - 2026-11-03

### Features

- **记事本：** 新增 Markdown 笔记、日记与凭证模板、笔记本、标签、收藏、自动保存、历史版本恢复和回收站。
- **记事本编辑：** 源码与实时预览同时显示，宽屏左右分栏可拖动调宽，窄屏上下排列；格式工具栏支持选区操作与撤销，代码块支持深浅色高亮，大图缩略并可点击查看原图。
- **记事本视图：** 固定保留全部笔记与回收站，自定义视图支持图标、嵌套筛选规则和排序，并至少保留一个视图。
- **笔记加锁：** 列表显示元数据，验证成功后才打开详情；每次刷新或重新打开分别验证，当前编辑中的自动保存沿用授权；支持密码与平台通行密钥，绑定和移除位于账号安全设置。

### Bug Fixes

- **记事本：** 保留编辑光标、中文组词、撤销历史和预览滚动位置，修复快速后退未收起详情与保存失败时的草稿保护。
- **记事本界面：** 压缩标题和属性栏，修正笔记本下拉定位、标签提示滚动条和菜单图标对齐；加锁状态直接在顶栏编辑，移除重复属性弹窗与立即锁定菜单。
- **设置：** 统一 React 运行时依赖，修复开发缓存导致设置页 Hook 报错或空白。

### Security

- **记事本：** 正文与历史版本使用独立密钥加密；解锁授权绑定登录会话和当前编辑上下文；笔记请求、响应、搜索内容与相关 SQL 参数不落日志。

### Build System

- **部署：** 支持通过独立目录只读挂载记事本密钥；首次启用需初始化密钥并与数据库分开备份，部署说明见 README。

## [v1.0.2](https://github.com/wzh-devin/oh-my-workbench/compare/v1.0.1...v1.0.2) - 2026-11-03

### Features

- **工作台：** 用户菜单提供更新日志入口，可查看当前安装版本与历史更新。
- **工作台：** 更新个人工作台 W 标识，统一侧栏、手机顶栏与浏览器图标。
- **工作台：** 页面标题统一为个人工作台。

### Documentation

- **文档：** 重新整理 README 页头与中文导航，并提供发布日志模板。

### Continuous Integration

- **部署：** 发布说明与应用内日志共用 CHANGELOG，发布时自动同步到 GitHub Release。

### Bug Fixes

- **资产：** 统一目标目录和目标存储选择器的高度，新建、移动、复制和上传入口保持一致。
- **界面：** 统一页面、弹窗、抽屉与表格滚动条的主题颜色，移除灰色轨道，并补齐滚动条与内容的间距。

## [v1.0.1](https://github.com/wzh-devin/oh-my-workbench/compare/v1.0.0...v1.0.1) - 2026-11-03

### Features

- **资产：** 私有文件支持签名链接预览和下载，图片可复用浏览器缓存。([9ac516d](https://github.com/wzh-devin/oh-my-workbench/commit/9ac516da2a1bc919ae9c721d4367dd8a7a30b23e))
- **资产：** 文件预览支持配置公开访问端点，以及路径和虚拟主机寻址。([9ac516d](https://github.com/wzh-devin/oh-my-workbench/commit/9ac516da2a1bc919ae9c721d4367dd8a7a30b23e))

### Performance Improvements

- **数据加载：** 待办、邮箱与资产按需读取列表、配置、详情和统计，减少重复加载。([9ac516d](https://github.com/wzh-devin/oh-my-workbench/commit/9ac516da2a1bc919ae9c721d4367dd8a7a30b23e))

### Code Refactoring

- **筛选：** 统一分页接口与复杂筛选请求，保留组合规则的分组和嵌套语义。([9ac516d](https://github.com/wzh-devin/oh-my-workbench/commit/9ac516da2a1bc919ae9c721d4367dd8a7a30b23e))

## [v1.0.0](https://github.com/wzh-devin/oh-my-workbench/tree/v1.0.0) - 2026-11-02

### Features

- **工作台：** 集中展示待办、邮箱、资产与资源关系，提供统一的分类导航。([c88e14a](https://github.com/wzh-devin/oh-my-workbench/commit/c88e14a4d06e3511b1deaad1c57352cc77439186))
- **待办：** 提供待办清单、每日计划、优先级、标签、步骤和自定义规则视图。([a5b141b](https://github.com/wzh-devin/oh-my-workbench/commit/a5b141b9fb0da7e62de7ce3a976d054193e11317))
- **邮箱：** 接入 QQ 和 Gmail 邮箱，支持阅读、搜索、星标、归档与来信通知。([a2c1e64](https://github.com/wzh-devin/oh-my-workbench/commit/a2c1e643ad533732d1e4c40e060e87fb3441d32e))
- **资产：** 接入兼容 S3 的对象存储，支持目录管理、分片上传、续传、移动、复制、回收站与文件预览。([7a66fe7](https://github.com/wzh-devin/oh-my-workbench/commit/7a66fe7b14e714cd5fb1663a39e6cef47974d4ac))
- **设置：** 提供管理员初始化、密码登录、个人设置与按服务配置网络代理。([5b54a65](https://github.com/wzh-devin/oh-my-workbench/commit/5b54a65b62bc88c9c275020a440ec565aa3333f8))
- **部署：** 支持 Docker 自托管，内置文件预览与缩略图服务，按版本标签构建镜像。([46d41ce](https://github.com/wzh-devin/oh-my-workbench/commit/46d41ceb6aacc80eac9be1238adb671808bc175f))
- **日志：** 后端请求、响应、SQL 与业务错误写入 JSON 文件，通过请求编号关联；敏感信息脱敏，文件自动轮转，崩溃堆栈单独保存。([971f603](https://github.com/wzh-devin/oh-my-workbench/commit/971f603fcfe9025e0148d5ea6fbb3f9411994e7e))

### Continuous Integration

- **部署：** 通过 GitHub Actions 发布双架构镜像，并经 SSH 部署和检查服务健康状态。([7035bf1](https://github.com/wzh-devin/oh-my-workbench/commit/7035bf1ceb0c9afc3bf1cc0bc16d4f9c4a9ac7e3))

### Build System

- **日志：** 应用与缩略图服务保留持久日志卷，支持宿主机日志目录，并限制 Docker 标准输出日志大小。([971f603](https://github.com/wzh-devin/oh-my-workbench/commit/971f603fcfe9025e0148d5ea6fbb3f9411994e7e))

### Bug Fixes

- **部署：** 支持服务器 `.env` 配置文件和 Docker Compose 网络覆盖文件。([410b6ce](https://github.com/wzh-devin/oh-my-workbench/commit/410b6cebb308986050d06d2c02672973f7c6d733))
- **部署：** 部署执行器先连接 NetBird，再访问内网 SSH 服务。([2b68981](https://github.com/wzh-devin/oh-my-workbench/commit/2b68981db07f44bb62b2cd8894fad6a99a3dc58e))
- **部署：** 补充发布部署的 NetBird 启动诊断，便于定位内网连接失败。([fcf5f0f](https://github.com/wzh-devin/oh-my-workbench/commit/fcf5f0fa97462eb8b6002f3609de05fe76cd39b3))
