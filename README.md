# dsh-token-plan-usage

[English](README.en.md) | 中文

一个**只读用量**的 DSH 插件：在侧栏账号行的右侧常驻一枚双半圆环，点开查看多个 token plan 的消耗。它从
[dsh-opencode-go-plus](https://github.com/yumusb/dsh-opencode-go-plus)（以及
[kongyuna 的个人 fork](https://github.com/kongyuna/kongyuna-opencode-go-plus)）的用量面板里把「环 + 卡片」
抽出来，去掉了模型适配器、模型目录、响应修复和账号菜单 DOM 注入，改成官方 slot 实现。

- 不注册 LLM 适配器，不发聊天请求，不改 `llm-pi-ai`，也不改现有 `dsh-opencode-go-plus` 的配置。
- 与 `dsh-opencode-go-plus` 共存：它能继续负责模型；本插件只负责看用量，并优先复用它已配置的网关地址和凭据引用。
- v1 支持：**OpenCode Go**、**小米 MiMo Token Plan**、**DeepSeek 余额**。

> 口径提醒：面板里的百分比是**已用**，不是剩余；圆环弧长同样表示**已用**。0% 为空环，100% 为满环。

---

## 界面

- **侧栏账号行右侧**（头像/名称同一行）：一枚 36px 按钮，内含 28px 双半圆环；不再占用 Remote/Settings 那一行。
  - 上弧 = 所有 plan 里「短窗」（5 小时/rolling）的最大已用百分比；
  - 下弧 = 所有 plan 里「长窗」（每周/每月）的最大已用百分比；
  - 某窗口 `rate-limited` / `expired` / ≥100% 时整环灰显；
  - 悬停某条弧会浮出「哪个 plan、哪个窗口、已用多少」的提示。
- **点击**：向上浮出用量卡片（右对齐、视口内 clamp，窄屏 `max-width: calc(100vw - 16px)`）。
  - 每个 plan 一个区块：名称、套餐名（如有）、控制台 `↗`、窗口行；
  - 窗口行是三列栅格 `标签 | 数值 | 重置/说明`；数字等宽、不截断，标签可省略；
  - 小米未配置 Cookie 时显示「设置 Cookie」，可直接在卡片里粘贴并保存；
  - 页脚显示「更新于 HH:mm」；探测失败保留上一次成功读数并标「上次读数」。
- 卡片打开时强制刷新一次；页面可见时按 `refreshSeconds`（默认 180 秒）轮询；Esc / 点外部关闭。

---

## 安装

本插件是本地/源码安装的 bundle，没有构建步骤、没有依赖、没有安装脚本。

在 DSH 会话里使用插件管理器安装绝对目录：

```text
plugin_manager install_bundle target=/absolute/path/to/dsh-token-plan-usage
```

或按 DSH 的常规方式把本目录（或 `npm pack` 产出的 tgz）装进 profile：

```bash
# 仅限 web / headless 等非 desktop profile；desktop 由 Electron 独占
dsh plugin --profile web add "/absolute/path/to/dsh-token-plan-usage"
```

安装后侧栏账号行右侧出现圆环。若 DSH 提示 `restart-required`，重启 DSH；HMR 生效时刷新页面即可。

卸载：在 DSH 的插件页卸载 `dsh-token-plan-usage`，或对应 profile 的 `dsh plugin remove dsh-token-plan-usage`。

---

## 配置

所有配置都可省略。默认会按你已有的凭据**自动发现** plan：

| plan | 凭据引用 | 数据源 |
|---|---|---|
| OpenCode Go | `OPENCODE_GO_API_KEY` | `GET {baseURL}/v1/usage` |
| 小米 MiMo Token Plan | `XIAOMI_TOKEN_PLAN_COOKIE`（Cookie） | `GET https://platform.xiaomimimo.com/api/v1/balance`、`/tokenPlan/detail`、`/tokenPlan/usage` |
| DeepSeek | `DEEPSEEK_API_KEY` | `GET https://api.deepseek.com/user/balance` |

### OpenCode Go 复用现有配置

如果你已经装了 `dsh-opencode-go-plus`，本插件会尝试读取它的 `baseURL` 和 `apiKeyEnv`，所以本地代理
（例如 `http://127.0.0.1:8788`）不需要在这里再写一遍。显式写在 `plans` 里的值优先。

### 自定义/追加 plan

在 profile 的 `cordis.patch.yml` 里给本插件加 `config`（字段都是可选的）：

```yaml
- id: dsh-token-plan-usage
  name: dsh-token-plan-usage
  config:
    refreshSeconds: 180
    timeoutMs: 15000
    includeDefaults: true
    plans:
      - id: opencode-go
        kind: opencode-go
        label: OpenCode Go
        credentialRef: OPENCODE_GO_API_KEY
        baseURL: https://opencode.ai/zen/go
        consoleUrl: https://opencode.ai/console/
      - id: xiaomi-mimo
        kind: xiaomi-console
        label: Xiaomi MiMo
        credentialRef: XIAOMI_TOKEN_PLAN_COOKIE
        baseURL: https://platform.xiaomimimo.com/api/v1
        consoleUrl: https://platform.xiaomimimo.com/#/console/plan-manage
      - id: deepseek
        kind: deepseek-balance
        label: DeepSeek
        credentialRef: DEEPSEEK_API_KEY
        baseURL: https://api.deepseek.com
        consoleUrl: https://platform.deepseek.com/usage
```

- `kind`：`opencode-go` / `deepseek-balance` / `xiaomi-console`。
- `credentialRef`：大写 POSIX 变量名，对应 DSH 的 credentials 引用。
- `baseURL`：必须 `https://`；只有 loopback（`127.0.0.1` / `localhost` / `::1`）允许明文 `http://`，方便本地 relay。
- `includeDefaults: false` 时只探测显式 `plans`；`enabled: false` 可单独停用某个 plan。

### 小米 MiMo 的 Cookie

小米 Token Plan 的**用量只存在于控制台**，API Key（`tp-…` / `ttp-…`）本身没有用量接口。需要：

1. 浏览器登录 <https://platform.xiaomimimo.com/#/console/balance>；
2. 从 DevTools → Network 里复制任意请求的 `Cookie:` 头；
3. 打开本插件卡片 → 小米区块的「设置 Cookie」→ 粘贴 → 保存。

宿主会先实际探测一次，**校验通过才写入** DSH credentials（ref：`XIAOMI_TOKEN_PLAN_COOKIE`），
无效或过期的 Cookie 不会落盘。也可以手动把 `XIAOMI_TOKEN_PLAN_COOKIE` 写进凭据后重启/刷新。

---

## 安全

- API Key / Cookie 只在宿主进程里使用；浏览器只收到百分比、金额、重置时间和脱敏错误。
- 上游只允许 HTTPS；本地 relay 的明文 HTTP 仅限 loopback；拒绝 URL 内嵌凭据、拒绝跟随重定向（小米控制台 3xx 视为登录失效）。
- Cookie 保存接口只接受 POST + `application/json` + 同源 `Origin`，body 上限 8KB，保存前先探测。
- 不写 session 日志、不做本地 token 记账；用量是缓存读数（宿主 TTL 30 秒 + 单飞）。
- 面板里的 `status` 只按原始字符串保留；某窗口触顶/套餐过期只影响该行，不影响其它 plan。

---

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 卡片显示「没有可显示的 token plan」 | 没配到任何凭据，或 `includeDefaults: false` 且 `plans` 为空 | 配置凭据，或在 `plans` 里显式添加 |
| OpenCode 显示「未配置凭据」 | `OPENCODE_GO_API_KEY` 不存在 | 在 DSH 凭据里配置；或改 `credentialRef` |
| OpenCode 显示「凭据无效」 | 网关 401/403 | 去 Console 重新复制 Key；确认订阅有效 |
| 小米显示「需要控制台 Cookie」 | 只有 `XIAOMI_TOKEN_PLAN_CN_API_KEY` | 按上文在卡片里设置 Cookie |
| 小米显示「Cookie 格式不识别」 | 缺 `api-platform_serviceToken` 或 `userId` | 重新复制完整 Cookie 头 |
| 全部显示「网络错误 / 请求超时」 | 本机到上游不可达 | 检查网络/代理；OpenCode 可把 `baseURL` 指到本地 relay |
| 数字长时间不动 | 页面隐藏时轮询暂停，或上游失败 | 切回前台、点刷新；卡片会标「上次读数」 |
| 小米显示「部分数据不可用」 | 余额成功，但 detail/usage 端点失败 | 稍后刷新；余额仍会显示 |

---

## 与 dsh-opencode-go-plus 的关系

- 两者可以同时安装：`dsh-opencode-go-plus` 负责模型适配器与模型选择；本插件只读用量。
- 本插件**不修改** `dsh-opencode-go-plus` 的配置文件、不卸载它、不写它的 settings namespace，只读取它的 `baseURL`/`apiKeyEnv` 作为默认值。
- 如果你的 `dsh-opencode-go-plus` 版本里 already 有用量环，本插件与它不是替代关系：它的环绑定在账号菜单/侧栏 DOM 注入上；本插件走官方 `shell.overlay` slot，把按钮浮在账号行右侧、卡片浮层显示，不做 DOM 注入。

---

## 兼容性

- 基线：DSH **0.2.1-rc.5**（桌面版），Node ≥ 22.19.0。
- `engines.dsh`: `>=0.2.1-rc.2 <0.3.0-0`；依赖官方 slot `shell.overlay` 与对账号行的几何测量。
- 不依赖任何 `@deepseek-ai/*` npm 包，不引入 pi-ai。
- 客户端通过 DSH 的 module-loader 加载；无 React 运行时复制、无 DOM 注入、无 `<style>` 注入。

---

## 开发

```bash
node --check lib/*.js
node --test
```

测试覆盖：三个上游的解析与探针、缓存 TTL/单飞/last-good、配置校验、用量路由、Cookie 保存路由、
客户端格式化与渲染（module-loader shim）、打包元数据。当前不依赖网络，全部使用注入的 fake fetch。

目录：

```text
lib/index.js    Host：apply、路由、plan 装配
lib/config.js   默认 plan、校验、自动发现
lib/usage.js    通用请求、脱敏、缓存
lib/plans.js    三个 provider 的解析与探针
lib/client.js   侧栏圆环 + 浮层卡片
```

---

## 许可与署名

MIT。用量环/卡片样式与 `usage.js` 的探针/缓存思路来自 MIT 的
[yumusb/dsh-opencode-go-plus](https://github.com/yumusb/dsh-opencode-go-plus) 与
[kongyuna/kongyuna-opencode-go-plus](https://github.com/kongyuna/kongyuna-opencode-go-plus)；
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。不包含上游的模型适配器、模型目录、响应修复层。
