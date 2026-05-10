```text
   ┌──────────────────────────────────────────────────────────────────┐
   │   INNER-LOOP-TESTING.md                                          │
   │                                                                  │
   │   ┌──────────────┐    git push     ┌──────────────────────────┐  │
   │   │ Mac session  │ ──────────────▶ │ inner-loop.yml on wip/** │  │
   │   │              │                 │  pnpm install            │  │
   │   │ targeted     │ ◀── PASS/FAIL   │  pnpm test               │  │
   │   │ vitest path  │  gh run watch   │  pnpm verify             │  │
   │   │ stays LOCAL  │                 │  ubuntu-latest only      │  │
   │   └──────────────┘                 └──────────────────────────┘  │
   │   秒级单文件 inner loop              分钟级全量 CI inner loop      │
   └──────────────────────────────────────────────────────────────────┘
```

Live doc explaining how to use the wip-branch / `inner-loop.yml` channel.
For the rationale, see `docs/adr/0013-inner-loop-on-ci.md`.

## Channel selection

| Scenario | Channel | Command |
|---|---|---|
| Full test suite (`pnpm test`) | CI on `wip/<name>` | `git push origin HEAD:wip/<name>` |
| `pnpm verify` (snapshot diff) | CI on `wip/<name>` | (same) |
| Single-file targeted vitest | Local | `pnpm vitest run path/to/file.test.ts` |
| `pnpm typecheck` | Local OK (doesn't fork workers) or PR gate | `pnpm typecheck` |
| PR-final full check (Ubuntu + Windows + typecheck) | `ci.yml` on PR open | (automatic) |

## Pushing to wip

```bash
git checkout -b wip/<descriptive-name>
git commit -am "wip: ..."
git push origin wip/<descriptive-name>
```

Branch naming convention: `wip/<topic>` where topic is a short kebab-case
identifier. Branches are throwaway; clean up after PR merge.

## Reading CI results from inside Claude Code

```bash
RUN_ID=$(gh run list --workflow=inner-loop.yml --branch wip/<name> -L 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

`--exit-status`: returns 0 on success, 1 on failure. Claude Code's Bash tool
runs this with `timeout=600000` (10 minutes) and reads the exit code back.

For raw inspection:

```bash
gh run view "$RUN_ID" --json status,conclusion,createdAt,updatedAt,databaseId,url
```

## When CI is red

```bash
gh run view "$RUN_ID" --log-failed   # logs of failed steps only
```

Common causes:

- `pnpm install --frozen-lockfile` fails → `pnpm-lock.yaml` out of sync with
  `package.json`. Fix locally with `pnpm install`, commit lockfile, re-push.
- A test that depends on env var fails → check the `env:` block of
  `inner-loop.yml` AND the GitHub repo secret (`gh secret list` should show
  `MINIMAX_API_KEY`).
- Flake (network blip, runner timeout) → re-push an empty commit:
  `git commit --allow-empty -m "rerun" && git push`.

## Targeted single-file local exception

**Allowed locally**:

- `pnpm vitest run packages/cli/src/__tests__/init.test.ts` (one file)
- `pnpm vitest run --testNamePattern "specific test"` (filtered subset)

**Not allowed locally — must go through CI**:

- `pnpm test` (full suite)
- `pnpm verify`
- Any command that ends up running the full vitest worker pool

The boundary: "one file at a time" means vitest spawns one worker, not the
parallel pool. If you find yourself running 2+ files locally in sequence,
push to wip instead — the scheduler cost compounds quickly.

## Secrets — rotate + inject

The repo secret `MINIMAX_API_KEY` carries the MiniMax API key. The workflow
YAML aliases it to `ANTHROPIC_API_KEY` env (because `claudefast` wrapper does
the same).

To rotate:

1. Revoke the old MiniMax token in the MiniMax console.
2. Mint a new token; do not paste it into chat or git.
3. In a private terminal:
   ```bash
   read -rs NEW_TOKEN          # silent stdin, no echo
   gh secret set MINIMAX_API_KEY -b"$NEW_TOKEN"
   unset NEW_TOKEN
   ```
4. Update local `~/.zshrc` `claudefast` wrapper to the new token if you use
   it locally.

**Never**:

- commit token to git (lockfile, env file, YAML literal, ADR text)
- print token in chat, in CI logs, or in transcripts
- store token in `.env` files committed to the repo

## Cleanup after PR merge

```bash
git push origin --delete wip/<name>
git branch -D wip/<name>
```

## Boundaries with related docs

- Decision rationale → `docs/adr/0013-inner-loop-on-ci.md`
- Implementation plan → `docs/plans/2026-05-10-inner-loop-on-ci/plan.md`
- Verification harness → `docs/plans/2026-05-10-inner-loop-on-ci/judge.md`
- PR-gate testing → `.github/workflows/ci.yml`
- Parallel worker editing pattern → `docs/TEAMWORK.md` (orthogonal concern)
- Verification gate (canonical-help snapshot) → `docs/feature-verification.md`
