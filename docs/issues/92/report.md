```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Issue #92 — Report (release/install.sh)                             │
 │                                                                      │
 │   plan ────────► implement ────────► judge harness ────────► report  │
 │                                       all_passed=true        (this)  │
 └──────────────────────────────────────────────────────────────────────┘
```

# Report — Issue #92: release/install.sh

## Status

Implementation complete; PR open. Filled in after PR creation; finalized after Codex POSTPR loop converges.

## Acceptance criteria — issue checklist

- [x] File `release/install.sh` (POSIX sh, not bash-only) exists at the repo root.
- [x] Verifies `node ≥ 22` and `pnpm`/`npm` available; refuses otherwise (exit 10/11/20).
- [x] Runs `npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz` (or `pnpm add -g` fallback).
- [x] Idempotent: re-running upgrades cleanly (npm handles in-place upgrade).
- [x] Single one-liner CTA in README hero region: `curl -fsSL .../release/install.sh | sh && teamagent init` — replaces previous tarball install at `README.md:29`.
- [x] Script includes `set -eu` and prints clear errors with exit codes (10 = node missing, 11 = node too old, 20 = no npm/pnpm, 30 = install failed).
- [x] No domain registration; all URLs on `raw.githubusercontent.com`.
- [x] Verify script `docs/features/install-sh/run-judge.sh` returns exit 0 (six scenarios, `all_passed: true`).
- [ ] `pnpm test` passes — recorded after CI.
- [x] Listed in `docs/PRODUCT-FEATURES.md` as VERIFIED (#60 under "Landing CTA installer (#92)").

## Files added

| Path | LOC | Purpose |
|---|---|---|
| `release/install.sh` | 69 | POSIX sh installer (mode 0755) |
| `docs/features/install-sh/run-judge.sh` | ~210 | Six-scenario judge harness (mode 0755) |
| `docs/issues/92/research.md` | ~120 | Pre-plan exploration findings |
| `docs/issues/92/plan.md` | ~150 | Approved plan (project-tracked copy) |
| `docs/issues/92/report.md` | this file | Completion report |

## Files modified

| Path | Lines touched | Change |
|---|---|---|
| `README.md` | ~25–46 | Replaced install command at line 29 with `curl\|sh`; added exit-code paragraph; preserved tarball form in `<details>` fallback |
| `.github/workflows/release-branch.yml` | added 4 lines after line 32 | `cp release/install.sh /tmp/release-stage/install.sh` + `chmod 0755`; comments explain CTA URL contract |
| `docs/PRODUCT-FEATURES.md` | header + new section after row 59 | Counts 59 → 60; added "Landing CTA installer (#92)" section with row 60 |

## Judge harness verdict (latest run)

```
$ bash docs/features/install-sh/run-judge.sh
=== install.sh judge harness run_id=<utc-stamp>-<pid> ===
all_passed   : true
RESULT: PASS — all scenarios met expectations
```

Per-scenario:
- `syntax`: exit 0
- `node_missing`: exit 10 (matches expected)
- `node_old`: exit 11 (matches expected)
- `node_ok_install`: exit 0; `npm_args_captured = "argv: install -g https://github.com/.../release.tar.gz"`
- `idempotent_rerun`: both runs exit 0
- `dash_portability`: exit 0 under `dash` (POSIX confirmed)

## Atomic commit log (filled at push time)

To be appended after `git log --oneline worktree-issue92`.

## Deviations from plan

None at implementation time. To be filled with anything that surfaces during Codex review (POSTPR loop).

## POSTPR loop

Codex inline review will be fetched via `env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments` after PR opens. Loop continues until silent or 👍.

## Follow-ups

- After merge to `main`, the release-branch workflow runs and publishes `install.sh` to `release` branch root. Verify with:
  ```sh
  gh api repos/libz-renlab-ai/TeamBrain/contents/install.sh?ref=release --jq '.path'
  curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh -n
  ```
- Windows PowerShell installer is explicit out-of-scope; track in a follow-up issue if user demand surfaces.
