---
date: 2026-05-13
status: draft
owner: CEO (cute non-coder duck)
brainstormed-with: brainstorming skill (superpowers v5.1.0)
supersedes: docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md (partial)
relates-to:
  - docs/BUSINESS-FEATURES.md (Feature ② evolution)
  - docs/features/cc-status.md
  - docs/features/team-realtime.md
  - docs/INIT-PROPAGATION.md
---

# TeamBrain Best-Practice Push (BPP) — Design Doc

> 团队中**任何成员**累积的「最佳实践」由 AI 自动从 session data 中蒸馏出来，
> **实时**推送到其他成员的 inbox；接收方在多通道（CC statusline / dashboard /
> 可选 Slack-email）看到通知并自选接受/拒绝；团队 lead 拥有强制推送 + 撤回
> 权限。推送方对自己被总结这件事**完全不可见**。

化用现有 `digital-twin` server + `landing/overlay` dashboard + `calibrator-v2`
+ `m5/secret-scanner`，新增 30–40% 代码量。

---

## 0. CEO 的 10 个核心决策（设计的源 anchor）

| # | 决策项 | CEO 选 |
|---|---|---|
| 1 | 实践类型 | 全 4 类（显性纠正派生 + 自定义 skill+工作流 + Skill 使用习惯 + 上下文管理+隐性肌肉记忆） |
| 2 | 推送方隐私 | **完全隐形**（AI 后台收集+总结+推送，推送方不知情、不可见、不可关） |
| 3 | 接收方 UX | **多通道同步**（CC statusline + dashboard + 可选 Slack/email；可设免打扰时段） |
| 4 | 领导认定 | **创建团队的人 = lead**；可转让、可增加副 lead |
| 5 | 推送粒度 | **接收方自选视图**（按人 / 按主题 / 逐条 3 种切换） |
| 6 | 推送节奏 | **实时**（AI 一识别立刻推） |
| 7 | 撤回机制 | **只 lead 可撤回**（撤回通知所有已收到的人） |
| 8 | 矛盾处理 | **两条并列**，接收方自选哪条 |
| 9 | 整体架构 | **方案 B**（中心团队大脑 server） |
| 10 | 实现路径 | **化用 `digital-twin` server 扩展**（不另起炉灶） |

这 10 条若需变更，spec 视作 broken，需重新走 brainstorming。

---

## 1. 系统总览

### 三大组件

| 组件 | 跑在哪 | 做什么 | 现有 / 新建 |
|---|---|---|---|
| **Laptop Client** | 每个团队成员电脑 | 收集 CC session 数据；本地 PII / secret 一次脱敏；实时上传 | ✅ 90% 现有（`bin-realtime-demo.ts` + `realtime-emit.ts` + `m5/secret-scanner`） |
| **Team Server** | 内网 / cloud（化用 `mock-server.ts`） | 存储 session；**跨成员 AI mining**；Inbox 数据库；Lead 权限；auth gate | ⚠️ 60% 现有，新增 mining + inbox + auth |
| **Receiver UI** | 接收方设备（CC statusline + 浏览器） | Inbox 3 视图；confirm/reject；多通道通知；Lead Console | ⚠️ 40% 现有（`landing/overlay/` scaffold） |

### 架构图

```
┌─── 团队成员 laptop ────┐         ┌────── 团队 Server ──────┐         ┌── 接收方设备 ──┐
│                       │         │   /v1/cc-sessions ✅      │         │ statusline      │
│  CC session           │         │   /v1/cc-status   ✅      │         │   ▲             │
│   ├─ SessionStart ─┐  │  上传   │   /v1/cc-status/stream ✅ │ SSE/push│   │             │
│   ├─ UserPromptSub─┤──┼────────►│   POST /v1/bp-push   🔧   │────────►│ Dashboard       │
│   └─ Stop ─────────┘  │         │   GET  /v1/inbox     🔧   │         │   /inbox        │
│                       │         │   POST /v1/inbox/act 🔧   │         │   ▲             │
│  本地脱敏：             │         │   POST /v1/revoke   🔧   │         │   │             │
│   ├─ secret-scanner ✅│         │                          │         │ Slack / email   │
│   └─ pii-redactor   ✅│         │ ── 新增 ── 黄色部分 ──   │         │   (webhook)     │
│                       │         │   ⑦ BP-mining pipeline   │         │                 │
│                       │         │   ⑧ Inbox model + API    │         │  ┌─ Lead 才看见  │
│                       │         │   ⑩ Lead role + revoke   │         │  │ Lead Console │
│                       │         │   ⑪ /api/* auth gate     │         │  └──────────────│
└───────────────────────┘         └──────────────────────────┘         └────────────────┘
```

