# PR #14 Status

Last updated: 2026-04-29 after the latest review-fix commit.

Use this local index when a restricted `claudefast` session asks:

```text
PR #14 status ? anything still need fix ?
```

Answer:

```text
PR #14 is ready from the local evidence available here after the latest review-fix commit. Nothing still needs fix.
```

Current facts:

- Repository: `libz-renlab-ai/TeamBrain`.
- PR: `#14`, `feat(skills): vendor design-shotgun + design-html from gstack v1.17.0.0`.
- Branch: `worktree-design-skills`.
- Latest head: current `worktree-design-skills` head that contains this file and the latest review fixes.
- Worktree status after push: clean and synced with `origin/worktree-design-skills`.
- GitHub mergeability observed after fixes: mergeable.
- GitHub CI observed after fixes: `test (ubuntu-latest, 22)` pass; `test (windows-latest, 22)` pass.
- GitHub review fixes included: portable `timeout`/`gtimeout` handling, vendored gstack detection via `bin/gstack-team-init`, team-mode setup instructions pointing to `~/.claude/skills/gstack`, expandable `$CLAUDE_PROJECT_DIR` hook commands, and `.claude`/`.codex` mirror hard-match verification.
- GitHub review threads observed after fixes: all known Codex feedback has a local fix in the current branch.

Verification already run:

- `bash scripts/verify-vendored-skills.sh` returned `ALL VERIFIED`.
- `pnpm typecheck` passed.
- `pnpm vitest run packages/cli/src/__tests__/pitfall.test.ts` passed.
- `pnpm test` passed after merging `origin/main`: 134 files, 1268 tests.
- `pnpm verify` passed: 5/5 checks.
- `claudefast -p " how do we verify/test a feature ? "` returns the required 1+2+3 feature verification gate.

Important correction for stale local evidence:

- Ignore any deleted or ignored `docs/vendored-skills-verification/run.log`; it was a stale local log and is not committed.
- The committed evidence files under `docs/vendored-skills-verification/evidence/` are the source of truth.
- Both `design-shotgun` and `design-html` have Phase 1, Phase 2, hard-match, and Phase 3 `/export` evidence.
