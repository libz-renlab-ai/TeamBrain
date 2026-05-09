```text
                ┌─────────────────────────────────────────┐
                │  ISSUE 174 — NEW-USER UX BUNDLE (7→1)   │
                │                                         │
                │  ① plan        (this file)              │
                │  ② expected    7 reviewer-checkable     │
                │     outputs    fixes + anti-goals       │
                │  ③ judge.md    md playbook              │
                │     (no fixed bash)                     │
                └─────────────────┬───────────────────────┘
                                  │
   ┌──────────────────────────────┼──────────────────────────────┐
   │                              │                              │
docs touch              cli text touch                   parser/behaviour
─────────────           ─────────────                    ─────────────
 #1 README              #3 hook --verbose gate           #2 try cmd (NEW)
   release+main         #5 init pack-prompt skip         #4 demo hook ;
                        #6 bug-report stdout footer      separator
                        #7 doctor --fix help text
                              │
                              ▼
                       single squash-merge PR
                              │
                              ▼
                       judge.md §V1/§V2/§V3 + 1+2+3 gate
```

# Issue 174 — New-User UX Bundle

> **Scope owner**: 1 squash-merge PR — by user direction "build one PR will be good".
> **Branch**: `worktree-174` (current worktree at `.claude/worktrees/174/`; the
> path violates the `.codex/worktrees/` convention in `CLAUDE.md`, but the
> worktree was harness-created and we're not migrating mid-flight — note in
> `report.md`).
> **Status**: PLAN ONLY — pending user "go" before implementing.

---

## ① Task description

Land a single squash-merge PR that resolves all 7 sub-items in
[issue 174](https://github.com/libz-renlab-ai/TeamBrain/issues/174) (P1
new-user UX bundle). The PR makes the first 30 seconds of TeamAgent feel
intentional rather than half-finished, by closing 7 small gaps a fresh user
hits when they:

1. land on the GitHub release branch
2. read the README and try the suggested command
3. run a hook interception
4. probe the demo hook with the syntax shown in docs
5. run `init` against an empty stack-pack catalogue
6. emit a bug report and want to file it
7. read `--help` to find a self-rescue command

### What we're doing

| # | Sub-item                                        | Code/asset to touch                                                  | Shape of fix |
|---|-------------------------------------------------|----------------------------------------------------------------------|--------------|
| 1 | release branch README + dist sync               | `release/` branch (sync `README.md` from `main`); `release/install.sh` if any TBD remains; `README.md` line 57 demo command sanity check | doc + dist sync |
| 2 | `teamagent try` one-shot 5-case wow demo        | `packages/cli/src/commands/try.ts` (new); `bin.ts` dispatch + help; fixtures for `moment / rm -rf / git push --force / chmod 777 / hardcoded path` | new command |
| 3 | hook output `--- raw events ---` to `--verbose` | `packages/cli/src/bin-pre-tool-use.ts`, `bin-user-prompt-submit.ts`, related renderer; gate behind `TEAMAGENT_HOOK_VERBOSE=1` env var (hooks are not user-CLI so no `--verbose` flag) | output-format gate |
| 4 | `demo hook Write field=a;b=c` parser            | `packages/cli/src/commands/demo-hook.ts` `parseDemoHookArgs:154-173`; help text on `bin.ts:1098-1099` | parser + docs |
| 5 | `init` skips pack-prompt when 0 packs           | `packages/cli/src/commands/init.ts:399-424`; `renderPackPromptBody` caller; `bin.ts` print path at `1286-1288` | conditional emit |
| 6 | `bug-report --stdout` footer with paste target  | `packages/cli/src/commands/bug-report.ts` (final-line emit); suppress empty `## Summary` template when `--stdout` | text append + conditional |
| 7 | `doctor --fix` help text spells out scope       | `packages/cli/src/bin.ts:1118` (single help line) + the analogous string inside `doctor.ts:739` if shown | help text rewrite |

### How

- Trunk-based, all edits on branch `worktree-174`, single PR opened against
  `main` as a normal (non-draft) PR.
