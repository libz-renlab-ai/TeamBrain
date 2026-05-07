```text
                research → plan → annotate → implement → report
                    ▲                                       │
                    └─────── findings reroute ──────────────┘

issue #82  e2e probe research notes
```

# issue #82 团队共享 e2e probe — research

> Date: 2026-05-07
> Worktree: `.claude/worktrees/issue82`（**位置不合规**：CLAUDE.md 要求 `.codex/worktrees/`，由 harness 初始化，未迁移以避免丢失 commit `8219661`）
> 参考: docs/CONTEXT.md（canonical glossary），docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md，docs/features/team-share.md

本文件**只汇总事实与决议**，不写工作计划。计划见同目录 `2026-05-07-issue82-team-sharing-plan.md`。

---

## 1. issue #82 现状

| 项 | 值 |
|---|---|
| state | OPEN |
| label | enhancement |
| comments | 0 |
| blocker | issue #81（3 人 personal-use eval）OPEN |
| issue body 假设 | "group sharing 是绿地设计任务" |
| 实际状况 | M5 viral sync 已经在 2026-05-06 经 PR #71 合并 main |

issue body 列了 5 个 "必须答完的问题"，其中 4 个已经被 M5 spec 答了：

- Q1（错误怎么记录）→ pitfall 自动 m5-share，secret + scope 双闸门
- Q2（怎么传到 B）→ git-backed `.teamagent/team/<author>/<rule_id>.json` + auto commit + `teamagent sync push|pull`
- Q3（B 何时看到）→ `.githooks/post-merge` → `m5-sync --apply`，runtime 通道 PreToolUse / UserPromptSubmit / Stop
- Q4（噪声控制）→ 硬性密钥扫描 + scope classifier `uncertain → personal` + Calibrator v2
- Q5（怎么验证 metric）— **未答**：m5-auto-demo / xsync judge 都没真正落地 `positiveTriggerRate=1, falsePositiveRate≈0`

## 2. 现存代码 / 文档资产清单

| 路径 | 内容 | 与 #82 的关系 |
|---|---|---|
| `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md` | M5 完整设计：infect / bootstrap / sync / enforcement，L1/L2/L3，两道闸门，LWW + tombstone | answer to issue body Q1–Q4，不重写 |
| `docs/features/team-share.md` | IMPLEMENTED 状态：dual store、scope_level、CLI 支持、闸门、post-merge | 写 #82 时**直接引用**，不重做 |
| `docs/features/planned/cross-machine-sync.md` | Phase 4 PLANNED — 已被 M5 supersede | C deliverable 候选：归档或改为 stub 指向 M5 |
| `packages/cli/src/commands/m5-share.ts / m5-sync.ts / m5-publish.ts / m5-infect.ts / m5-bootstrap.ts / m5-status.ts / m5-delete.ts` | M5 CLI 全套 | probe harness 复用 |
| `packages/cli/src/commands/team-transfer.ts / git-sync.ts` | 早于 M5 的手动 export/import | probe 不复用，仅记录历史 |
| `packages/core/src/m5/secret-scanner.ts` | 闸门 1：永久 sealed | probe 走默认开 |
| `packages/core/src/m5/scope-classifier.ts` | 闸门 2：`personal/shareable/uncertain`，uncertain → personal | probe 用 shareable 路径 |
| `packages/core/src/m5/team-rule-projection.ts:22–27` | 给 team 规则打 `scope.level=team` + tag `original-author:<name>` | **#82 attribution chain 锚点** |
| `packages/core/src/m5/lww-merge.ts`（推测）+ tombstone | 冲突裁决 | 不在 #82 验证范围 |
| `scripts/m5-auto-demo.sh` | bare repo + 双 HOME alice/bob，模拟 SessionStart 走完管线 | **transport 已验**，metric 未验 |
| `docs/features/xsync/run-judge.sh` | bare remote + machine-a/b，跑 `teamagent sync push/pull`，dump judge.json | **transport 已验**，没跑 hook 拦截 |
| `docs/features/pii-redaction/run-judge.sh` | 闸门 1 e2e | 与 #82 正交 |
| `docs/PRODUCT-FEATURES.md` §132 / §191 | 已 claim VERIFIED 包括 viral spread & auto-sync | **#82 通过后不新增 row，仅在 evidence 列追加 e2e probe 证据指针** |

## 3. AttributionEvent / hook 事件 schema 现状

两套互补 taxonomy：

**(a) 用户可见 AttributionEvent**（`packages/types/src/attribution.ts:7`）

```ts
interface AttributionEvent {
  source: "pitfall" | "compiler" | "hook-pre" | "hook-post" | ...;
  action: string;
  target?: { id?: string; file?: string; count?: number };  // rule_id 在 target.id
  severity: "info" | "highlight" | "warning";
  timestamp: string;  // ISO 8601
}
```

**(b) calibrator 观测事件 kind**（`packages/core/src/calibrator/default.ts:13–15, 82–117`）

