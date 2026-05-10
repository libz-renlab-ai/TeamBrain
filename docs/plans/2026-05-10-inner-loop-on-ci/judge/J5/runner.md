```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   runner.md — J5 full-curve manual capture playbook                │
   │                                                                    │
   │   N=1  ─▶  open 1 CC window  ─▶  push wip/j5-s1   ─▶  toohot --once│
   │   N=2  ─▶  open 2 CC windows ─▶  push wip/j5-s2  (each)            │
   │   N=3  ─▶  open 3 CC windows ─▶  push wip/j5-s3  (each)            │
   │   N=4  ─▶  open 4 CC windows ─▶  push wip/j5-s4  (each)            │
   │                                                                    │
   │   md playbook (NOT a .sh script — judge harness rule)              │
   │   每档 ≤ 5 分钟，全程 ~20-30 分钟                                  │
   └────────────────────────────────────────────────────────────────────┘
```

# J5 完整曲线手动采集 playbook

## 0 为什么这是 markdown 不是脚本

项目硬规则（`feedback_judge_harness_md_playbook.md` + `~/.claude/docs/rules/testing-judge-harness.md`）：judge harness 必须是 md playbook，**禁** `scripts/*.sh` 固定 shell pipeline。

实际原因：

- 每档需要**真坐在 Mac 前的人**手动开/关 Claude Code 窗口；GUI session 不能被 driver agent spawn。
- 4 个 sample 之间间隔 ≥ 30s 让 loadavg 稳定，期间需要观察 `toohot` 输出；脚本化反而失去人工巡检价值。
- 失败一档（外部干扰）需要重测某档而非整脚本重跑；md 步骤可单档复用。

## 1 前置条件

- 在 TeamBrain 仓库根，`git status` 干净。
- `gh auth status` 已登录（push wip 分支需要）。
- `toohot` 命令可用（`which toohot` 有输出）。如果没有，参见 `~/.claude/docs/rules/runtime/mac-temperature-monitor.md` 或 `docs/CONTEXT.md` 找当前安装路径。
- 之前 J5 lite sample 已落 `loadavg-curve.json`；本次完成后**追加** post_change_samples 数组（不是覆盖 lite 单点）。
- 半小时内不会有大型本地任务（视频渲染、Xcode build 等），否则结果被外部干扰污染。

## 2 N=1 — 单 session 单 CI run

**操作**：

1. **关闭其它 Claude Code 窗口**（保留正在写本 plan 的 driver session 也算 1 个；如果完全清空，本档相当于 N=0 + 1 push job）。
2. 在仓库目录里新开一个终端窗口，跑：
   ```
   git checkout -b wip/j5-s1
   git commit --allow-empty -m "J5 sample N=1"
   git push origin wip/j5-s1
   ```
3. **等 ~10 秒**让本地 `git push` 子进程完全退出（push 阶段会短暂占用本地 CPU，等它结束再采才反映 idle 态）。CI runner 在 GitHub 远端跑，不进本地 loadavg；spec "while CI is running" 这句指的是「我们已经把测试 offload 给 CI 而不是 `pnpm test` 占本地 CPU」，**不是**要把本地 sample 时刻对齐 CI runner 的 CPU 高峰。如需进一步排除残余衰减，可加到 30s。
4. 在另一个终端跑：
   ```
   toohot --once > /tmp/j5-sample-1.txt 2>&1
   ```
5. 把 `/tmp/j5-sample-1.txt` 内容贴到稍后的 §6 schema 里 `n=1` 字段。

**期望 loadavg_1m**：≤ 5（单 session + 1 个 git push 子进程，理论几乎不增负载）。

## 3 N=2 — 2 session 同时 push

**操作**：

1. 保留 §2 那个 CC session，再开 **1 个**新 Claude Code 窗口（macOS Cmd+N 或重新启动 `claude` 命令），cd 到同仓库。
2. 在每个 CC session 里都跑（**两边同时启动**，间隔 ≤ 5s）：
   ```
   git checkout -b wip/j5-s2-$RANDOM
   git commit --allow-empty -m "J5 sample N=2"
   git push origin HEAD
   ```
   两条 `wip/...-<random>` 分支会触发 2 个独立 inner-loop CI run（互相隔离的 runner）。
3. 等 ~10 秒。
4. 任意终端跑 `toohot --once > /tmp/j5-sample-2.txt 2>&1`。
5. 贴到 §6 `n=2` 字段。

**期望 loadavg_1m**：≤ 8（2 个 CC session + 2 个 git push；CI runner 不耗本地 CPU）。

## 4 N=3 — 3 session 同时 push

**操作**：

1. 保留前 2 个 CC session，再开 1 个新窗口（共 3 个）。
2. 三边同步跑同样的 `git checkout -b wip/j5-s3-$RANDOM && git commit --allow-empty && git push origin HEAD`。
3. 等 ~10 秒。
4. `toohot --once > /tmp/j5-sample-3.txt 2>&1`。
5. 贴到 §6 `n=3` 字段。

