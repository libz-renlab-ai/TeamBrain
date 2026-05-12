```text
   delivery snapshot (PR-1 only)
   ─────────────────────────────
        │
        ├── what landed
        ├── what was deferred
        └── follow-up issue list
        │
        ▼
   updated on each follow-up PR
```

# Report — PR-1 (submodule + adapter skeleton)

## Status: DRAFT — finalised at merge time

This report.md is written before squash-merge with placeholders; on merge the author commits a second pass that fills in the merged SHA, PR number, and final pinned upstream SHA.

## What this PR delivered

1. Added `hrdAI3/RocketTeam` as git submodule at `landing/rocketteam`, pinned at SHA `3922219668cb1b41b4631487983518f6d3914543` (upstream `main` HEAD at time of clone).
2. Authored `docs/plans/landing-rocketteam/plan.md`, `research.md`, `report.md` (this file).
3. Added `packages/landing-adapter/` workspace with TypeScript contract surface (`LandingPayload`, `Feature2Signal`, `Feature3Signal`) and TODO-marked stubs.
4. Updated root `pnpm-workspace.yaml` / `tsconfig*.json` only as needed to make the new package compile.

## What this PR did NOT deliver (explicit non-goals)

- No `.github/workflows/landing-deploy.yml` (deferred to PR-2).
- No `next.config.js` override for `output: 'export'` (deferred — handled in PR-2 by build-time injection or via upstream PR).
- No real adapter implementation — only type contracts + `TODO(PR-3)` markers.
- No `gh-pages` branch was created; GitHub Pages NOT enabled on the repo by this PR.

## Verification

- Submodule pointer probe: `git submodule status landing/rocketteam` → `<sha>` recorded above, `heads/main`, clean.
- Submodule isolation probe: `git ls-tree -r HEAD -- landing/rocketteam | wc -l` → `0` (gitlink only).
- Plan trio existence probe: PASS — all three files present.
- Adapter typecheck probe: PASS — `pnpm --filter @teamagent/landing-adapter typecheck` exit 0.
- Plan three-segment lint probe: PASS — `Task description`, `Expected outputs`, `How-to-evaluate (third-party judge harness)` all present in plan.md.
- `/review` PASS gate: TODO — runs before squash-merge per ADR-0007.

## Deviations from plan

- (to be filled on merge — if zero deviations, write "none")

## Follow-up issues to open after merge

| # | Title | Trigger |
|---|---|---|
| F1 | `[landing] PR-2 wire submodules + adapter step into existing landing-deploy.yml` | After PR-1 squash-merges. NO new workflow file. |
| F2 | `[landing] PR-3 content-bridge implementation (RocketTeam content → apps/landing/src/_generated/)` | After PR-2 lands and an empty-fragment-emitting bridge is in CI |
| F3 | `[landing] optional fork of hrdAI3/RocketTeam under libz-renlab-ai if upstream content cadence becomes a bottleneck` | Only if F2 reveals friction |

## Architectural pivot mid-PR (2026-05-12)

Initial PR-1 design assumed a separate Next.js Pages deploy. Post-push repo search (which I should have done pre-push — flagged in self-report) surfaced two hard conflicts with existing `apps/landing/`:

1. `apps/landing/README.md` explicitly bans Next.js / React / Vue / any JS framework (source: `docs/specs/2026-05-07-landing-copy-actually-needed.md` decisions 1 / 7; P5 anti-slop).
2. `.github/workflows/landing-deploy.yml` already owns the `libz-renlab-ai.github.io/TeamBrain/` Pages slot with `concurrency: group: pages`.

Pivot locked at the plan.md / report.md level (commits append-only on this branch, no force-push, no rewrite of the three atomic commits): the adapter becomes a **content bridge** — reads structured content from `landing/rocketteam/`, emits Pretext-native HTML fragments under `apps/landing/src/_generated/` for inclusion by the existing static build. **No `next build` ever runs. No second Pages workflow.** Existing landing policy stays intact; submodule pins the upstream content source by SHA.

## Risks observed during delivery

- (to be filled on merge — capture anything that surprised the implementer)
