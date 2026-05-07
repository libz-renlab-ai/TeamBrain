```text
   alice (author)                          bob (teammate)
   ──────────────                         ──────────────
   pitfall ──► L1 ──► two gates ──► L2
                                     │
                                     │   git push origin main
                                     ▼   (probe repo)
                          ┌──────────────────────┐
                          │ libz-renlab-ai/      │
                          │ TeamBrain-           │
                          │ team-sharing-probe   │
                          └──────────────────────┘
                                     │   git pull
                                     ▼
                              post-merge hook
                                     │
                                     ▼
                              m5-sync --apply
                                     │
                                     ▼
                          K-set (5) + N-set (20) prompts
                                     │
                                     ▼   stream-json
                              hook-pre.warned ∪ hook-pre.blocked
                                     │
                                     ▼
                              judge.json (LLM-only verdict)
```

# issue #82 e2e probe canonical spec（B 交付物）

> Date: 2026-05-07
> 实施: `docs/features/team-sharing-probe/run-judge.sh`
> Glossary: `docs/CONTEXT.md`

本文件是 e2e probe 的**仅有契约**。所有 metric / schema / 阈值之争以本文件为准；harness 实现与之冲突时改 harness。

---

## 1. 拓扑

| 维度 | 选项 | 取值 |
|---|---|---|
| Transport | T3a | 真 GitHub remote `libz-renlab-ai/TeamBrain-team-sharing-probe`，1 个 PAT，2 套 git author identity（git config `user.email`） |
| Instance | C3-hybrid | tmux 双 pane；author 与 teammate 各跑 `claudefast -p --output-format stream-json --include-partial-messages --debug hooks --debug-file <path> --verbose` 一次性 prompt |
| Scope | team | `scope.level=team`（M5 闸门 2 走 shareable 路径） |
| Branch protection | 跑两遍 | run #1 protection=off；run #2 protection=on |
| K (positive set) | 5 | scenario-designer 改写措辞、保留意图 |
| N (control set) | 20 | scenario-designer 故意正交 |

## 2. Trigger 的 canonical 定义

**TRIGGER ⇔ 一次 hook-pre 事件同时满足全部 5 条**：

1. `kind ∈ { "hook-pre.warned", "hook-pre.blocked" }`
2. 关联 rule_id `R*` 来自 alice 在本次 run 内 publish 的 team 规则
3. 该 rule 在 teammate 项目 KB 中 `scope.level == "team"`
4. 该 rule 的 `tags` 包含 `original-author:alice`
5. 事件 timestamp 晚于 alice 那次 `[teamagent-sync]` commit 在 teammate clone 中变可见的时点

**排除**：

- `hook-pre.matched`（仅匹配未决策）
- `hook-pre.warned.doc_context` / `hook-pre.blocked.doc_context`（matcher 自识别为 doc/test 上下文 — 它本来就是 FP 反信号）
- `hook-post.result`（事后结果，与拦截正交）
- 任何 `source: "hook-pre"` 的 AttributionEvent（粒度太粗，hook 跑了一次但没 match 也算）

## 3. K / N 的 blind 构造协议

```
1. alice CLI 写一条 pitfall：
     trigger_phrase = "<一句话描述容易犯错的场景>"
     correct        = "<正确做法>"
   alice 此后**完全不参与** scenario / probe 执行。

2. scenario-designer = 独立 claudefast 子进程，所在 session 与主流程不共享上下文。
   仅获得 trigger_phrase（**不**给 correct、**不**给 rule body、**不**给 matcher 内部分数）。
   prompt 模板：docs/features/team-sharing-probe/prompts/scenario-designer.md。

3. scenario-designer 输出严格 JSON：
   {
     "k_set": [{"id":"k1","prompt":"..."}, ...],   // 5 条改写：保留意图换措辞 / 换场景细节
     "n_set": [{"id":"n1","prompt":"..."}, ...]    // 20 条故意正交
   }

4. 全 25 条 freeze：
     scenarios_path  = tmp/.judge/team-sharing-probe/<run_id>/scenarios.json
     scenarios_sha256 = sha256(<canonical 序列化>)
   sha256 写入 judge.json 锚定。

5. teammate 端按 id 顺序逐条独立调用 `claudefast -p` 跑 25 prompt。
   每条 prompt 单独 session、单独 stream-json artifact。
   **不允许批量 / 串拼 / 复用 session**，避免上下文污染。
```

## 4. judge.json schema