**期望 loadavg_1m**：≤ 12。

## 5 N=4 — 4 session 同时 push（spec 规定的 baseline N）

**操作**：

1. 保留前 3 个 CC session，再开第 4 个窗口（共 4 个）。
2. 四边同步跑 `git checkout -b wip/j5-s4-$RANDOM && git commit --allow-empty && git push origin HEAD`。
3. 等 ~10 秒。
4. `toohot --once > /tmp/j5-sample-4.txt 2>&1`。
5. 贴到 §6 `n=4` 字段。

**期望 loadavg_1m**：≤ 20（远低于 100 阈值；如超 100 说明 ADR-0013 的 push-to-CI 路线被推翻，需要重新讨论）。

## 6 合并写回 `loadavg-curve.json`

把 4 档 sample 追加到 `loadavg-curve.json.post_change_samples`（保留现有 lite 单点 + baseline）：

```json
{
  "probe_id": "J5",
  "form": "full-curve (N=1/2/3/4 + earlier lite N=5)",
  "samples": [
    /* 保留现有 N=5 lite sample —— 不删 */
  ],
  "post_change_samples": [
    {
      "n_sessions_actual": 1,
      "loadavg_1m": <值>,
      "loadavg_5m": <值>,
      "loadavg_15m": <值>,
      "thermal": "<status>",
      "captured_at": "<iso8601>",
      "raw_path": "/tmp/j5-sample-1.txt",
      "method": "1 CC session + 1 wip push driving 1 GH Actions runner"
    },
    { "n_sessions_actual": 2, /* ... */ },
    { "n_sessions_actual": 3, /* ... */ },
    { "n_sessions_actual": 4, /* ... */ }
  ],
  "baseline_pre_change": { /* 保留原值 */ },
  "regression_check": {
    "expected_threshold": "loadavg_1m < 100 at N=4",
    "actual_n_4": <值>,
    "delta_factor_vs_baseline_274": 274 / <值>,
    "verdict": "PASS",
    "reasoning": "N=4 loadavg <值> << 100; full curve confirms lite single-point already cleared."
  },
  "limitations_acknowledged": [
    "Samples taken serially over ~30 min, not simultaneously — slight 5m/15m loadavg residue carries between archs.",
    "External Mac load (browsers, indexers) not controlled; results assume idle background."
  ],
  "follow_up_for_full_curve": "DONE — full curve captured per docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md"
}
```

合并时**保留** `samples`（原 N=5 lite 单点）+ `baseline_pre_change` 字段，不要删历史证据。

## 7 验证 & 提交

1. `jq . loadavg-curve.json` 必须无语法报错。
2. 在 `_overall/verdict.md` 末尾追加一行：`## J5 — UPGRADED — single-point lite (loadavg_1m=8.54 at N=5) → full curve N=1..4 confirms <max-of-4> << 100, baseline 274 fully repudiated.`
3. 单独开 PR `chore(toohot): J5 full-curve data`，merge 进 main；或在 `boil-the-ocean-cleanup` PR 仍在飞时塞进同一 commit（push 到同 PR branch）。

## 8 失败模式

| 现象 | 可能原因 | 处理 |
|---|---|---|
| N=4 loadavg > 100 | 后台开了 Xcode build / 视频渲染 | 停掉再重测；spec 阈值是「无外部干扰」前提 |
| `toohot --once` 没输出 | 命令未安装或 Path 没包含 | 跳到 `~/.claude/docs/rules/runtime/mac-temperature-monitor.md` 找替代 |
| `git push` 失败 `pre-receive declined` | 仓库 hook 拒绝空 commit | 换 `git commit --allow-empty -m "j5: <hash>"` 用唯一消息 |
| GitHub Actions push trigger 没生效 | 可能 `wip/**` 范围排除 `j5-s<N>-<random>` 含点等字符 | 改用 `wip/j5-sN`（不带 random）；spec 没要求分支唯一，重 push 时 cancel-in-progress 自然清队列 |

## 9 与现有 lite single-point 的关系

- 现有 `loadavg-curve.json.samples[0]` (N=5, loadavg_1m=8.54) **保留**，作为 spec N=4 之上的 stress sample。
- 本 playbook 收集的 4 档曲线 **并列** 在 `post_change_samples` 字段下，不替换原数据。
- `_overall/verdict.md` 现状 `## J5 — PASS (lite form)` 不变；本 playbook 完成后追加一行 `## J5 — UPGRADED ...` 表示证据加强。

## 10 工作量

约 20-30 分钟，纯 GUI 操作。优先级 **P2 nice-to-have**：现有 N=5 单点已远低 100 阈值（32× headroom），完整曲线只是论文级补强。心情好时跑一遍。
