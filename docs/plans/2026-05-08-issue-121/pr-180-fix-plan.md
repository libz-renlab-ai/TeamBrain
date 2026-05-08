```text
                  PR-180 fix-plan — /review findings
                  ===================================

   Round 1                Round 2 (this plan)         Round 3
   ━━━━━━━                ━━━━━━━━━━━━━━━━━━━         ━━━━━━━
   Plan + judge           PR-PLAN (per                /review re-run
   3 workers              docs/PR-PLAN.md)            on same PR
   Reporter SOFT-PASS     Workers A v3 / B v2 /       Until /review
   Commit + PR open ──►   C v2 dispatched ──►         PASS + Codex 👍
   /review fired                                      (or hard-stop)
        │                       │                          │
        ▼                       ▼                          ▼
   24 findings               4 critical fixed           verify-loop
   (4 CRIT + 20 INFO)        + 6 mechanical fixed       continues
                             + 14 deferred              indefinitely
                             with named reasons         (POSTPR loop)
```

# PR-180 Fix Plan — /review POSTPR round 1

> **Strict shape per `docs/PR-PLAN.md`** — three sections only: ① task description, ② expected outputs, ③ judge harness (md playbook delta).
> Hard rule: third-party judge harness forbidden fixed scripts; MUST use md playbook. We extend the existing `docs/plans/2026-05-08-issue-121/judge.md` with new V1 steps; no `.sh` script created.

## ① Task description

`/review` (POSTPR round 1, run 2026-05-08T17:00Z, 4 specialists dispatched: testing, maintainability, security, performance) returned 4 CRITICAL findings + 20 INFORMATIONAL findings against PR #180. Worker A v3 + Worker B v2 + Worker C v2 fix the 4 CRITICAL items + 6 high-yield mechanical items in this same PR; the remaining 14 informational items are deferred with named reasons (Open questions table at bottom).

### Critical fixes (4)

Anchored to specialist findings — file:line + reviewer comment cited.

1. **install.sh:152 — self-verify broken in `curl|bash` mode** (Security, confidence 9)
   `cp "$0" "$TMPDIR/install.sh"` copies `/bin/bash` (the interpreter) when the script is piped to bash, NOT the script content. The subsequent SHA-256 self-verify always fails → exit 1 → primary advertised install method (`curl ... | bash`) is broken for every user. **Fix**: replace `cp "$0"` with `_curl_safe "$SELF_URL" -o "$TMPDIR/install.sh"` — re-download install.sh from the SHA-anchored URL, then verify. The previously-unused `SELF_URL` variable becomes the source. Owner: Worker B v2.

2. **workflow:56 — sed RCE via package.json version field** (Security, confidence 9)
   `VERSION=$(jq -r .version packages/teamagent/package.json)` is interpolated into a `sed` command via `${{ steps.version.outputs.tag }}`. If a malicious commit lands a `"version": "1.0.0|e;id>/tmp/pwned"` in package.json, GNU sed's `e` flag (Ubuntu runner default) executes the replacement string as a shell command. Defense in depth: even if package.json is repo-controlled, a `|` character also breaks the sed delimiter. **Fix**: validate `VERSION` matches `^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$` before any use; abort the job on mismatch. Owner: Worker A v3.

3. **workflow:30 — GITHUB_OUTPUT newline injection** (Security, confidence 8)
   `echo "tag=v${VERSION}" >> "$GITHUB_OUTPUT"` — if VERSION contains a newline (jq -r interprets `\n` JSON escapes as literal newlines), a second line `SECRET_OVERRIDE=evil` could be smuggled into GITHUB_OUTPUT, polluting other step outputs. **Fix**: validate VERSION is single-line (semver regex from finding 2 already covers this) AND use `printf 'tag=v%s\n' "$VERSION"` instead of `echo`. Owner: Worker A v3 (combined with finding 2).

4. **install.sh:168 — archive fallback dead code** (Maintainability + Security + Performance + Testing — 4-way confirmed, confidence 9)
   `_download_with_fallback` calls `exit 1` on failure; the subsequent `if [ ! -s "$TMPDIR_INSTALL/$TARBALL_NAME" ]` guard is unreachable because the process has already terminated. The advertised "3-tier fallback chain" (Release asset → Release fallback → archive) collapses to "2-tier or die" and the SKIP_TARBALL_SHA branch never executes. **Fix**: change `_download_with_fallback` to `return 1` instead of `exit 1`; let callers test `$?`. The archive-fallback `[ ! -s ]` block then becomes reachable. Owner: Worker B v2.

### Mechanical fixes (6)

5. **install.sh:144 — `SELF_URL` unused variable** (Maintainability) — Worker B v2's fix #1 above starts USING `SELF_URL`; this finding resolves automatically.

6. **install.sh:43 — dry-run label alignment off-by-one** (Maintainability, INFO confidence 7) — `[dry-run] archive fallback : %s` is 27 chars before the colon vs 28 for the other 4 lines. Add one space. Owner: Worker B v2.