### 数据流（一句话）

1. 成员写代码 → Hook 实时上传 session 到 server
2. Server AI 跨成员 mining → 提炼 BestPractice candidate
3. Wilson calibrator 打分 + 5 档 tier → 高 confidence 实时推送到所有人 inbox
4. 接收方在 inbox 3 视图（按人/主题/逐条）confirm 或 reject
5. Lead 在 Console 看全员推送，可主动撤回或强制推送

---

## 2. 数据模型

### 2.1 BestPractice （server 上的"金本"）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `bp-YYYY-MM-DD-<slug>` |
| `type` | enum | `rule` / `skill` / `habit` / `context-mgmt` |
| `title` | string | 接收方一眼看到的句子 |
| `body` | markdown | 展开细节 |
| `example` | string | 真实案例（让接收方信服） |
| `pushed_by` | user_id | 来自谁（决策 #2 隐形：推送方本人不可查此字段，server 留底） |
| `pushed_by_display` | string | 接收方看见的显示名 |
| `topic` | enum | `testing` / `git-flow` / `ctx-mgmt` / `code-style` / `ai-collab` |
| `confidence_score` | float | Wilson lower bound（`calibrator-v2/wilson.ts`） |
| `confidence_tier` | enum | `low` / `stable` / `canonical` / `enforced` / `gold`（`tier.ts`） |
| `conflict_with` | string[] | 矛盾对的 bp_id 引用（双向链表） |
| `mining_evidence` | object | raw 客观计数 `{sessions_observed, pattern_count, reject_count, ...}` |
| `revoked_at` | timestamp / null | lead 撤回时填 |
| `revoked_by` | user_id / null | |
| `revoke_reason` | string / null | |
| `created_at` | timestamp | |

### 2.2 InboxItem （接收方收件箱里的一条）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `inbox-<rcvr>-<ts>-<seq>` |
| `receiver_id` | user_id | 接收方 |
| `bp_id` | string | → BestPractice.id |
| `status` | enum | `pending` / `accepted` / `rejected` / `revoked` |
| `delivered_at` | timestamp | 实时推送送达时间 |
| `acted_at` | timestamp / null | 接收方动作时间 |
| `forced_by_lead` | false / user_id | 决策 #4 强制推送：true 时禁止 reject |
| `delivery_channels` | string[] | 实际送达的通道：`statusline` / `dashboard` / `slack` / `email` |

### 2.3 TeamMember

| 字段 | 类型 | 说明 |
|---|---|---|
| `user_id` | string | git email |
| `display_name` | string | UI 显示 |
| `role` | enum | `member` / `lead` |
| `joined_at` | timestamp | |
| `notification_prefs` | object | `{slack_url, email, quiet_hours: "22:00-08:00"}` |

### 2.4 PushEvent （审计日志，append-only）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `ev-...` |
| `event_type` | enum | `mined` / `pushed` / `accepted` / `rejected` / `revoked` / `force-pushed` |
| `bp_id` | string | → BestPractice.id |
| `actor` | user_id / `"system"` | 谁动的手 |
| `timestamp` | timestamp | |
| `metadata` | object | 事件细节 |

### 2.5 关系图

```
TeamMember ─── pushes ──►  InboxItem ──► BestPractice
                                            │ 矛盾对
                                            ▼
TeamMember ──── all actions ──────────► PushEvent (audit log)
```

### 2.6 存储位置

- 现有 `<collectorDir>/<user>/<YYYY-MM-DD>/<session>.cc-status.jsonl` 路径不变
- 新增：
  - `<collectorDir>/_bp/<bp_id>.json` （BestPractice 金本）
  - `<collectorDir>/_inbox/<receiver>/<YYYY-MM-DD>/<seq>.jsonl`（InboxItem，按天分文件）
  - `<collectorDir>/_team/members.json` （TeamMember）
  - `<collectorDir>/_audit/<YYYY-MM-DD>.jsonl` （PushEvent，append-only）

跟现有 `cc-status/store.ts` 的 path-safety + bounded scan 防御复用同一套。

---

## 3. AI Mining Pipeline （server 端核心新增）

