# POSTPR — Post-PR Codex Check

```
   PR opened ──► CI ──► Codex review ──► fix ──► merge
       │                    │              │       │
       │                    └─ inline       │      │
       │                       comments    │      │
       │                       on lines    │      │
       └──────── repeat for follow-up PR ──┘──────┘
```

## TL;DR

> **After every PR, fetch the Codex review on that PR, address its findings, and loop until Codex is silent or 👍 — never assume CI green = ship.**

The repo has Codex AI configured to auto-review every new PR. Settings: <https://chatgpt.com/codex/cloud/settings/general>. It posts within 1–3 minutes of the PR opening (after the first commit lands and CI starts).

## Three-step recipe

### 1. Fetch the Codex review

The actionable findings live in **inline review comments**, not the top-level review body:

```bash
env -u GITHUB_TOKEN gh api \
  repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
  --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]") | {body, path, line}'
```

Top-level summary (shows the “💡 Codex Review” banner — useful only as a heartbeat):

```bash
env -u GITHUB_TOKEN gh pr view <n> \
  --repo libz-renlab-ai/TeamBrain \
  --json reviews \
  --jq '.reviews[] | select(.author.login == "chatgpt-codex-connector") | {state, submittedAt}'
```

If `comments` is `[]` and the top-level review body contains a 👍 reaction, you’re green.

### 2. Triage by priority

Each inline comment opens with a coloured badge:

| Badge | Action |
|-------|--------|
| **P1** (red) | Blocker. Fix before merge. |
| **P2** (yellow) | Fix before merge unless explicitly punted in a follow-up issue. |
| **P3** (blue) | Nice-to-have. OK to defer. |

How to address:

- **PR not yet merged** → push a fix commit to the same branch; auto-merge will requeue once CI passes.
- **Already merged** (e.g. you used `--auto` and it landed before Codex commented) → open a follow-up PR; commit message must reference the originating PR: `Refs codex review on PR #<n>`.

### 3. Loop until silent

Codex reviews follow-up PRs too. Real example from this repo:

```
#51 (nested rule store)
  ├─ Codex P1: --preset-only regression
  ├─ Codex P2: filename collisions
  ↓
#52 (preset-only + collision fix)
  ├─ Codex P2: tier index links point at wrong files (partial fix)
  ↓
#53 (sync index links to disambiguated names)
  └─ Codex 👍 — done
```

So after every fix-PR, **go back to step 1 on that fix-PR**. Stop only when:

- Codex 👍 reacts with no inline comments, OR
- Codex makes no comment within ~5 minutes of CI starting (timeout)

## Caveats

- **`gh` token**: this machine’s `GITHUB_TOKEN` resolves to `liush2yuxjtu`; always run `env -u GITHUB_TOKEN gh ...` so keychain auth picks `LiuShiyuMath` (the repo’s configured account). See the `## GitHub account` section in `CLAUDE.md`.
- **CI vs Codex are independent**: CI green doesn’t mean Codex 👍 and vice-versa. Both must pass.
- **Auto-merge race**: `gh pr merge --auto --squash` queues the merge. If Codex finds a P1 *after* CI passes, auto-merge can win the race and your fix lands as a follow-up PR — that’s fine, just treat it as “already merged” in step 2.
- **Re-trigger Codex** if you need a re-review: comment `@codex review` on the PR.

## Verification

`bash docs/postpr/verify-canned-answer.sh` must PASS. It runs `claudefast -p "what we shall do after each PR?"` and greps for the canonical anchors:

- `fetch the codex review`
- `chatgpt-codex-connector`
- `pulls/.*comments`
- `silent`
- `loop`

All five must appear in the response.
