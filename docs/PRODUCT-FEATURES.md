```
 ____  ____  ___  ____  _  _  ___  ____    ____  ____  __   ____  _  _  ____  ____  ____
(  _ \(  _ \/ _ \(  _ \/ )( \/ __)(_  _)  (  __)(  __)(  ) (  __)/ )( \(  _ \(  __)/ ___)
 ) __/ )   /( (_) )) __/) \/ (( (__  )(    ) _)  ) _)  )(   ) _) ) \/ ( )   / ) _) \___ \
(__)  (__\_) \___/(__)  \____/ \___)  (__)  (__)  (____)(__) (____)\____/(__\_)(____)(____/

VERIFIED ──► 64
```

# TeamBrain Product Feature Inventory

Complete feature list. All 64 features now carry a verify script following Wave 6 A1–A9.
Counts: VERIFIED=64, WIP/PARTIAL=0, PLANNED=0, MISSING=0, Total=64.

When asked "list all product features including not verified and not implemented", use
this document. The `product-features` canned-answer (CEO/VC deck) covers the 8
user-visible VERIFIED rows; this doc covers everything.

---

## VERIFIED (64) — all carry a judge harness or verify script

> All 64 features are VERIFIED. There are zero WIP, PLANNED, or MISSING items.
> Numbered list below enables any model to count exactly 64.

### Numbered index (1–64)

