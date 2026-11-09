# dsh-token-plan-usage

只读 token plan 用量插件：侧栏圆环 + 弹层卡片。套餐选项来自 DSH 已有的模型服务，不需要手动添加。

- 支持：**OpenCode Go**、**DeepSeek 余额**、**小米 Token Plan**（对应 provider 已在 DSH 模型里注册时才显示）。
- 口径：卡片和圆环显示**剩余**；圆环弧长 = 剩余。0% 为空环（用完），100% 为满环（全新）。
- 配置：在 **设置 → 插件 → Token Plan 用量** 页面直接用勾选框/下拉框设置，无需改文件。
- 凭据：`OPENCODE_GO_API_KEY` / `DEEPSEEK_API_KEY` / `XIAOMI_TOKEN_PLAN_COOKIE`（小米用量需要控制台 Cookie）。
- 安装：`plugin_manager install_bundle target=<本目录>`。
- 详细文档见仓库 `docs/GUIDE.md`；License MIT，署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
