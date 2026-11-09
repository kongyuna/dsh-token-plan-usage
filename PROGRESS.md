# PROGRESS

目标：让 `dsh-token-plan-usage` 在 DSH 侧栏账号行右侧显示用量环，点开看到 OpenCode Go / 小米 / DeepSeek 三个 plan；环与卡片显示**剩余**百分比，插件与 `dsh-opencode-go-plus` 完全独立。
顺序：先核对基线 → 用截图/点击证明按钮与卡片 → 修剩余口径与解耦 → 全量测试 → push/tag。
最大风险：账号行/overlay 结构变化、以及 macOS 辅助访问限制导致无法自动点击。

## 状态

- [x] 基线：`node --test` 117 → 现在 118 pass / 0 fail / 0 skipped；`node --check lib/*.js` 通过。
- [x] 环：已确认在账号行右侧；截图像素测量环中心 y=786.5，头像中心 y=786.0（差 0.5px）。
- [x] 卡片：已通过 CoreGraphics 点击真实页面打开；截图显示三个 plan 与「剩余 96% / 99% / 89%」；卡片从环上方浮出（锚点 bug 已修）。
- [x] 口径：UI 从「已用」改为「剩余」；宿主仍保留上游 `usedPercent`，客户端换算 100−used；环取各窗口**最小剩余**。
- [x] 解耦：删除读取 `dsh-opencode-go-plus` settings 的 `settingsValue` / `openCodeOverrides`；OpenCode Go 的 baseURL/credentialRef 只来自本插件配置/默认值。
- [x] 回归测试：按用户新要求（剩余口径、完全解耦）更新客户端断言，删除 2 个只测旧 settings 复用的测试，新增 2 个测试（点击锚点 bottom offset、剩余渲染 + 最小剩余聚合）；净 118 pass / 0 fail / 0 skipped。
- [x] push 到 `kongyuna/dsh-token-plan-usage`，打 v0.1.1 tag（dfbbffa）。
- [x] 窄窗：DSH 最小窗宽 520px（390 做不到）；520px 下卡片 300px 宽、无横向溢出，见 `artifacts/usage-card-narrow.png`。
- [x] 解耦核对：`lib/`、`test/` 中已无 `dsh-opencode-go-plus` 的功能引用（只剩 MIT 署名）。

## 说明

- 2026-11-09 DSH 曾中途重启（端口/进程变化），期间两次调试器工具调用结果未知；已改为截图 + 真实鼠标事件验证，不依赖重启中的调试器。