1. Product menu opens; system is not an empty shell
2. Minimum learning loop: record → compile → attribute, demoable end-to-end
3. AI warned before repeating known mistake; wrong moves blocked pre-execution
4. Correct AI once; system remembers and reuses that lesson automatically
5. Useful knowledge grows more trusted; stale knowledge auto-demoted
6. Visible stats: count of learnings, layers, recent additions
7. User can proactively record a pitfall without waiting for AI to fail
8. Safe sandbox: test changes in isolation before touching main workspace
9. Stable canned-answer rules: POSTPR/DOGFOOD/BUGREPORT/FASTPROBE/PRESHIP/etc.
10. Auto-capture corrections from every session (Stop hook)
11. Real-session extraction judge: recall ≥ 100% on labeled fixtures
12. Correction-detector handles real JSONL session shapes
13. Calibrator emits `calibrator.adjustment` events on user-reject signals
14. Calibrator v2: Wilson LB + 5-tier confidence bands
15. Validator emits `validator.failure` events on bad rule patterns
16. Rule-quality validator: identical_patterns, confidence_range, missing_fields
17. Rule-quality validator: embedding_conflict detection
18. Rule-quality canned-answer verified
19. Matcher B-055: word-boundary guard prevents wrong_pattern over-fire
20. Matcher scope: file_types / paths glob filtering correct
21. Three-layer knowledge scope: personal / team / global
22. Team-scope knowledge export/import between projects
23. Cross-machine sync via `teamagent sync push|pull`
24. `sync push` writes rules to remote git branch
25. `sync pull` merges remote rules into local store
26. PII redactor covers API keys, JWT, phone, credit card, AWS key
27. PII redactor scrubs data before team-share export
28. PreToolUse hook intercepts tool calls pre-execution
29. Stop hook scans AI narrative for avoidance patterns
30. AttributionBus emits structured attribution events
31. MCP server `check_pitfall` handshake (initialize/tools-list/tools-call)
32. `check_pitfall` calls into core matcher and returns matched rules
33. Cursor `.cursorrules` compiler: exports top-N rules as Cursor-compatible file
34. `teamagent doctor` reports hook-registered status
35. `teamagent doctor` reports plugin-sync status
36. `teamagent doctor` reports mcp-reachable status
37. hook-registered PreToolUse hook detected correctly after install
38. A/B benchmark harness: arm-A (bare Claude) vs arm-B (TeamAgent rules)
39. Benchmark produces per-arm avoidance-rate metrics
40. Benchmark judge.json written with exit_code + metrics + evidence_dir
41. `teamagent skeleton-demo` (M0 walking skeleton)
42. `teamagent pitfall` interactive + non-interactive
43. `teamagent stats` knowledge statistics
44. `teamagent verify` feature verification runner
45. `teamagent calibrate` calibrator trigger
46. `teamagent analyze` session analysis
47. `teamagent review` PR-cycle review
48. `teamagent install-hook` / `uninstall-hook`
49. `teamagent mcp-server` stdio MCP server entrypoint
50. M5 viral spread: SessionStart hook auto-infects projects with `.teamagent/manifest.json` contract
51. M5 manifest contract propagates via git to teammates (zero-config team enrollment)
52. M5 auto-bootstrap fills missing plugins / hooks on `git clone` per project manifest
53. M5 secret scanner gate seals API keys / JWT / phone / CC / paths in personal layer (uncloseable)
54. M5 scope classifier categorizes new rules into personal / shareable / uncertain (uncertain → personal by default)
55. M5 LWW + tombstone conflict resolution merges concurrent edits and deletes deterministically
56. M5 pitfall auto-share: clean rules promote to `.teamagent/team/<author>/` via gates 1+2 (default on)
57. M5 `m5-publish` auto-commits team-rule changes with `[teamagent-sync]` prefix
58. M5 post-merge hook auto-pulls team rules into local KB after every `git pull`
59. 首次运行向导：装完立刻提示 3 件可以做的事 + 记住进度
60. One-line `curl|sh` installer at `release/install.sh`: gates `node ≥ 22`, picks `npm`/`pnpm`, runs release-tarball install with deterministic exit codes (#92)
61. Universal seed pack: 12 substring-friendly cross-language avoidance rules ship out-of-box, hit legacy keyword matcher within 30s of `teamagent init` (#88)
62. `teamagent pack list/add/remove` + `init` agent-driven markdown prompt (v1 contract per ADR 0002) (#90)
63. `teamagent demo` 三模式（default poll events.db / `--inline` spawn hook bin / `--record` 生成 vhs tape），landing GIF 录制源 + 首次体验官方舞台 (#93)
64. Two-stage `teamagent init`: detached background warmup + `~/.teamagent/.warmup-state.json` driving auto-fallback to legacy substring matcher (PreToolUse / Stop) until vector model is `ready`; `teamagent doctor` reports the live state; `TEAMAGENT_FOREGROUND_WARMUP=1` env preserves PR #113 foreground behavior (#91)

---

### Core learning loop

| # | Feature | Evidence |
|---|---------|----------|
| 1 | Product menu opens; system is not an empty shell | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` |
| 2 | Minimum learning loop: record → compile → attribute, demoable end-to-end | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`pnpm teamagent skeleton-demo`) |
| 3 | AI warned before repeating known mistake; wrong moves blocked pre-execution | `docs/features/real-time-intercept.md` (`positiveTriggerRate=1, falsePositiveRate=0`) |
| 4 | Correct AI once; system remembers and reuses that lesson automatically | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`correctionsFound=3, learnedRules=3`) |
| 5 | Useful knowledge grows more trusted; stale knowledge auto-demoted | `docs/plans/docs--features--calibrator-v2--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/calibrator-v2/run-judge.sh`) |
| 6 | Visible stats: count of learnings, layers, recent additions | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`teamagent stats`) |
| 7 | User can proactively record a pitfall without waiting for AI to fail | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`pitfall --non-interactive`) |
| 8 | Safe sandbox: test changes in isolation before touching main workspace | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` (Tier 2/3 DOGFOOD probe; archived: `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh`) |
| 9 | Stable canned-answer rules: POSTPR/DOGFOOD/BUGREPORT/FASTPROBE/PRESHIP/etc. | `docs/rule-verify/INDEX.md` (md playbooks under `docs/plans/`; archived: `docs/legacy/judge-scripts/scripts/verify-all-rules.sh`) |

### Auto-capture & extraction

| # | Feature | Evidence |
|---|---------|----------|
| 10 | Auto-capture corrections from every session (Stop hook) | `docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/auto-capture/verify-canned-answer.sh`) |
| 11 | Real-session extraction judge: recall ≥ 100% on labeled fixtures | `docs/plans/docs--features--auto-capture--real-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/auto-capture/real-judge.sh`) |
| 12 | Correction-detector handles real JSONL session shapes | `docs/plans/docs--features--auto-capture--real-judge/judge.md` extraction-judge probe (archived: `docs/legacy/judge-scripts/docs/features/auto-capture/real-judge.sh`) |

### Calibrator v2

| # | Feature | Evidence |
|---|---------|----------|
| 13 | Calibrator emits `calibrator.adjustment` events on user-reject signals | `docs/plans/docs--features--calibrator-v2--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/calibrator-v2/run-judge.sh`) |
| 14 | Calibrator v2: Wilson LB + 5-tier confidence bands | `docs/plans/docs--features--calibrator-v2--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/calibrator-v2/verify-canned-answer.sh`) |
| 15 | Validator emits `validator.failure` events on bad rule patterns | `docs/plans/docs--features--calibrator-v2--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/calibrator-v2/run-judge.sh`) |

