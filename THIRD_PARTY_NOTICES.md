# Third-party notices

`dsh-token-plan-usage` is an independent plugin. Its visual language (two-half
ring, three-column usage rows, inline theme-token styling, reset-time
formatting) and its usage probe/cache approach are derived from the usage
panel added to `dsh-opencode-go-plus` by kongyuna:

- <https://github.com/yumusb/dsh-opencode-go-plus> — upstream, MIT,
  copyright (c) 2026 dsh-opencode-go-plus contributors.
- <https://github.com/kongyuna/kongyuna-opencode-go-plus> — personal fork with
  the usage ring/panel, MIT.

Both are distributed under the MIT License. The full MIT text is reproduced in
this repository's `LICENSE`; the upstream copyright notice above is retained
here.

No OpenCode, Xiaomi, MiMo, or DeepSeek logo is bundled. Brand names appear only
to identify the services whose usage this plugin reads.

The implementation in this repository is otherwise original: it registers the
official `sidebar.footer.action` / `shell.overlay` slots, supports multiple
plans, and does not contain the upstream LLM adapter, model catalog, response
repair layer, or account-menu DOM injection.
