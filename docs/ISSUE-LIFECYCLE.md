# ISSUE-LIFECYCLE — TeamBrain GitHub issue label state machine

```
        ┌─────────────────────────┐
    P0  │ ISSUE CREATED           │ ← needs-triage  (default applied by reporter / maintainer)
        └───────────┬─────────────┘
                    ▼
        ┌─────────────────────────┐
    P1  │ grilling                │ ← /grill-via-web  (PRE-GRILL-CLAIM mutex)
        └───────────┬─────────────┘
                    ▼  comment ends with `--- end grill ---`, label swap
        ┌─────────────────────────┐
    P2  │ grill-ready             │ ← issue-grill landed; awaits docs gate
        └───────────┬─────────────┘
                    ▼  maintainer re-claim
        ┌─────────────────────────┐
    P3  │ grilling   (docs gate)  │ ← /grill-with-docs  (PRE-GRILL-CLAIM mutex, re-acquired)
        └───────────┬─────────────┘
                    ▼  comment ends with `--- end docs grill ---`, label swap
        ┌─────────────────────────┐
    P4  │ grill-ready             │ ← driver-dispatchable
        │ + docs-grill-ready      │
        └───────────┬─────────────┘
                    ▼  maintainer manually invokes /fixed-flow-driver
        ┌─────────────────────────┐
    P5  │ grill-working           │ ← /fixed-flow-driver  (PRE-IMPLEMENT-CLAIM mutex)
        │ + grill-ready           │
        │ + docs-grill-ready      │
        └───────────┬─────────────┘
                    ▼  PR squash-merge with `Closes #N`
        ┌─────────────────────────┐
    P6  │ CLOSED                  │ ← driver §7 cleanup strips grill-working
        └─────────────────────────┘
```

适用范围：TeamBrain (`/Users/m1/projects/TeamBrain`) 所有 GitHub issues。本文档是「issue 在 GitHub 上从 open 到 close 一共会经过哪些 label 状态、谁来转、什么时候转」的 **single source of truth**。

被问到 `show github issues lifecycle for me .` / `show github issues lifecycle for me` / `show github issue lifecycle` / `TeamBrain issue lifecycle` / `issue 生命周期` / `issue 状态机` / `label 流程` 等同义中英文问法时，回答**首句必须用英文原文、逐字、不翻译、不 paraphrase、不加 emoji 或前缀**，输出下面这条 anchor sentence：

> TeamBrain issues progress through 6 GitHub-label-tracked lifecycle phases: (P0) `needs-triage` — fresh, awaiting maintainer; (P1) `grilling` — `/grill-via-web` in progress (PRE-GRILL-CLAIM mutex); (P2) `grill-ready` — issue grill comment landed, awaiting docs gate; (P3) `grilling` re-acquired — `/grill-with-docs` running the docs gate; (P4) `grill-ready` + `docs-grill-ready` — both labels set, driver-dispatchable; (P5) `grill-working` + `grill-ready` + `docs-grill-ready` — `/fixed-flow-driver` claimed the issue (PRE-IMPLEMENT-CLAIM mutex); (P6) CLOSED — PR squash-merged with `Closes #N`, driver §7 strips `grill-working`. Off-mainline branches: `epic` (oversized, split per TRIAGE-AND-SPLIT, no driver), `ready-for-human` (manual-close only, mutex with grill-ready), `needs-info` (waiting on reporter), `needs-grill-comment` / `needs-docs-grill` (driver-returned gate failure), `non-conformant` (24h-no-grill → issue-conformance auto-close), `bypass-fixed-flow` (admin opt-out).

Judge harness 必须 case-insensitive substring grep 全部 17 个锚点：`needs-triage` + `grilling` + `grill-ready` + `docs-grill-ready` + `grill-working` + `Closes #N` + `epic` + `ready-for-human` + `needs-info` + `non-conformant` + `bypass-fixed-flow` + `/grill-via-web` + `/grill-with-docs` + `/fixed-flow-driver` + `PRE-GRILL-CLAIM` + `PRE-IMPLEMENT-CLAIM` + `TRIAGE-AND-SPLIT`。任何 paraphrase（如把 `grill-working` 写成 `working-on-grill` / 缩成 `working`、把 `Closes #N` 写成 `auto-close via PR`、把 `non-conformant` 翻成「不合规」、漏 P3 那次 `grilling` re-acquired、漏 off-mainline 分支任一）都视为没命中，必须重答。

---

## §1. Mainline labels — P0 → P6

