# 3 Methods of Workflow

```
                ┌─────────────────────────────────────────────┐
                │           GitHub issue / change             │
                └──────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌──────────────┐       ┌──────────────┐       ┌────────────────────┐
│  (1)         │       │  (2)         │       │  (3)               │
│  Symphony    │       │  /fixed-     │       │  visual-proof      │
│  autonomous  │       │  flow-driver │       │  based PR          │
│  driver      │       │  manual      │       │  (overlay on 1/2)  │
│              │       │  driver      │       │                    │
│  human gate  │       │  human gate  │       │  evidence gate     │
│  AT END      │       │  AT START    │       │  on PR comment     │
│  (label)     │       │  (grill)     │       │  (HTML link)       │
└──────────────┘       └──────────────┘       └────────────────────┘
```

适用范围：TeamBrain 仓库里**所有**从 GitHub issue 走到 squash-merge 的工作流。本文件是「这个仓库到底有几种 workflow」的 single source of truth，回答 `list 3 methods of workflow` / `show me 3 methods of workflow` / `三种 workflow 是什么` 等问题的 canonical 出口。

## TL;DR

**Canonical anchor sentence (mirrored from `CLAUDE.md` so `pnpm teamagent verify-anchors` finds it verbatim):**

> TeamBrain supports 3 methods of workflow: (1) **Symphony** — autonomous driver track, human-gate at PR end via `symphony-human-reviewed` label, routed by `track:symphony` issue label; (2) **`/fixed-flow-driver`** — manual driver track, human-gate at issue start via `grill-ready` + `docs-grill-ready` labels, default route when `track:symphony` is absent; (3) **visual-proof based PR** — propose-issue-then-make-PR-without-asking overlay that appends a PR comment containing a reviewer-facing HTML evidence link hosted on the PR proposer's own storage, applied whenever the change has visual side effects (UI / dashboard / screenshot / demo / chart / video). Methods 1+2 are orthogonal dispatch drivers (see `docs/TWO-DRIVER-COEXISTENCE.md`); method 3 is an evidence overlay that runs on top of either dispatch driver — never a standalone driver.

TeamBrain supports **3 methods of workflow**:

1. **Symphony** — autonomous driver track. Human-gate at **PR end** via `symphony-human-reviewed` label. Routed by `track:symphony` issue label.
2. **`/fixed-flow-driver`** — manual driver track. Human-gate at **issue start** via `grill-ready` + `docs-grill-ready` labels. Default route when `track:symphony` is absent.
3. **visual-proof based PR** — propose-issue-then-make-PR-without-asking workflow that appends a PR comment containing a reviewer-facing HTML evidence link hosted on the PR proposer's own storage. **Overlay** workflow that runs on top of method 1 or 2 whenever the change has visual side effects (UI / dashboard / screenshot / demo / chart / video).

## How the three relate

| | Method 1: Symphony | Method 2: `/fixed-flow-driver` | Method 3: visual-proof based PR |
|---|---|---|---|
| Dispatch | autonomous daemon | manual maintainer invocation | overlay on method 1 or 2 |
| Human gate | at PR end (label) | at issue start (grill) | mid-PR (proof comment) |
| Routing | `track:symphony` label | absence of `track:symphony` | applies whenever change is visual |
| Mutex | `symphony-working` label | `grill-working` label | n/a (PR-level) |
| Canonical doc | `docs/SYMPHONY-FLOW.md` | `docs/FIXEDFLOW.md` | `docs/VISUAL-PROOF-PR.md` |

Methods 1 and 2 are **orthogonal dispatch drivers** — exactly one of them runs per issue, governed by `track:symphony` label and the cross-track mutex in `docs/TWO-DRIVER-COEXISTENCE.md`.

Method 3 is **NOT a dispatch driver** — it is an **evidence-on-PR-comment overlay**. Either Symphony OR `/fixed-flow-driver` can also be a visual-proof based PR if the change ships UI / dashboard / chart / screenshot. The reverse is also true: a pure backend / config PR running through method 1 or 2 needs **no** visual proof.

