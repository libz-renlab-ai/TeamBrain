# r11-summary — P2 Release Branch Publish Prep

```
worker-11 (I-phase)
      │
      ├─► release-publish-checklist.md  (146 lines, docs only)
      │         branch ops → SHA256 gen → publish → verify → rollback
      │
      └─► release-prep/gen-sha256.sh    (52 lines, bash -n OK)
                macOS shasum / Linux sha256sum dual-compat
                writes install.sh.sha256 alongside install.sh
                prints tarball SHA256 to stdout
```

---

## Deliverables

| File | Lines | bash -n | Status |
|------|-------|---------|--------|
| `docs/plans/issue-84/i-phase/release-publish-checklist.md` | 146 | n/a (markdown) | written |
| `release-prep/gen-sha256.sh` | 52 | OK | written, chmod +x |

Functional test: `bash release-prep/gen-sha256.sh release-prep/install.sh.draft /dev/null`
→ wrote `release-prep/install.sh.draft.sha256`, exit 0.

---

## Publish Flow Summary

1. Pre-publish: `bash -n install.sh.draft` + `--dry-run` + P4 grep probes
2. Branch ops: `git worktree add -b release .codex/worktrees/release-publish origin/main`
3. Copy: `cp release-prep/install.sh.draft install.sh` + run `gen-sha256.sh`
4. Commit: `chore(release): publish install.sh + sha256 (#84)`
5. Push release branch (USER CONFIRMATION REQUIRED)
6. Build tarball: `pnpm pack` → `teamagent-v0.9.4.tgz` + sha256
7. GitHub Release: `gh release create v0.9.4 ...` with tarball + sha256 assets (USER CONFIRMATION REQUIRED)
8. Verify: curl raw URL → `bash -n`; download tarball → SHA256 compare

---

## H6 punt note

`install.sh` self-update is not implemented in this PR (research.md §H6).
`TEAMAGENT_VERSION` env var lets users pin a version as a workaround.

---

## User Decision Points

**Before any real publish**, user must confirm two steps:

- `git push origin release` — creates/updates the public `release` branch
- `gh release create v0.9.4 ...` — creates a public GitHub Release with assets

Neither step is executed by this checklist. The checklist is a runbook only.