### Rule quality & matching

| # | Feature | Evidence |
|---|---------|----------|
| 16 | Rule-quality validator: identical_patterns, confidence_range, missing_fields | `docs/plans/docs--features--rule-quality--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/rule-quality/run-judge.sh`) |
| 17 | Rule-quality validator: embedding_conflict detection | `docs/plans/docs--features--rule-quality--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/rule-quality/run-judge.sh`) |
| 18 | Rule-quality canned-answer verified | `docs/plans/docs--features--rule-quality--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/rule-quality/verify-canned-answer.sh`) |
| 19 | Matcher B-055: word-boundary guard prevents wrong_pattern over-fire | `docs/plans/docs--features--matcher-scope--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/matcher-scope/run-judge.sh`) |
| 20 | Matcher scope: file_types / paths glob filtering correct | `docs/plans/docs--features--matcher-scope--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/matcher-scope/run-judge.sh`) |

### Team knowledge sharing & sync

| # | Feature | Evidence |
|---|---------|----------|
| 21 | Three-layer knowledge scope: personal / team / global | `docs/plans/docs--features--team-share--run-transfer-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/team-share/run-judge.sh`) |
| 22 | Team-scope knowledge export/import between projects | `docs/plans/docs--features--team-share--run-transfer-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/team-share/run-judge.sh`) |
| 23 | Cross-machine sync via `teamagent sync push|pull` | `docs/plans/docs--features--xsync--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`) |
| 24 | `sync push` writes rules to remote git branch | `docs/plans/docs--features--xsync--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`) |
| 25 | `sync pull` merges remote rules into local store | `docs/plans/docs--features--xsync--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`) |

### PII redaction

| # | Feature | Evidence |
|---|---------|----------|
| 26 | PII redactor covers API keys, JWT, phone, credit card, AWS key | `docs/plans/docs--features--pii-redaction--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`) |
| 27 | PII redactor scrubs data before team-share export | `docs/plans/docs--features--pii-redaction--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`) |

### Multi-tool & IDE integration

| # | Feature | Evidence |
|---|---------|----------|
| 28 | PreToolUse hook intercepts tool calls pre-execution | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh`) |
| 29 | Stop hook scans AI narrative for avoidance patterns | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh`) |
| 30 | AttributionBus emits structured attribution events | `docs/plans/docs--features--multi-tool--verify-canned-answer/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh`) |
| 31 | MCP server `check_pitfall` handshake (initialize/tools-list/tools-call) | `docs/plans/docs--features--mcp-server--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`) |
| 32 | `check_pitfall` calls into core matcher and returns matched rules | `docs/plans/docs--features--mcp-server--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`) |
| 33 | Cursor `.cursorrules` compiler: exports top-N rules as Cursor-compatible file | `docs/plans/docs--features--cursor-compiler--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/cursor-compiler/run-judge.sh`) |

### Doctor / install diagnostics

| # | Feature | Evidence |
|---|---------|----------|
| 34 | `teamagent doctor` reports hook-registered status | `docs/plans/docs--features--doctor-install--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh`) |
| 35 | `teamagent doctor` reports plugin-sync status | `docs/plans/docs--features--doctor-install--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh`) |
| 36 | `teamagent doctor` reports mcp-reachable status | `docs/plans/docs--features--doctor-install--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh`) |
| 37 | hook-registered PreToolUse hook detected correctly after install | `docs/plans/docs--features--hook-registered--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/hook-registered/run-judge.sh`) |

### A/B benchmark

| # | Feature | Evidence |
|---|---------|----------|
| 38 | A/B benchmark harness: arm-A (bare Claude) vs arm-B (TeamAgent rules) | `docs/plans/docs--features--ab-benchmark--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh`) |
| 39 | Benchmark produces per-arm avoidance-rate metrics | `docs/plans/docs--features--ab-benchmark--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh`) |
| 40 | Benchmark judge.json written with exit_code + metrics + evidence_dir | `docs/plans/docs--features--ab-benchmark--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh`) |

