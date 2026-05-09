```text
        ┌──────────────────────────────────────────────────────────┐
        │  ISSUE 174 — JUDGE HARNESS (md playbook, NOT bash)       │
        │                                                          │
        │  §V1 RUN   fixed tools per sub-item                      │
        │  §V2 DUMP  .judge/issue-174/<n>/judge.json               │
        │  §V3 READ  separate claudefast -p reads raw JSON only    │
        │                                                          │
        │  + §Pre-flight: 3 ambiguity probes before coding         │
        │  + §Project-gate: 1+2+3 hard-match for try/demo-hook -h  │
        └──────────────────────────────────────────────────────────┘
```

# Issue 174 — Judge Harness Playbook

> **Hard rule (`docs/HOWTO-PLAN-PR.md` § 3b)**: Third-party judge harness
> forbidden fixed scripts; MUST use md playbook. The MAIN agent dispatches
> sections of this file via TEAMWORK subagents (`N+1+(2N)`) or
> `claudefast -p` probes (FASTPROBE max 8 parallel). Failed §V<n>
> sections rerun by re-dispatching, **not** by editing scripts.

The PR author / executing agent / code-under-test never grade themselves.
§V3 READ runs in a fresh `claudefast -p` that has access only to
`.judge/issue-174/<n>/judge.json` and the listed evidence files.

## §Pre-flight — resolve ambiguities BEFORE coding

These are the three open questions in `research.md`. Each spawns one
`claudefast -p` probe (≤ 8 parallel). Probes write
`.fastprobe/issue-174-<probe>.log`.

### P1. Should `try` replace `demo` as the headline 30-sec entry?

```
!claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue-174-p1.debug.log \
  --permission-mode acceptEdits \
  "Read README.md and packages/cli/src/bin.ts. Issue 174 #2 proposes a new \`teamagent try\` command that plays 5 fixture cases. The repo already has top-level \`teamagent demo\` (bin.ts:350-371). Recommend: should the new \`try\` REPLACE \`demo\` as the headline 30-sec entry in README + --help, or be a sibling 'batch mode'? Pick one. Cite README and bin.ts line numbers. Output 5 bullets max."
```

Decision goes into `report.md`. Default if probe inconclusive: keep
`demo` as headline, add `try` as sibling.

### P2. Is `TEAMAGENT_HOOK_VERBOSE` env var name conflict-free?

```
!claudefast -p \
  --permission-mode acceptEdits \
  "Run \`grep -rn 'TEAMAGENT_HOOK' packages/\` and report whether the env var name TEAMAGENT_HOOK_VERBOSE is already used. If it is, propose an alternative (TEAMAGENT_HOOK_RAW_EVENTS=1 or similar). Output 3 bullets max."
```

Default: if free, use `TEAMAGENT_HOOK_VERBOSE=1`. If taken, fall back to
`TEAMAGENT_HOOK_RAW_EVENTS=1`.

### P3. Does release-meta automation already sync README into release?

```
!claudefast -p \
  --permission-mode acceptEdits \
  "Inspect release/release-meta.json, .github/workflows/release-*.yml, and any scripts in scripts/release/ or release/. Does any existing automation sync README.md from main into the release branch? Answer yes/no with file:line evidence. Output 4 bullets max."
```

Default: if no automation, do a one-off `git checkout main -- README.md`
on the release branch in this PR. If automation exists, just kick it.

## §Project-gate — 1+2+3 hard-match

`docs/feature-verification.md` flow. Two CLI surfaces this PR touches must
emit byte-identical canonical JSON between `claudefast` and `codex exec`.

### Surface A: `pnpm teamagent try --help`

```
!claudefast -p --permission-mode acceptEdits \
  "Run \`pnpm teamagent try --help\` and emit canonical JSON: {\"cmd\":\"teamagent try --help\",\"exit_code\":<n>,\"stdout_first_line\":\"...\",\"stdout_has_lines\":[\"用法:\",\"[1/5]\",\"演示完成\"],\"stdout_lacks_lines\":[\"--- raw events ---\"],\"stderr_len\":<n>}"

!codex exec --skip-git-repo-check -s read-only \
  "Run \`pnpm teamagent try --help\` and emit the same canonical JSON shape as above (same keys, same order)."
```