7. **install.sh:69 — redirect-guard regex `.` unescaped** (Security, INFO confidence 8) — `raw.githubusercontent.com|github.com|objects.githubusercontent.com` — bare `.` matches any char in `grep -E`. An attacker registering `githubXcom` could bypass. Owner: Worker B v2: escape to `raw\.githubusercontent\.com|github\.com|objects\.githubusercontent\.com`.

8. **install-legacy.sh:3 — stale comment URL** (Maintainability, INFO confidence 6) — header still reads `Run: curl -fsSL .../release/install.sh | sh`. After this PR, `release/install.sh` is the new P4 bash; users following the legacy file's comment URL get the bash script. Owner: Worker B v2: change comment to `Run: curl -fsSL .../release/install-legacy.sh | sh`.

9. **workflow:83 — release notes advertise raw pipe-to-bash** (Maintainability, INFO confidence 7) — contradicts P4-M04's `SAFE_MODE=1` default which deliberately discourages pipe-to-sh. Owner: Worker A v3: change to `Install: download install.sh and run it locally; see README for safe-mode instructions`.

10. **judge.md §V1.3 + §V1.13 — `INSTALL_DRY_RUN=1` env var prefix is a no-op** (Maintainability, CRIT confidence 9 — counted as mechanical because it's just a doc fix). install.sh only honours `--dry-run` arg; the env var is unread. Owner: Worker C v2.

### Deferred (14 informational items)

Each is logged here so future reviewers know they were SEEN, not missed. Per `docs/PR-PLAN.md`: P3 deferral may proceed with a named reason; P1/P2 may not.

| # | Finding | Reason for deferral |
|---|---------|---------------------|
| D1 | install.sh:9 TARBALL_BASE = FALLBACK_BASE redundancy (Maintainability + Performance + Testing) | Design issue — true CDN/mirror diversification is a separate concern. Track in follow-up issue. |
| D2 | install.sh:74 magic number `--max-redirs 3` (Maintainability) | Acceptable; comment-only fix would rot per checklist suppression rule. |
| D3 | install.sh:71-74 two-curl pattern (Security TOCTOU + Performance ~0.75-1.5s + Maintainability DRY) | Refactor of `_curl_safe` is a bigger change; warrants its own design discussion. |
| D4 | workflow:23 no pnpm cache (Performance) | Workflow optimization; not in this PR's scope (release publish, not CI speed). |
| D5 | workflow:77 TOCTOU between `gh release view` + `gh release create` (Security + Performance) | Concurrent push race; rare; consequence is workflow failure (visible), not silent corruption. Documented limit. |
| D6 | workflow:100 GH_TOKEN in git remote URL (Security) | Pre-existing pattern, not introduced by this PR. |
| D7 | install.sh:185 SAFE_MODE `cat "$0"` broken in pipe (Security) | Same root cause as critical fix #1; the SELF_URL re-download approach in fix #1 fixes both self-verify AND safe-mode review. |
| D8 | sed regex doesn't anchor end-of-token (Testing — pre-release version like `v0.10.1-rc1` corrupted) | Worker A v3's semver regex (CRIT fix #2) restricts version to no-prerelease semver for now; pre-release support is out-of-scope. |
| D9 | bats test for archive fallback reachability (Testing) | Project has no bats infrastructure; introducing bats is a separate concern. Worker B v2's `return 1` fix makes the path reachable; a future bats suite can verify behaviour. |
| D10 | bats test for TARBALL_PRIMARY ≠ TARBALL_FALLBACK (Testing) | Same as D9. |
| D11 | bats test for self-verify in pipe-to-bash mode (Testing) | Same as D9. CRIT fix #1 makes the pipe-to-bash path correct. |
| D12 | vitest test for sed pre-release version handling (Testing) | Worker A v3's semver guard rejects pre-release versions, making this test a future concern when pre-release support lands. |
| D13 | install.sh self-verify bug pre-existed in install.sh.draft from #84 (Research note in research.md §5 Risk 1) | RESOLVED by CRIT fix #1 — moved from "out-of-scope" to "fixed in this PR". |
| D14 | Cross-LLM judge §V3.2 (codex) INCONCLUSIVE due to local auth (Run-time issue) | Environmental, not code. Reporter v2 will run §V3.1 only and document the known V3.2 gap. |

### What we're explicitly NOT doing in this iteration

- No `bats` test suite added (D9-D11 above).
- No CDN diversification (D1).
- No pnpm cache (D4).
- No `_curl_safe` refactor (D3).
- No pre-release version support (D8/D12).

## ② Expected outputs

A reviewer (human or `/review`) can check off each line below.

### Files edited

| Path | Change | ∆ |
|------|--------|---|
| `release/install.sh` | CRIT fix #1 (SELF_URL re-download), CRIT fix #4 (return-not-exit), INFO fixes #6/#7 (alignment + regex escape) | ~-10 / +15 |
| `release-prep/install.sh.draft` | Mirror of `release/install.sh` changes (source-of-truth) | same as above |
| `release-prep/install.sh.draft.sha256` | Regenerate after .draft edits | -1 / +1 |
| `release/install.sh.sha256` | Regenerate after install.sh edits | -1 / +1 |
| `release/install-legacy.sh` | INFO fix #8 (comment URL update) | -1 / +1 |
| `.github/workflows/release-branch.yml` | CRIT fixes #2/#3 (semver guard + printf), INFO fix #9 (release notes) | ~+12 / -3 |
| `docs/plans/2026-05-08-issue-121/judge.md` | CRIT fix #10 (strip INSTALL_DRY_RUN env prefix), add §V1.18 semver-guard verify | ~+15 / -2 |
| `docs/plans/2026-05-08-issue-121/pr-180-fix-plan.md` | This file (NEW) | +260 |

### CLI / contract checks (re-run §V1 affected steps)

After Workers land, lead re-runs:
- §V1.1 install.sh `bash -n` — must remain PASS (exit 0)
- §V1.3 dry-run line count — must remain 7 (alignment fix doesn't add lines)
- §V1.5 `shasum -a 256 -c install.sh.sha256` — must PASS after Worker B's regen
- §V1.7 redirect guard count — must remain ≥ 1 (regex now escaped)
- §V1.8 fallback chain count — must remain ≥ 5 (archive line still present)
- §V1.10 workflow stages — must remain all ≥ 1
- §V1.14 workflow version-detect + Release-creation — must remain all ≥ 1
- §V1.15 workflow uploads assets — must remain both ≥ 1
- §V1.17 workflow templates install.sh + sha256 regen — must remain both ≥ 1

New §V1.18: `grep -cE 'VERSION =~|grep.*\^\[0-9\]\\\.\[0-9\]' .github/workflows/release-branch.yml` ≥ 1 — semver-guard regex present.
New §V1.19: `grep -c "_curl_safe.*SELF_URL" release/install.sh` ≥ 1 — SELF_URL is now USED, not just declared.
New §V1.20: `grep -c "return 1" release/install.sh` ≥ 1 inside `_download_with_fallback` — fallback returns instead of exits.

### PR artefacts (gate merge)

- 1+ new commit on `worktree-issue121` branch with message `fix(issue-121): /review POSTPR round 1 — N findings (M CRIT + K INFO)` (squash merge later collapses).
- `/review` round 2 on the latest commit: PASS (or down to ≤ 2 INFO confidence < 7).
- CI green (Step 8 acceptance criteria).

### Anti-goals

- No new files outside the 8 listed above.
- No changes to packages/* (unrelated to install/release pipeline).
- No deletion of the legacy POSIX installer.
- No reduction of P4 mitigations — only strengthening.

## ③ Judge harness (md playbook delta)

The existing `docs/plans/2026-05-08-issue-121/judge.md` md playbook is extended by Worker C v2 with three new V1 steps:

- **§V1.18** — workflow has semver guard for VERSION:
  ```bash
  grep -cE 'VERSION =~|grep.*\^\[0-9\]\.\[0-9\]\.\[0-9\]' .github/workflows/release-branch.yml \
    > "${EVIDENCE_DIR}/v1.18.out"
  ```
  PASS if value ≥ 1.

- **§V1.19** — install.sh re-downloads itself (uses SELF_URL):
  ```bash
  grep -c "_curl_safe.*SELF_URL" release/install.sh \
    > "${EVIDENCE_DIR}/v1.19.out"
  ```
  PASS if value ≥ 1.

- **§V1.20** — `_download_with_fallback` returns instead of exits:
  ```bash
  awk '/^_download_with_fallback\(\)/{flag=1} /^}/{if(flag){flag=0}} flag && /return 1/' \
    release/install.sh \
    | wc -l > "${EVIDENCE_DIR}/v1.20.out"
  ```
  PASS if value ≥ 1 (at least one `return 1` inside the function body).

The §V3.1 prompt is updated to include criterion 9 ("Critical /review findings from POSTPR round 1 fixed; specialist re-grade returns no CRITICAL"). Reporter v2 verifies via independent re-check of the 4 CRIT findings.

§V3.2 codex remains INCONCLUSIVE (auth broken on this machine; environmental).

## TEAMWORK execution

After this plan is committed, lead spawns:

| Worker | Slice | Files |
|--------|-------|-------|
| **A v3** | Workflow fixes (CRIT #2, CRIT #3, INFO #9) | `.github/workflows/release-branch.yml` |
| **B v2** | Installer fixes (CRIT #1, CRIT #4, INFO #6, #7, #8) | `release/install.sh`, `release-prep/install.sh.draft`, `release-prep/install.sh.draft.sha256`, `release/install.sh.sha256`, `release/install-legacy.sh` |
| **C v2** | judge.md cleanup (CRIT #10) + add §V1.18/19/20 | `docs/plans/2026-05-08-issue-121/judge.md` |

Each runs 2 claudefast probes after edit. Reporter v2 (opus 1M) consolidates + re-runs §V1.1/3/5/7/8/10/14-20 + spawns §V3.1 to grade fixes against /review CRIT findings.

On Reporter PASS, lead pushes commits to same `worktree-issue121` branch (NOT a new branch). `/review` round 2 fires; loop until PASS.