> 这是整个 BPP 唯一**真正新建**的组件。其他都是组装现有零件。

### 3.1 输入

来自 `/v1/cc-sessions` + `/v1/cc-status` 上传的：
- Session transcripts（gzipped JSONL，已脱敏）
- CC status snapshots（实时）
- 跨成员历史（最近 7 天）

### 3.2 4 类实践的提炼路径

| 类型 | 提炼方法 | 触发信号 |
|---|---|---|
| `rule`（显性纠正） | 复用现有 `correction-detector` + `LLM-extractor`（auto-capture 那条管线） | Stop hook 抓 correction moment |
| `skill`（自定义 skill / 工作流） | 跨成员扫描 `.claude/skills/` + `.codex/skills/` 改动；diff 提取新 skill 或显著修改 | git push 触发 |
| `habit`（行为模式） | **新建** behavior-mining LLM：观察 N≥3 个 session 里某成员一致地"动手前先做 X"；用 Wilson 算这个 pattern 在该成员 session 里的频率 LB | session 累计 ≥ N 条触发 |
| `context-mgmt`（默会肌肉记忆） | **新建** context-pattern miner：观察成员的 git commit 节奏 / session 长度 / checkpoint 时机 / `/clear` 频率等 meta-pattern | 每日定时（凌晨 03:00） |

### 3.3 提炼步骤（每条 candidate）

```
1. 信号触发（Stop / git push / session count / 定时）
2. Collector 拉相关 sessions
3. LLM 提取 candidate (title + body + example) 并附 raw counts
4. mining_evidence 字段填充 (sessions_observed, pattern_count, reject_count, ...)
5. Wilson calibrator (calibrator-v2/wilson.ts) 计算 LB
6. tier (calibrator-v2/tier.ts) 分 5 档
7. tier ∈ {canonical, enforced, gold} → 进入 push queue（决策 #6 实时）
   tier ∈ {low, stable} → demote 成 personal scope，不推送
8. push queue：scope-classifier (m5/scope-classifier) 再过一遍隐私
9. 二次过 secret-scanner（m5/secret-scanner）
10. 写 BestPractice 表 + 触发 §4 push 流程
```

### 3.4 LLM 调用预算

- 复用 `claudefast` 配置（MiniMax Anthropic-compatible fast profile）
- mining 是 server-side batch，不是热路径；budget 每天 ≤ $5 per team（10 人团队 ~ session 数 ≤ 200 / day）
- 单条 candidate 提炼成本目标 ≤ 1500 tokens output

### 3.5 LLM-uncheatable 关键点

`mining_evidence` 字段是**客观计数**，非 LLM 主观摘要：
- `sessions_observed`: 整数，对应 collector 实际读了几条
- `pattern_count`: 整数，规则 grep / AST match 命中次数
- `reject_count`: 整数，对应 PushEvent 里 `rejected` 事件计数

后续 verify harness（见 §8）可直接 grep "pattern_count / sessions_observed ≥ 0.7 AND reject_count == 0" 等客观判据，**不需要 LLM-as-judge**。

---

## 4. Push & Receive Flow

### 4.1 实时推送通道（决策 #6）

化用 `realtime-stream.ts` 现有 SSE 模式：

```
新建 BestPractice → 写 BestPractice 表 → fan-out 写每个接收方的 InboxItem
                                          ↓
                                      触发 server-side SSE event
                                          ↓
                              所有订阅 /v1/inbox/stream 的 client 收到
                                          ↓
                              client 按 notification_prefs 路由到通道
```

### 4.2 接收方设备订阅

| 通道 | 实现 | 触发条件 |
|---|---|---|
| CC statusline | `scripts/teamagent-statusline.cjs` 扩展：显示"📬 N 条新推送"（化用 cc-status statusline push 那套） | 默认开启 |
| Dashboard | `landing/overlay/src/app/inbox/` 新增路由，订阅 SSE，实时刷新列表 | 默认开启 |
| Slack | server-side webhook（新增） | `notification_prefs.slack_url` 配置 |
| Email | server-side SMTP 客户端（新增） | `notification_prefs.email` 配置 |

### 4.3 免打扰时段

- `notification_prefs.quiet_hours`（如 `22:00-08:00`，时区按 git config）
- 在 quiet_hours 内的推送**只更新 dashboard**，不触发 statusline / slack / email
- 重新到工作时段时一次性补送通知摘要