Hard-match:

```
diff -u \
  <(jq -S . .judge/issue-174/gateA-claudefast.json) \
  <(jq -S . .judge/issue-174/gateA-codex.json)
# expect: empty diff
```

### Surface B: `pnpm teamagent demo hook --help`

Same shape, `cmd` = `teamagent demo hook --help`, `stdout_has_lines`
includes the new multi-field syntax mention (e.g. `;`, `&`, `JSON`).

### Surface C: interactive tmux export

```
tmux new -d -s issue-174 'claudefast'
tmux send-keys -t issue-174 'pnpm teamagent try' Enter
tmux send-keys -t issue-174 'pnpm teamagent demo hook Bash command="npm install moment"' Enter
tmux send-keys -t issue-174 '/export .fastprobe/issue-174-export.md' Enter
```

Attach `.fastprobe/issue-174-export.md` to PR description.

## §V1 RUN — per-sub-item fixed tools

Each sub-item has its own §V section. Section name = `§V1.<n>`. The MAIN
agent dispatches each `§V1.<n>` to a TEAMWORK worker; the worker runs the
listed tool, captures `stdout` / `stderr` / `exit_code` to
`.judge/issue-174/<n>/`, then writes `judge.json` (see §V2).

### §V1.1 — Release branch README + dist sync

Tools:
```
git fetch origin release
git ls-tree origin/release -- README.md      # expect: a tree entry exists
gh api 'repos/libz-renlab-ai/TeamBrain/contents/README.md?ref=release'  # expect: 200, not 404
grep -n "TBD\|placeholder" release/install.sh  # expect: no output
```

Evidence: `.judge/issue-174/1/release-readme.txt`,
`.judge/issue-174/1/install-sh-grep.txt`.

### §V1.2 — `teamagent try` command

Tools:
```
pnpm vitest run packages/cli/src/commands/__tests__/try.test.ts
pnpm teamagent try --help
pnpm teamagent try     # full 5-case run, exit 0
```

Evidence: `.judge/issue-174/2/vitest.txt`,
`.judge/issue-174/2/try-help.txt`, `.judge/issue-174/2/try-run.txt`.

### §V1.3 — Hook output `--- raw events ---` gating

Tools:
```
# Default: no raw block
pnpm teamagent demo hook Bash 'command=npm install moment' | tee .judge/issue-174/3/default.txt

# Verbose env: raw block present
TEAMAGENT_HOOK_VERBOSE=1 pnpm teamagent demo hook Bash 'command=npm install moment' \
  | tee .judge/issue-174/3/verbose.txt

pnpm vitest run packages/cli/src/__tests__/bin-pre-tool-use.test.ts
```

Evidence: `.judge/issue-174/3/default.txt` (must NOT contain `--- raw events ---`),
`.judge/issue-174/3/verbose.txt` (must contain it).

### §V1.4 — `demo hook Write` parser fix

Tools:
```
# Existing space-separated must still work
pnpm teamagent demo hook Write file_path=test.js content='console.log(1)'

# New ; separator
pnpm teamagent demo hook Write 'file_path=test.js;content=console.log(1)'

# New & separator
pnpm teamagent demo hook Write 'file_path=test.js&content=console.log(1)'

# JSON form
pnpm teamagent demo hook Write '{"file_path":"test.js","content":"console.log(1)"}'

pnpm vitest run packages/cli/src/commands/__tests__/demo-hook.test.ts
```

Evidence: `.judge/issue-174/4/{space,semi,amp,json}.txt`,
`.judge/issue-174/4/vitest.txt`. All four invocations must show
`fields_parsed >= 2` (visible in debug output) — judge §V3.4 reads the
metric.

### §V1.5 — `init` 0-pack pack-prompt skip

