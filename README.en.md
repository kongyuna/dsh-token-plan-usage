# dsh-token-plan-usage

Read-only token-plan usage: a sidebar ring plus a popover card. Plan options come
from services already registered in DSH models; no manual plan setup.

- Plans: **OpenCode Go**, **DeepSeek balance**, **Xiaomi Token Plan** (shown only
  when the matching provider is registered in DSH models).
- DeepSeek balance source order: the signed-in DSH DeepSeek account wallet
  (`deepseekAccount.getBalance`, no API key needed) first; when the account is
  signed out, unreadable or unavailable, fall back to `DEEPSEEK_API_KEY` and
  `GET /user/balance`. The API-key side only exposes balance amounts — the
  official API has no usage/quota endpoint.
- Values are **remaining**; ring arc length = remaining (0% exhausted, 100% fresh).
  Balance metrics accept an optional full amount for a ratio arc.
- Configure it on **Settings → Plugins → Token Plan Usage** with checkboxes and
  dropdowns; no file editing required.
- Credentials: `OPENCODE_GO_API_KEY` / `DEEPSEEK_API_KEY` (optional when signed in
  to DeepSeek) / `XIAOMI_TOKEN_PLAN_COOKIE` (Xiaomi usage needs the console Cookie).
- Install: `plugin_manager install_bundle target=<path-to-this-directory>`; for a
  local build, `npm pack` and install `target=file:<absolute path to the tgz>`.
- Full guide: `docs/GUIDE.md`; data contracts: `docs/quotas.md`. MIT; see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
