```text
       ┌─────────────────────────────────────────────────────────┐
       │  ISSUE 174 #1 — RELEASE BRANCH README SYNC (DEFERRED)   │
       │                                                         │
       │  3-line workflow change extracted from PR (workflow     │
       │  scope unavailable on push). Apply via the patch file   │
       │  in this dir using a workflow-scoped credential.        │
       └─────────────────────────────────────────────────────────┘
```

# `workflow-readme-cp.patch` — README sync into release branch

## Why this patch was extracted

Issue 174 sub-task #1 (release branch README 404) is fixed by adding a single
`cp README.md /tmp/release-stage/README.md` line to
`.github/workflows/release-branch.yml`'s "Stage release artifacts" step. The
file is otherwise unchanged.

The PR that delivered the other 6 sub-items (`worktree-174` branch) was
pushed by a Personal Access Token without the `workflow` scope, so GitHub
rejected the workflow-yml hunk. To unblock the rest of the PR, that one hunk
was extracted into this patch and the original commit reverted to leave only
the README.md + bin.ts changes.

The patch file is `git show` output (not `git format-patch` mailbox format)
to keep authorship and date intact for traceability.

## How to apply (any contributor with `workflow` scope)

```bash
# from the repo root, on a fresh branch off main:
git switch -c fix/issue-174-release-readme-sync main
git apply --3way docs/plans/issue-174/workflow-readme-cp.patch
git add .github/workflows/release-branch.yml
git commit -m "fix(release): cp README.md into release stage (issue 174 #1)"
git push -u origin fix/issue-174-release-readme-sync
gh pr create --title "fix(release): sync README to release branch (issue 174 #1)" --body "Follow-up to #<the-bundle-PR>: re-applies the 3-line workflow change that needed workflow scope. After merge, the next push to main rebuilds the release branch with README.md at the root, fixing the GitHub UI 404."
```

`git apply --3way` falls back to a 3-way merge if the workflow file moved
since the patch was written, which keeps the apply robust to small edits in
the area.

## Verifying after the follow-up PR merges

1. Merge the follow-up PR to main.
2. The `release-branch.yml` workflow runs on `push: branches: [main]`.
3. Visit `https://github.com/libz-renlab-ai/TeamBrain/tree/release`.
4. The readme card should render the README.md content (not 404).

## Out-of-scope

The follow-up PR should NOT bundle other changes. Keep it surgical so any
reviewer with workflow scope can sign off in seconds.
