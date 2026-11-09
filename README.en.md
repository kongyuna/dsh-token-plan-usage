# dsh-token-plan-usage

Read-only token-plan usage: a sidebar ring plus a popover card. Plan options come
from services already registered in DSH models; no manual plan setup.

- Plans: **OpenCode Go**, **DeepSeek balance**, **Xiaomi Token Plan** (shown only
  when the matching provider is registered in DSH models).
- Values are **remaining**; ring arc length = remaining (0% exhausted, 100% fresh).
- Configure it on **Settings → Plugins → Token Plan Usage** with checkboxes and
  dropdowns; no file editing required.
- Credentials: `OPENCODE_GO_API_KEY` / `DEEPSEEK_API_KEY` / `XIAOMI_TOKEN_PLAN_COOKIE`
  (Xiaomi usage needs the console Cookie).
- Install: `plugin_manager install_bundle target=<path-to-this-directory>`.
- Full guide: `docs/GUIDE.md` in the repository. MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
