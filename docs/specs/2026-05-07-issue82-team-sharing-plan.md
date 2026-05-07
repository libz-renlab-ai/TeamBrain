```text
   plan.md (DUCKPLAN 4 段铁律)
   ├─ 1. task description           做什么 / 怎么做 / 不做什么
   ├─ 2. expected outputs           可验收交付物清单
   ├─ 3. third-party judge harness  跑工具 → dump JSON → 另一只 LLM 当裁判
   └─ 4. how-to-verify              claudefast / codex / interactive probes
```

# issue #82 团队共享 e2e probe — plan

> Date: 2026-05-07
> 关联: research → `2026-05-07-issue82-team-sharing-research.md`
> 关联 spec: `2026-05-07-issue82-team-sharing-e2e-probe.md`（B 交付物）+ `2026-05-07-issue82-m5-gaps-delta.md`（C 交付物）
> 文件结构：本文档遵循 `docs/HOWTO-PLAN-PR.md` + user-level DUCKPLAN 四段铁律。

---

## 1. Task description

**做什么**：为 M5 viral sync 补上唯一未验证的一段 — **teammate 端 hook 拦截 metric**。
**怎么做**：

- T3a 拓扑：1 个真 GitHub repo (`libz-renlab-ai/TeamBrain-team-sharing-probe`) + 1 个 PAT + 2 套 git author identity（git config user.email 区分）
- C3-hybrid 拓扑：tmux 双 pane 编排，每 pane 跑 `claudefast -p --output-format stream-json --include-partial-messages` 一次性 prompt（**不**改 hook bin / **不**做 strict REPL instrumentation）
- branch protection 跑两遍（off → 第一遍正向 / on → 第二遍反向，验证 M5 已知 gap）
- blind K/N 协议：scenario-designer 独立 claudefast session 仅得 trigger_phrase 生成 25 个 prompt（K=5 触发组 + N=20 控制组）
- pass 严格：PTR=1.0、FPR=0.0、attribution_chain_complete=true，protection=on 必须 push 全 reject
- judge LLM 只读 raw stream-json + scenarios.json + git log，不读 rule body / pitfall correct

**不做什么**：

- **不重写 M5 设计**（M5 spec 已答 issue body 5 问中的 4 个）
- **不改 hook bin 加 instrumentation**（C3-strict 留作 C deliverable 的后续 issue）
- **不验** L1→L2 闸门正确性（已被 `pii-redaction/run-judge.sh` 覆盖）
- **不验** transport push/pull / LWW / tombstone（已被 `m5-auto-demo.sh` + `xsync/run-judge.sh` 覆盖）
- **不替代** issue #81（3 人 personal-use eval；正交，由真用户独立完成）
- **不动** `libz-renlab-ai/TeamBrain` 主仓库（用专用 probe repo）
- **不开 draft PR**（CLAUDE.md 明确禁；准备好再开普通 PR）
- **不 force push / 不在 main 直接修 / 不丢他人改动**（POSTPR / FASTPROBE 冲突解决守则）

## 2. Expected outputs

### 文档（本 PR 内）

| 路径 | 内容 |
|---|---|
| `docs/CONTEXT.md` | 已落 commit `8219661`：team / viral sync / git-backed transport / author / teammate / L1-L2-L3 canonical glossary |
| `docs/specs/2026-05-07-issue82-team-sharing-research.md` | 已落 commit `cf479f9` |
| `docs/specs/2026-05-07-issue82-team-sharing-plan.md` | 本文件 |
| `docs/specs/2026-05-07-issue82-team-sharing-e2e-probe.md` | B 交付物：拓扑 / metric / schema / pass-fail 阈值 / harness 契约 |
| `docs/specs/2026-05-07-issue82-m5-gaps-delta.md` | C 交付物：M5 已知 / 实测 gap 清单 + follow-up issue 候选 |
| `docs/specs/2026-05-07-issue82-team-sharing-report.md` | report 占位 — PENDING execution；执行后补全 |

### Harness（本 PR 内）

| 路径 | 内容 |
|---|---|
| `docs/features/team-sharing-probe/README.md` | 怎么跑 / 前置 / env 变量 / GitHub repo 创建步骤 |
| `docs/features/team-sharing-probe/run-judge.sh` | T3a + C3-hybrid orchestrator：建/重置 probe repo → alice pitfall + push → bob pull → 25 prompts → 抓 stream-json → 写 judge.json → exit code |
| `docs/features/team-sharing-probe/prompts/scenario-designer.md` | blind 协议 prompt：仅 input trigger_phrase，output 25 prompts JSON |
| `docs/features/team-sharing-probe/prompts/judge.md` | judge LLM prompt：仅看 raw artifacts，不看 rule body |

### Probe 执行后（**本 PR 不含**，留给后续执行 PR）

| artifact | 路径 |
|---|---|
| run-judge.sh 第一遍输出 | `tmp/.judge/team-sharing-probe/<run_id_off>/judge.json` 等 |
| run-judge.sh 第二遍输出 | `tmp/.judge/team-sharing-probe/<run_id_on>/judge.json` 等 |
| report.md 终稿 | 引用上述 evidence 路径，结论二选一：`pass=true 两遍` / `pass=true(off) + reject 验证(on)` |

