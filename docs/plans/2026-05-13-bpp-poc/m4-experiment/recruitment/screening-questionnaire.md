# 实验前调查问卷 · 基线 AI 协作经验

> Per acceptance.md §M4 § 验证方法 step 3 — confirm both groups have no
> significant difference in "过去使用智能助手的经验". Run before random split.

每位参与者在 day 0（实验开始前 1 天）填一次。输出 → JSON 进
`recruitment/screening-<member-id>.json`，coordinator 用 `tools/balance-check.py`
检查两组在每一题平均分上有无显著差异（p > 0.05 = balanced）。

## 题目

### 1. 使用智能助手编程的时长（必填）
- [ ] 没用过 / 用过 < 10 小时
- [ ] 10-100 小时
- [ ] 100-500 小时
- [ ] > 500 小时

→ 编码：1 / 2 / 3 / 4

### 2. 主要使用的智能助手类型（多选）
- [ ] ChatGPT 网页
- [ ] Claude Code CLI
- [ ] Cursor / Copilot Chat
- [ ] GitHub Copilot 补全
- [ ] 其他：____

→ 编码：one-hot 5 维向量

### 3. 主要工作语言（多选）
- [ ] TypeScript / JavaScript
- [ ] Python
- [ ] Go
- [ ] Rust
- [ ] Java / Kotlin
- [ ] 其他：____

→ 编码：one-hot 6 维向量

### 4. 主观自评智能助手熟练度（1-5）
1 = 不熟，遇到复杂 prompt 就会卡
3 = 一般，能让助手做大多数日常任务
5 = 非常熟，能用 hook / skill / subagent 等高级功能

→ 编码：整数 1-5

### 5. 最近 1 个月用智能助手完成任务的占比
- [ ] < 10%
- [ ] 10-30%
- [ ] 30-60%
- [ ] > 60%

→ 编码：1 / 2 / 3 / 4

### 6. 是否经常感到 "助手帮倒忙"？（1-5）
1 = 几乎从不
5 = 经常感到

→ 编码：整数 1-5

### 7. 是否参与过类似的"AI 工具效果对照"实验？
- [ ] 是
- [ ] 否

→ 编码：true / false

### 8. 自由文本：你对本实验有什么期待 / 担忧？

→ 不进 balance-check，仅 coordinator 阅读，作为风险预警。

## JSON schema

```json
{
  "member_id": "P-001",
  "filled_at": "2026-05-12T16:30:00Z",
  "answers": {
    "q1_hours": 3,
    "q2_tools": ["claude_code", "github_copilot"],
    "q3_langs": ["typescript", "python"],
    "q4_proficiency": 4,
    "q5_recent_usage": 3,
    "q6_helps_or_hurts": 2,
    "q7_prior_experiment": false,
    "q8_free_text": "希望能验证 BPP 确实有用 …"
  }
}
```

## Balance check

`tools/balance-check.py --screening recruitment/screening-*.json --groups /tmp/groups.json`

对 q1, q4, q5, q6 4 道 1-5 / 1-4 范围题分别做两组独立 t-test，
任一 p < 0.05 → balance failed，提示 coordinator 重抛随机或再增样本。