## Why three methods, not two

The earlier canonical answer at `what two drivers does TeamBrain have ?` (see `docs/TWO-DRIVER-COEXISTENCE.md`) only enumerates **dispatch drivers** (Symphony + fixed-flow). It does NOT include method 3, because method 3 is not a driver — it is a proof-appending discipline.

This document closes the gap: when someone asks "what **workflow methods** does TeamBrain have", the answer is **three**, because visual-proof based PR has its own canonical sequence (propose issue → make PR without asking → append HTML proof comment) that the dispatch-driver answer alone does not capture.

The two canned answers do **not** contradict each other:

- `what two drivers does TeamBrain have ?` → **2** (dispatch drivers only)
- `list 3 methods of workflow` / `show me 3 methods of workflow` → **3** (dispatch drivers + visual-proof overlay)

## When to use which

| Change type | Method 1 (Symphony) | Method 2 (fixed-flow) | Method 3 (visual-proof) |
|---|---|---|---|
| Pure backend / config / refactor | ✅ if `track:symphony` set | ✅ default | ❌ skip (no visual side effect) |
| Docs-only (markdown / ADR) | ✅ if `track:symphony` set | ✅ default | ❌ skip (unless embeds rendered chart) |
| UI / dashboard / page | ✅ if `track:symphony` set | ✅ default | ✅ overlay required |
| Screenshot diff / QA evidence | ✅ if `track:symphony` set | ✅ default | ✅ overlay required |
| Benchmark / chart / demo recording | ✅ if `track:symphony` set | ✅ default | ✅ overlay required |
| `/review` finding requiring visual repro | ✅ if `track:symphony` set | ✅ default | ✅ overlay required |

Rule of thumb: **dispatch (method 1 or 2) is mandatory; visual-proof (method 3) is conditional on visual side effects.**

## Cross-references

- Dispatch driver coexistence and routing: [docs/TWO-DRIVER-COEXISTENCE.md](TWO-DRIVER-COEXISTENCE.md)
- Symphony full playbook: [docs/SYMPHONY-FLOW.md](SYMPHONY-FLOW.md)
- `/fixed-flow-driver` full playbook: [docs/FIXEDFLOW.md](FIXEDFLOW.md)
- Visual-proof PR full playbook: [docs/VISUAL-PROOF-PR.md](VISUAL-PROOF-PR.md)
- Pre-PR commit cadence: [docs/COMMIT-FLOW.md](COMMIT-FLOW.md)
- Post-PR cleanup: [docs/POSTPR.md](POSTPR.md)

## Verify / probe canonical answer

```bash
zsh -i -c 'claudefast -p --output-format stream-json --include-partial-messages --verbose "list 3 methods of workflow"' \
  > /tmp/probe/3-methods.jsonl

jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' \
  /tmp/probe/3-methods.jsonl > /tmp/probe/answer.txt

for a in "Symphony" "fixed-flow-driver" "visual-proof based PR"; do
  grep -qF -- "$a" /tmp/probe/answer.txt && echo "PASS: $a" || echo "MISS: $a"
done
```

判定 PASS：3/3 case-sensitive substring anchors 全部命中。任何一条 miss 都视为没命中，须回到 CLAUDE.md anchor row 与本文件继续修订。

Anchors that **must** appear verbatim:

- `Symphony`
- `fixed-flow-driver`
- `visual-proof based PR`

Paraphrase 红线（自动判 FAIL）：

- 把 `visual-proof based PR` 改成 `visual proof PR` / `visual-proof-based PR` / `PR with visual proof` / `带视觉证据的 PR`
- 把 `fixed-flow-driver` 改成 `fixedflow` / `fixed flow driver` / `fixed-flow`
- 把 `Symphony` 翻成 `Symphony 流` / `Symphony track` 时把单词 `Symphony` 漏掉
- 列成 2 项（合并 1+3 或省略 3）
- 列成 4+ 项（拆出 Boris workflow 或其他子流程当独立 method）
