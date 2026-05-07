```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Issue #92 — Plan (release/install.sh one-line curl|sh installer)    │
 │                                                                      │
 │   main branch                          release branch                │
 │   ┌────────────────┐    workflow      ┌────────────────┐             │
 │   │ release/       │  ─────copy────►  │ install.sh     │ ◄── CTA URL │
 │   │  install.sh    │                  │ dist/*.cjs     │     resolves│
 │   │ (POSIX sh)     │                  │ package.json   │     here    │
 │   └────────────────┘                  └────────────────┘             │
 │           │                                    ▲                     │
 │           ▼                                    │                     │
 │   judge harness                          curl|sh fetches             │
 │   docs/features/install-sh/             then runs:                   │
 │     run-judge.sh ─────► judge.json       1. node ≥22 check           │
 │                                          2. npm/pnpm available       │
 │                                          3. npm install -g <tarball> │
 │                                          4. exit; user runs init     │
 └──────────────────────────────────────────────────────────────────────┘
```

# Plan — Issue #92: release/install.sh

> Approved version of `~/.claude/plans/transient-marinating-blum.md` (plan-mode sandbox), trimmed to project conventions. See [research.md](./research.md) for context.

## 1. Task description

### What

1. **`release/install.sh`** at repo root (POSIX sh, `set -eu`):
   - `node` ≥ 22 (parse `node -v` → major); exit 10 if missing, 11 if too old.
   - `npm` (preferred) or `pnpm` available; exit 20 if neither.
   - `npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`; exit 30 on failure.
   - Re-run safe (idempotent — `npm install -g` upgrades in place; no external state).
   - Does **not** auto-run `teamagent init` (CTA stays `curl|sh && teamagent init` per spec 决策 5).

2. **`docs/features/install-sh/run-judge.sh`** (bash harness, `set -euo pipefail`):
   - Six scenarios: `syntax`, `node_missing`, `node_old`, `node_ok_install`, `idempotent_rerun`, `dash_portability`.
   - Stub PATH dirs with controlled `node`/`npm` binaries; capture install argv to verify tarball URL was actually invoked.
   - Emit `judge.json` at `tmp/.judge/install-sh/<run_id>/judge.json` with fixed schema (mirrors `docs/features/doctor-install/run-judge.sh:280-321`).
   - Exit 0 only if `all_passed: true`.

3. **`.github/workflows/release-branch.yml`** patch:
   - Stage `release/install.sh` to `/tmp/release-stage/install.sh` (mode 0755) before force-push.
   - Single `cp` + `chmod` step inside the existing "Stage release artifacts" block.

4. **`README.md:25-37`** hero update:
   - Replace `npm install -g <tarball>` (line 29) with `curl -fsSL .../release/install.sh | sh`.
   - Add explanatory sub-paragraph (exit codes, source link).
   - Move tarball form into `<details>` fallback block for offline / Windows PowerShell / CI.

5. **`docs/PRODUCT-FEATURES.md`**: increment counts (59 → 60). Add row 60 in `### Landing CTA installer (#92)` section.

6. **`docs/issues/92/{research,plan,report}.md`**: project flow docs per AGENTS.md rule 8/9.

### How (sequenced)

1. ✅ `release/install.sh` (POSIX sh, ≤80 lines, mode 0755).
2. ✅ `docs/features/install-sh/run-judge.sh` (bash harness).
3. ✅ Run judge locally; iterate to `all_passed: true`.
4. ✅ Patch `.github/workflows/release-branch.yml`.
5. ✅ Patch `README.md:25-37`.
6. ✅ Update `docs/PRODUCT-FEATURES.md` (counts + row 60).
7. ✅ Author `docs/issues/92/{research,plan,report}.md`.
8. Run `pnpm test` + `pnpm typecheck`.
9. Atomic commits (≥6) on `worktree-issue92`. Each `Refs #92`.
10. Push branch + open non-draft PR.
11. POSTPR loop: fetch Codex inline review, triage P1/P2, push fixes until silent or 👍.

### Not

- No Windows PowerShell installer (out-of-scope per issue).
- No auto-run of `teamagent init` from install.sh.
- No new domain registration; URLs on `raw.githubusercontent.com`.
- Do not remove tarball install from README — preserved as `<details>` fallback.
- No bash-isms (no `pipefail`, `[[ ]]`, `(( ))`, arrays, `local`, `==`).
- No `canned-answer-snippet.md` (issue AC asks for `run-judge.sh` only).