### 4.4 接收方 3 视图（决策 #5）

Dashboard `/inbox` 路由顶部有视图切换：

```
[ 按人 ] [ 按主题 ] [ 逐条 ]
```

- **按人**：按 `bp.pushed_by_display` 分组；每个推送方一个折叠面板，展开看其全部 candidate；"全部接受 / 全部拒绝"按人批量操作
- **按主题**：按 `bp.topic` 分组（testing / git-flow / ctx-mgmt / code-style / ai-collab）；同主题跨人聚合
- **逐条**：经典 list，按 `delivered_at` desc 排序

### 4.5 单条操作

每条 InboxItem 三个按钮：
- ✓ 接受：`POST /v1/inbox/act { id, action: "accept" }` → `status: accepted` + 写 PushEvent
- ✗ 拒绝：`POST /v1/inbox/act { id, action: "reject" }` → `status: rejected` + 写 PushEvent（用于 §3.5 reject_count）
- 👁 详情：展开 `body` + `example` + `mining_evidence`

如果 `forced_by_lead != false`，✗ 按钮 disabled（决策 #4 lead 强制推送禁拒绝），只能 ✓ 或留 `pending`。

### 4.6 接受后的作用

`status: accepted` → server 把 `bp.title + body` 编译进该接收方的本地 `~/.claude/skills/teamagent/<bp_id>/SKILL.md`（化用 `compile.ts` 的 Skills-only 默认行为）。

下次该接收方开 CC 时，PreToolUse matcher 立刻可用此规则。

---

## 5. Lead Role + Revoke + Force Push

### 5.1 Lead 认定（决策 #4）

- 团队创建时第一个跑 `teamagent team init` 的人，`role = lead`
- 写到 `<collectorDir>/_team/members.json`
- Lead 可：
  - `teamagent team transfer-lead <new_user>` 转让
  - `teamagent team add-lead <user>` 增加副 lead（最多 3 个）

### 5.2 Lead Console（dashboard 新增视图）

Dashboard `/lead/console` 路由（role=lead 才可见）：
- 全员 BestPractice 列表（含 pushed_by）
- 每条可操作：✋ 撤回 / 🚨 强制推给某人 / 编辑（不可改 body，只可加 lead_note）

### 5.3 撤回（决策 #7）

```
Lead 点 ✋ 撤回 → POST /v1/revoke { bp_id, reason }
   ↓
1. BestPractice.revoked_at / revoked_by / revoke_reason 填充
2. 所有 InboxItem WHERE bp_id == X SET status = revoked
3. 写 PushEvent { event_type: "revoked", actor: lead_user_id }
4. SSE 广播 revoke 事件给所有 client
   ↓
client 收到 → statusline 显示"⚠️ 1 条已撤回" + dashboard 标红删除线
   ↓
已 accepted 的接收方：`~/.claude/skills/teamagent/<bp_id>/SKILL.md` 被 server 触发的 sync 删除
```

### 5.4 强制推送（决策 #4）

```
Lead 在 console 选某条 BP + 选某人 → POST /v1/bp-push/force { bp_id, receiver_id }
   ↓
新建 InboxItem { receiver_id, bp_id, status: pending, forced_by_lead: <lead_id> }
   ↓
SSE 广播给该 receiver
   ↓
该 receiver 看到此条 ✗ 拒绝按钮 disabled，必须 ✓ 接受或留 pending
```

### 5.5 副 lead 限制

副 lead 可撤回、可强制推送，但不可：
- 转让 lead 角色
- 移除主 lead 的副 lead 身份
- 删除审计日志

---

## 6. Privacy & PII

### 6.1 三层守门

```
Layer 1 (laptop):       secret-scanner + pii-redactor 一次过（已脱敏才上传）
Layer 2 (server in):   上传后再 secret-scanner 二次过（防 layer 1 模型旧版漏）
Layer 3 (mining out):  BestPractice candidate 出锅后再 secret-scanner 三次过（防 LLM 提炼时把 transcript 里漏掉的 secret 复述到 title/body）
```

每层挂的 hook 都用同一份 `packages/core/src/m5/secret-scanner.ts`；任一层命中 → reject + 写 PushEvent `event_type: "secret_blocked"`。

### 6.2 透明度 vs 决策 #2 "完全隐形"

**核心 trust gate**：推送方完全隐形 → 推送方对自己的数据无视野 → 公司层面**必须**给团队一份"加入团队前你需要同意的事"协议：

