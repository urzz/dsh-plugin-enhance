# 实现验收与发布交接

## 验证对象与环境

- 当前 `fix-plugin-display` worktree 的 0.1.15 实现、构建产物与实际 npm tgz；根包与两个私有组件版本一致。
- 本地 Node.js 26.13.0、npm 11.20.0；完整测试使用锁文件中的 DSH 0.2.2-rc.1 基准依赖。
- 额外使用已安装 DSH 0.2.2-rc.5 的公开原生服务验证临时目录中的实际 tgz。没有修改已安装插件、profile 或真实 GUI。

## 结果

| 验收 | 证据与结果 |
| --- | --- |
| A1 名称与描述 | 实际 tgz 经 `readPluginMeta` 读取，根 bundle 与两个组件的中英文名称和描述分别与已审核文案一致。见 [打包测试](../../../../test/package.test.js) 和 [rc.5 运行结果](runtime-verification.json)。 |
| A2 组件发现及独立启停 | 原生依赖闭包仅从根 bundle 的依赖声明发现嵌套组件；两条 row 保留原 ID。原生 Loader 验证 `{id, disabled}` 旧覆盖和组件独立启停。rc.5 的 `ClientModuleRegistry` 从真实已安装包发现两个客户端，根兼容客户端没有重复进入图；停用更新组件后只保留归档组件。 |
| A3 菜单图标 | 归档菜单声明原生 `workspace.archive` 图标，客户端回归测试验证注册数据；队列、重试、权限与原生单参数调用测试通过。没有将自动化测试表述为实际 GUI 目视验收。 |
| A4 完整回归 | `npm ci --ignore-scripts --no-audit --no-fund && npm run check` 成功：构建通过，61 tests、61 pass、0 fail、0 skipped。旧 Host、Typert、Remote 导出与 Remote 所属根 bundle 保持兼容。 |
| A5 发布包自包含 | 实际 `npm pack` 后在隔离 consumer 中执行离线安装成功；两个组件和更新所需 semver/zod/execa 从根 bundle 的嵌套 node_modules 解析，不依赖源目录或组件提升。原生 Host、Client、locale 入口均可解析，Host 可导入；打包检查未携带 DSH host peers。见 [安装证据](package-verification.json)。 |

完整测试任务回执：`bash-c1f7117dca1746fa`，exit code 0。测试成员独立完成相关 16 项测试后，Lead 审阅测试 diff、构建产物和最终源码迁移；六个更新实现模块与原文件逐字相同，归档实现仅新增菜单图标。`git diff --check` 通过。

rc.5 验证使用 `/tmp/dsh-enhance-install-0LWKIF/verify-runtime.mjs`，输入为该目录实际离线安装的 0.1.15 tgz，输出摘要已保存在本 change。辅助脚本使用公开 `pluginPackages.packageOf` 定位包目录，不要求根包公开 `package.json` 子路径。

## 兼容性与边界

- 原生管理器保存的 `{id, disabled}` 记录继续生效。手写旧 `name` 条件需要按 README 更新，未改写用户 profile。
- 保留原根包兼容导出、服务名、模型工具名、自身更新单位和 Remote 身份。
- README 与 AGENTS 是长期说明的权威入口；本 change 只记录实现验收和发布交接。

## 发布交接

实现已满足 spec v2 的 A1–A5。开发记录先归档以纳入一个功能与版本提交，随后按既有用户授权从 `fix-plugin-display` 普通推送分支及 `v0.1.15`，由 GitHub Actions Trusted Publishing 发布。此文档不声称推送或 npm 发布已经成功；最终结果由本会话及对应 Actions 运行记录给出。
