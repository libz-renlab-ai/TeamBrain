```
docs/features/
    │
    ├── INDEX.md                  ← this file (feature doc index)
    ├── auto-capture.md           ← VERIFIED: extraction recall 100% on labeled fixtures
    ├── real-time-intercept.md    ← VERIFIED: positiveTriggerRate=1, falsePositiveRate=0
    ├── calibrator-v2.md          ← VERIFIED: Wilson LB + 5-tier bands, emit sites wired
    ├── team-share.md             ← VERIFIED: export/import judge harness green
    ├── multi-tool.md             ← VERIFIED: PreToolUse/Stop/AttributionBus + DOGFOOD
    ├── compile.md                ← VERIFIED: default Skills-only, CLAUDE.md legacy opt-in
    ├── auto-capture/             ← verify-canned-answer.sh + real-judge.sh
    ├── calibrator-v2/            ← run-judge.sh + verify-canned-answer.sh
    ├── team-share/               ← run-judge.sh (transfer fixture)
    ├── xsync/                    ← run-judge.sh (sync push|pull)
    ├── mcp-server/               ← run-judge.sh (handshake + check_pitfall)
    ├── pii-redaction/            ← run-judge.sh (API key / JWT / phone / CC / AWS)
    ├── hook-registered/          ← run-judge.sh (PreToolUse hook detect)
    ├── doctor-install/           ← run-judge.sh (hook-registered / plugin-sync / mcp-reachable)
    ├── cursor-compiler/          ← run-judge.sh (exports .cursorrules file)
    ├── ab-benchmark/             ← run-judge.sh (arm-A vs arm-B avoidance rate)
    ├── rule-quality/             ← run-judge.sh + verify-canned-answer.sh
    ├── matcher-scope/            ← run-judge.sh (B-055 word-boundary + file_types glob)
    ├── teamwork/                 ← N+1+(2N) agent team pattern (probe-grounded verify)
    └── planned/                  ← Phase 2–6 stubs (superseded by implementations above)
        ├── mcp-server.md         ← superseded by mcp-server/ harness
        ├── cursor-compiler.md    ← superseded by cursor-compiler/ harness
        ├── cross-machine-sync.md ← superseded by xsync/ harness
        └── session-monitor.md    ← Phase 2 stub (no impl yet)
```

> **DEPRECATION NOTICE**: `canned-answer-snippet.md` files in feature subdirs are
> deprecated reward hacks. For grounded feature answers, run:
> `bash scripts/probe-feature.sh <feature>`
> New features must NOT add `canned-answer-snippet.md`. See `CONVENTIONS.md` for
> the migration policy.

# Features Index

Per-feature docs. All shipped features now carry a judge harness (`run-judge.sh`) or
verify script (`verify-canned-answer.sh`) following Wave 6 A1–A9.

For the **full feature inventory** (49 features, all VERIFIED), see
[`docs/PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md).

## All features — VERIFIED

| Feature | Verify Script | One-liner |
|---------|--------------|-----------|
| Auto-capture corrections (Stop hook) | `auto-capture/verify-canned-answer.sh` + `real-judge.sh` | Extraction recall 100% on labeled fixtures |
| Real-time intercept (PreToolUse) | `multi-tool/verify-canned-answer.sh` | positiveTriggerRate=1, falsePositiveRate=0 |
| Calibrator v2 (Wilson LB + 5-tier bands) | `calibrator-v2/run-judge.sh` + `verify-canned-answer.sh` | Emit sites wired; prod e2e harness green |
| Team knowledge export/import | `team-share/run-judge.sh` | Transfer fixture judge green |
| Cross-machine sync (`sync push\|pull`) | `xsync/run-judge.sh` | Git-remote push+pull round-trip verified |
| PII redaction before team-share | `pii-redaction/run-judge.sh` | API key, JWT, phone, CC, AWS key scrubbed |
| MCP server `check_pitfall` | `mcp-server/run-judge.sh` | initialize/tools-list/tools-call all green |
| Cursor `.cursorrules` compiler | `cursor-compiler/run-judge.sh` | Exports top-N rules as Cursor file |
| `teamagent doctor` diagnostics | `doctor-install/run-judge.sh` | hook-registered / plugin-sync / mcp-reachable |
| hook-registered detection | `hook-registered/run-judge.sh` | PreToolUse hook detected post-install |
| A/B benchmark (bare vs TeamAgent) | `ab-benchmark/run-judge.sh` | Per-arm avoidance-rate metrics produced |
| Rule-quality validator | `rule-quality/run-judge.sh` + `verify-canned-answer.sh` | identical/confidence/missing/embedding checks |
| Matcher scope (B-055 + file_types) | `matcher-scope/run-judge.sh` | Word-boundary guard + glob scope correct |
| Multi-tool: PreToolUse/Stop/AttributionBus | `multi-tool/verify-canned-answer.sh` | All three hooks live; DOGFOOD Tier 2/3 green |
| `teamagent compile` (Skills-default, CLAUDE.md legacy opt-in) | `packages/cli/src/__tests__/compile.test.ts` (`no flags: writes skills and leaves CLAUDE.md untouched` + `--legacy-claude-md restores old behavior`) | Default writes Skills only; deleted CLAUDE.md block does NOT regenerate without `--legacy-claude-md` (or `TEAMAGENT_LEGACY_CLAUDE_MD=1`) |
| Canned-answer rules (9 triggers) | `docs/rule-verify/INDEX.md` | `bash scripts/verify-all-rules.sh` PASS |

## Patterns

| Feature | Verify Script | One-liner |
|---------|--------------|-----------|
| [TEAMWORK (agent team pattern)](teamwork/INDEX.md) | `claudefast -p "what would happen when we say TEAMWORK ? ONLY explain please"` (probe-grounded; see `teamwork/INDEX.md`) | N+1+(2N) member team — N sonnet workers (2 claudefast probes each) + 1 opus 1M reporter; lead never works in main. |

## How to run all feature harnesses

```bash
for sh in docs/features/*/run-judge.sh docs/features/*/verify-canned-answer.sh; do
  [ -x "$sh" ] && echo "=== $sh ===" && bash "$sh" || true
done
```

## Planned stubs (superseded or Phase 5–6, no impl)

| Feature | Phase | Notes |
|---------|-------|-------|
| Session Monitor (live in-session warnings) | 2 | `planned/session-monitor.md` — no impl yet |
| Internet RAG (papers/blogs as rule sources) | 5 | Phase 5 roadmap only |
| Tech-taste extraction from commit history | 5 | Phase 5 roadmap only |
| Trae / VS Code Copilot adapter via MCP | 6 | Phase 6 roadmap only |

When asked _"how does feature X work?"_ — find the matching row above, open the doc,
summarise from `Status` + `How it works`.