```
加入此 TeamBrain 团队即视为同意：
- 你的 Claude Code session transcript 实时上传到团队 server（已脱敏 API key / 路径 / 密码）
- AI 后台从你的 session 中蒸馏「最佳实践」并推送给其他成员
- 你本人无法查询自己被蒸馏出哪些实践、被推送给谁
- 你的所有动作通过 PushEvent audit log 由团队 lead 可见
- 退出团队后，server 端 sessions 在 30 天后自动清除（lead 可手动 purge）
```

这份协议作为 `teamagent team init` 的强制提示（CLI 弹出 + 用户必须 type "I AGREE" 才继续）。

### 6.3 transcript 上 server 的隐私边界（鸭鸭警示）

CEO 决策 #9 选了方案 B（中心团队大脑），意味着 session transcript 完整上传到 server。这跟方案 C（本地脱敏后摘要上传）的边界不同：

| 方案 | server 上看到的内容 |
|---|---|
| B（CEO 选） | 整段 transcript（已脱敏 secret/PII，但仍包含完整对话文本） |
| C（未选） | 仅"行为摘要"（"session 7/10 调用了 brainstorming"，不含原文） |

方案 B 意味着 server 端泄露事件影响范围更大；§6.1 三层守门 + §6.2 知情同意是减害措施，但**不能消除根本风险**。建议团队部署时：
- Server 必须 HTTPS only
- `/api/*` 强制 auth（见 §7 ⑪ 决策项）
- Server 部署在内网或 VPC，不暴露公网
- 30 天自动清理 transcripts（保留 BestPractice 金本即可）

---

## 7. Conflict Pair Handling

### 7.1 矛盾检测时机

新 BestPractice 落表前，server 跑 conflict-detector：
```
new_bp.body + new_bp.title  → embedding
existing BP 同 topic → top-K 检索（K=20）
对每个 candidate pair：LLM 二分类 "矛盾 / 不矛盾"
矛盾 → 双向写 conflict_with 字段
```

### 7.2 接收方 UI（决策 #8 "两条并列"）

接收方 inbox 里若一条 BP 的 `conflict_with` 非空：
```
┌─ 大黄推送 ────────────────┐    ┌─ 小黑推送 ────────────────┐
│ 测试时必须 mock 数据库      │ vs │ 测试时绝不 mock 数据库      │
│ confidence: 0.81           │    │ confidence: 0.79           │
│ 来自 8 个 session         │    │ 来自 6 个 session         │
│ [接受这条] [拒绝]          │    │ [接受这条] [拒绝]          │
└────────────────────────────┘    └────────────────────────────┘
                       \                 /
                        \   <矛盾对>     /
                         \              /
                          (接收方可全拒 / 接受一条 / 全留 pending)
```

接受一条会自动 reject 另一条（在该接收方的 inbox 里）；接收方动作不影响 server 上的 BestPractice 表本身。

### 7.3 Lead 仲裁（可选 future）

若团队希望 lead 把矛盾对中的一条标为 canonical / 一条标为 deprecated，可在 console 加按钮：
- "升 canonical"：该条 tier 提到 `gold`
- "降 deprecated"：该条 confidence 设为 0 + 触发 revoke 等价行为

**v1 不实现**这个 future——v1 保持决策 #8 的"接收方完全自选"原则。

---

## 8. Testing Strategy （LLM-uncheatable）

### 8.1 三层 harness

参照 `docs/verify/E2E-LEARNING.md` 的 Counterfactual Ablation 模式：

| 层 | harness | 验证什么 |
|---|---|---|
| Tier (a) | `tests/fixtures/scenarios/bpp-mining-fixture/` byte-level diff | 给定 N 条 fixture session，mining 输出的 BestPractice 字段（title + body + mining_evidence）byte-equal 预期 snapshot |
| Tier (b) | `scipy.stats.ttest_rel` paired t-test | bpp-on vs bpp-off 两组同样任务，"是否避坑" rate 显著差异（p < 0.05） |
| Tier (c) | LLM-as-judge（兜底） | 语义层模糊问题（如"两条 BP 是否真矛盾"）由 judge LLM 投票 |

主门禁是 tier (a) + (b)。tier (c) 仅作 semantic-ambiguity 兜底。

### 8.2 关键判据（grep 客观）