- TDD where new logic is added (#2 try, #3 verbose gate, #4 parser, #5 init
  conditional). Pure text/docs changes (#1, #6 footer, #7 help) only need
  snapshot or regex assertions in existing test files.
- Commits follow `feat(m6): …` / `fix(m6): …` / `docs(m6): …` per project
  rule, one concept per commit, so the squash-merge body is easy to write.
- Project verification gate `1+2+3` runs against the new `teamagent try
  --help` and `teamagent demo hook --help` (the two surfaces that change
  visible canonical output).

### What we're NOT doing

- **No restructuring of the demo subsystem.** `try` is a new sibling
  command, not a replacement for `demo` / `demo hook`.
- **No change to default hook output for non-verbose path.** The new
  default is the three-line warning block (title / fix / confidence); the
  raw JSON only appears when `TEAMAGENT_HOOK_VERBOSE=1`. We do **not**
  change the underlying envelope (`hookSpecificOutput` etc.) — that is
  consumed by Claude Code itself.
- **No change to the `pack` subsystem semantics.** `init` still computes
  `available` packs the same way; we only suppress the prompt block when
  the count is zero.
- **No change to the `doctor --fix` behaviour.** Only the help text is
  rewritten to enumerate what `--fix` already does.
- **No follow-up issues.** Per `docs/PR-PLAN.md` and project memory, if
  `/review` finds issues we fix on this PR via PR-PLAN, never punt to a new
  issue.
- **No worktree migration.** Working in `.claude/worktrees/174/` even though
  `CLAUDE.md` mandates `.codex/worktrees/`. Note in `report.md`; do not move
  mid-flight.
- **No changes to the SHA256 hash in `release/install.sh`.** Confirmed via
  grep that `TBD H1` is no longer present (issue claim is stale; see
  `research.md`).

---

## ② Expected outputs

Reviewer-checkable artefacts (each line maps to a `judge.md` §V section):

### Files added

- `packages/cli/src/commands/try.ts` — top-level `try` command implementation
- `packages/cli/src/commands/__tests__/try.test.ts` — covers 5-case playback
  + `--help` snapshot + non-zero-exit on internal failure
- `docs/plans/2026-05-09-issue-174-newuser-ux-plan.md` (this file)
- `docs/plans/2026-05-09-issue-174-newuser-ux-research.md`
- `docs/plans/issue-174/judge.md` — third-party judge harness md playbook
- `docs/plans/2026-05-09-issue-174-newuser-ux-report.md` (post-implementation)

### Files edited

- `packages/cli/src/bin.ts` — register `try` dispatch; rewrite `doctor
  --fix` help line (#7); update `demo hook` help text to advertise the new
  multi-field separator (#4)
- `packages/cli/src/commands/demo-hook.ts` — `parseDemoHookArgs` accepts
  `;` and `&` as inter-field separators in addition to argv slots; JSON
  short-circuit `teamagent demo hook Write '{"file_path":"a"}'`
- `packages/cli/src/commands/__tests__/demo-hook.test.ts` — new cases for
  semicolon / ampersand / inline-JSON parsing
- `packages/cli/src/commands/init.ts` — `pack-prompt` step skipped when
  `available.length === 0`; replacement single-line notice
- `packages/cli/src/commands/__tests__/init.test.ts` — assert no
  `<!-- teamagent-pack-prompt v1 -->` in stdout when 0 packs
- `packages/cli/src/bin-pre-tool-use.ts` (and sibling `bin-user-prompt-submit.ts`,
  `bin-post-tool-use.ts` if same renderer is shared) — gate `--- raw
  events ---` and `--- hookSpecificOutput ---` blocks behind
  `TEAMAGENT_HOOK_VERBOSE=1`
- `packages/cli/src/bin-pre-tool-use.test.ts` — assert default output omits
  raw blocks; assert env=1 includes them
- `packages/cli/src/commands/bug-report.ts` — append paste-to-issue footer
  when `--stdout`; suppress empty `## Summary` template in stdout mode
- `packages/cli/src/commands/__tests__/bug-report.test.ts` — assert footer
  present in stdout mode and absent in file mode
- `README.md` — confirm line 57 `teamagent demo` reference is consistent
  with CLI; otherwise rewrite to recommend `teamagent try` as the 30-sec
  entry point and demote `demo` to "advanced" section

### Release branch dist artefacts

- `release/README.md` (new) — sync from main `README.md` so visiting
  `https://github.com/libz-renlab-ai/TeamBrain/tree/release` no longer 404s
- `release/install.sh` — reviewed; only edited if a stale `TBD H1` slipped
  back in (currently grep-clean per `research.md`)

### CLI-visible contracts (judge §V will hard-match)

- `pnpm teamagent try --help` returns exit-code 0 and prints lines starting
  with `用法:` / `用例:` (canonical Chinese) plus the 5 fixture names
- `pnpm teamagent try` runs to completion with exit-code 0 and prints
  exactly `[1/5]` … `[5/5]` headers plus the closing `演示完成。` line
- `pnpm teamagent demo hook Write 'file_path=a;content=b'` parses two
  fields (asserted by debug echo or `--json` debug flag) — the JSON branch
  `pnpm teamagent demo hook Write '{"file_path":"a","content":"b"}'`
  parses the same way
- `pnpm teamagent init --dry-run` against an empty pack catalogue contains
  the line `ℹ️  暂无 stack packs 可用` and **does not** contain
  `<!-- teamagent-pack-prompt v1 -->`
- `pnpm teamagent bug-report --stdout` ends with `https://github.com/libz-renlab-ai/TeamBrain/issues/new`
  on its last non-blank line and **does not** contain `## Summary` template
- `pnpm teamagent --help` shows `try` near the top of the demo cluster and
  `doctor --fix` line lists at least three concrete fix categories
- Default hook output (no env) for `npm install moment` ends with the
  confidence line and does **not** contain `--- raw events ---`; with
  `TEAMAGENT_HOOK_VERBOSE=1` set, it does

### PR artefacts

- One non-draft PR opened against `main`
- PR description includes `/export` transcript path from interactive
  `claudefast` tmux run (per `docs/feature-verification.md`)
- POSTPR `/review` loop run at least once; PR merges only on `/review` PASS

### Anti-goals (must NOT change)

- The shape of the `hookSpecificOutput` envelope returned to Claude Code
  (anything Claude Code consumes verbatim)
- Default behaviour of `doctor --fix` (still strips legacy
  `TEAMAGENT:START` blocks etc.)
- Any non-help-text portion of `bin.ts` switch dispatch other than the
  `try` entry
- The `release-meta.json` schema (only `release/README.md` and dist sync)
- Existing `pack` runtime semantics — only the `init` emit branch changes

---

## ③ How-to-verify (third-party judge harness)

> **Hard rule reminder.** *Third-party judge harness forbidden fixed
> scripts; MUST use md playbook.* The full playbook lives at
> `docs/plans/issue-174/judge.md`. Below is the contract of that
> playbook; the playbook itself is the source of truth.

### 3a. Project-wide gate (always required)

`docs/feature-verification.md` `1+2+3` flow runs against the two surfaces
this PR touches that are user-facing CLIs:

1. **`teamagent try --help`** — `claudefast -p` and `codex exec` both run
   it, dump JSON `{cmd, exit_code, stdout, stderr, summary}`, byte-match.
2. **`teamagent demo hook --help`** — same, after the parser update so
   the help text mentions the `;`/JSON multi-field syntax.
3. **Interactive `claudefast` tmux run** — open a fresh tmux pane, run
   `claudefast` interactively, exercise `teamagent try` and an
   intercepting hook (`npm install moment`), end with `/export
   .fastprobe/issue-174-export.md`. Attach the export to the PR.

JSON schema (single shared file `docs/plans/issue-174/cli-canonical.schema.json`):

```json
{
  "cmd": "teamagent try --help",
  "exit_code": 0,
  "stdout_len": 0,
  "stdout_first_line": "...",
  "stdout_has_lines": ["用法:", "[1/5]", "演示完成"],
  "stdout_lacks_lines": [],
  "stderr_len": 0
}
```

`/export` path: `.fastprobe/issue-174-export.md`.

### 3b. Plan-specific judge harness (md playbook)

`docs/plans/issue-174/judge.md` contains the full §V1/§V2/§V3 sections.
Summary of what each section dispatches:

- **§V1 RUN** — for each of the 7 sub-items, the playbook lists the fixed
  tool to invoke (`pnpm vitest run <file>`, `pnpm teamagent <cmd>`, `git
  ls-tree origin/release`) and the `evidence_dir` to capture stdout/stderr
  to. No `.sh` script — the MAIN agent dispatches each item to a TEAMWORK
  worker or `claudefast -p` probe per the playbook's instructions.
- **§V2 DUMP** — each sub-item's worker writes
  `.judge/issue-174/<sub-item>/judge.json` with
  `{exit_code, metrics, evidence_dir, stdout_path, stderr_path}`.
  `metrics` is sub-item-specific (e.g. for #4 parser:
  `{fields_parsed: 2}`; for #5 init: `{pack_prompt_in_stdout: false}`).
- **§V3 READ** — a separate `claudefast -p` is dispatched per sub-item to
  read **only** the raw JSON + evidence files and return PASS/FAIL with a
  one-line reason. The PR author, the executing agent, and the
  code-under-test never grade themselves.

Failed §V<n> sections rerun by re-dispatching the playbook section, not by
editing scripts. If a sub-item's judge keeps flapping, write a PR-PLAN at
`docs/plans/2026-05-09-pr-<n>-fix-plan.md` and fix on the same PR branch.

---

## Quick checklist

```
- [x] plan.md committed under docs/plans/2026-05-09-issue-174-newuser-ux-plan.md
      with task description / expected outputs / judge harness
- [x] research.md (context dump for 7 sub-items, including 2 stale claims)
- [x] expected outputs are reviewer-checkable (files / CLI / metrics / artefacts)
      and include anti-goals
- [x] how-to-verify is `docs/plans/issue-174/judge.md` md playbook —
      third-party judge harness forbidden fixed scripts; MUST use md playbook
- [ ] judge.md drafted (this commit; full §V1/§V2/§V3 in companion file)
- [ ] claudefast probes run before coding:
      (a) -h orient   (b) parallel -p ≤ 8   (c) stream-json audit logs
- [ ] PR opened as a normal PR (not --draft)
- [ ] POSTPR loop scheduled — run `/review` after CI green
- [ ] PR-PLAN ready to be written if review surfaces issues
- [ ] report.md drafted alongside the implementation
```

## See also

- `docs/HOWTO-PLAN-PR.md` — the four-section planning guide (this plan
  follows ①②③④).
- `docs/feature-verification.md` — `1+2+3` gate detail.
- `docs/POSTPR.md` / `docs/PR-PLAN.md` — post-PR loop and fix-on-this-PR
  policy.
- `docs/TEAMWORK.md` — `N+1+(2N)` parallel pattern the judge.md uses.
- `docs/plans/2026-05-09-issue-174-newuser-ux-research.md` — companion
  context dump.
- `docs/plans/issue-174/judge.md` — companion judge harness playbook.