Tools:
```
# Use a temp dir with no installed packs
TMP_PROJ=$(mktemp -d)
cd "$TMP_PROJ" && pnpm teamagent init --dry-run > .judge/issue-174/5/init-stdout.txt
cd - && pnpm vitest run packages/cli/src/commands/__tests__/init.test.ts
```

Evidence: `.judge/issue-174/5/init-stdout.txt` (must contain `暂无 stack
packs 可用` and must NOT contain `<!-- teamagent-pack-prompt v1 -->`),
`.judge/issue-174/5/vitest.txt`.

### §V1.6 — `bug-report --stdout` footer + summary suppression

Tools:
```
pnpm teamagent bug-report --stdout > .judge/issue-174/6/stdout.txt
pnpm teamagent bug-report --out=.judge/issue-174/6/file-mode.md
pnpm vitest run packages/cli/src/commands/__tests__/bug-report.test.ts
```

Evidence: `.judge/issue-174/6/stdout.txt` last non-blank line contains
`https://github.com/libz-renlab-ai/TeamBrain/issues/new`; does NOT
contain `## Summary`. File-mode output `.judge/issue-174/6/file-mode.md`
DOES contain `## Summary` (template), and does NOT contain the footer
URL block (file is attached, not pasted).

### §V1.7 — `doctor --fix` help text rewrite

Tools:
```
pnpm teamagent --help | grep -A6 'teamagent doctor' > .judge/issue-174/7/help.txt
```