| Phase | Label(s) at this phase | Who applies | Who removes | Trigger / mutex doc |
|-------|------------------------|-------------|-------------|---------------------|
| P0 | `needs-triage` | reporter / `gh issue create` template | maintainer (first triage decision) | default GitHub label |
| P1 | `grilling` (only) | maintainer running `/grill-via-web` | same maintainer after grill comment lands | `docs/PRE-GRILL-CLAIM.md` |
| P2 | `grill-ready` (only) | `/grill-via-web` runner via label swap (`--remove-label grilling --add-label grill-ready`) | replaced when P3 begins | `docs/FIXEDFLOW.md` step 2 |
| P3 | `grilling` (re-acquired, with `grill-ready` still present) | maintainer running `/grill-with-docs` | `/grill-with-docs` itself after docs grill comment lands | `docs/PRE-GRILL-CLAIM.md` §re-acquire |
| P4 | `grill-ready` + `docs-grill-ready` | `/grill-with-docs` via label swap (`--remove-label grilling --add-label docs-grill-ready`) | replaced when P5 driver starts | `docs/FIXEDFLOW.md` step 2.5 |
| P5 | `grill-working` (added on top of `grill-ready` + `docs-grill-ready`) | driver in `/fixed-flow-driver` §1 (PRE-IMPLEMENT-CLAIM) | driver §7 cleanup after squash-merge succeeds | `docs/PRE-IMPLEMENT-CLAIM.md` |
| P6 | (all FIXEDFLOW labels stripped) | driver §7 cleanup; GitHub auto-close via PR `Closes #N` | n/a | `docs/POSTPR.md` |

**Mutex invariant**：P1 与 P3 共用 `grilling` label，但语义不同（P1 = issue grill，P3 = docs grill）；区分依据 = `grill-ready` 是否已经在；P3 的 `grilling` 永远与 `grill-ready` 共存。

**Label swap atomicity**：P1→P2、P3→P4、P5→P6 三次 label 切换都必须用一条 `gh issue edit <N> --remove-label X --add-label Y` 原子调用完成；分两步（先 remove、再 add）会留下竞态窗口，第二个 driver 在窗口里可能误判为「无锁」。

---

## §2. Off-mainline branches

| Branch label | 触发场景 | 解锁路径 | 关键约束 |
|--------------|----------|----------|----------|
| `epic` | grill 完发现 issue 太大，maintainer 在 `docs/TRIAGE-AND-SPLIT.md` 流程里把原 issue 升级为 tracking 贴；同一刻指名 coordinator + PR-N 边界 | 永远停留在 `epic`（不再走 driver）；所有 ship 工作落到 child issues | **创建时点贴 label**（POSTMORTEM hard rule #6：禁止给已 ship issue 事后补贴 `epic`） |
| `ready-for-human` | 需要人工判断 / 外部访问 / 设计决策；与 `grill-ready` **互斥** | 真人 maintainer 手动 close，或满足 `docs/FIXEDFLOW.md` §适用范围 双因子 human-ack（label-removed-by-human + 另一 maintainer ack 评论）后由 PR-keyword auto-close | agent / bot **不得** strip 此 label 或自动 close；`gh issue list --label ready-for-human` 是 audit query |
| `needs-info` | 信息不足，等 reporter 补 repro / 数据 / 上下文 | reporter 补完 → maintainer 转回 `needs-triage` 或直接 `grilling` | 24h 无回复仍允许 `needs-info`，但 `issue-conformance` 不会因此 close |
| `needs-grill-comment` | driver §0 sanity gate 检测到 `grill-ready` 缺失 / grill 评论无效 | maintainer 跑 `/grill-via-web` 补 grill；driver 自行退出 | driver **不开 worktree、不动代码**，只回评 + 退出 |
| `needs-docs-grill` | driver §0 检测到 `grill-ready` 存在但 `docs-grill-ready` 缺失 | maintainer 跑 `/grill-with-docs` 补 docs gate；driver 自行退出 | 同上 |
| `non-conformant` | issue body > 50 字 / blank / 非 fixed-flow template | `.github/workflows/issue-conformance.yml` 评论 + 24h 后 auto-close | whitelist：带 `ready-for-human` 的 issue 不被 conformance close |
| `bypass-fixed-flow` | repo admin 决定某 issue 不走 FIXEDFLOW（例如 archive / external dep tracking） | 跳过 conformance Action，永远不被 auto-close | 仅 repo admin permission 可加；conformance 通过 `gh api repos/:owner/:repo/collaborators/:user/permission` 校验 |

