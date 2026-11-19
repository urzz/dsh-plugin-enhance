# 实施计划

当前 projectRoot /工作目录：/home/fooksky/projects/fooksky/dsh-plugins/dsh-plugin-enhance/.agents/worktrees/workspace-batch-archive-migrate
分支 workspace-batch-archive-migrate；changeId 20261119-workspace-management。基于 intent v1 / spec v2，用户已明确审核并授权归档实现。

- P1 direct：实现隔离注入的工作区菜单与批量归档对话框、新客户端模块及边界/交互测试，关联 A1 A2 A4。复用公开服务，核对 rc.1/rc.5 契约；不新增 Host mutation。
- P2 direct：集成入口与发布文件，更新 README 和迁移待解决说明；运行 npm run check 与打包预览，审查最终 diff，关联 A1 A2 A4。
- P3 direct：fresh 子 agent 验证浏览器能力及 GUI https://dsh-dev1.urzz.me/ 的可测条件，能测则执行真实交互，否则报告具体阻断且不冒充通过，关联 A4。未经授权不安装 profile 或替换服务。

## 修正计划（spec v3，用户已批准）
- P4 direct / A5：核对并实现原生独立组件入口及开关，隔离更新 Remote，补充生命周期测试；更新打包与使用说明。
- P5 direct / A6 A1 A2：修正归档 UI 和对应测试，复用原生控件与语义变量。
- P6 direct / A1 A2 A4 A5 A6：Lead 审查最终 diff，运行完整检查和打包预览。用户于本轮明确取消插件更新后的真实 GUI 验证，禁止直接修改本机已安装插件；既有浏览器预检仅作为历史记录，不再构成交付阻断。

交付边界：工作分支代码与验证结果；不提交、推送、发布或安装。迁移明确不属于本次实现。
