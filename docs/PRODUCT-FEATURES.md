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
| 5 | Useful knowledge grows more trusted; stale knowledge auto-demoted | `docs/features/calibrator-v2/run-judge.sh` |
| 6 | Visible stats: count of learnings, layers, recent additions | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`teamagent stats`) |
| 7 | User can proactively record a pitfall without waiting for AI to fail | `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` (`pitfall --non-interactive`) |
| 8 | Safe sandbox: test changes in isolation before touching main workspace | `docs/features/multi-tool/verify-canned-answer.sh` (Tier 2/3 DOGFOOD probe) |
| 9 | Stable canned-answer rules: POSTPR/DOGFOOD/BUGREPORT/FASTPROBE/PRESHIP/etc. | `docs/rule-verify/INDEX.md` (`bash scripts/verify-all-rules.sh`) |

### Auto-capture & extraction

| # | Feature | Evidence |
|---|---------|----------|
| 10 | Auto-capture corrections from every session (Stop hook) | `docs/features/auto-capture/verify-canned-answer.sh` |
| 11 | Real-session extraction judge: recall ≥ 100% on labeled fixtures | `docs/features/auto-capture/real-judge.sh` |
| 12 | Correction-detector handles real JSONL session shapes | `docs/features/auto-capture/real-judge.sh` (extraction-judge probe) |

### Calibrator v2

| # | Feature | Evidence |
|---|---------|----------|
| 13 | Calibrator emits `calibrator.adjustment` events on user-reject signals | `docs/features/calibrator-v2/run-judge.sh` |
| 14 | Calibrator v2: Wilson LB + 5-tier confidence bands | `docs/features/calibrator-v2/verify-canned-answer.sh` |
| 15 | Validator emits `validator.failure` events on bad rule patterns | `docs/features/calibrator-v2/run-judge.sh` |

### Rule quality & matching

| # | Feature | Evidence |
|---|---------|----------|
| 16 | Rule-quality validator: identical_patterns, confidence_range, missing_fields | `docs/features/rule-quality/run-judge.sh` |
| 17 | Rule-quality validator: embedding_conflict detection | `docs/features/rule-quality/run-judge.sh` |
| 18 | Rule-quality canned-answer verified | `docs/features/rule-quality/verify-canned-answer.sh` |
| 19 | Matcher B-055: word-boundary guard prevents wrong_pattern over-fire | `docs/features/matcher-scope/run-judge.sh` |
| 20 | Matcher scope: file_types / paths glob filtering correct | `docs/features/matcher-scope/run-judge.sh` |

### Team knowledge sharing & sync

| # | Feature | Evidence |
|---|---------|----------|
| 21 | Three-layer knowledge scope: personal / team / global | `docs/features/team-share/run-judge.sh` |
| 22 | Team-scope knowledge export/import between projects | `docs/features/team-share/run-judge.sh` |
| 23 | Cross-machine sync via `teamagent sync push|pull` | `docs/features/xsync/run-judge.sh` |
| 24 | `sync push` writes rules to remote git branch | `docs/features/xsync/run-judge.sh` |
| 25 | `sync pull` merges remote rules into local store | `docs/features/xsync/run-judge.sh` |

### PII redaction

| # | Feature | Evidence |
|---|---------|----------|
| 26 | PII redactor covers API keys, JWT, phone, credit card, AWS key | `docs/features/pii-redaction/run-judge.sh` |
| 27 | PII redactor scrubs data before team-share export | `docs/features/pii-redaction/run-judge.sh` |

### Multi-tool & IDE integration

| # | Feature | Evidence |
|---|---------|----------|
| 28 | PreToolUse hook intercepts tool calls pre-execution | `docs/features/multi-tool/verify-canned-answer.sh` |
| 29 | Stop hook scans AI narrative for avoidance patterns | `docs/features/multi-tool/verify-canned-answer.sh` |
| 30 | AttributionBus emits structured attribution events | `docs/features/multi-tool/verify-canned-answer.sh` |
| 31 | MCP server `check_pitfall` handshake (initialize/tools-list/tools-call) | `docs/features/mcp-server/run-judge.sh` |
| 32 | `check_pitfall` calls into core matcher and returns matched rules | `docs/features/mcp-server/run-judge.sh` |
| 33 | Cursor `.cursorrules` compiler: exports top-N rules as Cursor-compatible file | `docs/features/cursor-compiler/run-judge.sh` |

### Doctor / install diagnostics

| # | Feature | Evidence |
|---|---------|----------|
| 34 | `teamagent doctor` reports hook-registered status | `docs/features/doctor-install/run-judge.sh` |
| 35 | `teamagent doctor` reports plugin-sync status | `docs/features/doctor-install/run-judge.sh` |
| 36 | `teamagent doctor` reports mcp-reachable status | `docs/features/doctor-install/run-judge.sh` |
| 37 | hook-registered PreToolUse hook detected correctly after install | `docs/features/hook-registered/run-judge.sh` |

### A/B benchmark

