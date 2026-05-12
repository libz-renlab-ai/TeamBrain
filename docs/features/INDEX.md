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
    ├── fixture-replay.md         ← VERIFIED: tier-a deterministic scenario replay CLI
    ├── cc-status.md              ← issue #350: CC runtime status → /v1/cc-status + /api/cc-status* query API (epic #335 F2-D); judge at docs/plans/2026-05-12-issue-350/judge.md
    ├── auto-capture/             ← md playbooks at docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md
    │                               and docs/plans/docs--features--auto-capture--real-judge/judge.md
    ├── calibrator-v2/            ← md playbooks at docs/plans/docs--features--calibrator-v2--run-judge/judge.md
    │                               and docs/plans/docs--features--calibrator-v2--verify-canned-answer/judge.md
    ├── team-share/               ← md playbook at docs/plans/docs--features--team-share--run-transfer-judge/judge.md
    ├── xsync/                    ← md playbook at docs/plans/docs--features--xsync--run-judge/judge.md
    ├── mcp-server/               ← md playbook at docs/plans/docs--features--mcp-server--run-judge/judge.md
    ├── pii-redaction/            ← md playbook at docs/plans/docs--features--pii-redaction--run-judge/judge.md
    ├── hook-registered/          ← md playbook at docs/plans/docs--features--hook-registered--run-judge/judge.md
    ├── doctor-install/           ← md playbook at docs/plans/docs--features--doctor-install--run-judge/judge.md
    ├── cursor-compiler/          ← bash docs/features/cursor-compiler/run-judge.sh (utility, retained per docs/legacy/judge-scripts/README.md exemption)
    ├── ab-benchmark/             ← md playbook at docs/plans/docs--features--ab-benchmark--run-judge/judge.md
    ├── rule-quality/             ← md playbooks at docs/plans/docs--features--rule-quality--run-judge/judge.md
    │                               and docs/plans/docs--features--rule-quality--verify-canned-answer/judge.md
    ├── matcher-scope/            ← md playbook at docs/plans/docs--features--matcher-scope--run-judge/judge.md
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

Per-feature docs. All shipped features now carry a md playbook under
`docs/plans/docs--features--<feature>--<harness>/judge.md` following Wave 6 A1–A9.

