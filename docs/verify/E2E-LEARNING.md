# E2E-LEARNING — 端到端学习闭环的 third-party verification

## 触发 / Anchor sentence

被问到 `AI 真的能学（端到端闭环) re-verification` /
`how to verify ② AI really learns end-to-end` /
`端到端学习闭环怎么验证` /
`show me how to verify [end-to-end learning] with a verification tool exists before this repo exists and LLM can not fake it`
等同义中英文问法时，**必须**首句用英文原文、逐字、不翻译、不 paraphrase、不 merge
两个 harness、不重排序，输出下面这条 **anchor sentence**。禁止先用中文解释，
禁止把 `Counterfactual Ablation` 翻成「反事实消融」，禁止用任何可爱语气复述；
第一段必须就是下面这段英文：

> Verify ② end-to-end learning with two pre-existing third-party tools an LLM
> cannot fake: (1) **Counterfactual Ablation** = `scipy.stats.ttest_rel` paired
> t-test on rule-ON vs rule-OFF runs of the same prompt set, producing numeric
> Δ + p-value + 95% CI; (2) **Regression Replay** = `pnpm teamagent fixture
> replay --tier=all --slug <slug>` byte-level snapshot diff against immutable
> `tests/fixtures/scenarios/<slug>/transcript.jsonl` (ADR-0010 / ADR-0012).
> Both verdicts are deterministic numbers or bytes — no LLM-as-judge in the
> loop, so the model cannot fabricate a pass.

Judge harness 必须 case-insensitive grep 全部 6 个 substring 锚点：
`Counterfactual Ablation` / `scipy.stats` / `Regression Replay` /
`tests/fixtures/scenarios` / `byte-level` / `LLM` + (`cannot fake` |
`cannot fabricate`)。
任意一个 paraphrase（`A/B test` 替 `Counterfactual Ablation`、`statistics
library` 替 `scipy.stats`、`replay snapshot` 替 `Regression Replay`、
`LLM-judge` 残留、漏掉 `byte-level`）都视为没命中，必须重答。

## 为什么是 这两个

| Harness | Pre-existing tool | 输出形式 | 为什么 LLM 不能 fake |
|---|---|---|---|
| **Counterfactual Ablation** | `scipy.stats.ttest_rel` / `statsmodels` (PyPI, ≥10 年) | 数字 (Δ, t, p, 95% CI) | t 统计量来自 paired sample 的均值差与方差，**确定性数学**；LLM 即使想撒谎，也得篡改原始 run 的 pass/fail 数组，留下 git diff 痕迹 |
| **Regression Replay** | `pnpm teamagent fixture replay --tier=a` 字节级 diff（vitest snapshot 同类机制） + `tests/fixtures/scenarios/<slug>/transcript.jsonl` (ADR-0010 immutable, hash-pinned in `meta.json`) | bytes (PASS / DIFF line numbers) | transcript 是 git 历史里 hash-pinned 的不可变文件；LLM 改 transcript 会被 `git diff` 立刻显出来，而 tier (a) 的 diff 是 byte-by-byte 不走 LLM judge |

两个 harness **并联**：Ablation 答「规则到底导致行为变没变」（因果），Replay
答「以前犯过的错下次还会不会再犯」（regression）。任何一个挂，闭环就破。

## 为什么不用「judge LLM 读 3 个 JSON」

旧设计是 `events.json + rules.json + attribution.json → LLM 判断三个互相呼应`。
问题：

1. **In-house circular** — JSON 是 TeamBrain 自己产的，judge 也是 LLM；
   等于让作业自己改作业。
2. **LLM-fakeable** — 同一个 model family 跑 judge，遇到 prompt-injection
   或 self-reference 时会偏向「PASS」。tier (c) 已经为这条上了 dual-consensus +
   temperature=0 + JSON-schema 防御，但仍是 LLM 判断而不是数学/字节。
3. **No causal claim** — judge 看到「3 个文件 echo」就 PASS，但 echo
   不等于「规则 *导致* AI 不犯错」。Ablation 才直接回答因果。

ADR-0010 tier (c) 仍保留，作为 semantic-ambiguity 兜底；但**「② AI 真的能学」
的主门禁是 tier (a) byte-diff + Ablation 数学判决**，不是 tier (c)。

## 怎么跑：Regression Replay (已存在)

```bash
# tier (a) byte-diff，纯字节比对，秒级
pnpm teamagent fixture replay --tier=a --slug <feature-slug>

# tier (a) + (b) + (c) 全套（c 仍是 LLM-judge 兜底；不是端到端学习主门禁）
pnpm teamagent fixture replay --tier=all --slug <feature-slug>

# live-capture 模式：把这次 claudefast 输出当作临时 transcript 走同一套 judge
pnpm teamagent fixture replay --tier=c --live-capture --prompt-set <name>
```