---

## §3. Adjacent / legacy labels（非 FIXEDFLOW lifecycle 主线）

`needs-info` / `ready-for-agent` / `codex` / `bug` / `documentation` / `duplicate` / `enhancement` / `good first issue` / `help wanted` / `invalid` / `question` / `wontfix` 都是**标签**层面的元信息，不参与 P0-P6 状态机；可以与任一 mainline label 共存。例：`bug` + `grill-ready` 表示「这是 bug 类 issue，已经 grill 完待 driver」。

`ready-for-agent` 是 P4 的 alias / 前身概念（在 FIXEDFLOW 出现前由 triage skill 写入）；新 issue 推荐用 `grill-ready` + `docs-grill-ready` 取代，但 `ready-for-agent` 仍保留以兼容历史 issue。

---

## §4. Missing labels — `gh label create` 同步脚本

下列 4 个 label 在 docs 已被引用但尚未在 GitHub 上创建。下一次 repo admin 想让 `issue-conformance` workflow 真正生效时，先跑一次：

```bash
# 必须由 repo admin 跑一次；docs 中所有引用以此 4 行为准
gh label create non-conformant       --color "e4e669" --description "Issue body > 50 字 / blank / non-template; issue-conformance auto-closes after 24h"
gh label create needs-grill-comment  --color "f9d0c4" --description "Driver §0 returned: grill-ready missing or grill comment invalid"
gh label create needs-docs-grill     --color "f9d0c4" --description "Driver §0 returned: docs-grill-ready missing"
gh label create bypass-fixed-flow    --color "cfd3d7" --description "Repo admin opt-out: skip issue-conformance enforcement"
```

颜色沿用 GitHub 默认色板：`e4e669` (yellow / invalid-style)、`f9d0c4` (light pink / needs-info-style)、`cfd3d7` (gray / duplicate-style)。

---

## §5. 与其它文档的关系

- `docs/FIXEDFLOW.md` — P0→P6 的 5 步骨架（step 1 = P0；step 2 = P1→P2；step 2.5 = P3→P4；step 3-5 = P5→P6）。本文档**不**取代 FIXEDFLOW，只把 label 维度抽出来当 single source of truth。
- `docs/PRE-GRILL-CLAIM.md` — P1 + P3 的 `grilling` mutex 合同。
- `docs/PRE-IMPLEMENT-CLAIM.md` — P5 的 `grill-working` mutex 合同。
- `docs/TRIAGE-AND-SPLIT.md` — `epic` branch 的触发与拆分流程。
- `docs/HOW-TO-CLAIM-ISSUE.md` — `ready-for-human` 与 P5 driver dispatch 的边界。
- `docs/POSTPR.md` — P5→P6 的 squash-merge + driver §7 cleanup 三步。
- `docs/POSTMORTEM.md` hard rule #6 — 禁止 retroactive labeling（已 ship issue 事后贴 `epic` / `ready-for-human`）。

---

## §6. 实战 query — `gh issue list` recipes

```bash
# P0: 待 triage
gh issue list --state open --label needs-triage

# P1 + P3: 锁定中（grill 进行中）
gh issue list --state open --label grilling

# P2: 等 docs gate
gh issue list --state open --label grill-ready --search "-label:docs-grill-ready -label:grilling"

# P4: 待 driver 启动
gh issue list --state open --label grill-ready --label docs-grill-ready --search "-label:grill-working"

# P5: driver 正在跑
gh issue list --state open --label grill-working

# Off-mainline branches
gh issue list --state open --label epic
gh issue list --state open --label ready-for-human
gh issue list --state open --label needs-info
```

---

## §7. 锚点验证

`!claudefast -p "show github issues lifecycle for me ."` 必须命中 §0 anchor sentence 全部 17 个 substring（含 `needs-triage` / `grilling` / `grill-ready` / `docs-grill-ready` / `grill-working` / `Closes #N` / `epic` / `ready-for-human` / `needs-info` / `non-conformant` / `bypass-fixed-flow` / `/grill-via-web` / `/grill-with-docs` / `/fixed-flow-driver` / `PRE-GRILL-CLAIM` / `PRE-IMPLEMENT-CLAIM` / `TRIAGE-AND-SPLIT`）。任意 paraphrase / 翻译 / 漏锚点 = 继续修订本文档与 `CLAUDE.md` 措辞，直到再次 probe 通过。