Evidence: `.judge/issue-174/7/help.txt` must list at least 3 concrete fix
categories (e.g., "TEAMAGENT:START 块剥离", "hook 路径刷新", "skill
残留清理") and mention `~/.teamagent/backups/` + `--dry-run`. Must NOT
contain "能自动修的问题" (the circular phrase).

## §V2 DUMP — canonical JSON schema

Each §V1.<n> worker writes `.judge/issue-174/<n>/judge.json` with this
shape:

```json
{
  "sub_item": 1,
  "title": "release branch README + dist sync",
  "exit_code": 0,
  "metrics": { },
  "evidence_dir": ".judge/issue-174/1/",
  "stdout_path": ".judge/issue-174/1/release-readme.txt",
  "stderr_path": ".judge/issue-174/1/release-readme.err.txt"
}
```

Per-sub-item `metrics` shape:

| Sub | metrics |
|-----|---------|
| 1   | `{ "release_readme_exists": bool, "install_sh_clean": bool }` |
| 2   | `{ "vitest_pass": bool, "try_help_exit": int, "try_run_exit": int, "fixture_count": int }` |
| 3   | `{ "default_has_raw_block": bool, "verbose_has_raw_block": bool, "vitest_pass": bool }` |
| 4   | `{ "space_fields": int, "semi_fields": int, "amp_fields": int, "json_fields": int, "vitest_pass": bool }` |
| 5   | `{ "stdout_has_pack_prompt_block": bool, "stdout_has_no_packs_notice": bool, "vitest_pass": bool }` |
| 6   | `{ "stdout_has_footer_url": bool, "stdout_has_summary_template": bool, "file_has_footer_url": bool, "file_has_summary_template": bool, "vitest_pass": bool }` |
| 7   | `{ "help_lacks_circular_phrase": bool, "help_has_categories_count": int, "help_mentions_backups": bool, "help_mentions_dry_run": bool }` |

The aggregate file `.judge/issue-174/summary.json` is produced by the
MAIN agent after all 7 workers finish:

```json
{
  "run_id": "issue-174-<timestamp>",
  "git_sha": "...",
  "items": [ /* 7 entries, one per sub */ ],
  "all_pass": false,
  "failing_items": [3, 6]
}
```

## §V3 READ — judges grade from raw JSON only

Each sub-item has its own judge probe. The probe receives the JSON +
evidence file paths and must NOT see the source diff or run any test
itself. PASS/FAIL plus one-line reason.

### §V3.1 — release branch + install.sh judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/1/judge.json and the evidence files referenced. \
   Output ONE LINE: 'PASS — <reason>' or 'FAIL — <reason>'. \
   PASS criteria: metrics.release_readme_exists==true AND metrics.install_sh_clean==true. \
   You may NOT read source files or run commands."
```

### §V3.2 — `try` command judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/2/judge.json and evidence_dir contents. \
   PASS criteria: vitest_pass==true AND try_help_exit==0 AND try_run_exit==0 \
   AND fixture_count==5. Output one line PASS/FAIL with reason."
```

### §V3.3 — hook verbose gate judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/3/judge.json. \
   PASS criteria: default_has_raw_block==false AND verbose_has_raw_block==true \
   AND vitest_pass==true. Output one line PASS/FAIL with reason."
```

### §V3.4 — demo hook parser judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/4/judge.json. \
   PASS criteria: all of {space_fields, semi_fields, amp_fields, json_fields} \
   >= 2 AND vitest_pass==true. Output one line PASS/FAIL with reason."
```

### §V3.5 — init pack-prompt skip judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/5/judge.json. \
   PASS criteria: stdout_has_pack_prompt_block==false \
   AND stdout_has_no_packs_notice==true AND vitest_pass==true. \
   Output one line PASS/FAIL with reason."
```

### §V3.6 — bug-report stdout footer judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/6/judge.json. \
   PASS criteria: stdout_has_footer_url==true AND stdout_has_summary_template==false \
   AND file_has_summary_template==true AND file_has_footer_url==false \
   AND vitest_pass==true. Output one line PASS/FAIL with reason."
```

### §V3.7 — doctor --fix help judge

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/7/judge.json. \
   PASS criteria: help_lacks_circular_phrase==true \
   AND help_has_categories_count >= 3 \
   AND help_mentions_backups==true AND help_mentions_dry_run==true. \
   Output one line PASS/FAIL with reason."
```

### §V3.summary — aggregate

```
!claudefast -p --permission-mode acceptEdits \
  "Read .judge/issue-174/summary.json. \
   If all_pass==true output 'PR READY'. Otherwise output \
   'PR BLOCKED — failing items: <list>' so the MAIN agent knows which §V1.<n> \
   to re-dispatch. You may NOT read other files."
```

## Re-dispatch policy

If §V3.<n> returns FAIL:
1. Re-dispatch §V1.<n> after the implementing agent pushes a fix commit.
2. The judge reads the *new* `judge.json` and grades again.
3. After 2 consecutive FAILs on the same §V<n>, write a PR-PLAN at
   `docs/plans/2026-05-09-pr-<N>-fix-plan.md` (per `docs/PR-PLAN.md`)
   and switch to TEAMWORK `N+1+(2N)` for that one sub-item.
4. Never edit this `judge.md` to make the test pass; if the contract is
   wrong, write a follow-up commit that updates the plan + judge together
   and re-run.

## Storage layout

```
.judge/issue-174/
├── summary.json
├── 1/
│   ├── judge.json
│   ├── release-readme.txt
│   ├── release-readme.err.txt
│   └── install-sh-grep.txt
├── 2/
│   ├── judge.json
│   ├── vitest.txt
│   ├── try-help.txt
│   └── try-run.txt
├── 3/  4/  5/  6/  7/  …
└── gate{A,B,C}-{claudefast,codex}.json
```

The whole `.judge/` tree is gitignored (existing root `.gitignore` rule);
evidence is kept locally for the PR run, judge JSONs are re-emitted on
each §V re-dispatch.

## See also

- `docs/HOWTO-PLAN-PR.md` — § 3b for why the harness is md not bash.
- `docs/feature-verification.md` — `1+2+3` gate detail.
- `docs/FASTPROBE.md` — full claudefast probe recipe (used by all
  §V probes above).
- `docs/POSTPR.md` — post-PR `/review` loop.
- `docs/TEAMWORK.md` — `N+1+(2N)` parallel pattern for re-dispatch.
- `docs/plans/2026-05-09-issue-174-newuser-ux-plan.md` — the plan.
- `docs/plans/2026-05-09-issue-174-newuser-ux-research.md` — context dump.
