```
   ___  ___  ___  ___  ___  _____
  / _ \/ _ \/ _ \/ _ \/ _ \/_  _/   report.md = post-impl truth.
 / , _/ ___/ ___/ _, / ___/  / /    What plan.md said vs what
/_/|_/_/ /_/  /_/|_/_/      /_/     actually shipped, and what's
                                    next.
```

# report.md — two-drivers plan execution

PR: <https://github.com/libz-renlab-ai/TeamBrain/pull/396>
Branch: `worktree-two-drivers-plan`. Worktree:
`.claude/worktrees/two-drivers-plan`. Ten commits.

## §1 What shipped vs what plan.md said

| plan.md §2 deliverable | Shipped? | File | Lines |
|------------------------|----------|------|-------|
| New `docs/TWO-DRIVER-COEXISTENCE.md` | ✅ | `docs/TWO-DRIVER-COEXISTENCE.md` | 196 |
| New `docs/SYMPHONY-FLOW.md` | ✅ | `docs/SYMPHONY-FLOW.md` | 191 |
| Patch `docs/FIXEDFLOW.md` (scope no-watcher + §0 refusal) | ✅ | `docs/FIXEDFLOW.md` | 308 (was 305, +3 net) |
| Patch `docs/ISSUE-LIFECYCLE.md` (new §1.5 + Symphony anchor) | ✅ | `docs/ISSUE-LIFECYCLE.md` | 196 (was 142, +54 net) |
| Patch `CLAUDE.md` (2 new bullets + Symphony anchor) | ✅ | `CLAUDE.md` | 318 (was 304, +14 net) |
| `docs/plans/2026-05-12-two-drivers/judge.md` | ✅ | (this dir) | 167 |
| `docs/plans/2026-05-12-two-drivers/research.md` | ✅ | (this dir) | 174 |
| `docs/plans/2026-05-12-two-drivers/plan.md` | ✅ | (this dir) | 181 |
| 4 new GitHub labels via `gh label create` | ⏳ | (repo admin runs script in SYMPHONY-FLOW.md / ISSUE-LIFECYCLE.md §4) | n/a |
| Regular (non-draft) PR opened | ✅ | PR #396 | n/a |

All file-level deliverables shipped. The 4 label creates are explicitly
**out of this PR's scope** because the agent does not hold repo-admin
permissions; PR description names this dependency.

## §2 Design choices (D1-D5) — all defaults selected

User instruction: 「全部按鸭鸭推荐的来」.

| ID | Choice | Selected default |
|----|--------|------------------|
| D1 | label namespace | `track:symphony` (colon-namespaced) |
| D2 | default routing without `track:*` | fixed-flow (zero migration) |
| D3 | `symphony-human-reviewed` on PR vs issue | PR |
| D4 | Symphony blocker label | new `symphony-blocked` (not reuse `ready-for-human`) |
| D5 | `<50` 字 body conformance applies | yes |

## §3 Deviations from plan.md

1. **TWO-DRIVER-COEXISTENCE.md needed 2 trim commits** (overshot 200-line
   budget at first draft of 207 lines → trimmed to 200 → trimmed again to
   196). Plan.md estimate was ~160; actual is 196. Drift driven by needing
   to cover both drivers' §0 refusal explicitly in §2 rather than just
   linking out.
2. **`docs/FIXEDFLOW.md` already over 200-line ceiling pre-PR** (305 →
   308). Plan.md §9 already noted this is preexisting state, not a
   regression.
3. **`CLAUDE.md` already over 200-line ceiling pre-PR** (304 → 318). Same
   note: preexisting; this PR adds only 14 lines.
4. **No `pnpm test` run** — docs-only PR; the test rule applies to code
   changes. `/review` skill is the canonical merge gate (ADR-0007) and
   runs on the PR side.

## §4 Probe status (judge.md §1 RUN, not executed inside this PR session)

Probes P1-P4 are claudefast invocations that depend on the new docs being
on disk. They will fire automatically when reviewers run them. P5 depends
on the label-create script. Inside this session none of the probes were
executed because:

- Running `claudefast` probes from inside the implementing session would
  violate the judge harness contract (judge LLM must be a **separate**
  process; see judge.md §3 READ).
- A reviewer (or a follow-up CI job) is the correct caller.

Expected outcomes once probes run:
- P1 PASS (CLAUDE.md bullet 1 contains all 5 anchors).
- P2 PASS (TWO-DRIVER-COEXISTENCE.md §1 says NO with citation).
- P3 PASS (FIXEDFLOW.md §Dispatch policy patch adds the refusal).
- P4 PASS (CLAUDE.md bullet 2 + SYMPHONY-FLOW.md both contain the 5
  anchors).
- P5 INCONCLUSIVE → PASS once admin runs the label-create script.

## §5 Known follow-ups (not in this PR)

1. **Symphony GitHub tracker adapter** — upstream `openai/symphony/lib/`
   ships only `Symphony.Tracker.Linear`. Building
   `Symphony.Tracker.Github` is an engineering effort comparable in size
   to FIXEDFLOW itself. Not in this PR.
2. **`/fixed-flow-driver` skill source code** — the skill currently does
   not read `track:symphony` and refuse. This PR ships the documented
   contract; a follow-up PR wires the refusal into `.claude/skills/...`
   skill source. Until then the contract is honored by convention, not
   enforcement.
3. **GitHub Action enforcement** — neither `track:symphony` mutex nor
   `symphony-human-reviewed` merge gate is enforced by an Action.
   Follow-up: extend `.github/workflows/issue-conformance.yml` (or add a
   sibling workflow) to reject PRs whose label combination violates the
   §1 mutex matrix.

## §6 Files in this dir at completion

```
docs/plans/2026-05-12-two-drivers/
├── judge.md       — 5-probe third-party verification harness (167 lines)
├── plan.md        — DUCKPLAN four-section (181 lines)
├── report.md      — this file
└── research.md    — current label inventory + collision matrix (174 lines)
```

No `evidence/` subdir — probes are run by reviewers, not this session.
