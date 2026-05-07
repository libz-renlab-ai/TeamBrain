```text
   M5 viral sync (PR #71, 2026-05-06)
                │
                ▼
   ┌────────────────────────────────────┐
   │ ✓ transport (push/pull/post-merge) │
   │ ✓ gates (secret + scope)           │
   │ ✓ projection (author tag preserved) │
   │ ✓ LWW + tombstone (single-machine) │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ ✗ hook trigger metric (← #82)      │
   │ ✗ branch protection compatibility  │
   │ ✗ C3-strict REPL metric channel    │
   │ ✗ cross-project sharing            │
   │ ✗ cryptographic signing            │
   │ ✗ stale planned/cross-machine doc  │
   └────────────────────────────────────┘
```

# issue #82 — M5 viral sync gaps delta（C 交付物）

> Date: 2026-05-07
> 关联: `2026-05-07-issue82-team-sharing-e2e-probe.md`（B 交付物）+ `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`（M5 spec）

本文件枚举 M5 viral sync 已知 / 实测的 gap，每条指向 follow-up issue 候选；**不重写 M5 设计**。

---

## 1. M5 spec §1 显式声明的 out-of-scope（非 bug）

| 编号 | M5 §1 原文 | 说明 | 推荐处置 |
|---|---|---|---|
| OOS-1 | "防恶意绕开（无 cryptographic 签名）" | 任何成员可伪造 author tag、绕过 secret scanner | 不修；写明在 SECURITY.md / FAQ；恶意场景由 git commit author 与 GPG 签名兜底（用户工作流而非 TeamBrain 机制） |
| OOS-2 | "跨项目（跨远程仓库）的规则共享" | 一条 alice 在项目 P1 写的规则不会自动出现在项目 P2 | 不修；属 `scope.level=global` 责任范围；若需跨 repo 复用 → user 走 `team-transfer.ts` export/import |
| OOS-3 | "真 P2P 网络（DHT、IP 直连）" | 必须有 git remote 作为锚点 | 不修；产品定位：TeamBrain 是 git-native，不是网络层 |
| OOS-4 | "单独的中央规则服务器" | 没 SaaS、没 API gateway | 不修；同 OOS-3 |

## 2. Probe 实测会暴露的 gap

### G1 — branch protection 完全阻塞 viral sync

- **现象**：M5 `m5-publish` = `git commit [teamagent-sync] ... && git push origin main`。GitHub 上 main 分支若启用 "require PR / disallow direct push"，push 直接 reject。
- **M5 spec 引用**：spec §5.1 流程图最后一步 "[自动 push] 失败则 fetch+rebase 重试 ≤ 3"；不会触发 PR 创建。
- **probe 验证**：第二遍 run（branch_protection=on）将 `m5_protected_branch_blocks_push=1.0` 视为 PASS_ON 必满足条件。即"M5 在 protected main 下**确定不能**自动同步"是 known and verified 行为。
- **Follow-up issue 候选标题**：`[feat] viral sync 在 protected main 下走自动 PR 路径`
  - 三段式（HOWTOISSUE）：(1) 现象：protection on 时 push reject (2) 复现：跑本 probe 第二遍 (3) 修复验证清单：M5 sync 触发 `gh pr create` + `gh pr merge --auto`（需 PAT 有 PR write 权）；保留新 [teamagent-sync] 前缀；同 author 字典序冲突仍走 LWW

### G2 — C3-strict REPL metric 通道缺失

- **现象**：本 probe 用 C3-hybrid（一次性 prompt 走 `claudefast -p --output-format stream-json`）；**真用户在 interactive `claudefast` REPL 里随手敲**时，hook 仍然跑、calibrator 仍然记，但**没有结构化通道**让外部脚本拿到"这次自由打字命中了哪条规则"。
- **现状**：`packages/cli/src/bin-pre-tool-use.ts` 等只往 `.teamagent/events/*.jsonl` 写 calibrator kind 事件；prompt 文本 / claudefast session id 没标，无法把 "user input X 触发了 rule R" 关联回去。
- **Follow-up issue 候选标题**：`[feat] hook 事件加入 prompt_text + session_id 字段，支持 REPL freeform metric`
  - 三段式：(1) 现象：calibrator events 只有 rule_id，没有触发它的 prompt 文本 (2) 复现：开 interactive claudefast，跑 100 条 prompt 看 events.jsonl (3) 修复验证清单：events 加 `prompt_text_excerpt` / `session_id` / `tool_use_id`；旧记录兼容；REPL probe harness 跑得通

