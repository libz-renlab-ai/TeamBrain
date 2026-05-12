```
   ___              __                __  
  / _ \___ ___ ___ / /__ ____ ____   / / 
 / , _/ -_|_-</ -_) _ `/ __/ __/ /_ /_/  
/_/|_|\__/___/\__/\_,_/_/  \__/\__(_) (_)

  TeamBrain has ONE driver today. User wants TWO. This file captures the
  ground truth before plan.md proposes the change set.
```

# research.md — current state before two-driver split

## §1 Existing labels on `libz-renlab-ai/TeamBrain`

Verified via `gh label list --repo libz-renlab-ai/TeamBrain --json name,description,color`
on 2026-05-12.

| Label | Color | Description (verbatim) | Used by |
|-------|-------|------------------------|---------|
| `needs-triage` | fbca04 | Maintainer needs to evaluate | P0 default |
| `needs-info` | f9d0c4 | Waiting on reporter for more information | Off-mainline |
| `ready-for-agent` | 0e8a16 | Fully specified, ready for an AFK agent | Legacy alias of `grill-ready` |
| `ready-for-human` | 1d76db | Needs human judgment / external access / design decision | Off-mainline, manual-close-only |
| `grilling` | 8B4513 | Cross-host mutex: a grill is in progress on this issue (PRE-GRILL-CLAIM.md) | P1 + P3 |
| `grill-ready` | 0e8a16 | Issue has valid grill comment; FIXEDFLOW driver may pick up | P2 + P4 |
| `docs-grill-ready` | 1d76db | /grill-with-docs has run the docs gate after /grill-via-web | P4 |
| `grill-working` | fbca04 | Cross-host mutex: driver has claimed this grill-ready issue (PRE-IMPLEMENT-CLAIM.md) | P5 |
| `epic` | 5319e7 | Tracking issue split into child issues per TRIAGE-AND-SPLIT.md | Off-mainline |
| `codex` | ededed | (no description) | adjacent metadata |
| `bug` / `documentation` / `duplicate` / `enhancement` / `good first issue` / `help wanted` / `invalid` / `question` / `wontfix` | various | GitHub defaults | adjacent metadata |

**Mentioned in docs but NOT YET created**: `non-conformant`, `needs-grill-comment`,
`needs-docs-grill`, `bypass-fixed-flow` (per `docs/ISSUE-LIFECYCLE.md` §4).

## §2 Verbatim anchor sentences that mention drivers

Three anchor sentences in `CLAUDE.md` lock-in driver semantics; plan.md must not
break them. Located by grep for the canned-answer signatures.

1. **ISSUE-LIFECYCLE anchor** (CLAUDE.md, ~370 chars): enumerates 6 phases
   (P0-P6) of the FIXEDFLOW lifecycle, lists 17 substring grep anchors. Names
   `/fixed-flow-driver` as THE driver. Does not mention Symphony.
2. **HOW-TO-CLAIM-ISSUE anchor**: `use an explore agent to understand what is
   going on in the issue, explore the comments and related PRs and issues`.
   Track-agnostic; survives the change.
3. **PRE-IMPLEMENT-CLAIM anchor**: `make a comment claiming we have started
   working on this issue and add tag "grill-working"`. Fixed-flow-specific
   (`grill-working` is fixed-flow's mutex). Symphony needs a parallel anchor.

## §3 The "no watcher" rule — where it lives, what it forbids

`docs/FIXEDFLOW.md:25` (in the top ASCII banner) and §Dispatch policy line 56
both say:

> 禁止任何 watcher / cron / daemon / 后台轮询 / 自动 dispatch / repo-wide sweep

`CLAUDE.md` references this rule via the FIXEDFLOW pointer. The rule is
**scoped to FIXEDFLOW step 3-5**: it forbids automation from starting the
implementation driver. Symphony's published design (`elixir/WORKFLOW.md`
upstream + `/Users/m1/projects/symphony/elixir/`) polls every 5 s and
auto-dispatches Codex per issue — that's exactly the forbidden pattern.

To allow Symphony to coexist, the prohibition must be **narrowed** from
"forbidden for all issues" to "forbidden for fixed-flow track only". This is a
real policy delta, not editorial.

## §4 Driver lifecycle invariants

**FIXEDFLOW driver** (`docs/FIXEDFLOW.md`):
- Triggered: maintainer manually runs `/fixed-flow-driver <N>` in Claude Code.
- Gate at START: requires both `grill-ready` + `docs-grill-ready` labels.
- Mutex: `grill-working` label + `.codex/worktrees/issue-<N>/.lock` sentinel.
- Workspace: `.codex/worktrees/issue-<N>/` (in-repo git worktree).
- Loop: `/review` skill loop — never ends until PASS.
- Merge: `gh pr merge <N> --squash --auto`.
- Human-gate position: **at the BEGINNING** (grill + docs-grill before any
  code is written).

**Symphony driver** (upstream `openai/symphony/elixir/WORKFLOW.md`):
- Triggered: background daemon polling Linear every 5 s.
- Gate at START: issue state == `Todo` / `In Progress` / `Merging` / `Rework`.
- Mutex: per-issue workspace; concurrency cap = `max_concurrent_agents: 10`.
- Workspace: `~/code/symphony-workspaces/<issue-id>/` (separate clone).
- Loop: per-turn implementation + `Acceptance Criteria` / `Validation` runs.
- Merge: issue moves to `Human Review` → human approves → moves to `Merging`
  → Symphony runs `land` skill.
- Human-gate position: **at the END** (after Symphony opens PR and reaches
  `Human Review` state).

User's ask maps Symphony's `Human Review` state to a TeamBrain GitHub label
`symphony-human-reviewed` (verbatim phrasing from user's message).

## §5 Cross-driver collision points

The two drivers will fight if any of these holds simultaneously on one issue:

1. Both `grill-ready` AND a Symphony track-claim signal → both drivers want it.
2. Same workspace root → won't happen (`.codex/worktrees/` vs
   `~/code/teambrain-workspaces/`).
3. Same branch name pattern → fixed-flow uses `feat/issue-<N>`; Symphony
   upstream uses `{branch_prefix}{issue.identifier}`. Need to namespace
   Symphony's prefix to e.g. `symphony/issue-<N>` to be unambiguous.
4. Both attempting `gh pr merge <N> --squash` on the same PR → won't happen
   because they open distinct PRs; but the issue-side mutex above prevents
   reaching that state.

## §6 Issue template surface

`.github/ISSUE_TEMPLATE/` (per FIXEDFLOW.md §issue body) ships exactly one
fixed-flow template; `blank issue` is disabled. To support Symphony track,
either:

- (a) add a second template `symphony.yml` that pre-applies `track:symphony`
  label, OR
- (b) keep one template; maintainer adds `track:symphony` manually at triage.

Option (b) is simpler and matches the user's described workflow
(`fixed-flow-driver will let humans decide in the beginning ... symphony will
do things by itself`). Option (a) gives reporters direct opt-in but
complicates the conformance Action regex.

## §7 Where Symphony cannot be cleanly bolted on

These are facts, not opinions:

1. **Symphony has no GitHub tracker adapter** — upstream `lib/` ships only
   `Symphony.Tracker.Linear`. Plan.md cannot assume `tracker.kind: github`
   works; it must call out the adapter gap.
2. **Symphony's WORKFLOW.md hard-codes Linear state names**
   (`Todo` / `In Progress` / `Merging` / `Rework` / `Human Review` / `Done`).
   GitHub-side state == "open" / "closed" + labels. Adapter would need to
   map.
3. **Symphony's `## Codex Workpad` comment convention** does not collide with
   any existing TeamBrain comment header. Safe to adopt.
