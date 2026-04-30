# 团队记忆方向备忘 (Direction Memo)

**日期**: 2026-04-21
**作者**: liboze2026 (+ AI 协作)
**状态**: 方向记录 — 暂不动代码，后续走完整 brainstorm → spec → plan → impl 流程
**取代/延伸**: `docs/specs/2026-04-13-teamagent-design.md` v5.2 中的 wiki 子系统部分

---

## 1. 现状

### 1.1 wiki 子系统已实现能力

- 5 源 fetcher: GitHub Release / npm / RSS / arxiv / manual URL
- Haiku L0 判断 + 嵌入索引 (`knowledge_vec` + sqlite-vec, 384 dim)
- SessionStart hook 自动拉取 (24h debounce)
- UserPromptSubmit 语义注入 (minSimilarity=0.75, maxResults=3)
- stack-relevance filter + age filter + sweep (zero-hit-aged, source-overflow)
- 归因 `AttributionBus` → `StdoutRenderer`
- CLI: `wiki:pull / list / stats / subscribe / unsubscribe / add / dislike / rejected / subscriptions`

### 1.2 新增（2026-04-21 会话）

- `wiki.manualStack` 配置项 (`.teamagent/config.json`)
- `.teamagent/last-wiki-pull.md` harvest 日志
- statusline 拆分 wiki/规则计数
- 5 条 AI 新闻 RSS + arxiv cs.AI 订阅

---

## 2. 为什么转向

### 2.1 外部订阅的问题

1. **低命中率** — 实际生产中 UserPromptSubmit 注入几乎不触发 (本次测试未命中)。原因链：minSimilarity=0.75 严苛 + Xenova 冷启动 5s 超时 + 跨模型 embedding 维度可能不匹配。
2. **高运维成本** — 5 套 source adapter + filter + judge + embed + sweep + retriever + marker。本轮踩坑包括: URL 404, RSS 解析失败, root `package.json` 检测不到 monorepo 子依赖, stack-relevance 过严全挡。
3. **价值点可被 MCP 替代** — "查最新 AI 新闻/论文/release" 可由 `teamagent-news-mcp` 服务端暴露几个 tool，让 Claude 按需 query。无需 hook、嵌入、sweep。
4. **本项目场景不强** — teamagent 无团队离线需求、无 air-gapped 部署、无跨会话主题记忆压力。

### 2.2 团队记忆才是差异化

**"团队"是这个工具的核心名字**。但当前系统只做了单人本地知识库 + 外部订阅，团队维度几乎为零：

- 同事 A 踩过的坑，同事 B 的 Claude 看不到
- 团队技术决策（"我们用 Zod 不用 Yup"）没有跨人同步机制
- 新人入职无法直接继承团队的 `knowledge.db`
- 知识库冲突（A 说应该 X, B 说应该 Y）无解决流程

这才是 MCP 解决不了、且必须自建的领域。

---

## 3. 团队记忆目标

### 3.1 核心用例

| # | 用例 | 说明 |
|---|------|------|
| U1 | **跨人共享规则** | 同事 A 的 Claude 学到一条规则，团队其他人的 Claude 自动拿到 |
| U2 | **新人入职继承** | 新成员 clone 项目 / 加入组织 → Claude 立即有团队累计的 N 条规则 |
| U3 | **决策归因** | 规则附带 "谁、何时、为什么" → 新人能追溯，不是凭空生效 |
| U4 | **冲突裁决** | A 的规则和 B 的规则矛盾 → 有机制识别+提示 tech lead 定夺 |
| U5 | **作用域管控** | 项目内 vs 团队级 vs 个人级 —— 个人偏好别污染团队库 |
| U6 | **审计轨迹** | 规则何时生效、拦截了什么、帮了谁 —— 可追溯团队级收益 |

### 3.2 非目标 (明确不做)

- ❌ 替代 Confluence/Notion —— 只管 AI 行为规则，不管产品文档
- ❌ 实时聊天 —— 不做团队通讯
- ❌ 复杂权限 RBAC —— 起步只做 owner / member 两级
- ❌ 保留当前 wiki 外部订阅主动权 —— RSS / arxiv 迁到 MCP server

---

## 4. 架构草案（不是设计文档，是思考起点）

### 4.1 存储分层

```
individual layer    project layer     team layer      (org layer — future)
~/.teamagent/       ./.teamagent/    git remote       central registry
  global.db           knowledge.db    team-rules.git    (TBD)
  (personal)          (shared in      (synced via
                       repo)           push/pull)
```

### 4.2 同步模型候选

| 模型 | 机制 | 优 | 劣 |
|------|------|----|----|
| **A. Git-based** | rules 导出为 `.teamagent/rules/*.yaml`，走 git PR 流程 | 无服务器、熟悉的 review 流程、diff 可见、历史清晰 | 每次规则变更要 commit + PR，打扰 |
| **B. Central registry** | 独立服务（HTTP API），客户端 push/pull | 实时、可聚合统计、UI 管理 | 要运维、权限系统、网络依赖 |
| **C. Federated peer** | 每人一个 DB，按订阅同步 | 去中心、无单点 | 冲突解决复杂、半死状态多 |