### G3 — `docs/features/planned/cross-machine-sync.md` 已 stale

- **现象**：该文件 status: PLANNED Phase 4，但 M5（PR #71）已 supersede。文件仍写"`team-transfer.ts` ... 需要手动 invocation 且没有 e2e verify script"——错。M5 已经有 `m5-auto-demo.sh` 与 `xsync/run-judge.sh`。
- **Follow-up issue 候选标题**：`[docs] 归档 cross-machine-sync.md 或重写为 M5 stub`
  - 三段式：(1) 现象：planned 文件与 M5 已 IMPLEMENTED 文档相互打架 (2) 复现：grep "Phase 4" 发现该文件继续被引用 (3) 修复验证清单：(a) 移到 docs/backup/m5-superseded/；或 (b) 改成一行 stub 指 m5 spec；PRODUCT-FEATURES / 任何索引同步更新

### G4 — per-PAT scoping 未测（T3b 留白）

- **现象**：本 probe 用 T3a（1 PAT 双 author 身份）。"两个真 GitHub 账号、两 PAT、各自独立 push 权限" 这条路径在自动 sync 流程里没真跑过。
- **影响**：alice 的 PAT 被吊销 / scope 不够 / SSH key 失效时，M5 没有降级路径——失败模式可能是默默丢规则。
- **Follow-up issue 候选标题**：`[research] M5 viral sync 多 PAT / 多账号下的失败降级路径`
  - 三段式：(1) 现象：sync 在 PAT 失效场景行为未定义 (2) 复现：本 probe 改成 T3b 拓扑 + 故意吊销其中一个 PAT (3) 修复验证清单：sync 失败时 attribution event 显式发 `sync.failed.auth`；规则 stay 在 L2 等下次重试；用户 stats 能看到 pending 队列

### G5 — model sensitivity 未度量

- **现象**：本 probe 用 `MiniMax-M2.7-highspeed`（claudefast）；trigger 触发率与 false positive 率会随模型变。`judge.json.topology.model` 仅记录，不锁定。
- **影响**：claudefast 跑过 PASS 不能直接推论 "真 claude opus 4.7 / sonnet 4.6 也 PASS"。
- **Follow-up issue 候选标题**：`[research] viral sync 触发 metric 跨模型敏感性测试`
  - 三段式：(1) 现象：trigger 率没跨模型对照 (2) 复现：把同一 scenarios.json 在 claude-haiku / sonnet / opus / minimax 各跑一遍 (3) 修复验证清单：输出对比表；如果 Δ_PTR > 0.2 标 P1 issue

## 3. 不计入本 delta 的 M5 残点

| 项 | 已被覆盖于 |
|---|---|
| LWW + tombstone 并发正确性 | M5 单元测试 + `xsync/run-judge.sh` |
| 闸门 1（secret scanner）准确率 | `docs/features/pii-redaction/run-judge.sh` |
| 闸门 2（scope classifier）二选一 | `packages/core/src/m5/__tests__/auto-share-pipeline.test.ts` |
| post-merge hook fire | `m5-auto-demo.sh` Step 6+ |
| infect / bootstrap | `m5-auto-demo.sh` Step 1 |

## 4. Follow-up issue 落地动作（由 user 触发 `/to-issues`）

按本 delta 列出 5 条候选 issue（G1–G5）。建议在执行 PR 合并 + report.md 终稿后，调用 `/to-issues` 一次性把这 5 条递给 GitHub issue tracker，每条挂 label `m5-followup` + 链接本 delta。**不允许在本 PR 自动开 5 个新 issue** — 需 user 显式审过 G1–G5 措辞才递。