### CLI commands

| # | Feature | Evidence |
|---|---------|----------|
| 41 | `teamagent skeleton-demo` (M0 walking skeleton) | `pnpm teamagent skeleton-demo` (CI green) |
| 42 | `teamagent pitfall` interactive + non-interactive | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` |
| 43 | `teamagent stats` knowledge statistics | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` |
| 44 | `teamagent verify` feature verification runner | `packages/cli/src/commands/verify.ts` (pnpm test green) |
| 45 | `teamagent calibrate` calibrator trigger | `packages/cli/src/commands/calibrate.ts` (pnpm test green) |
| 46 | `teamagent analyze` session analysis | `packages/cli/src/commands/analyze.ts` (pnpm test green) |
| 47 | `teamagent review` PR-cycle review | `packages/cli/src/commands/review.ts` (pnpm test green) |
| 48 | `teamagent install-hook` / `uninstall-hook` | `packages/cli/src/commands/install-hook.ts` (pnpm test green) |
| 49 | `teamagent mcp-server` stdio MCP server entrypoint | `docs/plans/docs--features--mcp-server--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`) |

### Viral spread & auto-sync (M5)

> Implemented in PR #71 (M5-A → M5-E). End-to-end verified by
> `bash scripts/m5-auto-demo.sh`: Alice infects → pitfall auto-shares →
> m5-publish auto-commits → Bob clones → SessionStart auto-bootstrap+sync →
> SQLite probe confirms Bob's KB has Alice's rule.

| # | Feature | Evidence |
|---|---------|----------|
| 50 | SessionStart hook auto-infects projects with `.teamagent/manifest.json` contract | `bash scripts/m5-auto-demo.sh` (Step 1); `packages/cli/src/m5-session-hook.ts` |
| 51 | Manifest contract propagates via git to teammates (zero-config team enrollment) | `bash scripts/m5-auto-demo.sh` (Step 5: clone brings `.teamagent/team/`) |
| 52 | Auto-bootstrap fills missing plugins / hooks on `git clone` per project manifest | `bash scripts/m5-auto-demo.sh` (Step 6); `packages/cli/src/commands/m5-bootstrap.ts` |
| 53 | Secret scanner gate seals API keys / JWT / phone / CC / paths in personal layer (uncloseable) | `packages/core/src/m5/secret-scanner.ts` + `__tests__/secret-scanner.test.ts` |
| 54 | Scope classifier categorizes new rules into personal / shareable / uncertain | `packages/core/src/m5/scope-classifier.ts` + `__tests__/scope-classifier.test.ts` |
| 55 | LWW + tombstone conflict resolution merges concurrent edits and deletes deterministically | `packages/core/src/m5/lww-merge.ts` + `__tests__/lww-merge.test.ts` |
| 56 | `pitfall` auto-share: clean rules promote to `.teamagent/team/<author>/` via gates 1+2 (default on) | `bash scripts/m5-auto-demo.sh` (Step 2); `packages/cli/src/commands/m5-share.ts` |
| 57 | `m5-publish` auto-commits team-rule changes with `[teamagent-sync]` prefix | `bash scripts/m5-auto-demo.sh` (Step 3 — commit `[teamagent-sync] sync N team rule(s)`) |
| 58 | post-merge hook auto-pulls team rules into local KB after every `git pull` | `bash scripts/m5-auto-demo.sh` (Step 6+7); `packages/core/src/m5/infect-planner.ts` writes `.githooks/post-merge` |

### First-run experience (#87)

| # | Feature | Evidence |
|---|---------|----------|
| 59 | 首次运行向导：装完立刻提示 3 件可以做的事 + 记住进度 | `docs/plans/scripts--judge-first-run/judge.md` (archived: `docs/legacy/judge-scripts/scripts/judge-first-run.sh`; J1–J6) |

### Landing CTA installer (#92)

