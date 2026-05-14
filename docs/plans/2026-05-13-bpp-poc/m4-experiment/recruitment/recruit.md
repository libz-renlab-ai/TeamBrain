# 招募流程

> Per acceptance.md §8 — "招募真实小团队" 是 BLOCKED-ON-HUMAN 动作之一，
> 但流程是可以预先定义的。这份文档就是为 coordinator 准备的招募手册。

## 招募规模

- 最少 6 人，理想 8-12 人
- 不超过 12 人（管理成本陡升 + 12 人是 acceptance.md §M4 上限）
- 必须**单一团队**（同公司、同部门、同协作圈），跨团队会引入噪声

## 招募来源（按优先级排序）

1. **公司内同事**：日常协作熟悉、共同语言、流失率低（首选）
2. **朋友 / 前同事 small startup**：熟人介绍，少量金钱激励即可
3. **开源社区贡献者**：贡献过 PR 的活跃成员，邮件招募
4. **付费招募**：上 Prolific / UserTesting 招 8 个，但**注意**：付费招的人天然
   行为偏离日常工作（acceptance.md §M4 风险 #2 — 真实日常工作样本污染）

## 招募信文案模板

主题：邀请你参加一个为期 4 周的 AI 协作效果实验

正文：

> Hi {name}，
>
> 我们正在做一个 BPP（Best-Practice Push）系统的效果验证实验，希望邀请你加入。
>
> 实验主要内容：
> - 4 周日常工作（你照常工作，**不需要额外加班**）
> - 期间完成 17 个编程小任务（每个 30 min - 3 hr）
> - 随机分到两组，一组开挖矿（看到队友的经验）、一组关挖矿
> - 实验结束统计两组差异，发布报告
>
> 你的承诺：
> - 4 周日常工作时段把"实验工作"插入正常工作流（17 任务大约共 18-30 hr）
> - 完成任务时填一个 1-5 主观分（< 30 秒）
> - 实验结束做一次简短复盘（30 min）
>
> 你拿到的：
> - 实验完成后 [REWARD_AMOUNT_TODO] 礼品 / 礼券
> - 一份完整的「我自己 4 周工作数据 + AI 协作模式」分析（仅自己可见）
> - 不影响你日常工作 KPI（保证书：附 informed-consent.md）
>
> 期望回信：YES / NO / 我有问题。
>
> Coordinator: {coordinator-name}

## Day 0 流程清单

- [ ] 所有 N 位参与者签 informed-consent.md
- [ ] 所有 N 位参与者填 screening-questionnaire.md
- [ ] coordinator 跑 `tools/random-split.py --members all.json --seed <YYYYMMDD>`
- [ ] coordinator 跑 `tools/balance-check.py` 检查两组在 baseline 上无显著差异
      - 如有差异：换 seed 重抛 max 5 次，仍不平衡 → 再招 1-2 人补
- [ ] coordinator 在 BPP server 上：
      - 开挖矿组成员：team enroll = `mining-enabled`
      - 关挖矿组成员：team enroll = `mining-disabled`
- [ ] 给所有人发 17 任务清单 + collection 工具安装包
- [ ] day 0 结束，day 1 开始

## 失败 fallback

- 招不到 6 人 → 实验**不启动**，acceptance.md §M4 维持 BLOCKED-ON-HUMAN
- 招到但 < 8 人 → 启动但提示统计功效不足、容易漏过中等大小的效应
- 招到 ≥ 8 但中途流失到 < 6 人 → 在 day 14 中断点决定是否补人或废弃实验
