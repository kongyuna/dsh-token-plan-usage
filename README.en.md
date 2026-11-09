# Token Plan Usage for DSH

**Know how much of your AI plans is left without leaving DSH.**

Glance at the sidebar ring; expand to see each service's balance, quota and reset time. **Every plan in one place, ring metrics freely combined** — no more console hopping.

| Service | What you can see |
|---|---|
| **OpenCode Go** | **Remaining** 5-hour, weekly and monthly quota, plus reset times |
| **DeepSeek** | The signed-in account's **wallet balance**; when unavailable it falls back to the API-key balance endpoint (not token usage quota) |
| **Xiaomi MiMo** | Token Plan usage and account balance (console Cookie required) |

**Works out of the box**: only providers already registered in DSH models are shown; pick plans and ring halves under **Settings → Plugins → Token Plan Usage**, with a live preview. No config files.

**Install**: run `plugin_manager install_bundle target=/absolute/path/to/dsh-token-plan-usage` in DSH (replace the path with this repository's local directory).

**Data & safety**: percentages and ring arc lengths mean **remaining**, not used. Credentials are stored and used by the DSH host; except while you paste a Cookie, stored credentials are never returned to the browser. The plugin sends no model chat requests.

[Install, configuration and troubleshooting](docs/GUIDE.md) · [Data semantics and limits](docs/quotas.md) · [中文](README.md) · MIT License

Credentials: `OPENCODE_GO_API_KEY`, `DEEPSEEK_API_KEY` (optional when signed in), `XIAOMI_TOKEN_PLAN_COOKIE` (Xiaomi usage).
