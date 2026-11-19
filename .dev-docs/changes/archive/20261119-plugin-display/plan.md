# 实施与发布计划

基于 intent v1 / spec v2；用户在已展示方案后要求“提交，发布一下”，作为本方案实施、提交与发布授权（D2/D3）。

- projectRoot / 工作目录：/home/fooksky/projects/fooksky/dsh-plugins/dsh-plugin-enhance/.agents/worktrees/workspace-batch-archive-migrate/.agents/worktrees/fix-plugin-display
- branch：fix-plugin-display
- changeId：20261119-plugin-display
- 发布版本：0.1.15（已有远端标签 v0.1.14）。从当前工作分支普通推送并创建 v0.1.15 标签，通过现有 GitHub Actions Trusted Publishing 发布；本次不包含合入 main。

## P1 — 组件包与展示修复（direct；A1/A2/A3）

Lead 负责源码迁移、两个组件清单、根 bundle 打包、双语元数据及原生菜单图标、构建和锁文件。所有修改仅在当前 worktree；归档和更新实现自包含，保持原生 row ID 与 Remote 协议；更新组件仍以根 bundle 为自身更新单位。调整 README 与 AGENTS 的包结构说明和自定义 name 条件升级说明。

## P2 — 验证（direct；A1/A2/A3/A4/A5）

适配已有测试并补充原生元数据读取、组件发现/启停覆盖和菜单图标回归。运行 npm run check，以及实际 tgz 的内嵌组件清单、原生解析和临时安装检查。验证不接触已安装插件、不进行真实 GUI 操作。检查最终 diff 与版本文件。测试文件可作为独立工作包委派；不并发改写同一路径。

## P3 — 发布准备与交接（direct；A4/A5）

同步根包/组件包/锁文件版本，审阅单次提交范围，保存实现验收证据和知识更新。实现验收完成后先关闭并归档开发 change，使记录随同一次功能与版本提交保留；开发 change 的关闭仅证明实现已验收，不证明 Git 推送或 npm 发布成功。

## 已授权的后续发布操作（本会话继续）

归档后立即选择性暂存本次变更并创建一个 Conventional Commit，普通推送 fix-plugin-display 和匹配版本标签，监测现有 publish.yml 的实际结果；只有 CI 发布成功并确认 npm 版本后才报告已发布。发布执行结果由会话及 GitHub Actions 链接记录。此编排不改变用户要求的提交与发布结果，也不新增确认步骤。
