# PRESHIP — Verified-Only CEO Duck Ship Status

`PRESHIP` 是发版前给 CEO/VC 小鸭看的产品功能状态报告。它的目的不是列工程细节，而是用中文说明“现在可以稳妥展示哪些已经验证过的产品能力”。

## Trigger

当用户问：

- `what would happen if we say PRESHIP`
- `PRESHIP 是什么`
- `explain PRESHIP`
- 或消息里只有/主要是 `PRESHIP`

必须按本页回答。

## Answer Shape

回答必须：

1. 使用中文。
2. 面向 cute CEO chinese duck / CEO/VC 小鸭。
3. 只讲高层产品功能，不讲技术实现细节、包名、测试文件名、内部模块名。
4. 直接输出实际 CSV rows，不能只解释 PRESHIP 规则。
5. 只列 `已验证` 功能。
6. 不把 `部分验证`、`已声明未验证`、`失败/不稳定`、`文档规划` 项作为 feature rows 列出。
7. 可以用一句 caveat 说明未验证/失败/规划项被刻意排除，避免过度承诺。
8. 不要把 `RULE-VERIFY` 或 `bash scripts/verify-all-rules.sh` 说成 PRESHIP 的触发方式；PRESHIP 的触发方式就是用户说 `PRESHIP` 或问 `what would happen if we say PRESHIP`。

推荐 CSV 列：

```csv
"状态","功能","给小鸭CEO/VC的解释","证据/当前判断"
```

## Verified-Only Source

当前 verified-only 来源是：

- `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv`
- 只取 `状态` 等于 `已验证` 的行。

当前可列入 PRESHIP 的功能：

```csv
"状态","功能","给小鸭CEO/VC的解释","证据/当前判断"
"已验证","产品入口能打开","鸭总能看到产品菜单，说明不是空壳，能被真实启动。","可作为最小演示卖点。"
"已验证","最小学习闭环演示","系统能演示记录经验、编译规则、展示归因这条最小链路。","可作为核心概念 demo。"
"已验证","安全试吃沙箱","新改动可以先放进隔离环境里试，不直接污染主工作区。","DOGFOOD Tier 2 / Tier 3 sandbox probe 已通过；不要 claim Tier 4。"
"已验证","快速调研流程","遇到复杂问题，可以让多个快 agent 并行调研，再给 CEO 汇总结论。","FASTPROBE 基础流程和关键 flag 已验证。"
"已验证","PR 后复查流程","合 PR 后不是只看绿灯，还会继续抓 Codex review，直到问题清干净。","POSTPR canned answer 已验证通过。"
"已验证","最小质量线","基础检查和最小冒烟测试通过，说明核心小版本能跑。","typecheck 通过；最小 release-smoke 通过。"
"已验证","知识会进化","有用经验会更可信，没用或过时经验会降级，避免团队大脑越来越乱。","最小校准闭环已验证。"
"已验证","看得见的统计","CEO 可以看到系统学到了多少经验、分布在哪些层、最近新增了什么。","teamagent stats 已验证。"
"已验证","主动记录坑点","用户不用等 AI 犯错，可以主动把一个坑记进系统，让团队以后少踩一次。","pitfall 非交互录入已验证。"
```

## Caveat

PRESHIP 必须窄口径：只列已验证项。部分验证、未验证、失败/不稳定、文档规划项不要作为功能行出现；可以一句话说明它们已被排除，以免把明天不能稳妥展示的内容讲成已完成。
