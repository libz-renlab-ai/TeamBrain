# 17 任务清单 · 里程碑 4 实验

> Each task has objective pass/fail measured by `score.sh` (exit 0 = pass,
> non-zero = fail). Time-to-completion is auto-recorded by `collection/daily-collector.ts`.

## 设计原则

- **客观判分**：每个任务必须能被自动脚本判 0/1（完成 / 未完成）
- **真实工作**：避开"教科书题"，选用接近团队日常工作的题
- **难度梯度**：3 类（小修小补 / 中等实现 / 复杂重构），混合在 4 周内分配
- **互不依赖**：任何一题都能单独完成，避免顺序锁
- **覆盖维度**：算法、调试、迁移、API 设计、测试、文档至少各 2 题

## 17 任务列表

| # | 任务 | 类别 | 预期工时 | 状态 |
|---|---|---|---|---|
| 01 | `parseDuration` — 实现一个时长字符串解析器（`1h30m`、`2d`、`90s`） | 算法 / 小修 | 30-60 min | **fully specified** ↓ |
| 02 | 修复 stale-PR detection — 给定一段误报的 PR 状态判别代码，定位并修 bug | 调试 / 小修 | 45-90 min | **fully specified** ↓ |
| 03 | 把 callback 风格 API 迁移到 Promise / async-await | 迁移 / 中等 | 60-120 min | **fully specified** ↓ |
| 04 | 实现一个 LRU 缓存（含 TTL） | 算法 / 中等 | 60-90 min | outline |
| 05 | 给定一个性能瓶颈函数，用 profiling 数据找出热点并优化 | 调试 / 中等 | 60-120 min | outline |
| 06 | 把一个旧版正则解析器迁移到 PEG.js / chevrotain | 迁移 / 复杂 | 120-180 min | outline |
| 07 | 实现一个 CLI 工具（含 zod 输入校验、help 文本、子命令） | API 设计 / 中等 | 60-90 min | outline |
| 08 | 给一段没测试的工具函数补 unit test（覆盖率 ≥ 80%） | 测试 / 小修 | 45-75 min | outline |
| 09 | 把一段同步代码改成并发（Promise.all / Worker thread） | 算法 / 中等 | 60-90 min | outline |
| 10 | 修复 flaky test —— 给定一个时间敏感 flaky 测试，定位竞态并修 | 调试 / 复杂 | 90-150 min | outline |
| 11 | 实现一个 markdown → HTML 渲染器（CommonMark 子集） | 算法 / 复杂 | 120-180 min | outline |
| 12 | 给一段函数补完整 TSDoc + 使用示例 | 文档 / 小修 | 30-45 min | outline |
| 13 | 把 REST API 迁移到 GraphQL schema | 迁移 / 复杂 | 120-180 min | outline |
| 14 | 实现一个 rate-limiter 中间件（token bucket） | API 设计 / 中等 | 60-90 min | outline |
| 15 | 给一份 OpenAPI spec 写一个 client SDK | API 设计 / 复杂 | 90-150 min | outline |
| 16 | 修复内存泄漏 —— 给定一个长时间运行的服务，定位泄漏点 | 调试 / 复杂 | 90-180 min | outline |
| 17 | 给一段过时文档对照代码做更新 | 文档 / 中等 | 45-75 min | outline |

**总工时**：约 18-30 hours per member over 4 weeks (~1 hour/day if distributed evenly).

## Fully specified vs outline

3 任务（01 / 02 / 03）作为模板**完整规约**，含：
- `problem.md` — 任务描述、约束、验收标准
- `starter/` — 起始代码（成员从这里开始）
- `reference-solution/` — 标准答案（仅 coordinator 用，judge 用，不给成员）
- `score.sh` — 客观判分脚本

剩下 14 任务（04-17）现在是 **outline**——清单和分类已定，**正式启动实验前必须扩展成同样格式**。扩展的工作量：每任务约 30-60 min，14 任务总计 7-14 hours。这是 coordinator 在 day -1 (recruit-day) 之前必须完成的 prep work。

## 各任务公平性约束

- 每位成员都跑相同 17 任务、相同顺序、相同验收标准
- 不允许 coordinator 在实验中插入"AI 不擅长 / AI 擅长"的偏向题
- 17 任务在 day 0 锁定后**实验中不允许增删改**
- 如某任务出现"两组都做不出来"或"两组都瞬秒"的极端情况，该任务在分析阶段标 OUTLIER 并从 4-gate 计算中剔除（剔除条件预先写明）

## 客观判分的边界

`score.sh` 只判"代码是否过测试"。**不**判：
- 代码风格
- 注释质量
- 设计优雅度

主观维度由成员自己每日给 1-5 分（acceptance.md §M4「成员主观评价」），与 score.sh 独立。

代码质量分（第 3 个 gate）由统一工具自动化计算：
- `eslint` zero-warning rate
- `tsc --noEmit` clean rate
- 圈复杂度 (`madge --circular`)
- 测试覆盖率（如任务要求带测试）

具体计算见 `analysis/code-quality.py`（outline，由 coordinator 在 prep 阶段补全）。