| # | Feature | Evidence |
|---|---------|----------|
| 60 | One-line `curl\|sh` installer at `release/install.sh` (POSIX sh): gates `node ≥ 22`, picks `npm`/`pnpm`, runs release-tarball install with deterministic exit codes (10/11/20/30) and idempotent re-run | `bash docs/features/install-sh/run-judge.sh` (6 scenarios: syntax / node-missing / node-old / node-ok-install with captured argv / idempotent-rerun / dash-portability; utility, retained per docs/legacy/judge-scripts/README.md exemption) |

### Seed packs / first-run interception (issue #88)

> Decision 2 of `docs/specs/2026-05-07-landing-copy-actually-needed.md`:
> "30 秒内首次拦截". Substring-friendly seed pack lets the legacy keyword
> matcher fire within the 30-second window before the vector model has been
> downloaded (ADR 0001 two-stage install).

| # | Feature | Evidence |
|---|---------|----------|
| 61 | Universal seed pack: 12 cross-language substring rules ship out-of-box (moment, /Users/, /home/, rm -rf /, chmod 777, eval(, git push --force, git reset --hard, --no-verify, dangerouslySetInnerHTML, pickle.loads, .env) | `docs/plans/docs--features--universal-pack--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/universal-pack/run-judge.sh`); `packages/cli/src/__tests__/seed-pack-universal.test.ts` (27 tests); `packages/teamagent/seed/packs/universal.jsonl` |

### Pack management (#90)

> Implements ADR 0002 (`docs/adr/0002-stack-detection-via-coding-agent.md`):
> TeamAgent does not auto-detect stacks; `teamagent init` emits a versioned
> markdown prompt and the user's coding agent picks the right packs. Pack rule
> content lands separately — universal pack via #88 (already #61 above),
> per-stack packs via #89.

| # | Feature | Evidence |
|---|---------|----------|
| 62 | `teamagent pack list/add/remove` + `init` agent-driven prompt (v1 contract) | `docs/plans/docs--features--pack-cli--run-judge/judge.md` (10/10 checks PASS; archived: `docs/legacy/judge-scripts/docs/features/pack-cli/run-judge.sh`) |

### Demo command (issue #93)

> Decision 2 of `docs/specs/2026-05-07-landing-copy-actually-needed.md`
> requires a deterministic stage to record the landing GIF and to give a
> new user a controlled first-interception experience without relying on
> their actual project state. `teamagent demo` provides three modes that
> share a single canonical fixture (`npm install moment` → matched by
> `seed-pack-universal-moment` from #88).

| # | Feature | Evidence |
|---|---------|----------|
| 63 | `teamagent demo` three modes: default (poll `events.db` 60s for moment hit) / `--inline` (spawn real `bin-pre-tool-use.cjs` with mock stdin, render ANSI deny box; CI-safe) / `--record [path]` (emit `demo.tape`; spawn vhs if on PATH, else print install hint); legacy `teamagent demo hook` subcommand preserved | `docs/plans/docs--features--demo--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/demo/run-judge.sh`); `packages/cli/src/__tests__/demo.test.ts` (14 tests covering argv parsing, ANSI render, inline spawn contract, vhs tape generation, and events.db poll match+timeout); `packages/cli/src/commands/demo.ts` |

### Two-stage init (issue #91)

> Decision 2 + ADR 0001 of `docs/specs/2026-05-07-landing-copy-actually-needed.md`
> require `teamagent init` to return to the shell prompt within ~30s — the
> ~120MB Xenova vector model is too slow to download in the foreground. The
> implementation spawns warmup as a detached child process, writes a state
> file, and has every consumer (PreToolUse, Stop, doctor) consult the state
> file to decide whether to use the semantic matcher or fall back to the
> legacy keyword matcher. PR #113's foreground/visible-progress behavior
> stays one env var away: `TEAMAGENT_FOREGROUND_WARMUP=1`.

| # | Feature | Evidence |
|---|---------|----------|
| 64 | Two-stage init: detached warmup + `~/.teamagent/.warmup-state.json` + auto-fallback to legacy substring matcher in PreToolUse/Stop until `vector_model` is `ready`; `teamagent doctor` reports `vector_model: ready / downloading (X%) / failed / stale_downloading / missing` | `docs/plans/docs--features--two-stage-install--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/two-stage-install/run-judge.sh`); `packages/cli/src/__tests__/warmup-state.test.ts` (18 unit) + `warmup-state-integration.test.ts` (4 integration); `packages/cli/src/warmup-state.ts` |