4. **TeamBrain's `/review` skill is the canonical merge gate** (ADR-0007).
   Symphony's published flow has no `/review` equivalent — its merge gate is
   "human moves to Merging in Linear". Without `/review`, Symphony PRs would
   bypass TeamBrain's quality bar. User's `symphony-human-reviewed` label
   plus an explicit human review step is the closest analog and is what
   plan.md will codify.

## §8 Open design choices (for user signoff in plan.md)

These are decisions plan.md will recommend a default for; user can override:

- D1: Label namespace — `track:symphony` (with colon) vs `symphony-track`
  (with hyphen) vs bare `symphony`? Default recommendation: `track:symphony`.
- D2: Default routing when no `track:*` label — fixed-flow (status quo,
  recommended) vs require explicit `track:fixed-flow` label?
- D3: `symphony-human-reviewed` lives on the PR or the issue? Default: PR
  (matches "human decides AFTER PR").
- D4: When Symphony hits a true blocker — new `symphony-blocked` label vs
  reuse existing `ready-for-human`? Default: new `symphony-blocked` (keeps
  the two tracks' off-mainline branches separate).
- D5: Should `track:symphony` issues be subject to the `<50 字 issue body`
  conformance check? Default: yes (Symphony can autonomously expand, but
  brief issue body is still cleanest for the human review at the end).

## §9 Files that need to change

| File | Lines now | Change kind | Estimated delta |
|------|-----------|-------------|------------------|
| `docs/SYMPHONY-FLOW.md` | new | NEW (mirror of FIXEDFLOW.md scoped to Symphony track) | ~180 |
| `docs/TWO-DRIVER-COEXISTENCE.md` | new | NEW (anti-collision contract) | ~160 |
| `docs/ISSUE-LIFECYCLE.md` | 142 | PATCH (add Symphony branch + symphony lifecycle anchor) | +50-70 |
| `docs/FIXEDFLOW.md` | 305 | PATCH (scope no-watcher to fixed-flow track only; add `track:symphony` refusal in §0) | +20-30 |
| `CLAUDE.md` (TeamBrain) | 304 | PATCH (new pointer rows for SYMPHONY-FLOW + TWO-DRIVER-COEXISTENCE; new symphony lifecycle canned answer) | +40-60 |
| `docs/plans/2026-05-12-two-drivers/judge.md` | new | NEW (5-probe judge harness) | ~80 |
| GitHub labels | n/a | repo admin runs `gh label create` x4-5 | n/a |

All files stay under the 200-line ceiling (per CLAUDE.md `*.md < 200 lines`
rule) except FIXEDFLOW.md which is already 305 lines pre-patch — patch keeps
it bounded but the file remains over budget. This is preexisting state, not
a regression introduced here.
