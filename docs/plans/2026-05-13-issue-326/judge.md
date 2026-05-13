```text
   ┌────────────────────────────────────────────────────────┐
   │  JUDGE HARNESS · issue #326 implementation half PR     │
   │                                                        │
   │  6 fixed probes · RUN → DUMP → READ                    │
   │  read-only LLM judge consumes raw JSON, no re-grading  │
   └────────────────────────────────────────────────────────┘
```

# Judge harness: `feat(issue-326): RESCOPE 12 items` PR

> Md playbook per `docs/HOWTO-PLAN-PR.md` § 3b. Dispatched by the MAIN agent
> via subagents or `claudefast -p` probes; **NO** fixed `scripts/*.sh` —
> shell pipelines are wrong shape per project rule.

Evidence dir (uncommitted): `.judge/2026-05-13-issue-326/` under the worktree.

---

## §V1 — RUN (6 fixed probes)

### P1 · Landing copy forbidden-substring sweep

```bash
{
  grep -cE 'PreToolUse|拦截 PreToolUse|拦截机制' apps/landing/src/index.html || true
  echo '---'
  grep -nE 'PreToolUse|拦截 PreToolUse|拦截机制' apps/landing/src/index.html || true
} > .judge/2026-05-13-issue-326/p1.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p1.exit
```

PASS criterion: `grep -c` returns exactly `0`. Empty grep result is the
correct end-state.

### P2 · Init success block minimal-shape grep

```bash
{
  grep -nE '✅ TeamAgent 已就绪|TeamAgent 安装成功' packages/cli/src/commands/init.ts || true
  echo '---'
  grep -nE '下一步：' packages/cli/src/commands/init.ts || true
  echo '---'
  grep -nE 'cd your-project' packages/cli/src/commands/init.ts || true
  echo '---'
  grep -nE '💡 团队标配插件' packages/cli/src/commands/init.ts || true
  echo '---'
  grep -nE '🆕 本次新增|buildPostInitWhatsNewTail' packages/cli/src/commands/init.ts || true
} > .judge/2026-05-13-issue-326/p2.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p2.exit
```

PASS criteria (all must hold):

- `✅ TeamAgent 已就绪` appears ≥ 1× in source.
- `TeamAgent 安装成功` appears `0×` in source.
- `下一步：` (full-width colon) appears ≥ 1×.
- `cd your-project` appears ≥ 1×.
- `💡 团队标配插件` appears `0×` in the rendered output path (function can still exist gated behind env var).
- `buildPostInitWhatsNewTail` defined (function kept) but not invoked on the default success path.

### P3 · Init step-group label sweep

```bash
{
  grep -nE '"🔗 注册 Hook"|🔗 注册集成' packages/cli/src/commands/init.ts || true
} > .judge/2026-05-13-issue-326/p3.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p3.exit
```

PASS: `"🔗 注册 Hook"` literal `0×`; `🔗 注册集成` ≥ 1×.

### P4 · Init unit tests

```bash
pnpm vitest run packages/cli/src/__tests__/init.test.ts \
  > .judge/2026-05-13-issue-326/p4.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p4.exit
```

PASS: `exit_code=0`, no `FAIL` lines.

### P5 · Typecheck

```bash
pnpm typecheck > .judge/2026-05-13-issue-326/p5.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p5.exit
```

PASS: `exit_code=0`, zero TS errors.

### P6 · Restored grill shard existence

```bash
{
  for f in grill-comment.md grill-spec-acceptance.md grill-spec-behavior.md grill-spec-protocol.md; do
    test -f "docs/plans/2026-05-11-issue-122/$f" && echo "OK $f $(wc -l < docs/plans/2026-05-11-issue-122/$f) lines" || echo "MISSING $f"
  done
} > .judge/2026-05-13-issue-326/p6.stdout 2>&1
echo $? > .judge/2026-05-13-issue-326/p6.exit
```

PASS: 4 `OK` lines, each file > 80 lines, no `MISSING` lines.

---

## §V2 — DUMP

Every probe writes a `<probe>.stdout` + `<probe>.exit` pair to
`.judge/2026-05-13-issue-326/`. No probe edits source. Directory is NOT
committed (`.gitignore` already excludes `.judge/`).

Aggregator JSON (built once after all probes run):

```bash
cat > .judge/2026-05-13-issue-326/judge.json <<'JSON'
{
  "run_id": "2026-05-13-issue-326",
  "probes": [
    { "id": "p1", "exit": "p1.exit", "stdout": "p1.stdout", "name": "landing forbidden substrings" },
    { "id": "p2", "exit": "p2.exit", "stdout": "p2.stdout", "name": "init success-block grep" },
    { "id": "p3", "exit": "p3.exit", "stdout": "p3.stdout", "name": "init step-group label" },
    { "id": "p4", "exit": "p4.exit", "stdout": "p4.stdout", "name": "init.test.ts vitest" },
    { "id": "p5", "exit": "p5.exit", "stdout": "p5.stdout", "name": "pnpm typecheck" },
    { "id": "p6", "exit": "p6.exit", "stdout": "p6.stdout", "name": "grill shards exist" }
  ]
}
JSON
```

---

## §V3 — READ (LLM judge, read-only)

A separate `claudefast -p` invocation reads ONLY the `.judge/<run_id>/*.exit`
+ `*.stdout` + `judge.json` files and outputs a single line:

```
VERDICT: PASS|FAIL  (probes failed: [...])
```

Judge prompt (canonical):

```
You are a read-only judge. Inputs: 6 probe stdout+exit files
under .judge/2026-05-13-issue-326/. For each probe, PASS iff
its exit file contains "0" AND the stdout matches the PASS
criteria spelled out in docs/plans/2026-05-13-issue-326/judge.md
sections P1..P6. Output exactly one line:

VERDICT: PASS  (all 6 probes green)
VERDICT: FAIL  (probes failed: p2, p4)  ← list ids only

Do NOT re-run probes. Do NOT re-read source files. Read only
the .judge/ artifacts.
```

PASS = all 6 probes PASS. Any FAIL = block PR open (return to implementation).

`/review` PASS (ADR-0007) is the **separate** merge gate. The judge harness
is the pre-`/review` smoke gate.