| kind | 含义 |
|---|---|
| `hook-pre.matched` | matcher 命中，未决策 |
| `hook-pre.warned` | 软提示已发 |
| `hook-pre.blocked` | 硬拦截已发 |
| `hook-pre.warned.doc_context` / `.blocked.doc_context` | matcher 自识别为 doc/test 上下文（FP 反信号） |
| `hook-post.result` | tool 执行结果 |

**#82 trigger 定义只用 (b)** — `warned ∪ blocked`，doc_context 排除。

## 4. 团队规则 author chain 现状

`team-rule-projection.ts:22–27` 已经给 team 规则打：

```ts
scope: { level: "team", ... }
tags: ["m5-team-sync", `original-author:${originalAuthor}`]
```

含义：B 端 hook-pre.warned 事件触发时，从 rule_id → 项目 KB → 该 rule 的 tags → `original-author:alice`，attribution chain 自动补全。**无需新加字段**。

唯一缺的是 "alice 那次 [teamagent-sync] commit 的 SHA"——需要 probe harness 在 alice 端 push 完后 `git log -1 --format=%H` 显式抓一次写入 judge.json。

## 5. 现有 verify 的实际拓扑（不要再误判）

`scripts/m5-auto-demo.sh`（已读 80 行）：

- bare repo on disk as remote（**T1**）
- alice / bob 各自独立 git repo + 独立 HOME（含 .teamagent/global.db 装/没装的差异）
- SessionStart 模拟：`echo '{"cwd":"$ALICE"}' | node bin-session-start.ts`（**C1**）
- pitfall 走 `--non-interactive` CLI 直接灌（不真启 claude）
- m5-publish `--no-push` + 手动 `git push origin main` 到 bare repo
- bob 端 `git pull` → post-merge → m5-sync apply → 看到规则进 KB

**结论**：transport（push/pull/gates/projection/lww/post-merge）全打通了。**hook 拦截 metric** 没打。

`docs/features/xsync/run-judge.sh`（已读 60 行）：

- bare remote + machine-a/b + isolated HOMEs
- 通过 tsx 直接灌 5 条 team 规则进 machine-a KB
- 跑 `sync push --remote bare`，再 `sync pull`，断 metadata 是否一致
- **完全不跑 hook 拦截**

## 6. 决议（grill Q1–Q6）

| Q | 答案 | 说明 |
|---|---|---|
| Q1 frame | **B + C** | B = e2e probe-only spec；C = M5 gap delta |
| Q2 术语 | team / viral sync / git-backed transport / author / teammate / L1-L2-L3 | 已落 docs/CONTEXT.md commit `8219661` |
| Q3 拓扑 | **T3a + C3-hybrid** | 真 GitHub remote / 1 PAT / 2 git author identity；tmux 双 pane，每 pane 跑 `claudefast -p --output-format stream-json` 一次性 prompt |
| Q3 K/N | **K=5, N=20** | PTR 精度 0.2，FPR 精度 0.05 |
| Q5 protection | **跑两遍**（off + on） | C deliverable 核心证据 |
| Q5 repo | **专用 `libz-renlab-ai/TeamBrain-team-sharing-probe`** | 避污染主仓库 |
| Q6 trigger | `hook-pre.warned ∪ hook-pre.blocked`，rule_id 对、scope=team、tag 含 `original-author:alice`，事件晚于 alice push commit | `*.doc_context` 排除 |
| Q6 K/N 构造 | **blind 协议**：scenario-designer = 独立 claudefast session，仅得 `trigger_phrase`；输出 25 prompts JSON，sha256 写 judge.json | author 不参与 |
| Q6 阈值 | **PTR=1.0 严格 / FPR=0.0 严格 / attribution_chain_complete=true / m5_protected_branch_blocks_push=1.0（on 跑）** | 任一偏离视为 #82 不通过 |

## 7. 风险与已知约束

| 风险 | 影响 | 缓解 |
|---|---|---|
| worktree 在 `.claude/worktrees/`（违规） | 不阻塞工作；PR review 时易被指 | 在 PR description 显式标注，承诺下次按 `.codex/worktrees/` |
| #81 未关 | "personal use 是否真有用"未独立证明 | #82 只验 sync transport + hook trigger，不替 #81；report 中显式分离 |
| 真跑需 GitHub repo 创建 + tmux + claudefast 真凭据 | 需用户授权 | 本轮只交付 spec + harness scaffold；执行动作走 user approval |
| 模型敏感性 | claudefast (MiniMax-M2.7-highspeed) 跟真 claude 触发率不同 | judge.json `topology.model` 字段记录；不在 metric 里钉死模型 |
| `[teamagent-sync]` push 在 protected main 必失败 | M5 已知行为，C deliverable 重点 | 第二遍 probe 跑 protection=on 显式记录 reject reason |

## 8. 待执行动作（需用户授权，本 research 不动）

1. `gh repo create libz-renlab-ai/TeamBrain-team-sharing-probe --public --confirm`（或 private）
2. 跑 `bash docs/features/team-sharing-probe/run-judge.sh --branch-protection=off`
3. 在 GitHub 给 main 加 protection（require PR / disallow direct push）
4. 跑 `bash docs/features/team-sharing-probe/run-judge.sh --branch-protection=on`
5. 写 report.md 收尾 → 开普通 PR（非 draft）
