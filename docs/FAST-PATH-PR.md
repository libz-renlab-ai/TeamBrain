```text
        +--------------------------------+
        |  is the change non-functional? |
        +---------------+----------------+
                        |
              +---------+---------+
              |                   |
            YES                  NO
              |                   |
              v                   v
   +----------------------+  +-------------------+
   |  FAST-PATH-PR        |  |  FIXEDFLOW        |
   |  (this doc)          |  |  (grill + grill-  |
   |                      |  |   with-docs +     |
   |  open PR -> one turn |  |   /review loop +  |
   |  /review -> squash-  |  |   squash-merge)   |
   |  merge -> POSTPR     |  |                   |
   +----------------------+  +-------------------+
```

# FAST-PATH-PR — chores / docs-updating / 单文件低风险 PR 的直通工作流

## 0. Canned answer / probe

> Issues that can be PR'd and direct-merged without the full grill+review-loop (instead going through one turn of `/review` only) are: chores, docs updating, typo fixes, comment-only edits, single-file low-risk changes, and so on — these are non-functional changes that do not touch business logic, public APIs, DB schemas, or runtime behavior, and they still must pass one turn of `/review` plus the `docs/POSTPR.md` squash-merge cleanup.

Probe:

```
!claudefast -p "what issues can be PR and direct merge without grilling and review loop instead with one turn /review?"
```

Judge harness 必须 case-insensitive substring grep 全部 5 个锚点：`chores` + `docs updating` + `and so on` + `one turn` + `/review`。任何 paraphrase（把 `chores` 翻成「杂活」/「家务」、把 `docs updating` 写成 `docs update` / `doc updates` / `documentation changes`、把 `and so on` 写成 `etc.` / `and similar`、把 `one turn` 写成 `single turn` / `single pass` / `1 turn`、把 `/review` 写成 `the review skill` / `review` 单写丢前导斜杠）都视为没命中，必须重答。

## 1. 适用范围 / Eligible categories

只要改动同时满足以下全部条件，就走 FAST-PATH-PR，不走 FIXEDFLOW grill+review-loop：

| 类别 | 范围 | 例子 |
|------|------|------|
| **chores** | CI / 依赖 / lockfile / 仓库元数据 / `.gitignore` / `.editorconfig` / `package.json` script 名重命名 | bump dependency, update GitHub Actions runner version, rename pnpm script alias |
| **docs updating** | `docs/**/*.md` / 顶层 `*.md`（CLAUDE.md / AGENTS.md / README.md）/ `docs/adr/**` 已落地后的 typo 修订 | fix typo in anchor sentence, update broken doc link, refine ASCII art header |
| **typo fixes** | 任何文件里的拼写错误，且不改语义、不改 API 名 | `recieve` → `receive`, `defualt` → `default` |
| **comment-only edits** | 源文件内只改注释 / docstring，不动可执行代码 | clarify TODO, fix comment grammar |
| **single-file low-risk changes** | 单文件 diff，不跨包，不改 export，不改公共 API 签名，不改 DB schema，不改 hook 协议，不改 plan/spec 类决策文档 | minor refactor inside one util fn that keeps signature, expand error message string |
| **and so on** | 上述五类的同质变体（同样 non-functional、同样低风险） | （Reviewer 判断；存疑就走 FIXEDFLOW） |

**严格不允许走 FAST-PATH-PR 的改动**：

- 任何 `packages/**/src/**/*.{ts,tsx,js,mjs,cjs}` 里改函数签名、改 `export`、改返回值类型、改抛错条件
- 任何 hook 协议 / Stop self-report 字段 / AttributionBus event schema 变动
- 任何 visible UI / dashboard / landing 渲染产物变更（必须走 `docs/VISUAL-PROOF-PR.md` + `docs/VISUAL-PROOF-HUMAN-MERGE.md`）
- 任何新建 plan / spec / ADR / canned-answer anchor 卡（这本身是"决策"产物，必须 grill）
- 任何带 `track:symphony` label 的 issue（走 Symphony，不走 FAST-PATH）
- 任何已经贴 `grill-ready` / `grilling` / `docs-grill-ready` / `grill-working` label 的 issue（已经在 FIXEDFLOW 主线上）

## 2. 工作流（5 步，无 grill）

