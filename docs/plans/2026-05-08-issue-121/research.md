```text
                   research.md — issue #121 context dump
                   =====================================

   release/install.sh        release-prep/install.sh.draft
   ┌────────────┐           ┌────────────────────────┐
   │ POSIX sh   │           │ bash (P4 hardened)     │
   │ 106 lines  │   ───►    │ 199 lines              │
   │ archive    │   becomes │ Release asset + sha256 │
   │ tarball    │           │ + fallback chain       │
   └────────────┘           └────────────────────────┘
                          (Worker B copies)
                                  │
                                  ▼
                        Worker A workflow stages it,
                        creates Release tag, uploads assets
```

# Research — Issue #121 Context Dump

Source of truth: worktree at `/Users/m1/projects/TeamBrain/.claude/worktrees/issue121/`

---

## 1. P4 Mitigation Map

Source: `release-prep/install-sh-checklist.md` — § "P4 Must-Have Items → install.sh.draft Sections"

| Item ID | Mitigation Description | install.sh.draft Location | Acceptance Probe |
|---------|----------------------|--------------------------|-----------------|
| P4-M01 | URL 版本化（含 tag/SHA），禁止 release/latest 浮动标签 | `TEAMAGENT_VERSION` var + `PRIMARY_BASE/TARBALL_BASE` URL construction (lines 7–11) | `grep 'TEAMAGENT_VERSION' install.sh.draft \| grep -v 'latest'` |
| P4-M02 | 提供 SHA-256 校验和文件，执行前校验（install.sh + install.sh.sha256 双文件） | `_verify_sha256()` fn + Step 1 (self-verify) + Step 2 (tarball verify) (lines 121–133) | `INSTALL_DRY_RUN=1 bash install.sh.draft --dry-run` prints "SHA-256 verified: yes"; `bash -n install.sh.draft` |
| P4-M03 | curl 显式指定 CA bundle / TLS，禁止静默 TLS 降级 | `_curl_safe()` fn: `--tlsv1.2 --proto '=https'` flags (lines 70–71) | `grep -E '\-\-tlsv1\.2\|\-\-proto' install.sh.draft` |
| P4-M04 | 默认两步执行（download + execute），禁止默认 pipe \| sh | `SAFE_MODE=1` default + Step 3 review prompt in `_safe_mode` block (lines 13, 185–196) | `bash install.sh.draft --dry-run` exits without executing; `echo N \| bash install.sh.draft` aborts |
| P4-M05 | install.sh 内置 redirect URL 域名检查，防止 redirect 到外部恶意域 | `_curl_safe()` redirect guard: `allowed_hosts` regex + host check (lines 67–86) | `grep 'allowed_hosts' install.sh.draft` confirms domain allowlist |
| P4-M06 | 提供至少一个 fallback 下载端点（Release asset 直链或 CDN 镜像） | `_download_with_fallback()` fn: PRIMARY + FALLBACK args; archive degrade via `ARCHIVE_FALLBACK_URL` (lines 99–177) | `grep 'FALLBACK_BASE' install.sh.draft \| wc -l` ≥ 5 |
| P4-M07 | install.sh 支持 --dry-run / --verify / --no-run 模式，用户可先查看 | Argument parsing section: `--dry-run`, `--verify`, `--no-run` aliases → `DRY_RUN=1` gate (lines 18–34, 37–45) | `bash install.sh.draft --dry-run` exits 0 with "[dry-run]" prefix output only |

---

## 2. Current install.sh vs Draft — Diff Summary

Files compared:
- `release/install.sh` — current bot-published script (106 lines)
- `release-prep/install.sh.draft` — the new P4 source (199 lines)