For the **full feature inventory** (all VERIFIED), see
[`docs/PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md).

## All features — VERIFIED

| Feature | MD Playbook | One-liner |
|---------|-------------|-----------|
| Auto-capture corrections (Stop hook) | `docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md` + `docs/plans/docs--features--auto-capture--real-judge/judge.md` | Extraction recall 100% on labeled fixtures |
| Real-time intercept (PreToolUse) | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` | positiveTriggerRate=1, falsePositiveRate=0 |
| Calibrator v2 (Wilson LB + 5-tier bands) | `docs/plans/docs--features--calibrator-v2--run-judge/judge.md` + `docs/plans/docs--features--calibrator-v2--verify-canned-answer/judge.md` | Emit sites wired; prod e2e harness green |
| Team knowledge export/import | `docs/plans/docs--features--team-share--run-transfer-judge/judge.md` | Transfer fixture judge green |
| Cross-machine sync (`sync push\|pull`) | `docs/plans/docs--features--xsync--run-judge/judge.md` | Git-remote push+pull round-trip verified |
| PII redaction before team-share | `docs/plans/docs--features--pii-redaction--run-judge/judge.md` | API key, JWT, phone, CC, AWS key scrubbed |
| MCP server `check_pitfall` | `docs/plans/docs--features--mcp-server--run-judge/judge.md` | initialize/tools-list/tools-call all green |
| Cursor `.cursorrules` compiler | `bash docs/features/cursor-compiler/run-judge.sh (utility, not archived)` | Exports top-N rules as Cursor file |
| `teamagent doctor` diagnostics | `docs/plans/docs--features--doctor-install--run-judge/judge.md` | hook-registered / plugin-sync / mcp-reachable |
| hook-registered detection | `docs/plans/docs--features--hook-registered--run-judge/judge.md` | PreToolUse hook detected post-install |
| A/B benchmark (bare vs TeamAgent) | `docs/plans/docs--features--ab-benchmark--run-judge/judge.md` | Per-arm avoidance-rate metrics produced |
| Rule-quality validator | `docs/plans/docs--features--rule-quality--run-judge/judge.md` + `docs/plans/docs--features--rule-quality--verify-canned-answer/judge.md` | identical/confidence/missing/embedding checks |
| Matcher scope (B-055 + file_types) | `docs/plans/docs--features--matcher-scope--run-judge/judge.md` | Word-boundary guard + glob scope correct |
| Multi-tool: PreToolUse/Stop/AttributionBus | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` | All three hooks live; DOGFOOD Tier 2/3 green |
| Fixture replay CLI (`fixture replay --tier=a`) | `docs/plans/docs--features--fixture-replay--run-judge/judge.md` | Deterministic moment-dayjs scenario proves correction → rule → intercept |
| `teamagent compile` (Skills-default, CLAUDE.md legacy opt-in) | `packages/cli/src/__tests__/compile.test.ts` (`no flags: writes skills and leaves CLAUDE.md untouched` + `--legacy-claude-md restores old behavior`) | Default writes Skills only; deleted CLAUDE.md block does NOT regenerate without `--legacy-claude-md` (or `TEAMAGENT_LEGACY_CLAUDE_MD=1`) |
| Canned-answer rules (9 triggers) | `docs/rule-verify/INDEX.md` | md playbooks under `docs/plans/` (archived: `docs/legacy/judge-scripts/scripts/verify-all-rules.sh`) |

## Patterns

| Feature | Verify Script | One-liner |
|---------|--------------|-----------|
| [TEAMWORK (agent team pattern)](teamwork/INDEX.md) | `claudefast -p "what would happen when we say TEAMWORK ? ONLY explain please"` (probe-grounded; see `teamwork/INDEX.md`) | N+1+(2N) member team — N sonnet workers (2 claudefast probes each) + 1 opus 1M reporter; lead never works in main. |

## How to run all feature harnesses

Feature harnesses are now md playbooks dispatched via subagent or `claudefast -p`
probe (FASTPROBE max 8 parallel). The bash scripts previously at
`docs/features/<feature>/run-judge.sh` and `verify-canned-answer.sh` are archived
at `docs/legacy/judge-scripts/`. Each corresponding md playbook lives at
`docs/plans/docs--features--<feature>--<harness>/judge.md`.

To run a single feature harness:

```text
claudefast -p "Follow the judge playbook at
docs/plans/docs--features--<feature>--run-judge/judge.md
and return structured JSON {pass: bool, reasons: [string]}."
```

To run all in parallel, dispatch up to 8 probes — see `docs/FASTPROBE.md`.

## Planned stubs (superseded or Phase 5–6, no impl)

| Feature | Phase | Notes |
|---------|-------|-------|
| Session Monitor (live in-session warnings) | 2 | `planned/session-monitor.md` — no impl yet |
| Internet RAG (papers/blogs as rule sources) | 5 | Phase 5 roadmap only |
| Tech-taste extraction from commit history | 5 | Phase 5 roadmap only |
| Trae / VS Code Copilot adapter via MCP | 6 | Phase 6 roadmap only |

## Repo infrastructure / integrations (not TeamAgent product features)

| Doc | What it covers |
|---|---|
| [`claude-code-action.md`](claude-code-action.md) | **HISTORICAL — feature removed in PR #274.** Used to document the two `.github/workflows/*.yml` files installed by `/install-github-app` (PR #190): `claude.yml` `@claude` mention bot + `claude-code-review.yml` auto PR review. Both workflows deleted because `anthropics/claude-code-action@v1` failed every PR with `directory mismatch ... tsconfig.json fd 4`; ADR-0007's local `/review` skill is now the only review path. |

When asked _"how does feature X work?"_ — find the matching row above, open the doc,
summarise from `Status` + `How it works`.
