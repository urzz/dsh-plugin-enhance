# 插件与组件展示修复方案

基于 intent v1。方案审核及实施授权见本 change 的决策记录 D2/D3。

## 展示文案

| 对象 | 中文名称 | English name | 中文描述 | English description |
| --- | --- | --- | --- | --- |
| 整体插件（bundle） | DSH 增强 | DSH Enhance | 提供插件更新管理与工作区会话批量归档。 | Manage plugin updates and archive workspace sessions in bulk. |
| 更新组件 | 插件更新 | Plugin Updates | 检查插件更新，批量更新所选插件，并重试失败项。 | Check for plugin updates, update selected plugins in bulk, and retry failed updates. |
| 归档组件 | 会话批量归档 | Bulk Session Archive | 在工作区中选择并批量归档会话，查看每项处理结果。 | Select and archive sessions within a workspace, with individual results. |

更新页入口继续沿用既有“增强管理”。npm 发布包名称仍为 dsh-plugin-enhance；现有原生组件 ID dsh-plugin-enhance 与 dsh-plugin-enhance-workspace-archive 保持稳定。原生管理器新建启停记录只保存 id 和 disabled，这类已有选择可继续生效。用户手写或既有的带 name 条件的 patch 只有名称匹配才生效；若明确绑定旧入口名称，需要按新组件包名更新该条件。文档说明此边界，不在插件内自动改写用户 profile。

## 根因与原生契约

1. 归档菜单 action 未提供 icon。DSH 原生工作区客户端已注册 contextMenu.icon 的 workspace.archive 键，可以直接复用。
2. readPluginMeta 仅读取包 specifier 的 locale 资源，不读取 file URL 或相对文件入口，导致归档组件标题回退到路径且无描述。
3. readPluginMeta 支持包子路径，但 ClientModuleRegistry.locatePkgJson 仅接受包根或文件路径。只把归档入口换成包子路径会使归档客户端不加载，不能作为完整修复。
4. 整体 bundle 与当前根更新组件共用根包 metadata，无法通过单改根 locale 同时给两者提供不同的名称和描述。原生 inventory 不读取 row.title、row.description 或 row.meta 覆盖。

## 采用的结构

仍以 dsh-plugin-enhance 一个包安装和发布，在其发布产物中内嵌两个具有 package.json、locale 和客户端入口的私有组件包。使用 npm dependencies 与 bundledDependencies 将组件随同一个 tgz 交付，不要求用户额外安装，不单独发布组件。

组件 Host row 改用可解析的包根名称：更新组件 dsh-plugin-enhance-updates，归档组件 dsh-plugin-enhance-workspace-archive；row ID 保持原值。根包只承担 bundle 展示元数据和安装入口。源码、Host 及客户端产物按各自组件归属组织；组件包必须包含其运行依赖的本地文件，不通过固定 ../../ 路径访问安装目录，也不依赖依赖提升布局。

宿主从启用 bundle 的 dependencies 闭包建立运行时解析映射，按声明依赖的 package.json 解析包根，因此内嵌组件不需要安装到 profile 顶层。沿用原生加载和生命周期，不增加自定义名称覆盖、客户端注册桥接或开关存储。保留现有顶层导出能保留的兼容入口，避免为展示修复修改更新工具协议。

归档菜单直接添加 icon: { key: 'workspace.archive' }，其余行为沿用原生 archiveSession 和现有队列。更新文档中关于路径组件无法展示名称的旧说明。

## 选择理由与替代

- 单改 locale 无法修复被跳过的归档元数据，也无法区分整体和更新组件。
- 包子路径能修元数据，但当前宿主不为其加载客户端。
- row 字段覆盖没有宿主支持，不采用 UI 文本替换或私有服务补丁。
- 分别发布两个组件会增加发布和版本管理成本，不采用。
- 单 tgz 内嵌包根使用宿主已有依赖解析和 npm 打包能力，保留用户面对的单插件和两组件独立开关；代价是需要调整包布局、构建和锁文件，并验证真实打包结构。

## 验收

