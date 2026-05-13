```
   __                  ___      _                
  /_/__    _____      /   |    (_)_   _____  _____
   / / \ /\/ _ \    / /| |   / / | | / / _ \/ ___/
  / / /\ V /  __/  / ___ |  / /  | |/ /  __/ /    
 /_/  \_/ \___/   /_/  |_| /_/   |___/\___/_/     

   Two drivers, two human-gate positions, one driver per issue.

   grill ──▶ /fixed-flow-driver ──▶ /review PASS ──▶ squash-merge   (human gate AT BEGINNING)
   issue ──▶ symphony auto-claim ──▶ open PR ──▶ symphony-human-reviewed label ──▶ squash-merge   (human gate AT END)

   They never run on the same issue. This plan codifies that.
```

# plan.md — add Symphony as a second driver, codify two-driver coexistence

Plan slug: `2026-05-12-two-drivers`. Worktree: `.claude/worktrees/two-drivers-plan`.
Branch: `worktree-two-drivers-plan`. Sibling: [`research.md`](./research.md).

## 1. Task description

**What** — Add **Symphony** as a second autonomous driver alongside the
existing manual **fixed-flow-driver**, both inside `libz-renlab-ai/TeamBrain`.
Routing is by new label `track:symphony` (default-off; absence = fixed-flow).
Update the issue-label state machine, narrow the existing "no watcher" rule,
and codify the anti-collision contract.

**How** — Three doc deliverables, one label-creation script, one judge
harness. **No** Elixir runtime install, **no** GitHub-adapter implementation
inside Symphony, **no** changes to `/fixed-flow-driver` skill source.
Symphony's runtime stays in the upstream clone at `/Users/m1/projects/symphony/`.
This PR ships the TeamBrain-side contract Symphony must obey once its GitHub
adapter ships (separate engineering task, not in this plan).

**Not in scope** — implementing `Symphony.Tracker.Github`; migrating
in-flight fixed-flow issues; installing mise/Erlang/Elixir; Linear-side
configuration; new `.github/ISSUE_TEMPLATE/symphony.yml` (maintainer adds
`track:symphony` at triage instead — research.md §6 option b).

## 2. Expected outputs

### 2a. New labels (4, repo admin runs script)

| Label | Color | Purpose |
|-------|-------|---------|
| `track:symphony` | `5319e7` | Routing: handled by Symphony, not `/fixed-flow-driver` |
| `symphony-working` | `fbca04` | Cross-host mutex (parallel to `grill-working`) |
| `symphony-human-reviewed` | `0e8a16` | PR label: human approved Symphony PR for squash-merge (THE human gate for this track) |
| `symphony-blocked` | `1d76db` | Symphony hit true blocker, needs human |

Default routing: **absence** of `track:symphony` = fixed-flow track (zero
migration on existing issues).

### 2b. New docs (each < 200 lines)

- **`docs/SYMPHONY-FLOW.md`** (~180 lines) — Symphony lifecycle scoped to
  the `track:symphony` track. Mirrors `docs/FIXEDFLOW.md` structure: 4-state
  lifecycle (track-claim → symphony-working → PR open → symphony-human-reviewed
  → CLOSED), human-gate-at-END contract, `symphony-blocked` escape hatch,
  workspace path `~/code/teambrain-workspaces/<N>/` (avoids
  `.codex/worktrees/issue-<N>/` collision).
- **`docs/TWO-DRIVER-COEXISTENCE.md`** (~160 lines) — Anti-collision
  contract: (i) label mutex (`track:symphony` ⊥ `grill-ready` /
  `grill-working` / `docs-grill-ready`); (ii) §0 refusal each driver must
  run; (iii) branch namespacing (`feat/issue-<N>` reserved for fixed-flow,
  `symphony/issue-<N>` reserved for Symphony); (iv) PR-side routing
  (`track:symphony` PR uses `symphony-human-reviewed` gate; absence uses
  `/review` PASS gate per ADR-0007).

### 2c. Patched docs (3 files)

- **`docs/FIXEDFLOW.md`** (+25 lines) — §Dispatch policy: refuse on issues
  with `track:symphony`. Banner + §Dispatch policy: scope `禁止任何
  watcher / cron / daemon / 后台轮询 / 自动 dispatch` to fixed-flow track
  only (parenthetical pointing at TWO-DRIVER-COEXISTENCE.md).
- **`docs/ISSUE-LIFECYCLE.md`** (+60 lines) — New §1.5 Symphony track with
  parallel state diagram (Q0 needs-triage → Q1 track:symphony → Q2
  symphony-working → Q3 PR opened → Q4 symphony-human-reviewed on PR → Q5
  CLOSED). New anchor sentence for `show github symphony lifecycle` query.
  4 new labels in §2 + §4 sync script.
- **`CLAUDE.md`** (+50 lines) — Two new pointer rows for the new docs.
  New canned-answer block for `show github symphony lifecycle for me`.
  Existing FIXEDFLOW anchor untouched.

