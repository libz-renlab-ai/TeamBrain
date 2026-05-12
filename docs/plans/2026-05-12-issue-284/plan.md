```
   plan.md                 expected outputs                judge harness
   ──────────              ────────────────                ─────────────
   what / how              files + commands                deterministic
   (not how to gather      after this PR                   third-party,
    context — that's        merges                          JSON to evidence
    in research.md)                                          dir, LLM judges
```

# plan.md — issue #284 slice 1

> issue #284 grill (2026-05-11): retarget the issue from m5-infect git-hook viral spread to gstack-style "TeamAgent required for Claude-assisted work" via `teamagent init .`. This PR is **slice 1**: the `required-check` command + `.teamagent/required.json` + `.claude/hooks/check-teamagent.sh` writer + `m5-infect` deprecation. Slice 2 (CLAUDE.md managed block, `.claude/settings.json` PreToolUse merge) is explicitly out of scope per `research.md` §"Slice scope decisions".

## 1. Task description

### Do
- Add a new CLI command `teamagent required-check` that:
  - Reads `.teamagent/required.json` from `--project <dir>` (default `$CLAUDE_PROJECT_DIR`, then `process.cwd()`).
  - Checks `command -v teamagent` (i.e. the running binary itself returns a sensible `--version`).
  - Exits `0` when both succeed, non-zero otherwise.
  - Prints a one-line human-readable diagnostic (stderr) so the wrapping `.sh` can quote it back to Claude.
- Extend `executeInit()` to write two new files, both idempotent (re-running init must NOT duplicate content or bump mtime when unchanged):
  - `.teamagent/required.json` (schema `teamagent.required.v1`).
  - `.claude/hooks/check-teamagent.sh` (executable bash, `chmod +x`).
- Add a one-line deprecation banner to `m5-infect` output: `[legacy] teamagent m5-infect 已归档，请改用：teamagent init .` (continues for compatibility, does not block existing behaviour).
- Wire `required-check` into `packages/cli/src/bin.ts` (registry + parse/render).
- Tests:
  - `packages/cli/src/__tests__/required-check.test.ts`: 0-exit when valid, non-zero exits for missing config, malformed config.
  - `packages/cli/src/__tests__/init.test.ts`: extend with one case asserting `.teamagent/required.json` + `.claude/hooks/check-teamagent.sh` present after init, byte-identical on re-run.
  - `packages/cli/src/__tests__/m5-infect.test.ts`: assert deprecation banner string appears in render output.

### How
- New file `packages/cli/src/commands/required-check.ts` (parser + executor + renderer triple, mirroring `compile.ts`).
- New helper `writeManagedFile(absPath, content, mode?)` co-located in `required-check.ts` (small, local — promote later if reused).
- Schema and file content for `.teamagent/required.json` taken verbatim from grill §"`.teamagent/required.json`".
- Shell script content taken verbatim from grill §"`.claude/hooks/check-teamagent.sh`", with the command name `npm install -g github:libz-renlab-ai/TeamBrain#release` exactly as grilled.
- `m5-infect` banner: emit before the existing `[m5-infect] 传染完成。` line so it is the FIRST line of output (loud signal).

### Don't
- Don't touch `CLAUDE.md` (managed block append is slice 2).
- Don't touch `.claude/settings.json` (PreToolUse wiring is slice 2).
- Don't add a new public command like `teamagent m5-team-init` (grill bans it).
- Don't check `~/.claude/skills/teamagent` as a "TeamAgent installed" proxy (grill bans it).
- Don't write `.githooks/` from `teamagent init` (grill bans it).
- Don't hard-delete `m5-infect` (grill says soft-archive only).
- Don't refactor `init.ts` beyond the additive hooks needed to call the two new writers.

## 2. Expected outputs

After this PR squash-merges, the following artifacts exist on `origin/main`:

| Path | Status | Description |
|---|---|---|
| `packages/cli/src/commands/required-check.ts` | NEW | The new command source. Exports `executeRequiredCheck`, `parseRequiredCheckArgs`, `renderRequiredCheckResult`. |
| `packages/cli/src/commands/init.ts` | MODIFIED | Calls a new internal `doWriteRequiredArtifacts(projectRoot)` step after `installHook()` succeeds; idempotent. |
| `packages/cli/src/commands/m5-infect.ts` | MODIFIED | Renderer prepends deprecation banner. |
| `packages/cli/src/bin.ts` | MODIFIED | New `case "required-check":` dispatch. |
| `packages/cli/src/__tests__/required-check.test.ts` | NEW | Vitest cases covering 0-exit, missing config, malformed config. |
| `packages/cli/src/__tests__/init.test.ts` | MODIFIED | One new case: artifacts written + idempotency byte-check. |
| `packages/cli/src/__tests__/m5-infect.test.ts` | MODIFIED (or created if missing) | Deprecation banner assertion. |
| `docs/plans/2026-05-12-issue-284/research.md` | NEW | (this PR) |
| `docs/plans/2026-05-12-issue-284/plan.md` | NEW | (this PR) |
| `docs/plans/2026-05-12-issue-284/report.md` | NEW | (this PR; post-impl) |

CLI surface (verifiable via `pnpm teamagent required-check --help`):

```
Usage: teamagent required-check [--project <dir>] [--json]

Exit code:
  0   TeamAgent is installed, the project requires TeamAgent for Claude-assisted
      work, and the required-check passes.
  1   TeamAgent binary missing on PATH.
  2   .teamagent/required.json missing or malformed.
  3   .teamagent/required.json present but its schema/mode is unsupported.
```

Runtime artifacts created by `teamagent init .` (verifiable on a fresh project):

```
.teamagent/required.json
.claude/hooks/check-teamagent.sh   (mode 0755)
```

## 3. How to eval from 3rd-party harness (JSON + LLM-judge, per `~/.claude/CLAUDE.md` §plan.md 三段铁律)

This PR's verdict gate is `docs/plans/2026-05-12-issue-284/judge.md` (created alongside this plan.md). The judge harness is an MD playbook that the main agent dispatches via `claudefast -p` probes; **never a `scripts/*.sh` runner** (per user-level memory `feedback_judge_harness_md_playbook.md`). Three deterministic third-party-tool probes, each emitting `evidence_dir/<probe>/judge.json` consumed by an LLM judge (an independent `claudefast` invocation that reads only the raw JSON + evidence file paths):

### Probe 1 — `pnpm vitest run` (third-party tool: vitest CLI)
- Command: `pnpm vitest run packages/cli/src/__tests__/required-check.test.ts packages/cli/src/__tests__/init.test.ts packages/cli/src/__tests__/m5-infect.test.ts --reporter=json --outputFile=evidence/probe-1/vitest.json`
- JSON shape: vitest's `--reporter=json` output (file shape `{numTotalTests, numPassedTests, numFailedTests, testResults[...]}`).
- PASS predicate: `numFailedTests === 0 && numPassedTests >= (new cases count)`.

### Probe 2 — `teamagent init` + `teamagent required-check` happy-path (third-party tool: node + bash)
- Setup: `mkdtemp` → `teamagent init --cwd=$TMP --home=$TMP --skip-import --skip-warmup`.
- Step 1: `stat .teamagent/required.json .claude/hooks/check-teamagent.sh` → both exist + the .sh is executable.
- Step 2: `teamagent required-check --project=$TMP --json > evidence/probe-2/check.json` → exit 0, JSON has `{status:"ok",schema:"teamagent.required.v1"}`.
- Step 3: re-run `teamagent init` → both files have identical mtime/content (idempotency). Capture `sha256` of both before/after.
- PASS predicate: all three asserts hold; LLM judge confirms by reading the captured stats.

### Probe 3 — `m5-infect` deprecation banner present (third-party tool: grep + node)
- Setup: same `mkdtemp` + `git init`.
- Run: `pnpm teamagent m5-infect --project-root=$TMP > evidence/probe-3/output.txt`.
- PASS predicate: `grep -q '\[legacy\].*teamagent init' evidence/probe-3/output.txt`. LLM judge reads the captured stdout and asserts the legacy banner mentions `teamagent init`.

### Final verdict
- LLM judge invocation: `claudefast -p "Read docs/plans/2026-05-12-issue-284/judge.md and the three JSON files under docs/plans/2026-05-12-issue-284/evidence/. Return only PASS or FAIL on a single line, with one paragraph reasoning."`
- The judge's claudefast session is **separate from this main session** (no context leak). It only reads the captured raw JSON; it cannot re-run probes; it cannot import any non-test code. This satisfies the third-party-harness contract.