---

## Pending judge harness (shipped 2026-05-09 → 2026-05-12, not yet VERIFIED)

> These features merged after the 2026-05-09 release cut and ship code +
> tests but do **not** yet carry the `docs/plans/<slug>/judge.md` playbook
> required for inclusion in the canonical VERIFIED=64 list. Adding a row
> here is a tracking signal — the canonical count stays at **64** until
> each feature lands its harness in a follow-up PR. CHANGELOG `Unreleased`
> documents the user-visible behaviour.

| Pending # | Feature | Shipped in | Status |
|---|---------|------------|--------|
| P1 | Digital-twin sidecar + `/api/cc-status` collector | #350 / #374 / #381 | code + tests; harness needed |
| P2 | `teamagent statusline` CC runtime state | #331 / #337 / #317 | code + tests; harness needed |
| P3 | Post-merge auto-update banner for PR creators (`m6`) | #358 | code + tests; harness needed |
| P4 | Newsboard SessionStart hook (4-section ASCII duck MOTD) | #235 / #249 | code + tests; harness needed |
| P5 | `/reverification` skill (LLM-uncheatable verification) | #318 | skill + tests; cross-harness gate |
| P6 | `grill-via-web` + `grill-with-docs` + cross-host grill mutex | #286 / #314 / #347 / #361 | skills + GH-label contract; workflow harness needed |
| P7 | `teamagent required-check` + nested-init guard | #284 / #383 | code + tests; harness needed |
| P8 | Counterfactual Ablation harness (scipy paired t-test) | #332 / #365 / #369 | itself a verify harness; meta-harness needed to gate |
| P9 | MockLlmResponder + `teamagent fixture replay` (moment-dayjs) | #324 / #360 | code + tests; tier-(a) byte-diff harness in `docs/verify/E2E-LEARNING.md` |
| P10 | TeamAgent symphony orchestration service (`m6`) + install-status HTML | #363 / #357 / #373 | code + tests; harness needed |
| P11 | `teamagent install duck` static skill | #321 | skill mirrored at user level; harness needed |
| P12 | `/onboard` project skill (remote Mac bootstrap) | #201 | skill mirrored; harness needed |
| P13 | `/repo-issues-status` project skill | #334 | skill mirrored; harness needed |
| P14 | Soft-force upgrade prompt + `teamagent whatsnew` | #225 / #237 | code + tests; harness needed |
| P15 | One-line `curl|bash` installer + idempotent resume (ADR-0011) | #92 / #107 / #147 / #155 / #180 / #268 / #272 | shipped via `release/install.sh`; existing `docs/features/install-sh/run-judge.sh` covers the curl path — promotion to canonical VERIFIED row pending |
| P16 | Inner-loop tests on `wip/**` CI (ADR-0013) | #270 | workflow shipped; harness needed |
| P17 | M5 propagation slices 1–7 (dual-HOME / bare-git / fs-copy bridges, nightly workflow) | #332 slices 1–7 / #356–#367 | test scaffolding shipped; M5-PROPAGATION-L4 doc updated |

Total: 17 pending. Promotion path: each row needs a
`docs/plans/<slug>/judge.md` playbook that produces a JSON verdict (per
`docs/PLAN-RESEARCH-REPORT.md`), at which point the row moves up into the
numbered VERIFIED list above and the canonical count increments.

---

## Biggest Known Limitations (residual, not blockers)

1. **Cross-machine sync requires shared git remote** — not fully zero-config; documented in `docs/features/xsync/`.
2. **Cursor compiler writes static file** — live sync on rule changes requires IDE reload.
3. **MCP server starts with empty rule store** — caller must seed rules via `setRules()` or load from SQLite.

See `docs/features/INDEX.md` for per-feature detail docs.
See `docs/superpowers/specs/2026-04-15-product-roadmap.md` for Phase 2–6 roadmap.
See `docs/specs/2026-05-07-landing-copy-actually-needed.md` for **the subset of features actually needed by the 30-second landing copy** — identifies which existing features to surface + 6 new features N1–N6 to build, with 11 grill decisions sealed and ADRs 0001–0003 cross-referenced. (Spec was written when this inventory had 49 features; the substance — which 8 to surface and which 6 to build — is unchanged by the m5 additions.)
