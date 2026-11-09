# dsh-token-plan-usage

A read-only DSH plugin that shows token-plan consumption from the sidebar:
one two-half ring at the right edge of the account row, one popover card.
It is independent of `dsh-opencode-go-plus`; the visual/cache approach was
adapted from the MIT-licensed usage panel in
[dsh-opencode-go-plus](https://github.com/yumusb/dsh-opencode-go-plus) and
[kongyuna/kongyuna-opencode-go-plus](https://github.com/kongyuna/kongyuna-opencode-go-plus),
with the model adapter, model catalog, response repair layer, and account-menu
DOM injection removed.

- No LLM adapter, no chat requests, no `llm-pi-ai` changes.
- Fully independent of `dsh-opencode-go-plus`: it neither reads nor writes that
  plugin's config/settings, and does not need it installed.
- v1 plans: **OpenCode Go**, **Xiaomi MiMo Token Plan**, **DeepSeek balance**,
  shown only when the matching DSH model provider is registered.

The ring arc is **remaining**: 0% is an empty arc (exhausted), 100% is full
(headroom). The card prints the same "N% left" percentages.

## Install

```text
plugin_manager install_bundle target=/absolute/path/to/dsh-token-plan-usage
```

or, for non-desktop profiles:

```bash
dsh plugin --profile web add "/absolute/path/to/dsh-token-plan-usage"
```

The plugin has no build step, dependencies, or install scripts. `engines.dsh`
targets the current `0.2.1-rc.*` line.

## Configure

With no config, plans are discovered from the credential refs you already store:

| Plan | Credential ref | Source |
|---|---|---|
| OpenCode Go | `OPENCODE_GO_API_KEY` | `GET {baseURL}/v1/usage` |
| Xiaomi MiMo | `XIAOMI_TOKEN_PLAN_COOKIE` | `platform.xiaomimimo.com/api/v1/{balance,tokenPlan/detail,tokenPlan/usage}` |
| DeepSeek | `DEEPSEEK_API_KEY` | `GET https://api.deepseek.com/user/balance` |

**Only plans whose provider is registered in DSH models are shown.** The plugin
reads `ctx.llm.listProviders()`; it does not infer plans from credentials. For
example, the current DSH has no Xiaomi provider (`xiaomi-token-plan-*`), so the
Xiaomi block is hidden even if `XIAOMI_TOKEN_PLAN_CN_API_KEY` exists. If a
provider is registered but its credential is missing, the plan appears as
"No credential configured". To show Xiaomi, enable its provider under
Settings → Models first, then set the console cookie.

`OPENCODE_GO_API_KEY` is only a DSH credential-reference name; rename it with
`credentialRef` if you want full separation from any other OpenCode plugin.

### Display settings on the plugin detail page

Open Settings → Plugins → `Token Plan Usage`. The bundle page lets you:

- check any number of plans to show in the card; options come only from services
  registered in DSH models;
- per plan, pick and order 1–3 metrics. For OpenCode Go you can show only 5-hour,
  only weekly, or 5-hour + monthly / monthly + 5-hour;
- configure the sidebar ring **separately**: pick a metric for the top half and
  one for the bottom half (they may come from different plans); choose "Not shown"
  for the lower half to display a single metric. Balance metrics show a currency
  glyph in the ring center.
- card and ring are independent; the ring may use a metric from a plan that is
  not shown in the card (the host probes it automatically). The whole form is
  checkboxes, buttons and dropdowns — no YAML/JSON or API names to type. Save without touching the profile; the preference is stored in
  `~/.dsh/dsh-token-plan-usage.json` (non-secret, no restart).

The plugin does not read other plugins' settings. OpenCode Go's gateway URL and
credential ref come from this plugin's own `plans`; for a local relay, set
`baseURL` explicitly. A plan can be added or overridden in the profile patch:

```yaml
- id: dsh-token-plan-usage
  config:
    plans:
      - id: deepseek
        kind: deepseek-balance
        credentialRef: DEEPSEEK_API_KEY
        baseURL: https://api.deepseek.com
```

Xiaomi's usage lives only in its console, so an API key (`tp-...`) is not
enough. Copy the `Cookie:` header from
`platform.xiaomimimo.com/#/console/balance`, then use **Set cookie** in the
Xiaomi section of the card. The host probes the cookie before storing it under
the `XIAOMI_TOKEN_PLAN_COOKIE` credential ref; invalid cookies are never saved.

## Security

Keys and cookies stay host-side. The browser receives only percentages,
amounts, reset instants, and redacted errors. Upstreams must be HTTPS (plain
HTTP only for loopback relays); redirects are refused, and the MiMo console's
3xx is treated as an expired login. The cookie route requires POST +
`application/json` + same-origin `Origin`, with an 8 KiB body cap.

## Test

```bash
node --check lib/*.js
node --test
```

All tests use an injected fake `fetch`; no network is required.

## License

MIT. Usage-ring/panel styling and the probe/cache approach are adapted from the
MIT-licensed upstream forks above; see `THIRD_PARTY_NOTICES.md`. No model
adapter, catalog, or response-repair code is included.
