# Token Plan Usage for DSH

**不用离开 DSH，就能知道 AI 套餐还剩多少。**

在侧栏用圆环快速查看余量，点击展开各服务的余额、额度和重置时间。**多套餐集中查看，圆环指标自由组合**，不再反复切换控制台。

| 支持服务 | 可查看内容 |
|---|---|
| **OpenCode Go** | 5 小时、每周、每月的**剩余额度**及重置时间 |
| **DeepSeek** | 已登录账号的**钱包余额**；不可用时尝试 API Key 余额接口（不是 Token 使用配额） |
| **Xiaomi MiMo** | Token Plan 用量和账户余额（需控制台 Cookie） |

**开箱即用**：仅展示 DSH 模型中已注册的对应 Provider；在 **设置 → 插件 → Token Plan Usage** 里勾选套餐、选择圆环上下指标，可查看预览，无需手写配置文件。

**安装**：在 DSH 中运行 `plugin_manager install_bundle target=/absolute/path/to/dsh-token-plan-usage`（将路径替换为本仓库的本地目录）。

**数据与安全**：百分比和圆环弧长均代表**剩余**，不是已用；凭据由 DSH 宿主保存和使用；除主动粘贴 Cookie 的设置过程外，不向浏览器返回已存凭据。插件不发送模型聊天请求。

[详细安装、配置和排错](docs/GUIDE.md) · [数据口径与限制](docs/quotas.md) · [English](README.en.md) · MIT License

所需凭据：`OPENCODE_GO_API_KEY`、`DEEPSEEK_API_KEY`（已登录账号时可省略）、`XIAOMI_TOKEN_PLAN_COOKIE`（小米用量）。
