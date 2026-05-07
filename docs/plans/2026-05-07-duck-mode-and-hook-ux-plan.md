```text
                ┌──────────────────────────────────────────┐
                │  plan.md — duck-mode + hook UX (PR plan) │
                │  closes: #116 (duck mode) + #86 (hook    │
                │  prompts humane + matcher FP + README)   │
                └────────────────────┬─────────────────────┘
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │ ① task description                                      │
        │ ② expected outputs                                      │
        │ ③ how-to-verify (1+2+3 + judge harness)                 │
        │ ④ claudefast probes BEFORE coding                       │
        └────────────────────────────┬────────────────────────────┘
                                     │
                  research → annotate → implement → report
                                     │
                              POSTPR until 👍
```

# Plan — duck-mode + hook UX combined PR

- Date: 2026-05-07
- Author: claude-opus-4-7
- Closes: #116, #86
- Companion: [`2026-05-07-duck-mode-and-hook-ux-research.md`](./2026-05-07-duck-mode-and-hook-ux-research.md)
- Worktrees: `.claude/worktrees/issue116` (branch `worktree-issue116`, primary), `.codex/worktrees/issue86` (branch `worktree-issue86`, parking for #86-only follow-ups if scope is split).
- Combined per user instruction (2026-05-07): single PR covering both issues. PR opens from `worktree-issue116`.

## ① Task description

### What we're doing

Ship a single PR that delivers two coherent UX upgrades wired around the same "non-technical user reads TeamBrain output" pain:

1. **#116 — opt-in cute CEO duck explanation mode.** A new env flag `TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1` and CLI flag `--explain-like-ceo-duck` that, when enabled, appends a 中文 cute-duck explanation to every user-visible jargon line emitted during install, init, warmup, stats, doctor, and other CLI commands. Persistent feature: works for both install-time output and any later CLI command. Off by default. Engineer view unchanged when off.
2. **#86 — humane hook prompts + matcher false-positive fix + README screenshots.** Rewrite `formatWarnMessage` / `formatBlockReason` so the first line tells the user (a) what they were doing, (b) why it was caught, (c) what to do next. Push confidence / hit count / rule id / age to a single details-suffix line. Drop `Error:` framing in favor of `⚠️ TeamAgent 提醒`. Add a `META_COMMAND_PREFIXES` whitelist to the legacy substring matcher so `gh issue create`, `gh pr create`, `gh issue comment`, `git commit -m`, `git log`, `git show` invocations don't trigger on quoted-arg content. Add ≥2 redacted screenshots (intercept + learning) to the README hero with a 1-sentence caption each.

### How we're doing it

#### A. Duck-mode (#116)

- Introduce `packages/core/src/duck-mode/`:
  - `translations.ts` — the canonical jargon → 中文 duck table. Each entry: `{ term: string; aliases: string[]; duck: string }` where `duck` is a 中文 sentence containing ≥1 of `呷呷~` / `鸭鸭说` / `鸭鸭` / `(>ω<)` / ASCII duck. Seed entries cover every term observed in the survey (Skills / hooks / PreToolUse / Stop hook / RAG / embedding / quantization / canonical / token 预算 / matcher / vector / reload / MCP / 元原则 / 知识种子 / 打包规则 / statusLine / Codex / plugins / knowledge.db / confidence / tier / demerit / verbose / 归因渲染).
  - `is-enabled.ts` — single source of truth for "is duck mode on right now?" Reads env `TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK` first, then per-call CLI flag override. Cached per-process.
  - `duckify.ts` — `duckify(line: string): string[]` returns `[line, ...duckLinesForJargonFound(line)]` when enabled, else `[line]`. Duck lines are added immediately after the jargon line they explain (not blanket appended at end), so visual coverage is line-local.
- Wire `duckify` into the call sites listed in research §3:
  - `packages/teamagent/postinstall.mjs` (banner + warmup messages)
  - `packages/cli/src/commands/init.ts` `renderInitResult()`
  - `packages/cli/src/commands/stats.ts` `renderStats` / `renderExplain` / `renderStuckInPromotion` / `renderOverrideSignals`
  - `packages/cli/src/commands/warmup.ts`
  - `packages/cli/src/bin.ts` install-hook / install-user-hook output
- CLI flag plumbing: add `--explain-like-ceo-duck` to the global flag parser in `packages/cli/src/bin.ts` so any subcommand inherits it. Setting either env or flag flips the same `is-enabled` result.
- No flag renaming, no other CLI flag refactor in scope.

#### B. Hook block humane rewrite (#86 task 1)

- Rewrite `formatWarnMessage` and `formatBlockReason` in `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` (L148–173) to a fixed shape:

  ```text
  ⚠️ TeamAgent 提醒 — 你刚才想 {action_summary}，规则 {rule_short_label} 建议先 {suggested_action}。
  复制即可: {suggested_command_or_pattern}
  细节: conf={conf} hit={hit_count} {age}学到 rule={rule_id_short}
  ```

  - `action_summary` derives from `tool_name + first arg` (e.g. "跑一条 Bash 命令").
  - `rule_short_label` is `rule.summary || rule.trigger` truncated to ~30 chars.
  - `suggested_action` derives from `rule.correct_pattern || rule.trigger`.
  - `suggested_command_or_pattern` is taken from the rule's `correct_pattern` if it looks like a runnable command; else falls back to a 1-line how-to.
  - The 3-line shape replaces the ASCII box. ASCII boxes are kept only when the user explicitly opts into legacy output via `TEAMAGENT_HOOK_ASCII_BOX=1` (preserves V4 engineer parity).
- Drop `Error:` red framing — verified in research that the explicit `Error:` literal is in the global error handler (`bin.ts:1022`), not in the hook block code, so no change needed there. The hook block already writes plain text to stderr; we just add the new prefix and let terminal default coloring be neutral.

#### C. Matcher false-positive whitelist (#86 task 4)

- Add to `packages/core/src/matcher/legacy/keyword-matcher.ts`:
  - `const META_COMMAND_PREFIXES = ["gh issue create", "gh issue comment", "gh pr create", "gh pr comment", "git commit -m", "git log", "git show", "git rebase", "git cherry-pick"]` (extensible).
  - Pre-filter step at the top of `matchRules`: if `input.tool_name === "Bash"` and the trimmed `command` starts with any prefix, skip substring matching for rules whose `wrong_pattern` would otherwise hit only inside a quoted arg. Implementation: detect `--body "..."`, `-m "..."`, `--message "..."` quoted regions and exclude them from the haystack before `patternMatches` runs.
- Add tests in `packages/core/src/matcher/legacy/__tests__/keyword-matcher.test.ts`:
  - Positive: `gh issue create --title "x" --body "moment is bad"` MUST NOT match a `wrong_pattern: "moment"` rule.
  - Positive: `npm install moment` STILL matches.
  - Positive: `git commit -m "fix: stop using moment"` MUST NOT match.
  - Negative: command outside the whitelist with quoted arg containing pattern still matches (we're not generally trusting quotes).
- No schema change. The `meta_command_exempt` per-rule field is explicitly out of scope (deferred to follow-up if real demand surfaces).

#### D. README screenshots (#86 tasks 5 + 6)

- Create `docs/screenshots/`:
  - `2026-05-07-intercept-warn.png` — terminal capture of the new humane warn block on a `gh issue create` style intercept (after the matcher fix, this should now show on a *real* `wrong_pattern` hit, not a false positive).
  - `2026-05-07-learn-rule.png` — capture of the "learned a rule" Stop-hook output.
  - Both captured via asciinema → svg-term-cli for reproducibility (see §③ judge harness).
  - Manual redaction pass: scrub `/Users/m1/`, `LiuShiyuMath`, hostnames, GH tokens.
- Embed in `README.md` directly under L23 (before the "5–10 分钟上手" section):

  ```markdown
  ## 它在你背后帮你避坑

  ![intercept](./docs/screenshots/2026-05-07-intercept-warn.png)

  > AI 准备走错路时，TeamAgent 拉一下，免得错误真的落到代码里。

  ![learn](./docs/screenshots/2026-05-07-learn-rule.png)

  > 你纠正它一次，下次它就记住。
  ```

- Add a `docs/screenshots/REDACTION-CHECKLIST.md` listing the patterns to scrub before any commit.

### What we're NOT doing

- **Not migrating hook stderr writes to AttributionBus.** Research confirmed direct stderr writes; that's a known gap. Out of scope to keep the diff focused. File a follow-up issue post-merge.
- **Not adding a per-rule `meta_command_exempt` schema field.** Hardcoded `META_COMMAND_PREFIXES` is enough for the known false-positive class.
- **Not changing the semantic matcher.** M4-B BM25 + dense path is unchanged; only the legacy substring matcher gets the whitelist.
- **Not folding the ASCII box rendering into a pluggable theme system.** Single `TEAMAGENT_HOOK_ASCII_BOX=1` legacy escape hatch only.
- **Not localizing duck strings.** Chinese only per project rule. No EN duck. No `quack quack ~`.
- **Not touching #84 / #85 landing-page or onboarding scope** beyond the README screenshot section. Coordination is a follow-up.
- **Not running real `npm install -g` in CI verification.** Use sandboxed dry-run only (postinstall has dryRun guards already).

## ② Expected outputs

Reviewer-checkable artifacts. A reviewer (or Codex) can grade the PR by walking this list.

### Files added

- `packages/core/src/duck-mode/translations.ts`
- `packages/core/src/duck-mode/is-enabled.ts`
- `packages/core/src/duck-mode/duckify.ts`
- `packages/core/src/duck-mode/__tests__/duckify.test.ts`
- `packages/core/src/duck-mode/__tests__/translations.test.ts`
- `packages/core/src/matcher/legacy/__tests__/keyword-matcher-meta-cmd.test.ts` (or extend existing test file — preferred extension to keep coverage co-located)
- `docs/screenshots/2026-05-07-intercept-warn.png`
- `docs/screenshots/2026-05-07-learn-rule.png`
- `docs/screenshots/REDACTION-CHECKLIST.md`
- `docs/screenshots/CAPTURE-RECIPE.md` — asciinema → svg-term recipe doc for (re)generating the README assets (delivered as a recipe doc instead of a runnable script per lead decision 2026-05-07; runnable script is a follow-up if/when needed).
- `docs/feature-verification/stats-help.schema.json` — JSON Schema lockfile for `pnpm teamagent stats --help` envelope (used by the 1+2+3 hard-match gate).
- `docs/feature-verification/duck-mode-judge-harness.md` — RUN/DUMP/READ recipe doc for `scripts/duck-mode-verify.sh` (covers issue #116 V1–V5).
- `docs/feature-verification/hook-prompt-judge-harness.md` — RUN/DUMP/READ recipe doc for `scripts/hook-prompt-verify.sh` (covers issue #86 tasks 1 + 4).
- `scripts/duck-mode-verify.sh` — judge harness runner (see §③).
- `scripts/hook-prompt-verify.sh` — judge harness runner (see §③).
- `docs/plans/2026-05-07-duck-mode-and-hook-ux-plan.md` (this file)
- `docs/plans/2026-05-07-duck-mode-and-hook-ux-research.md`
- `docs/plans/2026-05-07-duck-mode-and-hook-ux-report.md` (added at PR-open time, populated post-merge)

### Files edited

- `packages/teamagent/postinstall.mjs` — wrap banner + warmup writes through `duckify`.
- `packages/cli/src/commands/init.ts` — `renderInitResult()` returns `duckify(line)` per emitted line.
- `packages/cli/src/commands/stats.ts` — `renderStats` / `renderExplain` / `renderStuckInPromotion` / `renderOverrideSignals` route through `duckify`.
- `packages/cli/src/commands/warmup.ts` — same.
- `packages/cli/src/bin.ts` — install-hook / install-user-hook output through `duckify`; global `--explain-like-ceo-duck` flag parsing.
- `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` — `formatWarnMessage` / `formatBlockReason` rewrite + new format constants.
- `packages/core/src/matcher/legacy/keyword-matcher.ts` — `META_COMMAND_PREFIXES` whitelist + quoted-arg stripping.
- `README.md` — new "它在你背后帮你避坑" section under L23 with two screenshots.
- `CHANGELOG.md` — new entry: `feat(m5): cute-duck explain mode + humane hook prompts + meta-command matcher whitelist`.

### CLI / metric outputs (gradable)

- `pnpm teamagent stats --explain-like-ceo-duck` STDOUT contains ≥1 line matching `/(呷呷|鸭鸭|\(>ω<\)|🦆)/`.
- `TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 pnpm teamagent stats` STDOUT same as above (env-only path).
- `pnpm teamagent stats` (no flag, no env) STDOUT contains zero duck signals (engineer parity).
- `pnpm teamagent --help` lists `--explain-like-ceo-duck` once.
- `pnpm test packages/core/src/duck-mode/__tests__/` exits 0 with ≥6 passing tests.
- `pnpm test packages/core/src/matcher/legacy/__tests__/` exits 0 with the new false-positive test rows green.
- `pnpm test packages/adapters/src/hook/claude-agent-sdk/__tests__/` exits 0 with the new format-snapshot test green.
- `pnpm typecheck` exits 0 across all packages.
- `bash scripts/duck-mode-verify.sh` exits 0 and produces `.judge/duck-mode-<run_id>/judge.json` with `coverage_rate >= 1.0` and `engineer_view_diff <= 0.05`.

### PR artifacts

- Normal (non-draft) PR opened against `main` from branch `worktree-issue116`.
- PR title: `feat(m5): cute-duck explain mode + humane hook prompts + matcher meta-cmd whitelist (closes #116, #86)`.
- PR body uses the HOWTO-PLAN-PR checklist verbatim, plus links to plan + research + report files.
- Commit history follows `feat(m5):` / `fix(m5):` / `refactor(m5):` / `docs(m5):` per CLAUDE.md commit style. Atomic commits per concern (duck table, duckify wiring, hook rewrite, matcher whitelist, screenshots, docs).
- `/export <path>` interactive transcript file attached to PR description.

### Anti-goals (must not regress)

- `pnpm teamagent stats` with no flag MUST keep current line count ±5% (V4 of #116).
- `claudefast -p "what project tools we have?"` MUST still echo `FASTPROBE` / `POSTPR` / `TEAMWORK` anchors (V5 of #116).
- All canned-answer Bash verifiers under `docs/postpr/`, `docs/bugreport/`, `docs/dogfood/`, `docs/rule-verify/` MUST still pass.
- No new `process.exit` paths.
- No change to `TEAMAGENT_VISIBILITY` semantics.
- No PR landing while Codex still has unresolved P1/P2 inline comments (POSTPR loop).

## ③ How-to-verify

Two layers per HOWTO-PLAN-PR §3.

### 3a. Project-wide 1+2+3 gate

Per `docs/feature-verification.md`. The MODULE under test for this PR is **`pnpm teamagent stats`** (because it exercises both the duck-mode opt-in path AND a non-install command, hitting V2 of #116). The canonical JSON we hard-match is the `--help` envelope, which both `claudefast` and `codex exec` will receive.

Module: `pnpm teamagent stats --help`
Canonical JSON schema (lands at `docs/feature-verification/stats-help.schema.json` as the lockfile; `.schema.json` extension chosen 2026-05-07 to self-document as a JSON Schema):

```json
{
  "command": "stats",
  "summary": "...",
  "flags": [
    { "name": "--explain", "type": "string" },
    { "name": "--explain-like-ceo-duck", "type": "boolean" },
    { "name": "--stuck-in-promotion", "type": "boolean" },
    { "name": "--override-signals", "type": "boolean" }
  ],
  "exit_codes": [0, 1, 2]
}
```

Workflow:

```bash
# (1) claudefast canonical JSON
claudefast -p "Run 'pnpm teamagent stats --help' and emit the result as a canonical JSON object with fields: command, summary, flags (sorted by name), exit_codes." \
  > .judge/feature-verification/stats-help.claudefast.json

# (2) codex exec canonical JSON
codex exec --skip-git-repo-check -s read-only \
  "Run 'pnpm teamagent stats --help' and emit the result as a canonical JSON object with fields: command, summary, flags (sorted by name), exit_codes." \
  > .judge/feature-verification/stats-help.codex.json

# (3) hard-match
jq -S . .judge/feature-verification/stats-help.claudefast.json > /tmp/a.json
jq -S . .judge/feature-verification/stats-help.codex.json     > /tmp/b.json
diff -u /tmp/a.json /tmp/b.json && echo PASS || { echo FAIL; exit 1; }

# (4) tmux interactive claudefast → /export
tmux new-session -d -s preship-export -x 200 -y 50 'claudefast'
tmux send-keys -t preship-export "pnpm teamagent stats --explain-like-ceo-duck" Enter
sleep 5
tmux send-keys -t preship-export "/export /tmp/stats-duck-export.json" Enter
# attach the resulting export file to the PR description
```

Plan owner commits the locked canonical JSON file at `docs/feature-verification/stats-help.schema.json` so future regressions diff against a versioned baseline.

### 3b. Plan-specific judge harness

Two judge runs — one per issue. Both follow RUN → DUMP → READ.

#### 3b-1. `scripts/duck-mode-verify.sh` (covers #116)

```bash
#!/usr/bin/env bash
set -euo pipefail
run_id="${RUN_ID:-$(date +%s)}"
out=".judge/duck-mode-${run_id}"
mkdir -p "$out"

# RUN: capture stats with and without duck mode
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 pnpm teamagent stats > "$out/engineer.txt" 2>"$out/engineer.err" || true
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 pnpm teamagent stats > "$out/duck.txt"     2>"$out/duck.err"     || true

# RUN: capture postinstall dry-run
TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 \
  node packages/teamagent/postinstall.mjs > "$out/postinstall-duck.txt" 2>&1 || true
TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 \
  node packages/teamagent/postinstall.mjs > "$out/postinstall-eng.txt" 2>&1 || true

# DUMP metrics
jargon_terms=$(grep -Eio 'skills?|hooks?|PreToolUse|Stop hook|RAG|embedding|quantization|canonical|token (budget|预算)|matcher|vector|reload|MCP|tier|confidence|demerit' "$out/duck.txt" "$out/postinstall-duck.txt" | sort -u | wc -l | tr -d ' ')
duck_lines=$(grep -cE '呷呷|鸭鸭|\(>ω<\)' "$out/duck.txt" "$out/postinstall-duck.txt" || true)
eng_lines=$(wc -l < "$out/engineer.txt" | tr -d ' ')
duck_total_lines=$(wc -l < "$out/duck.txt" | tr -d ' ')

cat > "$out/judge.json" <<JSON
{
  "run_id": "$run_id",
  "exit_code": 0,
  "metrics": {
    "jargon_terms_found": $jargon_terms,
    "duck_lines_emitted": $duck_lines,
    "engineer_view_lines": $eng_lines,
    "duck_view_lines": $duck_total_lines,
    "engineer_view_diff": $(awk "BEGIN{printf \"%.4f\", ($duck_total_lines - $eng_lines) / ($eng_lines + 1)}")
  },
  "evidence_dir": "$out",
  "stdout_path": "$out/duck.txt"
}
JSON

cat "$out/judge.json"
```

READ: a separate `claudefast -p "Read .judge/duck-mode-<id>/judge.json and the stdout files. Grade pass/fail against V1 (every jargon term has a duck pairing within ±2 lines), V2 (duck mode persists outside install — pnpm teamagent stats also emits duck), V3 (duck lines all 中文 with ≥1 signal token), V4 (engineer view ±5% line count). Output JSON {pass: bool, reasons: [string]}."`

#### 3b-2. `scripts/hook-prompt-verify.sh` (covers #86 tasks 1 + 4)

```bash
#!/usr/bin/env bash
set -euo pipefail
run_id="${RUN_ID:-$(date +%s)}"
out=".judge/hook-prompt-${run_id}"
mkdir -p "$out"

# RUN: humane format snapshot test
pnpm test --filter @teamagent/adapters packages/adapters/src/hook/claude-agent-sdk/__tests__/format-snapshot.test.ts \
  > "$out/format-snapshot.txt" 2>&1 || fail=1

# RUN: false-positive matcher test
pnpm test --filter @teamagent/core packages/core/src/matcher/legacy/__tests__/keyword-matcher.test.ts \
  > "$out/matcher-fp.txt" 2>&1 || fail=1

# RUN: real PreToolUse simulation against a synthetic Bash command
node packages/cli/dist/bin-pre-tool-use.js < .judge/fixtures/pre-tool-use-meta-cmd.json \
  > "$out/sim-out.json" 2>"$out/sim-err.txt" || true

cat > "$out/judge.json" <<JSON
{
  "run_id": "$run_id",
  "exit_code": ${fail:-0},
  "metrics": {
    "format_snapshot_pass": $(grep -c 'PASS' "$out/format-snapshot.txt"),
    "matcher_fp_pass": $(grep -c 'PASS' "$out/matcher-fp.txt"),
    "first_line_chars": $(head -1 "$out/sim-err.txt" | wc -c),
    "details_line_present": $(grep -c '^细节:' "$out/sim-err.txt")
  },
  "evidence_dir": "$out",
  "stdout_path": "$out/sim-err.txt"
}
JSON
cat "$out/judge.json"
```

READ: separate `claudefast -p "Read .judge/hook-prompt-<id>/judge.json + sim-err.txt. Grade against: first line ≤80 chars, first line tells the user what they tried + why caught + what to do; details suffix present once; no 'Error:' literal; matcher-fp test green. Output JSON {pass: bool, reasons: [string]}."`

The plan author / executing agent / code under test do NOT grade. The judge `claudefast -p` is the only grader, fed only raw JSON + evidence files.

## ④ Claudefast probes — BEFORE coding

Per `docs/FASTPROBE.md`. Run all of these before the first implementation commit; do not run during research (already complete).

### Step 1 — orient

```bash
!claudefast -h | head -80
```

Pin current flag list to a one-pager note inside `.fastprobe/claudefast-h-2026-05-07.txt`.

### Step 2 — heavy + needs conclusion (≤8 parallel `-p`)

Submit these in one batch, each as its own `claudefast -p` invocation:

1. **Exhaustive jargon-emit audit.**
   `claudefast -p "List every file under packages/ and scripts/ that calls process.stderr.write or process.stdout.write or console.log directly. Return as JSON array of {file, line, snippet} objects (snippet = ≤80 chars). Don't read whole files."`
2. **Matcher subcommand awareness.**
   `claudefast -p "Read packages/core/src/matcher/legacy/keyword-matcher.ts. Tell me whether the matcher inspects input.command argv structure (subcommand-aware, e.g. distinguishes 'gh issue create' from 'gh pr merge'), or whether it only walks a concatenated haystack. Quote line numbers and suggest the cleanest place to insert a META_COMMAND_PREFIXES whitelist."`
3. **Existing flag conventions.**
   `claudefast -p "Search packages/cli/src for existing global CLI flags (yargs / commander / custom). Tell me where to register --explain-like-ceo-duck so every subcommand inherits it. Return file:line + minimal patch shape."`
4. **README screenshot prior art.**
   `claudefast -p "Read README.md and any docs/SCREENSHOTS*.md. Tell me whether the project already has screenshot dimension / dark-mode / alt-text conventions. If not, propose a minimal convention compatible with GitHub's light/dark rendering."`
5. **Feature-verification schema.**
   `claudefast -p "Read docs/feature-verification.md and quote the canonical JSON schema 1+2+3 expects from {MODULE} --help. List required fields, sort key, exit_code conventions."`
6. **Codex history on pre-tool-use-sdk.ts.**
   `env -u GITHUB_TOKEN gh api 'repos/libz-renlab-ai/TeamBrain/pulls?state=closed&per_page=20' --jq '.[] | {n: .number, t: .title}' | grep -i hook` → if any PR touched pre-tool-use-sdk.ts in last 90 days, fetch its Codex review and summarize recurring P1/P2 patterns.
7. **POSTPR sanity.**
   `claudefast -p "Read docs/POSTPR.md and tell me the exact phrasing the POSTPR canned answer requires for the literal string 'fetch the codex review'. Confirm my plan's POSTPR section will not regress that anchor."`
8. **DUCKPLAN compliance.**
   `claudefast -p "Read docs/rules/duckplan.md (or ~/.claude/docs/rules/duckplan.md if present). List the four required sections of a DUCKPLAN response and confirm whether this plan needs to be a DUCKPLAN response itself or just produce DUCKPLAN-compatible output."`

### Step 3 — audit-grade evidence

For probe #1 (jargon-emit audit) and probe #2 (matcher subcommand awareness), re-run with stream-json so reviewer can replay:

```bash
mkdir -p .fastprobe
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/jargon-audit.debug.log \
  --permission-mode acceptEdits \
  "List every file under packages/ and scripts/ that calls process.stderr.write or process.stdout.write or console.log directly. Return as JSON array of {file, line, snippet}." \
  > .fastprobe/jargon-audit.stream.jsonl

claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/matcher-fp.debug.log \
  --permission-mode acceptEdits \
  "Read packages/core/src/matcher/legacy/keyword-matcher.ts. Tell me whether the matcher inspects input.command argv structure (subcommand-aware) or only walks a concatenated haystack. Quote line numbers." \
  > .fastprobe/matcher-fp.stream.jsonl
```

Reviewer can `jq` over the stream-json and grep the hook debug log. Both files attach to PR.

### Conflict-resolve probe (only if conflicts surface)

If during POSTPR a conflict appears, follow `FASTPROBE about PR+conflict resolve`:
- Classify: merge / Codex-review / rule-doc.
- Resolve on `worktree-issue116` (never on `main`, never `--force`, never `git reset --hard`).
- Rerun `pnpm test` + `pnpm typecheck` + 1+2+3 verification.
- Push back to the same branch (or open follow-up if PR already merged).

## Boris workflow walk

1. **research** — done. See companion research file.
2. **plan** — this file.
3. **annotate** — drop `// FIXME(plan-2026-05-07-duck-mode-and-hook-ux:<section>)` markers in the call sites listed in §② "Files edited" so reviewers map diff hunks to plan sections.
4. **implement** — atomic commits in this order, each followed by `pnpm test` + `pnpm typecheck`:
   1. `feat(m5): add duck-mode translations + duckify helper + tests`
   2. `feat(m5): wire duckify into postinstall + warmup`
   3. `feat(m5): wire duckify into init renderInitResult`
   4. `feat(m5): wire duckify into stats renders + global --explain-like-ceo-duck flag`
   5. `feat(m5): humane hook block — first-line summary + details suffix + ASCII-box escape hatch`
   6. `fix(m5): keyword-matcher META_COMMAND_PREFIXES whitelist + quoted-arg stripping`
   7. `docs(m5): README screenshots + intercept/learn captions + redaction checklist`
   8. `chore(m5): scripts/duck-mode-verify.sh + scripts/hook-prompt-verify.sh judge harnesses`
   9. `docs(m5): plan + research files`
5. **report** — write `docs/plans/2026-05-07-duck-mode-and-hook-ux-report.md` after PR opens, recording deltas, slipped scope, follow-up issues.

## POSTPR loop

Per `docs/POSTPR.md`:

```
PR #N opens
  → CI runs (pnpm test + typecheck + verification 1+2+3)
  → fetch the codex review:
      env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/N/comments \
        --jq '.[] | select(.user.login=="chatgpt-codex-connector[bot]") | {body, path, line}'
  → triage P1 (blocker) / P2 (fix-before-merge default) / P3 (punt with follow-up issue)
  → resolve conflicts (merge / Codex-review / rule-doc) on PR branch only
  → push same branch (or open follow-up PR if already merged) — re-fetch the codex review again
  → loop until silent or 👍
  → merge only when CI green + no conflict + Codex silent/👍
```

Stop conditions written into the PR description so the reviewer (and Codex) can audit them.

## Quick checklist (paste into PR body)

```
- [x] plan.md committed at docs/plans/2026-05-07-duck-mode-and-hook-ux-plan.md
      with task description / expected outputs / judge harness
- [x] research.md committed at docs/plans/2026-05-07-duck-mode-and-hook-ux-research.md
- [ ] expected outputs reviewer-checkable (files / CLI / metrics / artefacts)
      and include anti-goals
- [ ] how-to-verify names module under test (pnpm teamagent stats),
      JSON schema (docs/feature-verification/stats-help.schema.json),
      and /export path (/tmp/stats-duck-export.json)
- [ ] claudefast probes run before coding:
      (a) -h orient   (b) parallel -p ≤ 8   (c) stream-json audit logs in .fastprobe/
- [ ] PR opened as a normal PR (not --draft)
- [ ] POSTPR loop scheduled — fetch the codex review after CI green
- [ ] report.md drafted alongside the implementation
```

## See also

- Companion: `2026-05-07-duck-mode-and-hook-ux-research.md`
- `docs/HOWTO-PLAN-PR.md` — 4-section workflow
- `docs/feature-verification.md` — 1+2+3 gate
- `docs/FASTPROBE.md` — orient → parallel → audit recipe
- `docs/POSTPR.md` — Codex review loop
- `docs/rules/duckplan.md` — duck signal canon
- `CLAUDE.md` — POSTPR / FASTPROBE / PRESHIP / language-Chinese / worktree placement rules
- Issue #116, Issue #86 (open at plan-write time, both assigned to LiuShiyuMath)
