# PROGRESS

## 当前状态（压缩摘要，供新会话直接接手）

- 项目：`01_Projects 项目/dsh-token-plan-usage`；版本 `1.0.2`，tag `v1.0.2`。
- 功能：浮层卡片可显示多选套餐（完整指标）；圆环单独配置上半/下半指标（可跨套餐、可只选一个、余额可填满额算比例）。插件详情页为左右两卡：左设置、右示例预览。
- DeepSeek 取数：优先 `ctx.get("deepseekAccount").getBalance(client)` 读账号钱包（`normal_wallets` + `bonus_wallets`）；账号未登录/读取失败/服务缺失时回退 `DEEPSEEK_API_KEY` 的 `GET /user/balance`。API Key 官方只有余额接口，没有 usage/quota。
- DeepSeek 账号客户端元数据：`version` 取 `profileContext.installAnchor` 的 package.json（当前 `0.2.2-rc.1`），`locale` 取宿主 `Intl`，时区为东为正秒；账号调用按 `timeoutMs` 竞速（默认 15s）。
- 失败语义：`signed-out`（未登录账号）、`account-error`（账号读取失败）；无账号服务且无 API Key → `no-key`；无账号服务但 API Key 报错 → 保留 API Key 状态。失败保留 last-good（30s TTL + 单飞）。
- 数据源：套餐选项来自 `ctx.llm.listProviders()`；当前 providers=`deepseek-official`/`deepseek-account`/`opencode-go`，无小米 provider，所以小米不显示。
- 口径：UI 显示剩余（100−used）；圆环上下半按详情页独立选择。
- 测试：`node --test --experimental-test-isolation=none` 162 pass / 0 fail / 0 cancelled；`node --check lib/*.js` 通过。
- 本地安装（验证用）：`npm pack` 后用 `plugin_manager install_bundle target=file:<tgz 绝对路径>`；安装后实测 `/usage` DeepSeek `status:"ok"`（CNY 账号钱包），不再 401。
- 仓库：main + tag `v1.0.2`；新增 `.github/workflows/test.yml`（Node 22 语法检查 + 测试）；`package.json files` 已包含 `docs/`。

## v1.0.2 修复（对应外部评审问题）

- [x] P1 整体请求失败不再伪装成空成功：宿主整体异常返回 HTTP 500（无 `plans`）；单个 plan 抛错只影响该 plan；客户端把 `internal` 当失败并保留上次快照。
- [x] P1 配置写入接口补齐同源 + JSON 校验：`POST /config` 要求同源 `Origin` 与 `application/json`（与 Cookie 接口一致）。
- [x] P1 圆环不再因失败/触顶误导：圆环回退 last-good 读数；单个触顶只影响该弧；上下槽位缺失时不再把另一个指标上移。
- [x] P2 配置页预览跟随未保存选择：`/usage?preview=1&plans=…&ring=…` 探测当前勾选（200ms 防抖），不再只看上次保存的套餐。
- [x] P2 小米 partial：detail/usage 即使 HTTP 成功但数据不可解析，也标 `partial`。
- [x] P2 文档/发布：quotas 环口径改为独立槽位语义；GUIDE 英文链接修正；npm 包包含 docs；新增 CI workflow。
- [x] README 改为产品化结构（中英双语），安装/数据安全/凭据说明集中在一页。

## 历史（v0.2.0 时代，已完成）

- 圆环/卡片真机可见；口径为「剩余」；provider 范围过滤；多套餐勾选 + 圆环上下半独立配置；配置持久化到 `~/.dsh/dsh-token-plan-usage.json`；129 个测试覆盖。
- 小米 Cookie 设置流程：宿主先探测成功再写入 `XIAOMI_TOKEN_PLAN_COOKIE`；失败不落盘。
- v0.4.1/v0.4.2：详情页减负、保存按钮主题中性色、弹层表面改用 DSH 原生菜单 token `--dsw-specific-menu`。
- v1.0.1：DeepSeek 改为账号余额优先、API Key 兜底；新增账号客户端元数据、`signed-out`/`account-error` 状态与提示。

## 未验证/待办

- GUI 卡片与配置页的新外观需刷新页面后人工确认（host 路由与单测已覆盖）。
- API Key 成功路径无法实测：现有 Key 无效，官方无 usage 接口；由 fixture 测试覆盖，换 Key 后可再验证。