| Dimension | `release/install.sh` (current) | `release-prep/install.sh.draft` (new) |
|-----------|-------------------------------|--------------------------------------|
| **Shell language** | POSIX sh (`#!/bin/sh`, `set -eu`) | bash (`#!/usr/bin/env bash`, `set -euo pipefail`) |
| **Line count** | 106 | 199 |
| **Tarball URL strategy** | Single hardcoded archive URL: `archive/refs/heads/release.tar.gz` | PRIMARY = Release asset (`releases/download/${TAG}/teamagent-${TAG}.tgz`); FALLBACK = same URL pattern; ARCHIVE = archive tarball as final degrade |
| **TLS flags** | None (bare `curl` calls implied by npm/pnpm) | `--tlsv1.2 --proto '=https'` in `_curl_safe()` helper on every network call |
| **SHA-256 verification** | None | Dual-file: `install.sh.sha256` checked before execution; `teamagent-${TAG}.tgz.sha256` checked after tarball download |
| **Two-step execution (no pipe-to-sh default)** | No — `npm install -g "${TARBALL_URL}"` fires directly | Yes — `SAFE_MODE=1` default; Step 3 shows script contents and prompts y/N before executing |
| **Redirect guard** | None | `allowed_hosts` regex in `_curl_safe()`: only `raw.githubusercontent.com`, `github.com`, `objects.githubusercontent.com` |
| **Dry-run mode** | None | `--dry-run` / `--verify` / `--no-run` all set `DRY_RUN=1`; prints 7 `[dry-run]` lines and exits 0 |
| **Fallback chain** | None | PRIMARY Release asset → FALLBACK (same base) → ARCHIVE `archive/refs/heads/release.tar.gz` |

---

## 3. Workflow Trigger Conditions

File: `.github/workflows/release-branch.yml`

- **Trigger event**: `on: push: branches: [main]` — fires on every push to `main`; there is no `workflow_dispatch`, no tag filter, no PR trigger.
- **Permissions**: `contents: write` — allows the workflow job to push to branches and create GitHub Releases. No other elevated permissions declared.
- **Build steps** (in order):
  1. `actions/checkout@v4` (full history, `fetch-depth: 0`)
  2. `actions/setup-node@v4` (Node 22) + `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`
  3. `pnpm --filter teamagent build` — compiles the teamagent package
  4. **Detect version** (`jq -r .version packages/teamagent/package.json`) → `steps.version.outputs.tag = v${VERSION}`
  5. **Pack tarball** (`pnpm pack --pack-destination /tmp/release-assets`); rename to `teamagent-${TAG}.tgz`; generate `teamagent-${TAG}.tgz.sha256` via `shasum -a 256`
  6. **Stage release artifacts** into `/tmp/release-stage/`: `dist/`, `package.json`, `postinstall.mjs`, `install.sh` (P4 version, **sed-templated to replace `TEAMAGENT_VERSION:-v[0-9.]*` with the detected tag**, chmod 0755), `install-legacy.sh` (chmod 0755), `install.sh.sha256` (regenerated **inline via `shasum -a 256 /tmp/release-stage/install.sh | awk` — NOT via `release-prep/gen-sha256.sh`**, hashes the templated copy), `release-meta.json`
  7. **Create GitHub Release (idempotent)**: check if tag exists via `gh release view`; if not, `gh release create` uploading `teamagent-${TAG}.tgz`, `teamagent-${TAG}.tgz.sha256`, `/tmp/release-stage/install.sh.sha256` (the templated sha256, matching what curl-fetched users actually run)
  8. **Force-push release branch**: `git init -q -b release` in `/tmp/release-stage`, commit, `git push --force` to `origin/release`
- **Staging structure** (`/tmp/release-stage/` layout):
  ```
  /tmp/release-stage/
  ├── dist/               # compiled teamagent CLI
  ├── package.json
  ├── postinstall.mjs
  ├── install.sh          # P4-hardened bash installer
  ├── install-legacy.sh   # legacy POSIX sh installer (BC)
  ├── install.sh.sha256   # freshly generated by inline `shasum -a 256` against the templated install.sh
  └── release-meta.json   # {"sha":"<GITHUB_SHA>","built_at":"<ISO8601>"}
  ```
- **Force-push target**: `origin/release` branch (separate orphan branch from `main`). The `git push --force` in the last step overwrites the entire branch with the staged snapshot on every `main` push. No `--allow-unrelated-histories` needed because `git init -q -b release` starts a fresh history each run.

---