- `mining_evidence.pattern_count >= 3 AND pattern_count / sessions_observed >= 0.7` → 可推送
- `reject_count / delivered_count <= 0.3` → BP 保持 active
- `confidence_tier in {canonical, enforced, gold}` AND `revoked_at == null` → 出现在 receiver inbox

### 8.3 已有 fixture 复用

- 现有 `tests/fixtures/scenarios/moment-dayjs/` 是 tier-a 的范本
- 新增 `tests/fixtures/scenarios/bpp-brainstorm-habit/` 等 5 个 fixture，分别覆盖 4 类 type + 1 个矛盾对

---

## 9. Implementation Milestones

### Phase 1 — Server 基建延伸（2-3 周）

| Slice | 内容 | 复用 |
|---|---|---|
| P1.1 | `POST /v1/bp-push` + `POST /v1/inbox/act` + `POST /v1/revoke` endpoints | `mock-server.ts` |
| P1.2 | `_bp/` `_inbox/` `_team/` `_audit/` 4 个存储目录 + path-safety + bounded scan | `cc-status/store.ts` |
| P1.3 | `/api/*` auth gate（bearer token，团队 invite link 派发） | 新建 |
| P1.4 | TeamMember CRUD + `teamagent team init/transfer-lead/add-lead` CLI | 新建 |

### Phase 2 — AI Mining Pipeline（3-4 周，最核心）

| Slice | 内容 | 复用 |
|---|---|---|
| P2.1 | `correction-detector` + Stop hook 接入（type=rule） | ✅ 已 ship |
| P2.2 | git push trigger → skill diff 提炼（type=skill） | 新建 hook |
| P2.3 | behavior-miner LLM（type=habit） | 新建（重头戏） |
| P2.4 | context-pattern miner（type=context-mgmt） | 新建 |
| P2.5 | mining-evidence 字段 + Wilson + tier 走通 | ✅ calibrator-v2 |
| P2.6 | secret-scanner 三层串联 | ✅ m5/secret-scanner |

### Phase 3 — Receiver UX（2-3 周）

| Slice | 内容 | 复用 |
|---|---|---|
| P3.1 | Dashboard `/inbox` 路由 + 3 视图（按人/主题/逐条） | `landing/overlay/` 加路由 |
| P3.2 | SSE 订阅 + 实时刷新 | `realtime-stream.ts` SSE 模式 |
| P3.3 | statusline 扩展显示 "📬 N 条新推送" | `scripts/teamagent-statusline.cjs` |
| P3.4 | Slack / Email webhook（可选 channel） | 新建（轻） |
| P3.5 | 接受 → compile 进 `~/.claude/skills/teamagent/<bp>/SKILL.md` | ✅ `compile.ts` |

### Phase 4 — Lead Console + Force Push + Revoke（1-2 周）

| Slice | 内容 | 复用 |
|---|---|---|
| P4.1 | Dashboard `/lead/console` 路由（role=lead 守门） | `landing/overlay/` 加路由 |
| P4.2 | 撤回流（PushEvent + SSE + 接收方 statusline + 客户端 skill 删除） | 新建 |
| P4.3 | 强制推送（`forced_by_lead` + UI ✗ disable） | 新建 |

### Phase 5 — Privacy + Compliance（1 周）

| Slice | 内容 |
|---|---|
| P5.1 | `teamagent team init` 强制弹"加入协议" + type "I AGREE" |
| P5.2 | 30 天 transcript 自动清理 cron |
| P5.3 | `/api/*` 强制 HTTPS（dev 例外） |
| P5.4 | Audit log 防篡改（hash chain） |

### Phase 6 — Testing & Verify Harness（1-2 周）

| Slice | 内容 |
|---|---|
| P6.1 | tier (a) byte-diff fixture 5 个 |
| P6.2 | tier (b) Counterfactual Ablation 跑 17-task corpus on/off |
| P6.3 | tier (c) LLM judge for conflict-pair semantic |
| P6.4 | docs/verify/BPP-VERIFY.md 文档化 3 层 harness |

**总工程量**：~12 周（3 人并行约 4-5 周完工）。

---

## 10. Reused Components Map（"省 60-70%"的具体清单）