- A1 整体及两个组件的中英文名称和描述能通过原生 readPluginMeta 从实际安装布局读取，归档组件不再回退到 file URL；npm 包描述与功能范围一致。
- A2 原生 Loader 与客户端模块发现能读取两个组件；任一组件停用不影响另一个，已有 row ID 不变；原生管理器保存的 id/disabled 覆盖继续生效，文档说明旧 name 条件需更新的边界；重新启用和卸载不残留菜单、订阅或重复注册。
- A3 “批量归档会话”菜单提供 workspace.archive 原生图标键，双语标签、归档请求和权限行为不变。
- A4 构建和相关自动化测试通过；完整回归核对已有更新与归档行为。验证以源码、自动化和打包为准，遵守用户禁止真实 GUI 验证和修改本机已安装插件的要求。
- A5 打包产物包含两个组件的 Host、client、package.json 和语言包；临时目录中的单 tgz 安装/解析检查证明不依赖仓库源文件、顶层依赖提升或额外组件发布。构建不引入安装时脚本。

## 调查证据

以下源码路径相对 DSH 安装目录 /home/fooksky/.local/share/fnm/node-versions/v26.13.0/installation/lib/node_modules/@deepseek-ai/dsh/：

- node_modules/@deepseek-ai/dsh-app-boot/src/package-meta.ts:159–198：metadata 的入口类型及资源读取规则。
- node_modules/@deepseek-ai/dsh-client-modules/src/index.ts:931–965：客户端只发现包根或路径入口。
- node_modules/@deepseek-ai/dsh-client-ui-workspace/src/client/index.ts:317–323：原生归档图标键。
- node_modules/@deepseek-ai/dsh-app-boot/src/profile.ts:488–539：启用 bundle 的依赖闭包。
- node_modules/@deepseek-ai/dsh-app-boot/src/profile-resolution/resolver.ts:869–876：按依赖声明者解析组件包。

调查环境为 DSH 0.2.2-rc.5。另核查 0.2.2-rc.1 的 lib/index.js:1634–1676，同样有 dependencyClosure；无需因本次依赖打包方式提升最低版本。源码契约核对不等同于所有版本的完整运行验证。

调查成员 metadata-contract 使用 npm 11.20.0 在临时目录完成独立打包样例：根包 dependencies 指向 file:./components/{updater,archive}，bundledDependencies 列出两个 private:true 组件；npm install --offline --ignore-scripts 与 npm pack --offline --ignore-scripts --json 成功。一个 tgz 内含两个 node_modules/<name>/{package.json,index.js,client.js,locale/en.json,locale/zh.json}，共 14 个文件，无需将源 components 目录纳入根 files 或单独发布组件。随后使用实际解包后的 tgz 建立仅暴露根 bundle 的临时 profile，通过公开 createRuntimeResolution、PluginPackages、loadOverlayPatches、readPluginMeta 和 resolvePluginResource 验证：DSH rc.1 与 rc.5 都能解析两个内嵌组件的 Host、Client 和三组独立元数据，无需将组件提升到 profile/node_modules。证据为 /tmp/dsh-bundled-components-B6FZrK/resolution-result.json，验证脚本为同目录 verify-resolution.mjs；Lead 已读取结果。该样例证明打包和解析契约可行，尚不是实际插件迁移后的完整回归。

启停兼容证据：dsh-plugin-manager/src/patch.ts:43–46 按 id 及可选 name 匹配覆盖，:74 新建覆盖仅写 { id, disabled }；cordis-plugin-include/src/patch.ts:97–99 跳过 name 不匹配的覆盖。应保留 ID 并说明手写 name 条件的升级边界，不声称保留 ID 能覆盖所有自定义 patch。

更新实现的具体布局采用 plugin-updates/：index、engine、github、typert.host 作为整体迁入，保持组件内部 ./ imports；client.js、typert.remote-client.js 与语言包归于同一目录，并在组件 manifest 声明实际运行依赖。归档组件保持工作区相关代码自包含。构建从这些组件源码生成各自可发布产物。
