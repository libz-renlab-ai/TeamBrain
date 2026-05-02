# Task 5 实施：收益声明（Claim）v0

> 日期：2026-04-30  
> 状态：Draft（先声明，后验证）

## 1) Claim Statement（当前先对外声明）

我们声明：在 TeamAgent 的目标使用场景中，团队“重复犯错率”将**相对基线下降 30%**，
但该数值**暂不作为当前里程碑验收门槛**，直到数据链路稳定并完成正式验证。

## 2) 指标口径（Metric Contract）

- 指标名：`repeat_mistake_rate`
- 定义：
  - 分子：当前周期内“已被历史规则/经验覆盖但仍再次发生”的错误次数
  - 分母：当前周期内可计入统计的总错误次数
- 计算：`repeat_mistake_rate = repeated_errors / total_errors`
- 比较方式：`relative_drop = (baseline_rate - current_rate) / baseline_rate`
- **零基线边界**：当 `baseline_rate == 0`（基线窗口未观测到重复错误）时，`relative_drop` 数学上未定义，**不得**输出 `NaN` / `Inf`。规则：
  - 若 `current_rate == 0`：判定 `relative_drop = 0`（绝对达标但不可外推），并在报告里标注 `baseline_zero=true, status=insufficient_baseline`。
  - 若 `current_rate > 0`：判定 `relative_drop = -∞` 的等价标记 `regression_from_zero_baseline=true`，并将该周期标记为 `claim_status=undetermined`，等待基线扩窗后再评估，**不得**进入"两个连续周期"反证计数。
  - harness 的 raw JSON 必须显式输出 `baseline_rate`、`current_rate`、`baseline_zero` 三个字段，由 LLM judge 读 raw JSON 决定下游处置。
- 成功阈值（仅用于未来验证阶段）：`relative_drop >= 0.30`（仅在 `baseline_zero=false` 且样本量达标时生效）

## 3) 假设（Assumptions）

1. 错误事件可被稳定归一化（同类错误可聚合）。
2. 规则触发与错误事件存在可追溯关联（rule-id / session-id / timestamp）。
3. 样本量达到最小统计规模（建议：每周期 >= 100 个错误事件）。
4. 基线周期与当前周期的任务结构差异不发生极端漂移。

## 4) 证据来源（Evidence Sources）

- TeamAgent 事件日志（规则命中、拒绝、回滚、override）。
- 第三方 harness 周期报告（按周期输出汇总）。
- 抽样人工复核记录（用于确认“重复错误”归类正确性）。

## 5) 反证条件（Falsification）

出现以下任一情况，Claim 判定为“不成立/需修订”：

1. 两个连续评估周期 `relative_drop < 0.30`（`baseline_zero=true` 的周期不计入此计数）。
2. 指标口径无法稳定复现（同一数据重跑结果偏差超过预设容差）。
3. 复核显示“重复错误”识别误差超阈值（建议 > 10%）。
4. 样本量未达标或分母口径异常波动导致结论不可比。

## 6) 实施清单（Now）

- [ ] 固化口径：将本文件作为 Task 5 的唯一 Claim 口径文档。
- [ ] 接入数据：确保日志中具备 rule-id / error-id / session-id / timestamp。
- [ ] 出首版周报：仅报告口径准备度与数据完整性，不做 30% 达标判断。
- [ ] 进入验证门：当连续 2 周数据完整性达标后，再启用“30% 下降”验收。
