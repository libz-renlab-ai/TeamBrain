# 里程碑 4 实验报告 · 模板

> Coordinator 在 day 28 之后用本模板撰写正式实验报告。
> 报告必须含原始数据 + 复现脚本（acceptance.md §M4 验证方法 step 6-7、§9.5）。

## 1. 实验摘要

- **实验 ID**：______
- **执行日期**：YYYY-MM-DD ~ YYYY-MM-DD（4 周）
- **参与人数**：N
- **两组划分**：开挖矿组 N_e 人、关挖矿组 N_d 人
- **整体 verdict**：PASS / FAIL / INCONCLUSIVE

## 2. 4 个量化门槛对照

| Gate | 阈值 | 实际 Δ | 95% CI | p-value | Pass? |
|---|---|---|---|---|---|
| G1 完成率 | ≥ 10pp | ___ | [__, __] | ___ | ✓/✗ |
| G2 AI 纠正减少 | ≥ 30% | ___ | [__, __] | ___ | ✓/✗ |
| G3 代码质量分 | ≥ 0.5 | ___ | [__, __] | ___ | ✓/✗ |
| G4 主观评价分 | ≥ 0.3 | ___ | [__, __] | ___ | ✓/✗ |

由 `analysis/judge.py` 跑出，verdict.json 全文附 §6。

## 3. 实验设计回顾

- 17 任务清单：见 `tasks/task-suite.md`（实验中冻结）
- 随机分组 seed：______（由 day 0 抛硬币或 git log 选择）
- 实验前 balance check 结果：PASS（p > 0.05 across q1/q4/q5/q6）

## 4. 每位成员逐项数据

由 `verdict.json.per_member` 自动生成，去标识化（用 P-001 等代号）。

| Member | Group | 完成率 | AI 纠正/任务 | 质量分 | 主观分 |
|---|---|---|---|---|---|
| P-001 | enabled | ___ | ___ | ___ | ___ |
| P-002 | disabled | ___ | ___ | ___ | ___ |
| ... | ... | ... | ... | ... | ... |

## 5. 复现脚本 + 原始数据

复现命令（任何第三方在自己机器上跑应得到同样 verdict）：

```bash
python tools/random-split.py --members recruitment/<roster>.json --seed <SEED> --out groups.json
python analysis/aggregate.py --input collection/daily/ --groups groups.json --out rollup.json
python analysis/judge.py --rollup rollup.json --out verdict.json
diff verdict.json verdict-archived.json   # should match byte-for-byte
```

原始数据位置：

- `collection/daily/<DATE>/<MEMBER>.jsonl` — 28 × N 文件（已 sha256 哈希封档）
- `recruitment/signed/<MEMBER>-consent.pdf` — 签字版知情同意书
- `recruitment/screening-*.json` — baseline 问卷
- `groups.json` — 随机分组结果
- `rollup.json` — aggregate 中间产物
- `verdict.json` — 最终判决

acceptance.md §9.5 规定，**任何数据没附原始位置 + 复现脚本一律不予采信**。
本报告的原始数据 + 脚本全部齐了才发布。

## 6. verdict.json 全文

附 `analysis/judge.py` 输出，逐字粘贴：

```json
{
  "experiment_id": "...",
  ...
}
```

## 7. 失败处理（如果 verdict.overall_pass = false）

按 acceptance.md §M4 失败处理：

- [ ] 召开复盘会议
- [ ] 回答三个问题（是不是产品设计不对 / 挖矿质量不够 / 实验设计有偏）
- [ ] 决定：彻底放弃 / 回炉重做某模块 / 扩大样本再验
- [ ] **不**移动门槛（除非 coordinator 显式批准放宽并记入 acceptance.md §10）

## 8. 风险与局限

- 本实验是单一团队、4 周、N 人，不是普适性验证
- 17 任务集偏 backend / 算法，对 frontend / 数据分析等领域的代表性有限
- 24/7 监督不现实，所以 ai-correction hook 漏报率估计 5-15%
- 主观 1-5 分由成员自填，受当日情绪影响

## 9. 后续工作建议

- 若 PASS：继续 §M5 生产化运维（acceptance.md §M5）
- 若 FAIL：根据失败诊断，回 §M2 / §M3 / 重设计 BPP 推送策略
- 若 INCONCLUSIVE（N 太小、p > 0.05）：扩样本到 12-15 人再做一轮

---

> 模板末尾。Coordinator 把 ____ 填实，发到团队负责人 + acceptance.md 验收人。