**初判**: 选 A。理由:
- 天然契合现有工作流（开发者已经用 git）
- diff + PR review 解决 U4 冲突裁决
- 规则文件可被人读，不是黑盒 SQLite
- 升级到 B/C 成本低（git 只是 transport）

### 4.3 规则文件格式（草稿）

```yaml
# .teamagent/rules/use-zod-over-yup.yaml
id: proj-teamagent-a1b2c3d4
scope:
  level: project            # project | team | personal
  project: teamagent
  paths: ["packages/**"]
category: C                  # L/M/H/C/W 沿用
trigger: "校验用户输入/API 请求体"
wrong_pattern: "用 Yup / Joi / Zod 以外的 schema 库"
correct_pattern: "使用 Zod，type 从 schema 推导"
reasoning: "团队已有 Zod 依赖，避免引入多套 schema 库导致 type 不一致"
confidence: 0.95
tier: canonical
enforcement: passive
evidence:
  added_by: "alice@example.com"
  added_at: "2026-03-15T10:00:00Z"
  related_pr: "https://github.com/x/y/pull/42"
  hit_count_at_canonical: 7
conflict_with: []
```

### 4.4 合并规则

- **冲突定义**: 同 `scope` 下 `wrong_pattern` 互斥 OR `correct_pattern` 互斥
- **检测时机**: 每次 `teamagent compile` (本地) + git merge / rebase (远端)
- **解决策略**:
  1. 自动: `max_tier_ever` 高者胜 (canonical > enforced > experimental)
  2. 自动: hit_count 高者胜 (二级排序)
  3. 人工: 都不能决出 → 标记 `status: contested`，compile 跳过该条，提示 tech lead

### 4.5 隐私 / 噪声控制（暂时归档）

> 2026-04-30 决议：隐私守门方案先归档，不作为当前里程碑交付项。
> 当前目标先做出可演示 demo，隐私拦截/脱敏能力后置。

- `scope.level: personal` 规则不进 `.teamagent/rules/`、commit 前敏感信息扫描、`teamagent export-team` 等机制全部延后。
- 当前阶段允许先走最小可用同步链路，优先验证端到端体验与演示稳定性。
- 隐私相关需求保留在本节，待 demo 完成后再恢复排期。

---

## 5. wiki 子系统处置

### 5.1 立即 (本备忘生效即做)

- ❌ **不动代码** — 保留现有 wiki 功能，避免破坏当前能用的部分
- ✅ 承认其为"实验性 / 非核心"
- ✅ CLAUDE.md / README 若提到 wiki，加注 "experimental, team-memory 优先"

### 5.2 后续 (团队记忆做完后)

- RSS / arxiv / github release fetcher → 抽成独立 MCP server `teamagent-news-mcp`
- 删除 `packages/adapters/src/wiki/sources/*`、`WikiPipeline` 的 fetch/filter 部分
- 保留 `SqliteWikiRetriever` + `knowledge_vec` 基建（团队记忆也要语义检索）
- 保留 `AttributionBus` + `harvest-writer`（团队记忆也要日志）

---

## 6. 下一步

### 6.1 待调研问题（需要走 brainstorm）

1. 团队库用什么路径挂到现有 `SqliteKnowledgeStore`？第三层 DB? 还是同 db 不同 `scope.level`?
2. `teamagent compile` 如何处理 team rules 的 token budget —— 个人 / 项目 / 团队三层谁优先？
3. 规则冲突 UI：用 CLI 交互 (`teamagent resolve-conflicts`) 还是 PR comment?
4. 多团队场景（一个人属于 team A + team B）怎么隔离？
5. hit_count 是否同步？同步了会有隐私问题（A 公司多少人用过某规则）

### 6.2 流程

按 memory 里的规范:

```
1. 深度调研 — git-based rule sync 的业界实践（Renovate / Dependabot / custom lint rules）
2. brainstorm — 和用户确认 U1-U6 排序 + 隐私预算
3. 设计文档 — 产出 2026-xx-xx-team-memory-design.md
4. 实现计划 — 拆 milestone + subagent 可执行 task
5. subagent 驱动开发 — 按 milestone 推进
```

**当前状态**: 仅完成此备忘。进入步骤 1 需用户触发。

---

## 7. 附：当前会话证据

本次会话暴露的问题（用于日后回顾）:

- wiki 注入实测未触发 → 验证了"低命中率"论点
- 订阅 5 RSS 中 2 条 URL 失效 → 验证了"外部源运维成本"论点
- stack-relevance filter 挡掉 39/46 = 85% → 验证了"过滤过严"论点
- Haiku 拒绝 297/386 = 77% → 验证了"LLM judge 大量做无用功"论点
- User 提出 MCP 替代方案 → 验证了"价值点可被 MCP 替代"论点

这 5 点共同支撑向团队记忆转向的合理性。
