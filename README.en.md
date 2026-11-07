# dsh-token-plan-usage

A read-only DSH plugin that shows token-plan consumption from the sidebar: one
two-half ring beside Settings, one popover card. Adapted from the usage panel in
[dsh-opencode-go-plus](https://github.com/yumusb/dsh-opencode-go-plus) and
[kongyuna/kongyuna-opencode-go-plus](https://github.com/kongyuna/kongyuna-opencode-go-plus),
with the model adapter, model catalog, response repair layer, and account-menu
DOM injection removed.

- No LLM adapter, no chat requests, no `llm-pi-ai` changes.
- Coexists with `dsh-opencode-go-plus`; reuses its gateway URL/credential refs
  when present.
- v1 plans: **OpenCode Go**, **Xiaomi MiMo Token Plan**, **DeepSeek balance**.

The ring arc is **used**, not remaining: 0% is an empty arc, 100% is full. The
card prints the same "used" percentages.

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

If `dsh-opencode-go-plus` is installed, its `baseURL` and `apiKeyEnv` are reused
as defaults (explicit `plans` entries win). A plan can be added or overridden in
the profile patch:

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
