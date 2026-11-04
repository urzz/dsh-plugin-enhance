# 插件增强 · Plugin enhance

包名：`dsh-plugin-enhance`。图标使用蓝色底、循环箭头和四个模块方块，表示插件组合包更新。

为 DSH 插件管理页增加「更新」标签页，支持检查更新、勾选批量更新、一键更新全部可更新项，以及重试失败项。Host 服务和 `plugin_enhance` 工具使用同一更新引擎。

目标运行版本为 **DSH 0.2.1-rc.5**，包含英文和简体中文界面。此仓库独立管理，源码位于 [urzz/dsh-plugin-enhance](https://github.com/urzz/dsh-plugin-enhance)。

## 使用

安装并启用后，在 DSH 的「插件 → 更新」中点击「检查更新」。列表默认勾选「仅显示可更新」；取消后，按「可更新、更新中、需处理、已更新、已是最新、不可更新」的顺序分组显示全部组合包，每组显示数量。各组内按插件名称自然升序排列，忽略大小写，名称中的数字按数值排序（如 `plugin-2` 在 `plugin-10` 前）。列表显示组合包名称、当前版本、目标版本、启用状态、来源和不可更新原因。选择需要更新的项目后点击「更新所选」，或点击「更新全部可更新项」。队列串行执行；取消「仅显示可更新」可查看更新进度、结果及失败原因。

升级单位为 **bundle（组合包）**，同一包中的多个插件会一起更新。原启用状态会传给新版本；底层管理器可能改变插件选择顺序。

已在所配置市场中找到的包优先采用市场默认版本及其明确的安装目标；其他标准 npm 安装查询 `latest`。版本查询沿用 DSH 包管理器的子进程策略，在当前 profile 中执行 `pnpm view` 并额外读取兼容性字段，使用 profile 的 pnpm 启动器、registry、认证及代理设置。仅选择比当前版本更新、且与当前 DSH 兼容的目标。不使用兼容性豁免；市场读取失败不会静默改用 npm 来源。

## 更新失败与限制

- 支持 HMR 时，更新先卸载旧包再安装指定版本。这个过程不是原子操作；安装失败可能留下未安装的组合包。页面保留恢复目标，可解决原因后点击「重试失败项」。
- 无 HMR 且管理器以 `stop-profile` 拒绝卸载时，按官方管理器支持的方式直接覆盖安装，并报告是否需要重启。其他卸载失败不会继续安装。
- 待授权构建脚本、安装失败、激活失败及实际版本不符均不会报告为更新成功。脚本必须通过官方插件管理器另行明确授权；本插件不会自动授权脚本、授予版本豁免或重启 DSH。
- 排除更新器自身、安装随附的内置包、不可移除包、本地路径及无市场目标的 Git/URL/npm alias 来源。市场明确提供的新 Git 目标可以使用。
- 恢复队列只保存在当前进程内存中。重启会丢失队列；可使用官方管理器按原包名安装所需版本。没有自动回滚或跨进程恢复承诺。
- 更新前会重新读取包清单，拒绝已变化的来源、版本或启用状态；这不是对其他管理入口的事务锁。执行更新期间请避免同时从其他入口管理同一包。

`plugin_enhance` 工具支持 `check`、`status`、`start` 和 `retry`。`check` 返回 `generation`；`start` 需要该值及包名数组 `names`；`retry` 可以省略 `names` 重试所有可恢复项。工具遵守 DSH 的完整访问权限/审批机制，未获得授权时不修改 profile。网页由 DSH 现有 Remote 网关执行 owner 访问控制。

## 开发与验证

使用 Node.js 22 或更新版本，安装开发依赖后运行：

```sh
npm install --ignore-scripts
npm run check
npm pack --dry-run
```

Host 使用 ESM JavaScript；`build` 用 esbuild 将客户端源码与 Remote 描述打包为浏览器入口，再检查所有发布入口的语法。React 与 Zod 由 DSH 客户端提供。测试覆盖纯引擎、真实 Cordis/Typert 网关、客户端 Remote 挂载与释放以及界面交互，全部使用假包管理器，不真实安装或卸载插件。完整测试需要清单中的 DSH peer 与开发依赖可解析。

源码入口：[`engine.js`](engine.js) 负责发现与更新队列，[`index.js`](index.js) 提供 Host 服务、npm 适配和工具，[`client.source.js`](client.source.js) 挂载本插件的 Remote 描述后，通过子作用域显式注入 `remote.pluginEnhance` 再注册更新标签页，生成的 [`client.js`](client.js) 随仓库发布，安装时无需构建。Remote 描述分别由 [`typert.host.js`](typert.host.js) 和 [`typert.remote-client.js`](typert.remote-client.js) 提供。

## 打包与后续安装

发布清单包含 Host、Client、Remote 描述、bundle patch、语言包和图标。没有需要授权的构建脚本，也不需要 Git 安装的 `prepare` 构建。可通过 DSH 官方插件管理器按 GitHub 地址安装；npm 发布后，也可按包名安装：

```sh
dsh plugin --profile web add dsh-plugin-enhance@latest
```

配置字段 `pnpmCommand`（默认 `pnpm`）和 `lookupTimeoutMs`（默认 20000 毫秒）可由 bundle 配置覆盖；profile 自带的包管理启动器优先于 `pnpmCommand`。

## 自动发布到 npm

[发布 workflow](.github/workflows/publish.yml) 在推送 `v*` 标签时运行，使用 Node.js 24、npm 11 和 GitHub 托管的 Ubuntu runner。标签必须等于 `v` 加包版本（例如版本 `0.1.2` 对应 `v0.1.2`）；通过依赖安装、构建与测试后，使用 npm Trusted Publishing（OIDC）发布并附带 provenance。正式版使用 `latest`，含预发布标识的版本（如 `0.2.0-rc.1`）使用 `next`。

### 首次配置

1. 将 workflow 推送到 `urzz/dsh-plugin-enhance`。如果 npm 上尚未创建该包，先在本地完成首次发布，建立包的所有权：

   ```sh
   npm ci --ignore-scripts
   npm run check
   npm login --registry=https://registry.npmjs.org
   npm publish --access public --registry=https://registry.npmjs.org
   ```

2. 在 npm 包的 **Settings → Trusted Publisher** 中添加 GitHub Actions，填写以下字段：

   | 字段 | 值 |
   | --- | --- |
   | Organization or user | `urzz` |
   | Repository | `dsh-plugin-enhance` |
   | Workflow filename | `publish.yml` |
   | Environment name | 留空 |

   若设置页提供允许的操作选项，启用直接发布的 `npm publish` 权限。此 workflow 不需要配置 `NPM_TOKEN` Secret。详细要求见 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。

### 发布后续版本

例如，当前 `0.1.2` 已首次发布后，在工作区干净时执行：

```sh
npm version patch
git push origin main
git push origin v0.1.3
```

`npm version patch` 将版本更新为 `0.1.3`，同步锁文件，并创建版本提交和 `v0.1.3` 标签。推送标签后到 GitHub Actions 查看发布结果。也可以使用 `npm version <具体版本>` 发布其他版本，并推送对应标签。npm 不允许覆盖已发布的同一版本；首次手动发布后，应提升版本再触发自动发布。