## 4. Decision Log Echo

Copied verbatim from `docs/plans/2026-05-08-issue-121/plan.md` § DECISION LOG.

**2026-05-08 — Plan approved by user with these decisions:**

| Open Q # | Decision | Implication |
|----------|----------|-------------|
| **#2** Tarball strategy | **3a (一步到位)** — workflow creates GitHub Release + uploads tarball asset; archive fallback kept as belt-and-suspenders | Worker A scope expands; judge.md adds §V1.14-§V1.16 release-pipeline checks |
| #1 Worktree location | Accept + flag in report (`.claude/worktrees/issue121` violates `.codex/worktrees/`) | Cosmetic only |
| #3 Version pin | Keep static `v0.9.4`; bump-script as follow-up | Workflow reads from `packages/teamagent/package.json`; install.sh keeps env var override |
| #4 bash vs POSIX sh | Acceptable — `install-legacy.sh` covers POSIX-only edge cases | Worker B keeps both files |
| #5 No new tests | Acceptable for infra PR; revisit if `/review` flags | Worker C judge.md notes baseline `pnpm test` only |

---

## 5. Risks Not in Plan

### Risk 1 — install.sh self-verify bug (curl|bash pipe scenario)

**Location**: `release-prep/install.sh.draft` line ~150:
```bash
cp "$0" "$TMPDIR_INSTALL/install.sh"
```

**Problem**: When a user runs `curl -fsSL .../install.sh | bash`, the bash interpreter invokes the script with `$0 = bash` (the interpreter path, e.g. `/bin/bash`), not the piped script content. The `cp "$0" ...` line therefore copies the bash binary (or fails with a permissions error on macOS where `/bin/bash` is SIP-protected) rather than the script content. Consequence: the subsequent `_verify_sha256` call checks the wrong bytes, causing the SHA-256 check to fail on the very first step, before any installation occurs.

**Scope**: **RESOLVED in this PR by `c9a605b` (Worker B v2 CRIT #1 fix)**. The `cp "$0"` pattern was replaced with `_download_with_fallback "$SELF_URL" ... "$TMPDIR_INSTALL/install.sh"` — re-fetch the install.sh from its SHA-anchored URL, then verify the freshly-downloaded copy. This makes self-verify correct in both `curl|bash` and file-invocation modes.

**Action**: No follow-up issue needed. Verified by judge.md §V1.19 (`grep -c 'cp "\$0"' release/install.sh` returns 0 + `grep -c '_download_with_fallback "\$SELF_URL"' release/install.sh` returns ≥1).

### Risk 2 — Bot push race

If the workflow runs concurrently with a manual push to `origin/release` (e.g. an emergency hotfix), the workflow's `git push --force` wins and overwrites the manual push silently. Mitigated by AGENTS.md convention "no manual pushes to `origin/release`". If a race does occur during the PR's first deploy, record it in `report.md`.

---

## 6. References

| File / URL | Role |
|------------|------|
| `release-prep/install-sh-checklist.md` | P4 mitigation map (source for §1 above) |
| `release/install.sh` | Current POSIX sh installer (pre-PR, 106 lines) |
| `release-prep/install.sh.draft` | P4 bash source (199 lines, Worker B copies to `release/install.sh`) |
| `release/install-legacy.sh` | BC copy of old POSIX sh installer (Worker B creates) |
| `release/install.sh.sha256` | Checksum committed in repo (regenerated by workflow on every push) |
| `.github/workflows/release-branch.yml` | Release pipeline (Worker A edits for 3a) |
| `release-prep/gen-sha256.sh` | SHA-256 generator run in CI |
| `docs/plans/2026-05-08-issue-121/plan.md` | Full PR plan, DECISION LOG |
| `docs/plans/2026-05-08-issue-121/judge.md` | Third-party judge harness (§V1/§V2/§V3) |
| `docs/plans/issue-84/i-phase/release-publish-checklist.md` | Predecessor runbook from issue #84 |
| https://github.com/libz-renlab-ai/TeamBrain/issues/121 | Issue #121 — 8 acceptance criteria |