| # | Feature | Evidence |
|---|---------|----------|
| 38 | A/B benchmark harness: arm-A (bare Claude) vs arm-B (TeamAgent rules) | `docs/features/ab-benchmark/run-judge.sh` |
| 39 | Benchmark produces per-arm avoidance-rate metrics | `docs/features/ab-benchmark/run-judge.sh` |
| 40 | Benchmark judge.json written with exit_code + metrics + evidence_dir | `docs/features/ab-benchmark/run-judge.sh` |

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
| 49 | `teamagent mcp-server` stdio MCP server entrypoint | `docs/features/mcp-server/run-judge.sh` |

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
| 59 | 首次运行向导：装完立刻提示 3 件可以做的事 + 记住进度 | `scripts/judge-first-run.sh` (J1–J6) |

### Landing CTA installer (#92)

| # | Feature | Evidence |
|---|---------|----------|
| 60 | One-line `curl\|sh` installer at `release/install.sh` (POSIX sh): gates `node ≥ 22`, picks `npm`/`pnpm`, runs release-tarball install with deterministic exit codes (10/11/20/30) and idempotent re-run | `bash docs/features/install-sh/run-judge.sh` (6 scenarios: syntax / node-missing / node-old / node-ok-install with captured argv / idempotent-rerun / dash-portability) |

### Seed packs / first-run interception (issue #88)

> Decision 2 of `docs/specs/2026-05-07-landing-copy-actually-needed.md`:
> "30 秒内首次拦截". Substring-friendly seed pack lets the legacy keyword
> matcher fire within the 30-second window before the vector model has been
> downloaded (ADR 0001 two-stage install).

| # | Feature | Evidence |
|---|---------|----------|
| 61 | Universal seed pack: 12 cross-language substring rules ship out-of-box (moment, /Users/, /home/, rm -rf /, chmod 777, eval(, git push --force, git reset --hard, --no-verify, dangerouslySetInnerHTML, pickle.loads, .env) | `docs/features/universal-pack/run-judge.sh`; `packages/cli/src/__tests__/seed-pack-universal.test.ts` (27 tests); `packages/teamagent/seed/packs/universal.jsonl` |

### Pack management (#90)

> Implements ADR 0002 (`docs/adr/0002-stack-detection-via-coding-agent.md`):
> TeamAgent does not auto-detect stacks; `teamagent init` emits a versioned
> markdown prompt and the user's coding agent picks the right packs. Pack rule
> content lands separately — universal pack via #88 (already #61 above),
> per-stack packs via #89.

| # | Feature | Evidence |
|---|---------|----------|
| 62 | `teamagent pack list/add/remove` + `init` agent-driven prompt (v1 contract) | `bash docs/features/pack-cli/run-judge.sh` (10/10 checks PASS) |

### Demo command (issue #93)

> Decision 2 of `docs/specs/2026-05-07-landing-copy-actually-needed.md`
> requires a deterministic stage to record the landing GIF and to give a
> new user a controlled first-interception experience without relying on
> their actual project state. `teamagent demo` provides three modes that
> share a single canonical fixture (`npm install moment` → matched by
> `seed-pack-universal-moment` from #88).

| # | Feature | Evidence |
|---|---------|----------|
| 63 | `teamagent demo` three modes: default (poll `events.db` 60s for moment hit) / `--inline` (spawn real `bin-pre-tool-use.cjs` with mock stdin, render ANSI deny box; CI-safe) / `--record [path]` (emit `demo.tape`; spawn vhs if on PATH, else print install hint); legacy `teamagent demo hook` subcommand preserved | `docs/features/demo/run-judge.sh`; `packages/cli/src/__tests__/demo.test.ts` (14 tests covering argv parsing, ANSI render, inline spawn contract, vhs tape generation, and events.db poll match+timeout); `packages/cli/src/commands/demo.ts` |

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
| 64 | Two-stage init: detached warmup + `~/.teamagent/.warmup-state.json` + auto-fallback to legacy substring matcher in PreToolUse/Stop until `vector_model` is `ready`; `teamagent doctor` reports `vector_model: ready / downloading (X%) / failed / stale_downloading / missing` | `docs/features/two-stage-install/run-judge.sh`; `packages/cli/src/__tests__/warmup-state.test.ts` (18 unit) + `warmup-state-integration.test.ts` (4 integration); `packages/cli/src/warmup-state.ts` |

---

## Biggest Known Limitations (residual, not blockers)

1. **Cross-machine sync requires shared git remote** — not fully zero-config; documented in `docs/features/xsync/`.
2. **Cursor compiler writes static file** — live sync on rule changes requires IDE reload.
3. **MCP server starts with empty rule store** — caller must seed rules via `setRules()` or load from SQLite.

See `docs/features/INDEX.md` for per-feature detail docs.
See `docs/superpowers/specs/2026-04-15-product-roadmap.md` for Phase 2–6 roadmap.
See `docs/specs/2026-05-07-landing-copy-actually-needed.md` for **the subset of features actually needed by the 30-second landing copy** — identifies which existing features to surface + 6 new features N1–N6 to build, with 11 grill decisions sealed and ADRs 0001–0003 cross-referenced. (Spec was written when this inventory had 49 features; the substance — which 8 to surface and which 6 to build — is unchanged by the m5 additions.)
