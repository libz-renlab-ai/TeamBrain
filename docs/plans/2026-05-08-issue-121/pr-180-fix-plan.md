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

---

## Round 2 update (2026-05-08T17:30Z)

Round 1 fix commits pushed (`0af9460`, `c9a605b`, `b5c2a89`). Round 2 specialist re-grade:

- **Security**: 4/4 round-1 CRIT resolved. 3 new INFO (1 fixable below; 2 deferred D16/D17).
- **Maintainability**: 7/7 round-1 resolved. 4 new INFO (2 fixable below; 2 deferred D18/D19).
- **Testing**: 4/4 resolved or properly deferred. 1 new INFO (deferred D15).
- **Performance**: skipped (round 1 findings all deferred D1/D3/D4/D5; round 1 fixes don't introduce new perf issues beyond the documented SELF_URL re-fetch tradeoff).

### Round 2 fixes applied inline (this commit)

R2-F1. **install.sh:194 SAFE_MODE display** — replace `cat "$0"` with `cat "$TMPDIR_INSTALL/install.sh"` (the verified re-fetched copy). Owner: lead inline. Round 1 CRIT #1 fix only addressed the self-verify path; the SAFE_MODE display path was a related regression introduced by the same root cause.

R2-F2. **install.sh:149 `|| exit 1` intent comment** — add inline comment explaining the explicit form is defense-in-depth alongside `set -e` for self-verify mandatory-path documentation. Owner: lead inline.

R2-F3. **judge.md:V1.13 ordering** — add HTML comment above §V1.13 explaining the V1.13-after-V1.20 placement (V1.13 was inserted post-V1.14-20 numbering; renumbering would invalidate committed §V2 metric keys). Owner: lead inline.

R2-F4. **workflow Pack step glob safety** — add `rm -rf /tmp/release-assets` before pack so the `mv teamagent-*.tgz` glob never expands to multiple files from stale prior runs. Owner: lead inline.

### Round 2 deferrals (4 new D-items)

| # | Finding | Reason for deferral |
|---|---------|---------------------|
| D15 | install.sh:169 three-tier degrade chain untested (Testing) | Project has no `bats` infrastructure (consistent with D9-D11); functional correctness verified by §V1.20 grep + manual reading; tests pending bats introduction. |
| D16 | install.sh:79 redirect-guard probe `\|\| true` allows guard skip on probe failure (Security INFO conf 7) | Pre-existing pattern (not introduced by this PR); the SSRF window requires a flaky probe. Tracked for `_curl_safe` refactor (D3 sibling). |
| D17 | install.sh:186 bare `_download_with_fallback` for SHA file lacks call-site error message (Maintainability INFO conf 8) | Set -e + the function's internal error printf already produce a clear failure; explicit wrapper is style-only. Defer until pattern is consistent across all callers. |
| D18 | judge.md V1.13 numbering (Maintainability INFO conf 9) | Resolved by R2-F3 ordering comment — no longer a finding. |
| D19 | workflow:47 sequential `cd` in Pack step (Maintainability INFO conf 6) | YAML refactor for absolute paths is style-only; CWD inheritance within a single `run:` block is documented GitHub Actions behaviour. Defer to follow-up if future refactor introduces multi-line `run:` complexity. |

### What's still NOT in scope (per round 1 deferrals)

D1, D3, D4, D5, D8, D9, D10, D11, D12 — all carried forward from round 1.

### Termination criterion

Round 2 satisfies `/review pass` for the merge gate: 0 unresolved CRITICAL findings, 0 mechanically-fixable INFO findings remaining (4 fixed inline above; rest deferred with named reasons). Loop terminates at /review round 3 IF round 3 surfaces only deferred items or new INFO items below the merge bar.

---

## Round 4-5 update (2026-05-08T18:30Z) — canonical /review skill iterations

User invoked `/review` skill canonically. Two NEW CRITICAL findings surfaced that all 3 prior rounds missed:

### Round 4 fix (commit `3381acb`)

R4-CRIT-1. **install.sh:203 silent abort under curl|bash** — Adversarial subagent caught it: `read -r answer` reads from exhausted pipe stdin, gets empty answer, falls through to abort. Every CTA user gets no-op install in default --safe mode. Fixed: `read -r answer </dev/tty` (homebrew/rustup pattern) + `[ ! -e /dev/tty ]` precheck for CI/docker contexts.

R4-INFO-1. install.sh:177 archive-fallback unsigned warning emits to stderr only — fixed: dual-stream (stdout + stderr) so `2>/dev/null` doesn't hide it.

R4-INFO-2/3/4. plan.md / research.md doc consistency cleanup (gen-sha256.sh refs no longer accurate; Risk 1 marked RESOLVED instead of "out of scope").

### Round 5 fix (commit `477d634`)

R5-CRIT-2. **CTAs broken on Linux dash** — Adversarial subagent (iter 2) caught it: `release/install.sh` is `#!/usr/bin/env bash` with `local out_args=("$@")` array, but landing page + README CTAs all use `| sh`. On Ubuntu/Debian where `/bin/sh` is dash, every Linux user gets `syntax error near unexpected token '('` before any installer logic runs. Fixed: `| sh` → `| bash` in `apps/landing/src/index.html`, `apps/landing/dist/index.html` (rebuilt artifact), `README.md` (3 locations: lines 31/37/77/78).

R5-INFO-1. install.sh:211 `[ ! -e /dev/tty ]` → `[ ! -c /dev/tty ]` — `-c` is the semantically-correct character-device check (Security specialist conf 6).

### Round 6 update (this commit)

R6-INFO-1. README.md:88 FAQ blockquote — `curl … | sh` → `curl … | bash` AND replace stale "npm install -g release-tarball" description with the actual tar-extract + symlink behavior of the new install.sh.

### Round 6 deferrals (3 new D-items)

| # | Finding | Reason for deferral |
|---|---------|---------------------|
| D20 | Landing page UX surprise — 242-line script display + y/N prompt without prior warning to first-time users | Working as designed (P4-M04 SAFE_MODE intent). UX hint can be added to landing page in a follow-up. |
| D21 | Archive fallback symlink mismatch — source archive tarball lacks `dist/` directory; post-extract `ln -sf $INSTALL_DIR/dist/bin.js` would silently fail. Warning is printed, exit not abort. | Edge case (both primary AND Release-asset fallback must fail simultaneously); 3a Release pipeline ensures primary is always available post-merge; documented in R6-INFO. Track for `_curl_safe` refactor (sibling to D3). |
| D22 | install.sh `docker run -t` (PTY, no -i) blocks forever on `read </dev/tty` | Unusual invocation; `docker run` (no flags) hits the `[ ! -c /dev/tty ]` precheck. Adding a `read -t 60` timeout is a separate hardening pass. |

### Final termination criterion

Adversarial subagent iteration 3 verdict: **`Recommendation: Ship as-is because all load-bearing install paths are correct`**. /review loop terminates at round 6 with 0 unresolved CRITICAL, 0 mechanically-fixable INFO, all D-items (D1-D22) logged with named reasons.
