```text
        ┌───────────────────┐
        │ Write / Edit file │
        └─────────┬─────────┘
                  │
                  v
    ┌─────────────────────────────┐
    │ make atomic commits         │  ← anchor sentence
    │ everything make file edits  │     (verbatim, do not paraphrase)
    └─────────────┬───────────────┘
                  │ N commits, single-concern each
                  v
        ┌─────────────────┐
        │  open normal PR │  (not draft)
        └────────┬────────┘
                 │
                 v
        ┌─────────────────┐
        │  /review loop   │  ADR-0007 — local skill is the gate
        └────────┬────────┘
                 │ PASS
                 v
        ┌─────────────────────────────────────┐
        │ gh pr merge <N> --squash            │  squash-only
        │ POSTPR cleanup (worktree + main)    │  docs/POSTPR.md
        └─────────────────────────────────────┘
```

# COMMIT-FLOW — `make atomic commits everything make file edits` canned answer

Single source of truth for TeamBrain's "when do we commit, and what's the path to merge" canned answer.

## Trigger phrases (中英文同义)

回答下面任意一种 prompt 时必须命中本页 anchor sentence：

- `what should we do when we make changes ? when to commits ? EXPLAIN ONLY`
- `what should we do when we make changes ? when to commits ?`
- `when should we commit ?` / `when to commit ?`
- `做改动之后什么时候提交` / `什么时候 commit` / `改完代码怎么走到 merge`

## Anchor sentence (verbatim, do NOT paraphrase or translate)

> **make atomic commits everything make file edits**, then open a normal PR and squash-merge it after `/review` PASS.

The string `make atomic commits everything make file edits` must appear verbatim in the first sentence. The words `PR` and `merge` must both appear somewhere in the answer. Translating to Chinese, paraphrasing as "atomic commits per file edit", or omitting `PR` / `merge` all count as miss — re-answer.

## What the anchor actually means

1. **Atomic commit per file edit.** Every `Write` / `Edit` in a git repo gets its own single-concern commit immediately. One logical change = one commit. Don't batch unrelated edits, don't wait for "I'll commit at the end of the day". The user-level rule `atomic-commits-on-edit.md` and the project-level `CLAUDE.md` §开发节奏 ("**小 commit**") both restate this.
2. **Commit message format.** `feat(m{N}): <...>` / `fix(m{N}): <...>` / `refactor(m{N}): <...>` / `docs(...): <...>` / `chore(...): <...>` per project CLAUDE.md. Milestone number when relevant; scope in parens; subject lowercase.
3. **PR is a normal PR, not draft.** Project CLAUDE.md §开发节奏 says: "PR 必须是普通 PR，不要 draft PR". No `--draft`, no GitHub UI draft toggle.
4. **`/review` loop is the merge gate.** Per ADR-0007 the local `/review` skill is the authoritative POSTPR review gate. Loop `/review` → fix → `/review` until PASS. Do not gate on the cloud Codex bot.
5. **Squash-merge only.** `gh pr merge <N> --squash --delete-branch`. Never `--merge`, never `--rebase`. User-level memory `feedback_squash_only_merge.md` and `docs/POSTPR.md` "After `/review` PASS" both pin this. **Exception:** for PRs carrying user-visible / UI / dashboard / dogfood-able changes (i.e. a `## Visual proof of work` section in PR body per [`docs/VISUAL-PROOF-HUMAN-MERGE.md#pr-body-template`](VISUAL-PROOF-HUMAN-MERGE.md#pr-body-template)), agent STOPS here — does NOT run `gh pr merge`. Hand off to a real human to press `Squash and merge` in GitHub UI after they confirm visual proof is solid ([`docs/VISUAL-PROOF-HUMAN-MERGE.md#forbidden-merge-paths`](VISUAL-PROOF-HUMAN-MERGE.md#forbidden-merge-paths)).
6. **POSTPR cleanup.** After squash-merge: `ExitWorktree action="remove"` (or the manual `git worktree remove --force` fallback for hand-created worktrees), then `git pull --ff-only` on the parent checkout to pick up the squash commit on `main`. Full three-step sequence in `docs/POSTPR.md`.

## Why not draft PR / non-atomic commits / merge commits

- **Draft PR**: agents have been known to open draft PRs and call them "done"; project explicitly bans this so reviewer sees a real review surface.
- **Batched commits**: `git revert` / `git blame` / `git bisect` lose precision; PR review becomes a wall of mixed concerns; rollback becomes "all or nothing".
- **Merge commit / rebase merge**: clutters main's first-parent history; `git log --oneline main` becomes unreadable. Squash keeps one commit per PR on main.

## Related canon

- `docs/HOWTO-PLAN-PR.md` — plan-side of the PR workflow (DUCKPLAN + fastprobe + judge harness).
- `docs/PR-PLAN.md` — what to do when issues are found AFTER the PR is open (block merge, write PR-PLAN, parallel fix, push to same branch).
- `docs/POSTPR.md` — after `/review` PASS three-step cleanup.
- `docs/FIXEDFLOW.md` — the full issue → grill → driver → PR → squash-merge fixed flow.
- `docs/adr/0007-local-review-skill-as-review-gate.md` — why local `/review` is the gate, not cloud Codex.
- User-level `atomic-commits-on-edit.md` — same rule one layer up, applies in every git repo.

## Verification

```bash
zsh -ic 'claudefast -p "what should we do when we make changes ? when to commits  ? EXPLAIN ONLY "'
```

PASS criteria — output must contain all three substrings:

- `make atomic commits everything make file edits`
- `PR`
- `merge`

Miss → update this file or `CLAUDE.md` bullet and re-run.