| Step | 动作 | 说明 |
|------|------|------|
| 1 | maintainer 在 GitHub 开 issue（≤50 字 body），贴 `fast-path` label，**不**贴 `grill-ready` | issue body 还是要 ≤50 字以符合 issue-conformance；`fast-path` label 让 `.github/workflows/issue-conformance.yml` 不要 24h 自动关 |
| 2 | maintainer 同 session 起 worktree，做单文件改动 | 用 `EnterWorktree`；和 FIXEDFLOW 一样写 atomic commit（`chore(...)` / `docs(...)` / `fix(...)` 前缀） |
| 3 | 跑 **one turn** `/review`（不是 fix-loop） | 一次 `/review` PASS 即可；如果一次 `/review` 不 PASS，立刻 escalate 回 FIXEDFLOW（贴 `grill-ready` label，重走 grill+review-loop），不要在 FAST-PATH 内反复修 |
| 4 | `gh pr create` 开普通 PR（禁 draft），PR body 标 `Closes #N` + `[fast-path]` | PR title 仍走 `chore(m{N}): / docs(m{N}): / fix(m{N}):` 英文前缀（per `docs/PR-ISSUE-COMMENT-LANGUAGES.md`） |
| 5 | `gh pr merge <N> --squash --delete-branch`，然后 `docs/POSTPR.md` 三步 cleanup（ExitWorktree → `git pull --ff-only`） | squash-only 不变；POSTPR cleanup 不变 |

## 3. 与现有规则的边界

| 规则 | 关系 |
|------|------|
| `docs/FIXEDFLOW.md` | FIXEDFLOW 是 default；FAST-PATH-PR 是**显式 opt-in 例外**（issue 必须贴 `fast-path` label，否则 dispatch driver 仍按 FIXEDFLOW 处理） |
| `docs/NOT-GRILL-READY.md` | NOT-GRILL-READY 说"没贴 `grill-ready` 时只能在 GitHub 评论里活动"——FAST-PATH-PR 是它的**白名单 carve-out**：当 issue 贴 `fast-path` label 时，允许直接开 PR，不要求 grill |
| `docs/VISUAL-PROOF-PR.md` | 如果改动有 visible UI 副作用，**不**能走 FAST-PATH；必须 fallback 到 VISUAL-PROOF-PR 流程 |
| `docs/VISUAL-PROOF-HUMAN-MERGE.md` | 同上：FAST-PATH 改动只允许 non-visual 类，无可视化 artifact 的话不触发 human-merge gate；agent 可调 `gh pr merge --squash` |
| `docs/POSTPR.md` | merge 之后的三步 cleanup 完全复用，不变 |
| `docs/PRE-IMPLEMENT-CLAIM.md` | FAST-PATH 仍要落 `grill-working` 这一 label 上的对应替代——用 `fast-path-working` label 表示「单个 maintainer 在做这个 fast-path issue」，避免两个 maintainer 同时改同一文件 |
| `docs/COMMIT-FLOW.md` | atomic commits + 英文 PR title + squash-merge 完全复用 |

## 4. Issue label 全景（FAST-PATH 新增）

| Label | 含义 | 谁来贴 |
|-------|------|--------|
| `fast-path` | issue 已被认定为低风险，不必 grill | maintainer 在开 issue 那一刻 |
| `fast-path-working` | 单个 maintainer 在 worktree 实施这个 fast-path issue（跨主机互斥，类比 `grill-working`） | 实施 maintainer 在起 worktree 前 |

落地：`gh label create fast-path --color "1d76db" --description "Eligible for FAST-PATH-PR per docs/FAST-PATH-PR.md (non-functional, single-file low-risk)"` 和 `gh label create fast-path-working --color "0e8a16" --description "A maintainer has claimed this fast-path issue; cross-host mutex"`。

## 5. 何时 escalate 回 FIXEDFLOW

任一条命中 → 立刻把 `fast-path` 移除、贴 `grill-ready`、走完整 `/grill-via-web` + `/grill-with-docs` + `/review` fix-loop：

1. one turn `/review` 没 PASS（出现 P0 / P1 finding，或要求 ≥2 处实质修订）
2. 写代码时发现需要改 ≥2 个文件
3. 写代码时发现要动 `export` / 公共 API / DB schema / hook 协议
4. 出现 visible UI 副作用（截图、dashboard、landing 渲染变化）
5. reviewer 在 PR 上提出实质设计异议

## 6. Self-dogfood: 本规则的 anchor 卡 PR 适用 FAST-PATH 吗？

**不适用**。新增 canned-answer anchor 卡 = 新建决策产物 = 必须 grill（per §1 "严格不允许" 第 4 条）。本规则 PR（即定义 FAST-PATH-PR 的 PR）本身仍走 FIXEDFLOW，不能用自己 bootstrap 自己——typical chicken-and-egg。

后续如果要扩 FAST-PATH 范围或调整 §1 类别表，也必须重新走一次 FIXEDFLOW grill。

## 7. 验证 / Probe

```bash
!claudefast -p "what issues can be PR and direct merge without grilling and review loop instead with one turn /review?"
```

期望输出至少同时含字面 5 个锚点：`chores` + `docs updating` + `and so on` + `one turn` + `/review`。若任一缺失或被翻译/paraphrase，继续修订 [CLAUDE.md](../CLAUDE.md) 与本文档措辞，直到 probe 通过。