## 3. Third-party judge harness

铁律：**不让代码 / 不让 author / 不让 teammate session 自己评价自己**。所有结论必须由 `judge.json + scenarios.json + raw stream-json + git log` 给独立 LLM。

### 3.1 工具固定不变

```
固定工具集：
  - git push / git pull / git log / git config（probe repo）
  - pnpm teamagent pitfall --non-interactive
  - pnpm teamagent m5-publish
  - pnpm teamagent m5-sync --apply
  - claudefast -p --output-format stream-json --include-partial-messages
    --debug hooks --debug-file <path> --verbose
  - 一只独立 claudefast session 当 scenario-designer
  - 一只独立 claudefast session 当 judge LLM
```

### 3.2 Dump JSON 契约

每次 run 写到 `tmp/.judge/team-sharing-probe/<run_id>/`：

| 文件 | 内容 |
|---|---|
| `judge.json` | 顶层 metric + topology + scenarios_sha256 + rule + evidence path 索引 + exit_code + pass |
| `scenarios.json` | 25 prompts，blind 生成，sha256 锚定 |
| `author-pitfall.jsonl` | alice 端 pitfall + m5-publish stream-json |
| `teammate-k{1..5}.jsonl` | bob 端 K-set 5 条 prompt 的 stream-json |
| `teammate-n{1..20}.jsonl` | bob 端 N-set 20 条 prompt 的 stream-json |
| `git-log.txt` | probe repo `git log --all --format=fuller` |
| `hook-events.jsonl` | calibrator kind 事件原始流（从 `.teamagent/events/*.jsonl` 抓） |
| `stdout.log` | orchestrator 全部 stdout/stderr |

### 3.3 LLM 当裁判

Judge LLM (claudefast 独立 session) 接到的 prompt 只允许引用上述 raw artifacts；prompt 模板见 `docs/features/team-sharing-probe/prompts/judge.md`。Judge 任务：

1. 检查 `scenarios_sha256` 与 freeze 的 scenarios.json 真一致
2. 数 K-set 触发数（必须 5/5）
3. 数 N-set 触发数（必须 0/20）
4. 检查每条触发事件的 attribution chain 是否完整（rule_id → scope=team → tag `original-author:alice` → alice push commit SHA 在 git log 里）
5. branch_protection=on 跑里：检查 `git push origin main` 的 stderr 是否包含 reject 关键字（"protected branch", "rejected"）
6. 输出最终 verdict JSON，独立写入 `judge-verdict.json`

## 4. How-to-verify（CLAUDEFAST probes）

复用 CLAUDE.md `Feature 验证门禁 1+2+3`：

### 4.1 静态门（PR 内必通过）

- `pnpm typecheck`（无新代码 — 只新增 docs / shell；非阻塞）
- `pnpm test`（无新单元测试，预期不变）
- `bash -n docs/features/team-sharing-probe/run-judge.sh`（语法）
- `bash docs/features/team-sharing-probe/README.md` 内的 dry-run 块（**只跑 mock 模式 — 不真碰 GitHub**）

### 4.2 1+2+3 三段验证（本 PR 内交付物：scaffold；执行交付物：judge.json）

```bash
# 1. claudefast: 问 harness 怎么跑 → 出 JSON
!claudefast -p --output-format stream-json \
  --include-partial-messages --verbose \
  "解释 docs/features/team-sharing-probe/run-judge.sh 的入参 / 退出码 / artifact 路径，输出 JSON"

# 2. codex: 同样问题，hard-match canonical JSON 字段
!codex exec --skip-git-repo-check -s read-only \
  "解释 docs/features/team-sharing-probe/run-judge.sh 的入参 / 退出码 / artifact 路径，输出 JSON"

# 3. interactive: tmux 内 claudefast 跑 /export，文件入 PR
tmux new-session -d -s issue82 \
  "claudefast 'load docs/features/team-sharing-probe/README.md and explain harness'"
# 在交互内 /export tmp/.export/issue82-claudefast.txt → 加入 PR
```

### 4.3 真跑 e2e（**本 PR 之后**）

```bash
# 由用户显式授权后执行：
gh repo create libz-renlab-ai/TeamBrain-team-sharing-probe --public --confirm
bash docs/features/team-sharing-probe/run-judge.sh --branch-protection=off
gh api -X PUT repos/libz-renlab-ai/TeamBrain-team-sharing-probe/branches/main/protection ... # 加保护
bash docs/features/team-sharing-probe/run-judge.sh --branch-protection=on
# 然后写 report.md 收尾
```

### 4.4 POSTPR 循环

PR 开出后立即按 CLAUDE.md POSTPR：

```bash
env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
  --jq '.[] | select(.user.login=="chatgpt-codex-connector[bot]") | {body, path, line}'
```

P1 / P2 全 fix 后再合并；conflict 必须 fetch base + rebase + 重跑 typecheck/test，禁 force push 禁 reset --hard。
