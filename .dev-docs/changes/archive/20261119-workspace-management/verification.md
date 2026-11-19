# 验证记录

## 浏览器能力预检（2026-11-19，fresh agent browser-validation）
目标 GUI：https://dsh-dev1.urzz.me/ 。实际使用 browser-skill 与 bsk 工具，session wrpp 已清理。

- 可创建浏览器会话，但目标页显示 `dsh web authentication required; reopen the URL printed by dsh web.`
- 已登录用户标签页 ID 413995113 借用操作返回 `Timed out waiting for tab borrow confirmation`；未重复请求。
- 未确认本地新插件在 GUI 加载，不安装插件、不修改 profile、不归档真实用户会话。
- A4 真实 GUI 交互：not-run；需要已认证的 Agent Window 或完成标签页借用，以及新构建在该环境加载。

## 实现验证（Lead 集成后）

- `npm run check`：构建成功，55 tests / 55 pass / 0 fail，后台 job bash-a3d543afadfb4c2e 已收取，exit code 0。
- 新增 test/workspace-client.test.js 3 项 VM 组件交互测试覆盖 A1/A2：工作区选择隔离、双语、全选/单选、部分失败继续、原生错误、重试、重复点击及归档时关闭保护、成员移除/已归档跳过、权限撤销、卸载停止后续调用和清理订阅。使用 fake native services，不声称真实原生归档的端到端验证。
- 现有 Cordis/Typert 和插件更新测试全部通过，缺失工作区可选服务不会影响更新标签。
- `npm pack --dry-run` 成功：13 files，43.2 kB client.js 已内嵌 workspace-client.js，无新增运行时散文件需求，未发布。
- `git diff --check` 通过。Lead 审阅新增模块与测试、入口与说明差异及构建中的权限订阅，未发现阻塞问题。
- rc.1 Modal 公开契约及 rc.5 workspace/session/contextMenu 公开接口已核对；未验证所有版本。

最终未提交产物 SHA-256：
- workspace-client.js: bcbdc93359d49dfe96efe4170be230eee99541b95cb85d9dd676fa0e224686ab
- client.source.js: 749345a55d6b68517cced8459f9a41fb1a05e11cc1a3d8cb69186579e7cc4620
- client.js: 8302db3b25376658c90feed718de80aa70159e7669ec940ac5a915c8156da1f6
- test/workspace-client.test.js: b509c1aa2363ff232d9e58ff3dbd718a57cdeea06853a885857d5dddfb20328e

A4 真实浏览器交互仍 not-run，change 不关闭。没有安装、提交、推送或发布。

## 验收范围修订（spec v4）
用户明确要求：「以后插件更新完不要进行真实gui验证了，因为已经禁止直接修改本机的插件了」。后续不再进行真实 GUI 验证或修改本机安装插件；交付使用源码契约审查、自动化测试、构建与打包检查。以下预检仅为历史事实，GUI 不再是交付阻断。

## spec v3 浏览器预检（fresh gui-readiness，2026-11-19）
- A4/A6 GUI：not-run。https://dsh-dev1.urzz.me/ 在自有 Agent Window 显示 `dsh web authentication required; reopen the URL printed by dsh web.`。
- script[src] 列表为空，window.__DSH_BOOT__ 不存在，无法证明归档组件新产物加载。未借用用户标签页或安装 profile，未操作真实归档。
- 自有 session atmv 已停止。原始证据 /tmp/gui-readiness-20261119-fresh-sync.json，检查及清理记录 /tmp/gui-readiness-20261119-fresh-report.json。此项不替代代码及组件自动化验证。

## spec v4 最终验证（2026-11-19）
- A1/A2/A4/A5/A6：`npm run check` 成功，59 tests / 59 pass / 0 fail；job bash-930e8a10afb1420e 已收取，exit code 0。生成两个客户端，根 client.js 不再包含归档注册。
- 5 项归档组件测试覆盖单选/全选、权限动态变化、部分失败继续、逐项复核、失败重选及重试、原生错误原文、关闭及重复点击保护、卸载停止队列和订阅清理。UI 使用公开 Checkbox 的布尔回调、Modal 的 className/contentClassName 和语义主题变量，经 Lead 源码审查。
- 2 项新增生命周期测试使用真实 Cordis Loader 与 rc.1 app-boot：相对 patch 锚定；原生 entry.update({disabled}) 清理菜单/弹窗/语言注册，首个请求在途停用后第二个不再发出；再启用只有一个实例且状态清空。服务及 React 为测试替身，不声称浏览器端到端测试。
- 最终 `npm pack --dry-run --json`：18 files，28260 bytes；归档组件 Host、manifest、client.js、双语locale均包含。`git diff --check` 通过。新增直接测试依赖沿用已锁定的 cordis-plugin-loader 1.1.0，离线同步锁文件，无脚本/安装profile操作。
- Lead 已审查最终源码、入口和打包差异。rc.5 client-modules 的 pathLike/最近manifest发现契约、plugin-manager升级重读patch及reconcileProfile已核对；rc.1 client-modules不在当前依赖中，未实测其发现契约，不承诺所有兼容版本均已验证。
- 已知宿主限制：文件路径组件的原生管理列表显示技术路径，不读取内嵌locale标题；README记录识别方式。无 HMR 的已有bundle升级遵循宿主重启机制，无额外迁移逻辑。
- 用户已取消真实GUI验收。工作区迁移仍明确排除且未实现；无提交、推送、安装或发布。

本轮最终产物 SHA-256（替代上方旧产物标识）：
- client.js: 40da5b23b8cd301942ca699abe7e2c5cc1cf7ee6049bab9da59bfd9d762a5c1f
- workspace-client.js: 8c447195cfa994689b0343fb6c5e38a0981fb08525788bffbf60742b32d423d7
- workspace-archive/client.js: 649069433df943127ad6aded473ef414e968eb03f94dd7d3da6a7fd982fde20a
- test/workspace-client.test.js: dfcd1a0e831287ad57511cf8e551f90e7183dca20c4c3b4ec72074c1791fddbf
- test/workspace-lifecycle.test.js: e4068a232a96e4f86091f6a83e99b2381b1f7ff9771e526a769b5b977eb4df8a