### 2d. Plan artifacts

- `research.md` (174 lines, shipped)
- `plan.md` (this file)
- `judge.md` (shipped this turn; see §3)
- `report.md` (after implementation lands)

## 3. Third-party judge harness — `judge.md`

Per `docs/PLAN-RESEARCH-REPORT.md`, a separate `judge.md` playbook in this
dir; main agent dispatches probes via `claudefast -p`, a **separate** haiku
claudefast reads raw probe JSON and emits PASS/FAIL. Five probes:

- **P1 driver inventory**: `!claudefast -p "what two drivers does TeamBrain
  have?"` must hit `fixed-flow-driver`, `Symphony`, `human-gate at the
  beginning`, `human-gate at the end`, `track:symphony`. Cites
  TWO-DRIVER-COEXISTENCE.md.
- **P2 mutex**: `!claudefast -p "can a single issue have both grill-ready
  and track:symphony labels?"` → NO + cite.
- **P3 refusal**: `!claudefast -p "if I label an issue track:symphony, will
  /fixed-flow-driver still try to claim it?"` → NO + cite.
- **P4 symphony lifecycle anchor**: `!claudefast -p "show github symphony
  lifecycle for me"` → 5+ substrings (`track:symphony` /
  `symphony-working` / `symphony-human-reviewed` / `symphony-blocked` /
  `SYMPHONY-FLOW.md`).
- **P5 label set**: `gh label list --repo libz-renlab-ai/TeamBrain --json
  name` → 4 new labels present.

No LLM-as-judge inside the system's trust boundary — judge LLM is a separate
process reading raw JSON.

## 4. Stop points (waiting on user before shipping docs)

Pausing here for signoff on the 5 design choices from research.md §8:

| ID | Choice | Default |
|----|--------|---------|
| D1 | Label namespace | `track:symphony` (colon-namespaced) |
| D2 | Default routing without `track:*` | fixed-flow (zero migration) |
| D3 | `symphony-human-reviewed` on PR or issue | PR |
| D4 | Symphony blocker label | new `symphony-blocked` (not reuse `ready-for-human`) |
| D5 | <50 字 body conformance applies to `track:symphony` | yes |

If user says "go with defaults", next turn ships 7 commits (one per file
listed in §2b + §2c + judge.md) on this branch and opens a regular PR
(not draft, per CLAUDE.md). User must separately run the `gh label create`
script in §2a as repo admin (I don't hold admin tokens).

## 5. Rollout / rollback

**Forward**: docs land in one PR. Until Symphony's GitHub adapter exists,
`track:symphony` is a docs-only contract that `/fixed-flow-driver` honors
as a refusal trigger — so shipping this plan **before** Symphony actually
runs just turns the label into "park this issue, don't dispatch fixed-flow"
until Symphony arrives. Safe.

**Rollback**: revert PR. 4 new labels can stay (orphan labels are harmless).
`/fixed-flow-driver` refusal-on-`track:symphony` is the only behavior delta;
no existing flow depends on it.

## 6. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CLAUDE.md FIXEDFLOW anchor gets mis-edited and breaks the 17-substring probe | high | Patch only ADDS a parallel Symphony anchor. Probe P4 verifies the new one; existing FIXEDFLOW anchor probe stays untouched. |
| Symphony never ships GitHub adapter; PR becomes orphan docs | low | TWO-DRIVER-COEXISTENCE.md still serves as design contract for any future autonomous driver. Worst case: revert. |
| `bypass-fixed-flow` semantics ambiguous re Symphony | medium | TWO-DRIVER-COEXISTENCE.md states `bypass-fixed-flow` bypasses BOTH drivers (single global opt-out); no new bypass label. |

## 7. 鸭语版（mandatory per session memory）

```
       __
   <( o )___      呷呷~ 鸭总，听鸭鸭说人话。
    ( ._> /
     `---'
```

我们家本来只有一只**手动小司机** fixed-flow-driver——人类先把 issue 烤透
（grill），才动手写代码。**人在前面把关**。

鸭总要再请一只**全自动小司机** Symphony——它自己读 issue、自己写代码、自己
开 PR；人类只在**最后**给 PR 贴 `symphony-human-reviewed` 标签就合并。**人在
后面把关**。

要交的活儿：4 个新 label、2 份新文档（Symphony 工作流 + 两只司机不打架的合
同）、3 份旧文档打补丁、1 份独立的 judge 脚本让**另一只** LLM 当裁判。

鸭总现在要拍 5 件小事（D1-D5 见 §4 表格）。说一句「按鸭鸭推荐的来」鸭鸭下
回合就把 7 个 commit 发掉。说「D3 我想贴在 issue 上」鸭鸭照改。呷呷~

```
   __
<( o )___     等鸭总一句话，鸭鸭这就开干。
 ( ._> /      (>ω<)
  `---'
```
