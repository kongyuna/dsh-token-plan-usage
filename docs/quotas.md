# 用量口径与上游契约

这份文档记录 v0.4.2 三个 plan 的数据来源、字段含义和归一化规则。上游都是非公开或半公开接口，
可能随服务方改动；插件对字段采取「坏字段丢弃、不坏整份」的策略，并在 UI 里保留原始 `status`。

## 1. OpenCode Go

```http
GET {baseURL}/v1/usage
authorization: Bearer <OPENCODE_GO_API_KEY>
accept: application/json
```

`baseURL` 默认 `https://opencode.ai/zen/go`；本插件不读取其它插件的 settings，走本地 relay
（例如 `http://127.0.0.1:8788`）时在 `plans[].baseURL` 里显式配置。若 `baseURL` 已带 `/v1`，不会重复拼接。

响应：

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 3, "resetsAt": "2026-11-07T12:42:26.000Z" },
    "weekly":  { "status": "ok", "percent": 14, "resetsAt": "2026-11-09T00:00:00.000Z" },
    "monthly": { "status": "ok", "percent": 7, "resetsAt": "2026-12-03T13:15:46.000Z" }
  }
}
```

- 三个窗口是月额度的 20% / 50% / 100%，`percent` 是**已用**比例。
- 未知窗口名忽略；`status` 原样保留（`rate-limited` 表示触顶）。
- `resetsAt` 是重置时刻；5 小时窗随消耗滑动，周窗对齐周一 00:00 UTC，月窗对齐订阅锚点。

## 2. 小米 MiMo Token Plan

官方 API Key（`tp-…` / `ttp-…`）只用于推理，没有用量接口。用量只在控制台，需要浏览器 Cookie：

```http
GET https://platform.xiaomimimo.com/api/v1/balance
GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail
GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage
Cookie: api-platform_serviceToken=…; userId=…
```

- 必需 Cookie：`api-platform_serviceToken`、`userId`；可选 `api-platform_ph`、`api-platform_slh`。
- `balance`：`{ code, data: { balance, currency, cashBalance, giftBalance } }`。
- `tokenPlan/detail`：`{ code, data: { planCode, currentPeriodEnd, expired } }`；`currentPeriodEnd`
  是 `yyyy-MM-dd HH:mm:ss`（按 UTC 解析）。
- `tokenPlan/usage`：`{ code, data: { monthUsage: { percent, items: [{ name, used, limit, percent }] } } }`；
  `monthUsage.percent` 是 0..1，宿主 ×100 后保存为已用比例；展示时再换算成剩余。第一个 `items[]` 作为 Credits 计数行。
- 控制台的过期会话可能以 3xx 重定向到登录；插件把 3xx / 401 / 403 都映射为 `auth`。
- balance 成功但 detail/usage 失败时，仍显示余额并标 `partial`。

Cookie 保存流程：卡片 → 小米区块 → 设置 Cookie → 宿主先用该 Cookie 实际探测一次 → 成功才写入
DSH credentials 的 `XIAOMI_TOKEN_PLAN_COOKIE`；失败不落盘。

## 3. DeepSeek

DeepSeek 条目按「账号钱包优先、API Key 兜底」取数。两者都只提供余额金额，没有已用百分比。

### 3.1 DSH 账号钱包（优先）

宿主侧调用 `ctx.get("deepseekAccount").getBalance(client)`；账号 provider 用存好的 grant 请求
`{platformOrigin}/api/v0/users/get_user_summary`（`x-dsh-auth-token`）。`client` 是该调用方的
`AccountClientMetadata`：`{ version, locale, timezoneOffsetSeconds }`，其中 version 取 DSH 构建版本
（`profileContext.installAnchor` 的 package.json），locale 取宿主 Intl，时区为东为正的整秒。

返回形状：

```json
{
  "status": "ready",
  "value": [{ "currency": "CNY", "balance": "100.00" }],
  "bonusWallets": [{ "currency": "CNY", "balance": "10.00" }]
}
```

- `value` = 充值余额（normal_wallets），`bonusWallets` = 赠金（bonus_wallets）；均为十进制字符串。
- 一个币种一行：`amount = 充值 + 赠金`，`granted = 赠金`，`toppedUp = 充值`；按 CNY、USD 排序。
- `getBalance` 返回 `null` → 未登录（`signed-out`）；`{ "status": "failed" }` 或抛错 → `account-error`；
  宿主没有账号服务 → `no-account`（无 API Key 时对外表现为 `no-key`）。
- 账号余额成功时不再请求 API Key，避免无意义的 401。

### 3.2 API Key 余额（兜底）

```http
GET {baseURL}/user/balance
authorization: Bearer <DEEPSEEK_API_KEY>
```

`baseURL` 默认 `https://api.deepseek.com`。响应：

