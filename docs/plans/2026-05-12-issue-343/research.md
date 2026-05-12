# research.md — issue #343

## 1. Issue Context

**Issue #343** (filed 5.12 by liboze): "领导：需要测量使用 teambrain 会增加了多少 token 成本"

**Execution path** (已定，maintainer @libz-renlab-ai 明确决定不拆 epic):
- **PR-1（本 PR）**: `TEAMAGENT_DISABLED=1` env master kill switch
- **PR-2**: 30-prompt 题库 + Counterfactual Ablation (scipy ttest_rel)
- **PR-3**: token 计量 overlay + 最终 A4 报告

PR-1 purpose: inject env-level master kill switch to disable all hook injections without code changes, enabling A/B testing token consumption via counterfactual ablation.

## 2. Related Issues Analysis

Related issues filed 5/12 by liboze:
- **#333** (规则闭环): Rule closed-loop detection — orthogonal scope
- **#332** (团队规则传播): Team-level rule propagation — orthogonal scope
- **#330** (自动更新失效): Auto-update failure — orthogonal scope

**Conclusion**: No overlap. PR-1 ranges only over hook early-return sites.

## 3. Hook Injection Face Mapping

### SessionStart — `packages/cli/src/bin-session-start.ts:114`

Handler entry (line 114–221). Insert early-return before line 115:
```
if (process.env["TEAMAGENT_DISABLED"] === "1") return undefined;
```
Skips: auto-init, banners, updater, M5 pipeline — zero token cost.

### PreToolUse — `packages/cli/src/bin-pre-tool-use.ts:99`

Handler after sdkInput assignment (line 99+). Insert:
```
if (process.env["TEAMAGENT_DISABLED"] === "1") return { permissionDecision: "allow" };
```
Skips: matcher, retriever, attribution — zero tool-level token cost.

### Stop — `packages/cli/src/bin-stop.ts` (3 paths)

**Path 1 (detached)** — Line 955:
```
if (isDetachedPipelineInvocation(...)) {
  if (process.env["TEAMAGENT_DISABLED"] === "1") return;
  ...
}
```

**Path 2 (async)** — Line 984:
```
if (config.stop_mode === "async") {
  if (process.env["TEAMAGENT_DISABLED"] === "1") return;
  ...
}
```

**Path 3 (sync)** — Line 1060:
```
if (process.env["TEAMAGENT_DISABLED"] === "1") return;
// sync mode pipeline ...
```

Skips: analyze, calibrate, compile, harvest, vectorization, scan-errors — zero session-end token cost.

### Coverage

SessionEnd/PreCompact delegate to Stop → automatic.
M5 nested in SessionStart → automatic via line 114 early-return.
UserPromptSubmit → lazy scan required.

## 4. TEAMAGENT_* Env Var Naming

### Existing patterns (excerpt)

Master toggles: `TEAMAGENT_AUTO_UPDATE`, `TEAMAGENT_MATCHER`
Feature flags: `TEAMAGENT_M5_AUTOSESSION`, `TEAMAGENT_BOOTSTRAP_SKIP`
Booleans: `TEAMAGENT_NEVER_PROMPT`, `TEAMAGENT_ALLOW_BARE_SESSIONSTART`

### Recommendation

**Name**: `TEAMAGENT_DISABLED`
- Consistent with negation-friendly existing vars
- Clear master-level intent
- Alternatives: `TEAMAGENT_KILL_SWITCH` (more descriptive), `TEAMAGENT_OFF` (shorter)

**Value**: Set to `"1"` to disable; unset or any other value to enable.

## 5. Behavior Contract

When `TEAMAGENT_DISABLED=1`:

- **SessionStart**: Early-return line 114, no side effects, exit 0
- **PreToolUse**: Return `{ permissionDecision: "allow" }`, exit 0
- **Stop (all paths)**: Early-return before pipeline, exit 0
- **Stderr**: Silent (no banner — clean A/B test delta measurement)
- **AttributionBus**: No events emitted
- **Filesystem**: No mutations (early-return before any fs.* calls)
- **Statusline**: Unaffected (separate subprocess, sees no lock files → idle)
- **CLI subcommands**: Unaffected (only hooks disabled, not explicit CLI use)

## 6. Test Strategy

### Unit tests

1. `bin-session-start.test.ts`: Add test for early-return when env set
2. `bin-pre-tool-use test`: Add test for fast-allow when env set
3. `bin-stop.test.ts`: Add 3 tests (detached/async/sync paths)

### Integration tests

New file `packages/cli/src/__tests__/disabled-env.test.ts`:
- SessionStart + M5: assert <100ms, no auto-init/M5
- PreToolUse: assert <100ms, no embedder contact
- Stop: assert <10ms, no analyze/calibrate/compile

### Feature verification

Baseline vs disabled (10 invocations each):
- Disabled duration < 20% of baseline
- Disabled events === 0
- Disabled stdout << baseline

## 7. Risk & Edge Cases

1. **Partial execution**: Mitigated — early-return at handler entry (lines 114/99/955–1060)
2. **Stop lock leak**: No issue — early-return before writeStopLock() (line 433 after handler)
3. **Detached child env leak**: Intentional — child inherits parent state
4. **Settings.json mutation**: No risk — all writes skipped
5. **ADR-0010 fixture-replay**: Unset TEAMAGENT_DISABLED when running fixtures
6. **.env precedence**: Command-line export wins — document in CHANGELOG
7. **Embedder daemon**: Idle when hooks disabled — no regression
8. **Statusline**: Separate process — correctly shows idle
9. **M5 nested in SessionStart**: Covered by line 114 early-return
10. **Windows windowsHide**: Orthogonal — spawn skipped when disabled

---

End of research. Findings inform PR-1 implementation, file:line insertions, behavior contract, test plan.
