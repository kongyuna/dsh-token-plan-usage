# PROGRESS

## 当前状态（压缩摘要，供新会话直接接手）

- 项目：`01_Projects 项目/dsh-token-plan-usage`；HEAD `165d927`，tag `v0.2.0`，git 干净。
- 功能：浮层卡片可显示多选套餐；圆环单独配置上半/下半指标（可跨套餐、可只选一个、可选余额）。插件详情页提供可视化配置。
- 数据源：套餐选项来自 `ctx.llm.listProviders()`；当前 providers=`deepseek-official`/`deepseek-account`/`opencode-go`，无小米 provider，所以小米不显示。
- 当前配置（`~/.dsh/dsh-token-plan-usage.json`）：卡片 `opencode-go: rolling+monthly`、`deepseek: balance`；圆环上半 `opencode-go rolling`，下半 `deepseek balance`（余额以 ¥ 显示）。
- 口径：UI 显示剩余（100−used）；圆环上半/下半按详情页独立选择。
- 测试：`node --test` 128 pass / 0 fail / 0 skipped；`node --check lib/*.js` 通过。
- [x] UI 收尾：保存按钮改为主题中性色（原 brand token 在深色主题变白导致白底白字）；配置页删掉多余说明，只留标题/套餐勾选/指标/圆环上下半。
- 未验证：DSH 窗口被关闭，插件详情页配置卡片（含圆环上半/下半）未做截图；配置路由、配置卡片渲染/多套餐/圆环槽位逻辑已有测试与 curl 证据。
- 下一步（如需）：打开 DSH → 设置 → 插件 → Token Plan 用量，确认可视化配置页；若打开后无配置卡，查 `plugins.bundle.config` 注册与 host `/dsh-token-plan-usage/config` 路由。

目标：让 `dsh-token-plan-usage` 在 DSH 侧栏显示一个套餐的用量环，点开卡片显示用户勾选的多个套餐；插件详情页提供可视化配置（多选套餐、每套餐指标顺序、圆环单选套餐）；环与卡片显示**剩余**；插件与 `dsh-opencode-go-plus` 完全独立。
顺序：基线核对 → 环/卡片真机可见 → 剩余口径与解耦 → provider 范围过滤 → 详情页可视化配置（多套餐 + 单环）→ 全量测试 → push/tag。
最大风险：账号行/overlay 结构变化、macOS 辅助访问限制、DSH 窗口被关闭导致配置页无法截图。

## 状态

- [x] 基线：`node --test` 117 → 目前 127 pass / 0 fail / 0 skipped；`node --check lib/*.js` 通过。
- [x] 环：在账号行右侧；截图像素测量环中心 y=786.5，头像中心 y=786.0（差 0.5px）。
- [x] 卡片：已通过 CoreGraphics 点击真实页面打开；卡片从环上方浮出（锚点 bug 已修）。
- [x] 口径：UI 显示「剩余」；宿主保留上游 `usedPercent`，客户端换算 100−used。
- [x] 范围：只显示 `ctx.llm.listProviders()` 里已注册 provider 的套餐（当前实测 `deepseek-official`/`deepseek-account`/`opencode-go`；小米无 provider，已隐藏）。
- [x] 解耦：删除读取 `dsh-opencode-go-plus` settings 的 `settingsValue` / `openCodeOverrides`；OpenCode Go 的 baseURL/credentialRef 只来自本插件配置/默认值。
- [x] 多套餐配置：详情页可多选套餐；每个套餐可单独选/排序指标；卡片按勾选显示多个套餐。
- [x] 圆环独立配置：上半/下半各自选指标（可来自不同套餐），下半可选「不显示」；余额指标在圆环中心显示货币符号；圆环引用的套餐不在卡片里也会被探测。
- [x] 配置持久化：`~/.dsh/dsh-token-plan-usage.json`（非敏感、无需重启）；GET/POST `/dsh-token-plan-usage/config` 实测成功。
- [x] 环顺序：`summarize(plans, ring)` 按独立槽位取上半/下半；有单测与余额符号测试。
- [x] 回归测试：127 pass / 0 fail / 0 skipped；覆盖剩余、provider 范围、多套餐配置读写、配置卡片渲染、环锚点。
- [x] 窄窗：DSH 最小窗宽 520px（390 做不到）；520px 下卡片 300px 宽、无横向溢出。
- [x] 解耦核对：`lib/`、`test/` 中已无 `dsh-opencode-go-plus` 的功能引用（只剩 MIT 署名）。
- [x] push 到 `kongyuna/dsh-token-plan-usage`，打 v0.2.0 tag。

## 说明

- 2026-11-09 DSH 曾中途重启；当前 DSH 窗口被关闭，无法截图插件详情页配置卡片。配置路由、配置卡片渲染与多套餐/环单选逻辑已有测试与 curl 证据，配置页外观仍需用户打开确认。
- 配置接口实测：selected `{plans:[opencode-go: rolling+monthly, deepseek: balance], iconPlanId:"opencode-go"}`，`/usage` 返回两个套餐且窗口顺序正确。
