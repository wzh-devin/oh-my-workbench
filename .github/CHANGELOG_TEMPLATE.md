# 更新日志模板

更新记录统一维护在根目录 [CHANGELOG.md](../CHANGELOG.md)，分类使用英文术语，变更说明使用中文。应用内弹窗和 GitHub Release 从中读取，不另写一份发布说明。

结构参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，条目的模块、Issue／PR 和提交引用参考 [Vue](https://github.com/vuejs/core/blob/main/CHANGELOG.md)。以下是占位模板，使用前替换版本、日期、说明和链接，删除空分类及不存在的引用。

```markdown
## [vX.Y.Z](https://github.com/wzh-devin/oh-my-workbench/compare/v上一版本...vX.Y.Z) - YYYY-MM-DD

### Features

- **模块：** 描述用户现在可以完成的操作。([#PR编号](https://github.com/wzh-devin/oh-my-workbench/pull/PR编号)) ([提交短哈希](https://github.com/wzh-devin/oh-my-workbench/commit/完整提交哈希))

### Code Refactoring

- **模块：** 描述行为变化及受影响的使用方式。([提交短哈希](https://github.com/wzh-devin/oh-my-workbench/commit/完整提交哈希))

### Bug Fixes

- **模块：** 修复什么条件下出现的问题。([#PR编号](https://github.com/wzh-devin/oh-my-workbench/pull/PR编号)) ([提交短哈希](https://github.com/wzh-devin/oh-my-workbench/commit/完整提交哈希))，关联 [#Issue编号](https://github.com/wzh-devin/oh-my-workbench/issues/Issue编号)。
```

## 分类术语

| 分类                       | 对应提交类型              | 用途                     |
| -------------------------- | ------------------------- | ------------------------ |
| `Features`                 | `feat`                    | 新功能与用户能力改进     |
| `Bug Fixes`                | `fix`                     | 问题修复                 |
| `Performance Improvements` | `perf`                    | 性能提升                 |
| `Code Refactoring`         | `refactor`                | 代码或接口结构整理       |
| `Documentation`            | `docs`                    | 文档变更                 |
| `Build System`             | `build`                   | 构建、依赖与打包变更     |
| `Continuous Integration`   | `ci`                      | CI 与发布流程变更        |
| `Reverts`                  | `revert`                  | 撤销已发布的变更         |
| `Security`                 | 按实际变更                | 安全修复与影响说明       |
| `Deprecations`             | 按实际变更                | 弃用计划及替代方式       |
| `BREAKING CHANGES`         | `!` 或 `BREAKING CHANGE:` | 破坏兼容的变更及迁移步骤 |

提交类型用于帮助归类；日志仍需人工整理成用户可读的说明，不自动复制全部提交。

## 填写规则

- 版本标题统一保留 `v` 前缀，如 `[v1.0.1]`，按倒序排列，日期为实际发布日期 `YYYY-MM-DD`。版本标题链接到与上一版本的比较；初始版本可链接到对应 tag。
- 日常变更先放入置顶的 `## [Unreleased]`，不写未来发布日期，也不为尚未提交的改动填写哈希。发布前将本次条目整理为目标版本节，保留新的待发布节。
- 分类从上述英文术语中按需选择，不使用“新增／调整／修复”等中文标题，不保留空分类。弃用能力时说明替代方式；移除或修改能力导致不兼容时，在 `BREAKING CHANGES` 写明影响和迁移操作，不只写“优化”。
- 模块使用稳定名称，如“工作台、待办、邮箱、资产、设置、部署”；一条记录描述一个对用户有意义的变化，不直接堆砌 Git 提交日志。
- Issue、PR 和提交引用均为可选项，有真实关联才填写；直推提交只保留提交链接。提交标签显示前 7 位以上短哈希，链接使用完整哈希，Issue 与 PR 使用各自真实地址。
- 每条记录保持为一个 Markdown 列表行，可用 `**加粗**`、行内代码和 HTTPS 链接；不要使用 HTML、图片或嵌套列表，避免网页与 GitHub 展示不一致。
- 记录较多时，按大版本归档到 `docs/changelog/v主版本.md`，在根日志的版本列表前添加历史链接。当前记录继续由应用携带，归档内容通过“查看完整记录”访问；当前仅两个正式版本，无需创建空归档。

## 发布前检查

1. 核对变更、关联记录、目标版本及发布日期；不要把待发布内容提前写进旧版本。
2. 在仓库根目录运行 `node scripts/changelog.mjs vX.Y.Z`，确认输出仅为该版本正文，引用可点击。
3. 运行 `APP_VERSION=vX.Y.Z pnpm --filter @workbench/web build`，确认版本节存在且格式有效。发布流水线会使用相同标签构建应用并提取 GitHub Release 正文。