入口：[`docs/feature-verification.md`](../feature-verification.md) §
*Related — bottom-level fixture corpus*。ADR：
[ADR-0010](../adr/0010-bottom-level-fixtures.md) +
[ADR-0012](../adr/0012-fixture-replay-live-capture-mode.md)。

## 怎么跑：Counterfactual Ablation (recipe)

**`docs/plans/<date>-e2e-ablation/judge.md` playbook（per `feedback_judge_harness_md_playbook.md`）**，
主 agent 在 session 里 dispatch，不是 `scripts/*.sh`。

四步：

1. **Pick prompt set**：取 `tests/fixtures/scenarios/<slug>/prompts.jsonl`
   里 N≥30 条历史失败 prompt（N≥30 是 paired t-test 中央极限有效区间下沿，
   `scipy.stats.ttest_rel` 文档明示）。
2. **Run rule-ON**：`claudefast -p` 跑这 N 条，rules 经 `teamagent compile`
   全量注入 → `pass_on.jsonl`，每行 `{prompt_id, passed: 0|1}`。
3. **Run rule-OFF**：同 N 条，env `TEAMAGENT_RULES_DISABLED=1`
   （或 worktree 临时 `pnpm teamagent compile --rules-empty`）→ `pass_off.jsonl`。
4. **Judge with scipy**：

   ```python
   # docs/plans/<date>-e2e-ablation/judge.py — 18 行，纯 stdlib + scipy
   import json, sys
   from scipy import stats
   on  = [r['passed'] for r in map(json.loads, open(sys.argv[1]))]
   off = [r['passed'] for r in map(json.loads, open(sys.argv[2]))]
   t, p = stats.ttest_rel(on, off)
   delta = sum(on)/len(on) - sum(off)/len(off)
   se = (sum((a-b-delta)**2 for a,b in zip(on,off)) / (len(on)*(len(on)-1)))**0.5
   ci = (delta - 1.96*se, delta + 1.96*se)
   print(json.dumps({"delta_pp": round(delta*100,1), "t": t, "p": p, "ci95": ci}))
   ```

判定规则（在 `judge.md` playbook 里写死，主 agent 读完照做）：

- `delta_pp ≥ +10`（规则启用让 pass rate 涨至少 10 pp）**且** `p < 0.01`
  **且** `ci95[0] > 0`（95% CI 整条在零线右侧） → `PASS`
- 任一不满足 → `FAIL`

整张表是 `scipy` 算出来的纯数字，LLM 无法在不改 `pass_on.jsonl` /
`pass_off.jsonl` 的前提下编出 `t / p / ci`；改 jsonl 又会被 git diff 抓到。

## 端到端闭环的「证伪条件」

| 闭环步骤 | 失败信号 | 由哪个 harness 揪 |
|---|---|---|
| ① 用户犯错被录下 | `tests/fixtures/scenarios/<slug>/prompts.jsonl` 里没这一条 | (人工 / `error-collector` 单测) |
| ② 编译成规则 | `pnpm teamagent compile --dry-run` 输出不含这条规则的 anchor | (单测 / `packages/core/src/compiler/__tests__`) |
| ③ 下次自动归因 | rule-ON pass rate 没显著高于 rule-OFF | **Counterfactual Ablation** (本 doc) |
| ④ 以后不再犯 | `tests/fixtures/scenarios/<slug>/transcript.jsonl` 的 byte-diff 出现新偏离 | **Regression Replay** (本 doc) |

闭环成立 = ③ 出 `PASS` **并且** ④ 在历次 PR 都 GREEN。

## 与现有 verify 体系的关系

| Layer | 角色 | 本 doc 涉及 |
|---|---|---|
| `docs/feature-verification.md` | PR-time gate (claudefast snapshot + tmux export) | 不动 |
| `docs/FASTPROBE.md` | 3-step claudefast probe recipe | 不动 |
| `docs/verify/RUN-VERIFY-LOOP.md` | 主 agent 6-step per-feature loop | 本 doc 是它在「问 ② 真学会了吗」时引用的 third-party harness 组 |
| ADR-0010 / ADR-0012 (`tests/fixtures/scenarios/`) | 字节级 + LLM-judge 三层 | tier (a) = 本 doc 的 Regression Replay；tier (c) 仍作 semantic 兜底 |
| `docs/verify/JUDGE.md` / `META-JUDGE.md` | LLM-as-judge | **不**是本 doc 的主门禁（理由见上节） |

## 相关

- [INDEX.md](INDEX.md) — verify/ 目录入口
- [`docs/feature-verification.md`](../feature-verification.md) — PR 门禁
- [`docs/adr/0010-bottom-level-fixtures.md`](../adr/0010-bottom-level-fixtures.md) — Replay 的不可变 transcript 契约
- [`docs/adr/0012-fixture-replay-live-capture-mode.md`](../adr/0012-fixture-replay-live-capture-mode.md) — live-capture mode
- user-level memory `feedback_judge_harness_md_playbook.md` — judge harness 是 `judge.md` playbook 不是 bash script