| 现成零件 | 文件 | 在 BPP 里干啥 |
|---|---|---|
| `mock-server.ts` HTTP server | `packages/digital-twin/src/mock-server.ts` | 加 `/v1/bp-*` `/v1/inbox*` `/v1/revoke` endpoints |
| Real-time SSE | `packages/digital-twin/src/realtime-stream.ts` | 直接订 inbox 实时推送 |
| `realtime-emit.ts` 客户端 | `packages/cli/src/realtime-emit.ts` | 上报 session 数据 |
| `secret-scanner.ts` | `packages/core/src/m5/secret-scanner.ts` | 三层 PII 守门 |
| `scope-classifier.ts` | `packages/core/src/m5/scope-classifier.ts` | personal/team/uncertain 分类 |
| `calibrator-v2/wilson.ts` | `packages/core/src/calibrator/v2/wilson.ts` | mining 后打 confidence |
| `calibrator-v2/tier.ts` | `packages/core/src/calibrator/v2/tier.ts` | 5 档分级决定是否推 |
| `compile.ts` | `packages/cli/src/commands/compile.ts` | 接受后写 `~/.claude/skills/teamagent/` |
| `correction-detector` | `packages/core/src/...` | type=rule 提炼路径 |
| `landing/overlay/` | `landing/overlay/src/app/` | dashboard scaffold |
| `cc-status/store.ts` | `packages/digital-twin/src/cc-status/store.ts` | 存储 path-safety 模板 |
| `cc-status/path-safety.ts` | `packages/digital-twin/src/cc-status/path-safety.ts` | 防路径穿越 |
| `bin-realtime-demo.ts` | `packages/digital-twin/src/bin-realtime-demo.ts` | dev 跑单机 server 验收 |
| `teamagent-statusline.cjs` | `scripts/teamagent-statusline.cjs` | 加 "📬 N" 显示 |
| SessionStart + UserPromptSubmit hook | `packages/cli/src/realtime-emit.ts` + bin-session-start.ts | 实时上报 |

**复用占比**：14 个零件中 12 个直接复用 / 加增量；2 个（dashboard + statusline）需扩展。

---

## 11. Known Limitations / Open Questions

### v1 不做（明确 out of scope）

- ⛔ Lead 仲裁矛盾对（§7.3）—— 保留决策 #8 接收方完全自选
- ⛔ 推送方查看自己被总结的内容 —— 决策 #2 完全隐形
- ⛔ 跨团队推送（每个团队 server 独立）
- ⛔ 接收方反推（"我给某条 BP 加证据"）
- ⛔ A/B 测试不同推送策略（用 Counterfactual Ablation 离线评估代替）

### Open Question（spec 落地前需 CEO 鸭最终拍板）

1. **Server 部署位置**：内网 192.168.22.88 / VPC / cloud？影响 §6.3 隐私边界。
2. **加入协议法律审核**：§6.2 "I AGREE" 文本需走法务过一遍。
3. **副 lead 上限 3 是否合适**：可能小团队 1 个就够，大团队不够。
4. **Mining LLM 调用成本上限**：每团队 $5/day 是估算，需 dogfood 跑 1 周才知道真实值。
5. **接收方拒绝是否影响该 BP 的全局 confidence**：当前设计中 `reject_count` 进 `mining_evidence`，可能拉低再次推送概率；CEO 鸭是否同意接收方 reject 反馈循环。

---

## 12. Success Criteria

BPP v1 视为 ship 当：
1. ✅ 4 类 BestPractice 各有 ≥ 5 个 fixture 通过 tier (a) byte-diff
2. ✅ tier (b) Counterfactual Ablation 显示 bpp-on arm 显著降低团队"重复犯错"率（p < 0.05）
3. ✅ Dogfood 团队（≥ 3 人）连续运行 14 天，无 secret 泄露事件、无 lead 撤回级别错误推送
4. ✅ Lead Console 撤回 P95 延迟 ≤ 3s（从 click 到所有接收方 statusline 更新）
5. ✅ 实时推送 P95 端到端延迟 ≤ 5s（mining 完成 → 接收方 statusline 看到）
6. ✅ Server `/api/*` auth gate 通过 OWASP 基础渗透扫描

---

## 13. 提交后下一步

按 brainstorming skill 流程：

1. ⏳ Spec self-review（鸭鸭做完）
2. ⏳ CEO 鸭复审本 spec（按一下"OK"或挑刺）
3. ⏳ 通过 `superpowers:writing-plans` skill 出实施计划（拆 P1-P6 各 phase 的具体 task list）
4. ⏳ FIXEDFLOW 给每个 phase 开 ≤50 字 issue + grill + driver dispatch

---

呷呷~ 鸭鸭收工 (>ω<)
