# 仓库维护约定

本仓库是独立的 DSH 插件 `dsh-plugin-enhance`，为插件管理页提供增强管理标签页，并通过 `plugin_enhance` 工具复用同一更新引擎。用户介绍与使用方法见 [README.md](README.md)。开发、验证、打包和发布约定集中在本文件；README 只保留插件介绍与使用说明。

## 环境与改动范围

- 使用 Node.js 22 或更新版本。DSH 开发与测试基准为 **0.2.2-rc.1**，运行兼容范围为 `>=0.2.2-rc.1 <0.3.0-0`，以 [package.json](package.json) 为准。`engines.dsh` 与 DSH peerDependencies 保持一致的范围；不要将测试基准误写成精确的运行版本限制。扩大范围前核对所用 API；范围声明不代表已经在所有后续版本上测试。
- 本仓库独立管理 Git、依赖、构建和发布，不在父仓库或其他插件中默认执行对应操作。
- Host 使用 ESM JavaScript。React、Zod 与公开 UI primitives 由 DSH 客户端提供，不打入客户端 bundle；Cordis peer 与官方保持 `~4.1.0`。
- 界面包含英文和简体中文；新增或调整用户文案时保持两种语言一致。

## 源码与生成文件

| 文件 | 职责 |
| --- | --- |
| [engine.js](engine.js) | 来源发现、兼容性判断、更新队列与失败重试。 |
| [index.js](index.js) | Host 服务、原生更新进度事件适配和模型工具。 |
| [github.js](github.js) | GitHub 来源识别与 Git 元数据查询。 |
| [client.source.js](client.source.js) | Web 标签页源码；挂载本插件的 Remote 描述，通过子作用域显式注入 `remote.pluginEnhance` 后注册标签页。 |
| [client.js](client.js) | esbuild 生成的浏览器入口，随仓库及 npm 包发布；修改客户端源码后通过构建更新。 |
| [typert.host.js](typert.host.js)、[typert.remote-client.js](typert.remote-client.js) | Host 与 Client 的 Remote 描述；修改接口时保持两端一致。 |
| [cordis.patch.yml](cordis.patch.yml)、[package.json](package.json) | bundle 加载与发布入口。 |
| [test/](test/) | 引擎、GitHub 查询、Cordis/Typert 网关、客户端挂载与交互回归测试。 |

## 实现约束

- Web 页面与 `plugin_enhance` 工具复用同一引擎，更新单位为 bundle，保留原启用状态。
- 原生路径优先：官方管理器 `updatable` 的组合包通过 `listVersions` 与 `updateBundle` 检查和更新，选择最新兼容正式版，沿用其 registry、认证、代理及兼容性策略。原生查询失败不切换扩展路径。
- 其余组合包使用扩展路径：市场目标优先，其后为 GitHub；市场查询失败不得静默切换来源。
- GitHub 元数据查询使用临时 bare 仓库，不执行仓库代码或构建脚本；保留原 ref 以继续跟踪同一分支，支持超时、取消和临时资源清理。
- 仅选择版本号更高且兼容当前 DSH 的目标；不自动授予版本豁免、构建脚本权限或重启 DSH。
- 更新前重新核对来源、版本和启用状态。更新结果必须核对实际安装版本；待授权构建、安装失败、激活失败或版本不符不得报告成功。
- 原生更新进度订阅 `plugin-manager/update-state` 并按 requestId 关联；目标安装失败后的旧版恢复由官方管理器尝试，分别保留目标结果和恢复结果，恢复成功不能报告更新成功。
- 扩展路径无 HMR 时仅对官方管理器的 `stop-profile` 卸载结果允许覆盖安装，其他卸载失败不继续安装；原生路径遵循官方管理器结果。
- 自身更新排在批次最后，使用官方管理器执行。队列数据挂在生命周期更长的管理器实例上供重载后的新引擎接续；不保存旧服务或查询闭包，不在卸载清理中等待更新批次（会与 HMR 互相等待）。
- 重试队列仅保存在进程内存中，不承诺原子更新或跨进程恢复。扩展路径不提供自动回滚。自身安装失败导致服务未恢复时，使用官方管理器重新安装。
- 保留模型工具的 DSH 完整访问权限/审批检查，以及网页 Remote 网关的 owner 访问控制。

## 开发与验证

```sh
npm install --ignore-scripts
npm run check
npm pack --dry-run
```

- `npm run build` 使用 esbuild 打包客户端源码及 Remote 描述，并检查发布入口语法。
- `npm test` 运行 Node.js 测试；`npm run check` 依次构建和测试。完整测试需要清单中的 DSH peer 与开发依赖可解析。
- 测试使用假包管理器，不真实安装或卸载插件。GitHub 查询测试使用本地 Git 仓库，不依赖真实网络。
- 修改实现后运行相关测试；发布前运行完整构建、测试和打包预览，确认新增运行时模块进入发布清单。
- 发布清单包含 Host、Client、Remote 描述、bundle patch、语言包、图标及 README。浏览器入口预先构建，安装时不需要 `prepare` 或另行授权构建脚本。

## 发布到 npm

[发布 workflow](.github/workflows/publish.yml) 在推送 `v*` 标签时运行，使用 GitHub 托管的 Ubuntu runner、Node.js 24 和 npm 11。标签必须等于 `v` 加包版本；通过依赖安装、构建和测试后，使用 npm Trusted Publishing（OIDC）发布并附带 provenance。正式版使用 `latest`，含预发布标识的版本使用 `next`。

发布需有用户明确授权。同步 [package.json](package.json) 与 [package-lock.json](package-lock.json) 的版本，创建匹配的标签，再普通推送分支和该标签。确认 GitHub Actions 的实际发布结果后再报告发布成功，不覆盖已发布的 npm 版本。

在改动已提交、工作区干净时，可按原流程发布补丁版本：

```sh
npm version patch
git push origin main
# 按 npm version 输出的版本推送对应标签，例如：
git push origin v0.1.6
```

`npm version patch` 会同步版本文件、创建版本提交和标签。若将功能与版本合入一个提交，先执行 `npm version <版本> --no-git-tag-version`，提交后再创建匹配标签。

### Trusted Publisher 配置

npm 包 Settings → Trusted Publisher 的配置：

| 字段 | 值 |
| --- | --- |
| Organization or user | `urzz` |
| Repository | `dsh-plugin-enhance` |
| Workflow filename | `publish.yml` |
| Environment name | 留空 |

若 npm 设置页要求选择操作，启用直接发布的 `npm publish` 权限。此 workflow 不需要配置 `NPM_TOKEN` Secret。详见 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。

仅在为新包首次建立所有权、尚不能使用 Trusted Publishing 时，采用本地首次发布流程：

```sh
npm ci --ignore-scripts
npm run check
npm login --registry=https://registry.npmjs.org
npm publish --access public --registry=https://registry.npmjs.org
```