```jsonc
{
  "run_id":              "20260507T123456Z-12345",
  "topology": {
    "transport":         "T3a",
    "instance":          "C3-hybrid",
    "branch_protection": "off",         // 或 "on"
    "k_count":           5,
    "n_count":           20,
    "model":             "MiniMax-M2.7-highspeed"
  },
  "scenarios_sha256":    "abc123...",
  "rule": {
    "rule_id":               "R-007",
    "original_author":       "alice",
    "scope_level":           "team",
    "trigger_phrase_excerpt":"PR 合并后必须 fetch codex review",
    "sync_commit_sha":       "1234567"
  },
  "metrics": {
    "positiveTriggerRate":           1.0,    // 必须 == 1.0
    "falsePositiveRate":             0.0,    // 必须 == 0.0
    "k_triggered_ids":               ["k1","k2","k3","k4","k5"],
    "n_triggered_ids":               [],     // 必须空
    "attribution_chain_complete":    true,
    "m5_protected_branch_blocks_push": null  // off 跑为 null；on 跑必须 == 1.0
  },
  "evidence": {
    "scenarios_path":               "tmp/.judge/team-sharing-probe/<run_id>/scenarios.json",
    "author_stream_json_path":      "tmp/.judge/.../author-pitfall.jsonl",
    "teammate_stream_json_paths":   ["...k1.jsonl", "...n20.jsonl"],
    "git_log_path":                 "tmp/.judge/.../git-log.txt",
    "hook_events_path":             "tmp/.judge/.../hook-events.jsonl",
    "stdout_path":                  "tmp/.judge/.../stdout.log"
  },
  "exit_code": 0,
  "pass": true
}
```

## 5. Pass / fail 公式

```
PASS_OFF = (PTR == 1.0)
        ∧ (FPR == 0.0)
        ∧ attribution_chain_complete
        ∧ branch_protection == "off"

PASS_ON  = (m5_protected_branch_blocks_push == 1.0)
        ∧ branch_protection == "on"
        ∧ author_push_attempts >= 1                 // 必须真试过 push
        ∧ author_push_rejected_by_remote_protection // 必须 GitHub 端 reject
```

`pass = (run_id 是 off 跑 ? PASS_OFF : PASS_ON)`。

issue #82 整体 acceptance：**两个 run_id 各自的 judge.json 都 `pass==true`**。

任一 false / null 字段不达标即 fail，并且 stream-json artifact 必须**完整保留**给后续 LLM 诊断。

## 6. Run 生命周期（每跑一遍）

```
0. orchestrator 解析参数 → 生成 run_id → 建 evidence_dir
1. 重置 probe repo（本地 clone 删 + 重新 git clone；远端硬重置：force-push 空 README — 仅
   probe repo 上允许，主仓库严禁）
2. branch protection 由调用方提前在 GitHub 端配好（off / on），orchestrator 不动
3. alice tmux pane：
     git config user.email alice@probe.example
     pnpm teamagent pitfall --non-interactive ...   # 写规则
     pnpm teamagent m5-publish                      # auto commit + push
     git log -1 --format=%H >> evidence/git-log.txt
4. orchestrator 起独立 claudefast session 当 scenario-designer，输出 scenarios.json
5. teammate tmux pane：
     git config user.email bob@probe.example
     git clone <probe-repo>
     git pull        # 触发 post-merge → m5-sync --apply
     for prompt in scenarios.json:
         claudefast -p --output-format stream-json ... > teammate-<id>.jsonl
6. orchestrator 抓 .teamagent/events/*.jsonl → hook-events.jsonl
7. orchestrator 起独立 claudefast session 当 judge LLM，output judge-verdict.json
8. orchestrator 合成最终 judge.json（含 pass / exit_code）
9. exit_code = (pass ? 0 : 1)
```

## 7. Orchestrator 退出码契约

| code | 含义 |
|---|---|
| 0 | 当前 run 的 pass 公式满足 |
| 1 | metric 偏离阈值 |
| 2 | scenarios sha256 不一致（被改动） |
| 3 | attribution chain 断裂（rule_id 找不到 / tag 缺 original-author / commit 不在 git log） |
| 4 | claudefast / git / pnpm 系统级失败 |
| 5 | branch_protection=on 但 push 居然成功（M5 spec 假设破裂，需新 issue） |

## 8. 不在本 spec 范围内

- C3-strict 真 REPL 自由敲 metric 通道；跨项目 / 跨 org 共享；cryptographic 签名 — 见 gaps delta
- LWW + tombstone 并发；闸门 1/2 PII 准确率；issue #81 — 由其它 judge harness / issue 覆盖