```json
{
  "is_available": true,
  "balance_infos": [
    { "currency": "CNY", "total_balance": "110.00", "granted_balance": "10.00", "topped_up_balance": "100.00" }
  ]
}
```

- 一种币种一行，按 CNY、USD 排序；余额金额不是百分比。
- `is_available: false` → 该 plan 状态 `unavailable`。
- 官方 API 只有余额接口（没有 usage/quota 接口），所以 API Key 侧只能显示金额。
- 401/403 → `auth`。只有账号侧不可用（未登录/失败/服务缺失）时才走到这里。

## 4. UI 归一化

- 显示范围：只展示 `ctx.llm.listProviders()` 里已有 provider 对应的 plan；provider 不存在时即使凭据存在也不显示（例：当前 DSH 没有小米 provider，就不显示小米）。
- 宿主返回的 `usedPercent` 是上游的**已用**比例并 clamp 到 0..100；客户端显示**剩余** = 100 − 已用，宿主不改口径。
- 环：上弧/下弧 = 配置页独立选择的上半/下半槽位（slot 0 / slot 1），不是按窗口类型自动挑最大/最小值；某个槽位缺失或探测失败时该半环留空，**不会把另一个指标上移到错误位置**。
- 弧长 = 剩余；单个窗口 `rate-limited`/`expired`/已用 ≥100% 只让该弧长度为 0，**不会让整个圆环灰显**（完全没有可画弧时才灰显）。
- 卡片百分比列显示「剩余 N%」；额度为 0 时显示「剩余 0%」，重置列显示「已达限额」或「套餐已过期」。
- 卡片可显示多个套餐（详情页多选）；套餐打开后显示完整指标，不再逐项配置。
- 圆环单独配置：上半/下半各选一个指标（可来自不同套餐），下半可不显示；余额可填满额（可选），填了按余额/满额计算比例，不填只显示金额/货币符号。圆环引用的套餐即使不在卡片里，宿主也会探针。
- 配置页预览会按**当前未保存**的套餐勾选和圆环选择即时探测（`/usage?preview=1&plans=…&ring=…`），不依赖上次保存的配置；勾选变化有 200ms 防抖。
- 卡片窗口行三列 `标签 | 数值 | 重置/说明`；金额行显示币种与赠金/充值明细。
- 失败保留 last-good：宿主缓存 30 秒 TTL + 单飞；失败时返回 `last`，卡片标「上次读数」，圆环同样回退到这份上次读数。
- 单个 plan 探测抛错只影响该 plan（显示失败状态）；宿主整体异常返回 HTTP 500，客户端保留上一次成功快照，不会用空列表覆盖界面。
- 小米的 detail/usage 接口即使 HTTP 成功但返回不可解析的数据，也会标 `partial`（余额仍显示）。

## 5. 安全

- Key/Cookie 只在宿主进程中使用；浏览器只收到百分比、金额、重置时间和脱敏错误。
- 上游必须 HTTPS；本地 relay 的明文 HTTP 只允许 loopback。
- Cookie 保存接口只接受 POST + `application/json` + 同源 `Origin`，body 上限 8KB。
- 配置保存接口 `/dsh-token-plan-usage/config` 的 POST 同样要求同源 `Origin` + `application/json`。
- 不跟随重定向；错误文本会脱敏 `Bearer`、`Cookie:` 和具体凭据。