## 2. Expected outputs

| Artifact | Path | Acceptance |
|---|---|---|
| Installer script | `release/install.sh` | POSIX sh, `set -eu`, `sh -n` clean, ≤80 lines, mode 0755 |
| Judge harness | `docs/features/install-sh/run-judge.sh` | exits 0; `tmp/.judge/install-sh/<run>/judge.json` `all_passed: true` |
| Workflow patch | `.github/workflows/release-branch.yml` | next push to main → release branch carries `install.sh` (mode 0755) |
| README hero | `README.md:25-46` | curl\|sh one-liner replaces line 29; tarball preserved in `<details>` |
| Feature row | `docs/PRODUCT-FEATURES.md` | counts 59 → 60; new row 60 with link to run-judge.sh |
| Project docs | `docs/issues/92/{research,plan,report}.md` | each ≤200 lines, ASCII art header |
| Atomic commits | `git log worktree-issue92` | ≥6 commits, each `Refs #92` |
| PR | non-draft on libz-renlab-ai/TeamBrain | description quotes judge.json + AC checklist |

## 3. Third-party judge harness — JSON-only LLM verdict

> Project rule "不要让代码自己评价自己". Harness writes fixed JSON; downstream LLM judge reads only `judge.json` + raw evidence files; must not trust prose.

### Tool runner (`docs/features/install-sh/run-judge.sh`)

Six scenarios run with `env -i PATH=<stub-dir> /bin/sh release/install.sh`:

| Label | PATH stub | Expected exit | Extra evidence |
|---|---|---|---|
| A `syntax` | host | 0 | `sh -n` only |
| B `node_missing` | sed only | 10 | stderr `node is not on PATH` |
| C `node_old` | sed + stub-node v21 | 11 | stderr `is too old` |
| D `node_ok_install` | sed + stub-node v22 + stub-npm | 0 | `D.npm-args` contains `release.tar.gz` |
| E `idempotent_rerun` | same as D, run twice | 0, 0 | both runs succeed |
| F `dash_portability` | same as D under `dash` | 0 (or skipped) | catches bashism leakage |

### JSON schema → `judge.json`

```json
{
  "run_id": "<utc-stamp>-<pid>",
  "evidence_dir": "tmp/.judge/install-sh/<run_id>",
  "stdout_path": "<run>/stdout.log",
  "scenarios": {
    "syntax":           {"expected_exit": 0,  "actual_exit": <int>, "passed": <bool>},
    "node_missing":     {"expected_exit": 10, "actual_exit": <int>, "passed": <bool>},
    "node_old":         {"expected_exit": 11, "actual_exit": <int>, "passed": <bool>},
    "node_ok_install":  {"expected_exit": 0,  "actual_exit": <int>, "passed": <bool>,
                         "npm_args_captured": "<contents of D.npm-args>"},
    "idempotent_rerun": {"expected_exit_1": 0, "expected_exit_2": 0,
                         "actual_exit_1": <int>, "actual_exit_2": <int>, "passed": <bool>},
    "dash_portability": {"expected_exit": 0, "actual_exit": <int|"skipped">, "passed": <bool>}
  },
  "all_passed": <bool>
}
```

### What downstream LLM judge reads

- `tmp/.judge/install-sh/<run_id>/judge.json` (verdict source)
- `*.stdout` / `*.stderr` (raw evidence)
- `D.npm-args` / `E.npm-args` (proof npm was invoked with tarball URL)

Judge LLM verifies `all_passed=true` AND `npm_args_captured` contains literal `archive/refs/heads/release.tar.gz`.

### Verification command set

```sh
pnpm install
pnpm test
pnpm typecheck
bash docs/features/install-sh/run-judge.sh
# inspect: tmp/.judge/install-sh/*/judge.json → all_passed: true
sh -n release/install.sh

# Post-merge (release branch propagated)
gh api repos/libz-renlab-ai/TeamBrain/contents/install.sh?ref=release --jq '.path'
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh -n
```

## Risks & mitigations

- Workflow patch — single `cp + chmod` line in existing staging block; worst case is install.sh missing on release branch (CTA broken), other artifacts unaffected.
- POSIX portability — judge scenario F runs script under `dash` to catch bashism leakage.
- Idempotency — install.sh writes no external state; re-run is `npm install -g <same-tarball>`.
- CDN lag — post-merge live URL verified via `curl ... | sh -n` after release-branch workflow finishes.
