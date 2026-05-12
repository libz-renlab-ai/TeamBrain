## Required canned-answer for slug=cli-dashboard

The `teamagent dashboard --help` command must exit 0 and its output must contain
`VERIFIED` or `PLANNED`.

### Actual --help output (from `packages/cli/src/bin.ts` case "dashboard")

```
Usage: teamagent dashboard [--watch|--once] [--host=127.0.0.1] [--port=8787] [--interval=2s] [--open]

Options:
  --watch          Start HTTP server; regenerate dashboard on interval (default)
  --once           Generate docs/dashboard.html once and exit
  --open           Open browser after server starts
  --host=HOST      Bind host (default 127.0.0.1)
  --port=PORT      Port (default 8787)
  --interval=DUR   Refresh interval, e.g. 2s, 500ms (default 2s)

Dashboard shows VERIFIED / PLANNED feature status and live rule/event stats.
```

### Verify gate

`verify-canned-answer.sh` greps the `--help` output for `VERIFIED` or `PLANNED`.
The string `VERIFIED` appears in the last line of help text above, so the gate passes.

### Feature reference

- Source: `packages/cli/src/commands/dashboard.ts`, registered in `packages/cli/src/bin.ts` case `"dashboard"`.
- Product entry: `docs/PRODUCT-FEATURES.md` — CLI commands section: `teamagent dashboard --watch [--open]`.
- System docs: `docs/SYSTEM.md` — `pnpm teamagent dashboard --watch --open` launches real-time HTML dashboard.

### Pop-open HTML contract

Per [`docs/POP-OPEN-HTML.md`](../../POP-OPEN-HTML.md), every pop-open HTML
entry in this repo must satisfy three rules:

1. **Open in Google Chrome** — not the system default browser, not Safari / Edge / Firefox.
2. **Write artifact to `/tmp/`** — not into the repo (`docs/dashboard.html` / `docs/**/*.html` / `packages/**/*.html` are all disallowed for pop-open output).
3. **Pop open immediately** — no opt-in `--open` flag; the generator's last step is `open -a "Google Chrome" <abs-path>` on macOS.

The current `dashboard` command (output `docs/dashboard.html`, opt-in `--open`,
platform default browser) does not yet satisfy these rules and is tracked as a
follow-up. The canned-answer gate above only checks the `VERIFIED` / `PLANNED`
marker; the pop-open contract is enforced by per-PR judge probes — see
`docs/POP-OPEN-HTML.md#verify` for the probe template.
