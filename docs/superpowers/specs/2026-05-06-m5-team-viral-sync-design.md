# M5 团队病毒式传播与规则同步（Team Viral Sync）

**Date:** 2026-05-06
**Status:** Abandoned — superseded by [ADR-0016](../../adr/0016-abandon-m5-viral-sync.md) (2026-05-15)
**Branch:** `m5/team-viral-sync`
**Worktree:** `.codex/worktrees/m5-team-viral-sync`

---

> ⚠️ **ABANDONED (2026-05-15).** M5 viral sync is no longer a supported or
> recommended capability. Its auto-infect / auto-install / auto-push behavior is
> invasive by design, shipped-but-unvalidated, and distracts from the Feature #1
> core wedge. See [ADR-0016: Abandon M5 viral sync](../../adr/0016-abandon-m5-viral-sync.md).
> The `m5-*` code is frozen (removal is a deferred follow-up); this spec is kept
> only as a historical design record. Do not build new work on it.

---

## 1. 目标与边界

让 TeamAgent 从"个人工具"变成"团队工具"。具体：

1. **病毒式扩散**：一个项目中只要有一名成员在用 TeamAgent，该项目对所有协作者都变成"必装"。
2. **完整功能等价**：被传染的协作者机器跑起来的 TeamAgent，与发起人本地形态等价（CLI、插件、项目级 Skill、hook、知识库结构、语义匹配能力全套）。
3. **自动静默规则同步**：项目内所有成员产生的可共享规则，自动经 git 仓库流通；删除、修改也同步。零人工操作。
4. **隐私守底**：含密钥、PII、机器特定路径的规则永远不进团队仓库，由不可关闸门兜底。
5. **失败降级**：自动机制任何环节失败都不能阻塞全队工作；写入冲突可恢复，永不丢人改动。

**显式不在范围内**：

- 防恶意绕开（无 cryptographic 签名）。
- 跨项目（跨远程仓库）的规则共享。
- 真 P2P 网络（DHT、IP 直连）。
- 单独的中央规则服务器。

---

## 2. 整体架构

四个子系统协作：

| 子系统 | 做什么 | 触发 |
|---|---|---|
| **传染（Infection）** | 把"必装契约"写进项目仓库（manifest、bootstrap 入口、hook 锚点、共享层目录骨架） | 资深用户首次在某项目内活动时自动触发；幂等 |
| **引导（Bootstrap）** | 在新协作者机器上读契约、补齐缺失的 TeamAgent 形态、验证完整性 | 新协作者克隆并装依赖时自动触发 |
| **同步（Sync）** | 个人规则的自动分类、共享规则的双向流通、删改冲突的确定性裁决 | 规则产生 / 修改 / 删除时立即触发；git pull / merge 后自动应用 |
| **拦截（Enforcement）** | 在多个关键节点检查"是否已装且可运行"，未通过给出补救命令 | 提交、构建、测试等节点；失败降级 |

**契约链**：传染创造契约 → 引导让契约对新机器生效 → 同步让规则在团队流动 → 拦截让契约持续有效。

---

## 3. 用户路径

### 用户 A：资深用户（已装 TeamAgent）

在自己已有项目中工作时，TeamAgent 自动检测"该项目尚未被传染"→ 一次性写入：

- 契约清单（`.teamagent/manifest.json`）
- bootstrap 入口（项目根脚本 + `package.json` 钩入）
- hook 锚点（`.githooks/`）
- 共享层目录骨架（`.teamagent/team/<author>/`、`.teamagent/shared-skills/`、`.teamagent/shared-claude.md`）

A 后续提交并推送时，这些会随项目进入团队仓库。**A 不需要跑任何"发起"命令——传染对 A 也是静默的**。

### 用户 B：新协作者（未装 TeamAgent）

`git clone` 后装依赖时，bootstrap 自动触发：

1. 读契约清单。
2. 比对本机 TeamAgent 现状。
3. 缺则装，版本不对则升级，关键插件 / 项目级 Skill / hook 缺则补齐。
4. 验证完整性后将 `.teamagent/team/*` 下的共享规则合入 B 本地知识库。

完成后 B 的 TeamAgent **功能层面等同于 A**。差异只在各自 L1 私有规则。

### 用户 C：希望避开的人

C 可以跳过装机（escape hatch 见 §8）。但默认路径会持续提示并给装机命令；C 主动 opt-out 不影响其他人。

---

## 4. 组件与责任

| 组件 | 职责 | 关键边界 |
|---|---|---|
| **契约清单** | 声明项目要求的 TeamAgent 形态：版本、必备插件、必备项目级 Skill、关键 hook、知识库结构、闸门策略 | 跟项目 git 走，纯声明式 |
| **传染器** | 检测当前项目是否已有契约清单；若无则一次性写入；幂等 | 不动用户工作树之外的文件 |
| **引导器** | 读契约 → 比对本机 → 增量补齐 → 验证 | 不覆盖既有用户级配置；缺失时增量装 |
| **个人知识层（L1）** | 用户产生的所有规则的第一站，无条件接收 | 永不出本机 |
| **共享知识层（L2）** | 经过两道闸门后被复制进来的子集 | 跟项目 git 走，全团队读写 |
| **沙箱层（L3）** | dogfood / 临时实验产生的规则 | 永不进 git |
| **闸门 1：硬性密钥扫描** | 阻止 token / 绝对路径 / 邮箱 / 电话 / 密钥模式流向 L2 | 不可关；命中即永久 sealed 在 L1 |
| **闸门 2：作用域分类器** | 给规则打 `personal` / `shareable` / `uncertain` 标签 | `shareable` 进 L2；`uncertain` 默认 personal |
| **同步器** | 监听 L2 变化 → 写盘 → idle 时自动 commit + push；监听 git pull → merge 进本地知识库 | 后台、静默；只动 `.teamagent/team/`，不污染用户工作树 |
| **冲突裁决器** | LWW（last-writer-wins）+ tombstone：晚改赢，并发按 author 字典序 | 纯函数 |
| **可见面板** | 把所有自动动作变成可读事件流：编译进 CLAUDE.md / `teamagent stats` / 状态面板 | 只读输出 |
| **拦截器** | 在 commit / build / test 等节点检查"是否已装且最新" | 失败降级、不 fail-stop |

---

## 5. 数据流

### 5.1 一条规则的诞生

```
规则产生（confidence = c, content = x）
    │
    ▼
[L1 写入] 立刻接收 — 用户感知不到延迟
    │
    │ 异步管线（不阻塞）
    ▼
[向量化] 自动生成 embedding（复用 M4-B 机制）
    │
    ▼
[闸门 1：密钥扫描]
    │   命中 → sealed=true, scope=personal, 永停 L1, 发"已封存"事件
    │   通过 ↓
    ▼
[闸门 2：作用域分类]
    │   personal | uncertain → 永停 L1, 发"判定为个人"事件
    │   shareable ↓
    ▼
[L2 写入] 写到 .teamagent/team/<me>/<rule_id>.json
    │
    ▼
[idle 检测] 等用户当前 git 操作空闲
    │
    ▼
[自动 commit] 带固定前缀 [teamagent-sync]
    │
    ▼
[自动 push] 失败则 fetch+rebase 重试 ≤ 3
    │
    ▼
[发事件] "已分享 R-007 到团队"
```

### 5.2 修改

任意成员对任意规则的修改：

- 同 `rule_id` 写新版本，更新 `modified_by` / `modified_ts`。
- pull 后冲突裁决：本地 ts < 远端 ts → 本地被覆盖；ts 相同 → author 字典序。

### 5.3 删除（tombstone）

```json
{
  "rule_id": "R-007",
  "current": {
    "deleted": true,
    "deleted_by": "alice",
    "deleted_ts": "2026-05-06T11:00:00Z"
  }
}
```

接收方 pull 后看到 tombstone → 从本地知识库移除。物理 JSON 文件保留（便于历史追溯与并发裁决），仅"effective state = 已删"。

### 5.4 接收（Bob 端 git pull 后）

```
git pull / git merge 完成
    │
    │ post-merge hook 触发
    ▼
扫 .teamagent/team/* 的 diff（vs 本地知识库）
    │
    ▼
对每条变更应用冲突裁决：
    │   新增 → 直接合入本地知识库
    │   修改 → LWW 决胜
    │   tombstone → 从本地知识库移除
    │
    ▼
发"已收到 N 条规则"事件
```

### 5.5 团队边界

```
team_id = SHA256(normalize(git remote get-url <primary>))
```

`normalize`：去 `.git` 后缀、去 user/token、统一 host。同 `team_id` 才视作同团队。fork 自动隔离。

---

## 6. 隐私模型

### 6.1 三层

| 层 | 进 git? | 团队可见 | 默认收容 |
|---|---|---|---|
| **L1** 个人本地 | ❌ | ❌ | 所有新规则的第一站 |
| **L2** 项目共享 | ✅ | ✅ | 闸门通过的子集 |
| **L3** 沙箱 | ❌ | ❌ | dogfood / 临时实验 |

### 6.2 闸门 1：硬性密钥扫描（不可关）

拒绝模式（命中即 sealed）：

- 绝对路径：`/Users/`、`/home/`、`C:\Users\`
- 邮箱、电话、信用卡格式
- token 形态：`sk-`、`gh[ps]_`、`xox[abp]-`、JWT 三段式、AWS Access Key
- 高熵字符串（≥ 高熵阈值且字符集复合）

命中规则永久封存在 L1，并发"已封存"事件提示用户改写。

### 6.3 闸门 2：作用域分类器

输入规则文本 → 输出 `personal` | `shareable` | `uncertain`。

启发式标签：

- 包含具体人名 + 组织名组合 → personal
- 包含本机仅有的目录 / 工具 / 配置名 → personal
- 描述项目流程、代码模式、抽象经验 → shareable
- 模糊不清 → uncertain（默认 personal）

实现层面用规则系统已有的语义能力（embedding + 启发式分类器），细节在实现 plan 中。

### 6.4 用户主动改作用域

- 用户随时可改一条规则的作用域标签：personal → shareable 或反向。
- 改 personal → shareable 仍需过闸门 1（密钥扫描）。
- 改 shareable → personal 触发 tombstone（团队副本被删）+ 本地保留为 personal。
- **跨 author 改作用域**：用户可改任何成员规则的作用域（沿用"任何人都可对任何规则有删改"原则）。操作时 `modified_by` 指向操作者本人，原 `author` 字段不变；事件流明确归因。

---

## 7. 自动化与可见性

**激进模式（按用户决策）**：

- 不弹首次同意。
- 不设冷却窗口，写 L2 即推送。
- 唯一的非用户可关闸门：闸门 1。

**事后可见，全程透明**：

- 每个自动动作（封存、分类、写 L2、push、接收、删除）都通过 AttributionBus 发结构化事件。
- CLAUDE.md 编译时插入"今日团队同步摘要"。
- `teamagent stats` 可查全历史。
- 状态面板常驻"待审 N / 已封存 M / 已分享 K / 已接收 J"。

---

## 8. 错误处理与降级

| 失败场景 | 行为 |
|---|---|
| 引导失败（网络、权限、平台） | 警告，不阻断依赖安装；下次有网自动重试 |
| 自动 push 被拒（远端有更新） | 自动 fetch + rebase 重试 ≤ 3；仍失败则下次 idle 再试 |
| 自动 commit 撞用户工作 | 同步只动 `.teamagent/team/`，且带固定前缀 `[teamagent-sync]` |
| 闸门 1 误杀 | 提示用户改写规则文本（去机器特定信息）→ 重新触发管线 |
| 闸门 2 误判 | 用户改作用域标签 → 触发管线重评 |
| 拦截器被人删 | 设计上不防恶意；任一节点幸存仍能拦 |
| Bob 离线 | 同步暂停；下次 online 自动追上 |
| 仓库无 push 权限（fork 协作者） | 自动降级为 personal-only；不报错，事件流中提示 |

**Escape hatch**：

- `TEAMAGENT_BOOTSTRAP_SKIP=1` 跳过自动安装（CI / 离线 / 调试）。
- 但拦截器在 commit / test 等节点仍会校验已装状态——escape 不跳过校验。

---

## 9. 测试策略

| 层 | 怎么测 |
|---|---|
| **冲突裁决（纯函数）** | 单元测试覆盖 LWW、tombstone、并发 ts 平局 |
| **闸门 1（密钥扫描）** | 黄金测试集：含敏感模式的样本必拒、干净样本必过 |
| **闸门 2（作用域分类器）** | 黄金测试集：personal / shareable / uncertain 三类样本，准确率门槛 |
| **同步管线（端到端）** | 假 git 仓库 + 模拟时序，三人并发改 / 删 / 推 / 拉，验证最终一致性 |
| **引导端到端** | 干净沙箱机器从零跑：clone → 装依赖 → TeamAgent 全套功能等价于参考机 |
| **拦截器多点冗余** | 删任一节点其余仍生效；删全部后允许显式 escape |
| **可见面板** | 每个自动动作都能在事件流中找到对应条目，无丢事件 |

**Port + 契约测试先行（元约束）**：

新增 Port 必须先在 `packages/ports/src/__tests__/*-contract.ts` 写契约，再写实现。M5 预计新增的 Port：

- `RuleSyncPort`（监听 L2 变化、应用远端变化、idle commit/push 抽象）
- `SecretScanPort`（闸门 1 的执行接口）
- `ScopeClassifierPort`（闸门 2 的执行接口）
- `BootstrapPort`（引导器对包管理器、git 操作、本机环境的统一抽象）
- `EnforcementPort`（拦截器对 hook 安装与运行时校验的统一抽象）

### Walking Skeleton 不断裂

每个 phase 结束的 commit 必须满足：

- `pnpm test` 全绿
- `pnpm typecheck` 全绿
- 该 phase 对应的 demo 命令跑通

---

## 10. 阶段切分

四个 phase 各自是一个可演示的 walking skeleton。

### M5-A：注入骨架 + 引导可用

- 实现传染器（写 manifest、bootstrap 入口、hook 锚点、共享层目录骨架；幂等）
- 实现引导器（读 manifest、比对、增量补齐、验证；至少覆盖核心 CLI + 关键插件）
- 新增 `BootstrapPort` 契约测试 + 实现
- **Demo**：A 机活动 → 自动注入；B 机干净环境 clone → 装依赖 → TeamAgent 自动跑起来

### M5-B：隐私三层 + 双闸门

- L1 / L2 / L3 存储抽象（沿用知识库已有结构 + L2 投影层）
- 闸门 1：硬性密钥扫描器
- 闸门 2：作用域分类器
- 新增 `SecretScanPort`、`ScopeClassifierPort` 契约测试 + 实现
- 主动改作用域命令
- **Demo**：含 token 的规则被封存；纯流程规则自动判 shareable；用户改标签触发重评

### M5-C：自动同步 + 删改

- 同步器：L2 变化监听、idle commit、自动 push、fetch+rebase 重试
- post-merge hook：扫 diff、应用远端变化、调用冲突裁决
- LWW + tombstone 冲突裁决（纯函数）
- 新增 `RuleSyncPort` 契约测试 + 实现
- **Demo**：两台机器交替 push / pull，规则集（含删除）收敛一致

### M5-D：多点拦截 + DX

- pre-commit / pnpm test / pnpm dev 的前置校验
- 错误文案、补救命令、escape hatch
- 可见面板（事件流注入 CLAUDE.md / `teamagent stats` / 状态面板）
- 新增 `EnforcementPort` 契约测试 + 实现
- **Demo**：单点删除拦截仍生效；事件流完整可查

---

## 11. 与现有架构的衔接

| 现有概念 | M5 怎么用 |
|---|---|
| **元约束：Functional Core, Imperative Shell** | 冲突裁决、密钥扫描、作用域分类、manifest 比对全部为纯函数；放 `packages/core/`。文件、git、网络、子进程的 IO 放 `packages/<m5-shell>/` |
| **元约束：Port + 契约测试** | M5 新增 5 个 Port，全部先契约后实现 |
| **元约束：归因走 AttributionBus** | 所有自动动作（封存、分类、写 L2、push、接收、删除、降级、escape）发结构化事件 |
| **元约束：Walking Skeleton 不断裂** | 每个 M5 phase 末尾 commit 全绿 + demo 跑通 |
| **元约束：Port 接口冻结于 M0** | M5 只新增 Port，不动 M0 已冻结的 Port |
| **现有知识库** | L1 直接复用既有存储；L2 是新增 storage layer，对知识库做 read/write 投影 |
| **现有 CLAUDE.md 编译** | 共享 `.teamagent/shared-claude.md` 进编译输入流；事件流摘要也注入编译输出 |
| **现有 M4-B 语义匹配** | 闸门 2 的分类器复用 embedding 管线 |
| **现有 dogfood 机制** | L3 沙箱层即 dogfood 工作树内的规则；与 L1 / L2 完全隔离 |

---

## 12. 显式不做（YAGNI）

| 不做 | 理由 |
|---|---|
| 真 P2P 网络（DHT、IP 直连） | git 当 transport 已够 |
| 加密签名 / 防篡改 | 信任模型已经是"git push 权限 = 团队成员" |
| 规则版本号 | timestamp + LWW 已够 |
| 用户身份认证 | git author 即 author |
| 防恶意绕开 | 目标是默认路径 100% 触发，不是抗对抗 |
| GUI 配置面板 | CLI + 文件优先 |
| 跨项目规则共享 | 团队边界严格按 remote URL；跨项目走另一条线（不在 M5 范围） |
| 中心化规则审核服务 | 与"零中央服务器"原则冲突 |

---

## 13. 风险与开放问题

### 风险 R1：自动 push 触发用户惊吓

**缓解**：闸门 1 兜底 + 事件流可见 + 状态面板常驻。**残留风险**：用户在不知情时写下被分类器判 shareable 的敏感规则（绕过闸门 1 但不该出团队）。

**待定**：是否需要"新规则首小时停 L1"作为可选保守模式（用户可一键开启）？激进模式下默认关。

### 风险 R2：闸门 2 准确率

**缓解**：黄金测试集 + 启发式 + 用户随时改标签。**残留风险**：误判率初期可能较高。

**待定**：误判率门槛设多少触发回退（例如 "误判率 > X% 时切回保守模式"）？

### 风险 R3：仓库膨胀

**缓解**：只存 JSON + tombstone，单条规则 KB 级；GC 策略：tombstone 超过 N 月后物理删除。**残留风险**：长期高频改写规则可能让 git 历史膨胀。

**待定**：tombstone GC 周期、L2 文件单独存 vs LFS。

### 风险 R4：多 author 子目录的合并冲突

**缓解**：每个 author 写自己子目录，物理隔离。**残留风险**：跨 author 删除（"任意人删任意规则"）写到原作者目录，可能并发冲突。

**待定**：删除是否写在原 rule_id 所在目录，还是写到 deleter 的目录用 `deletes_rule_id` 引用？后者无并发冲突，前者更直观。

### 风险 R5：bootstrap 跨平台

**缓解**：`BootstrapPort` 抽象包管理器、git、文件系统。**残留风险**：Windows / macOS / Linux 行为差异。

**待定**：哪些平台必须支持（Tier 1）、哪些尽力支持（Tier 2）。

---

## 14. 后续

- 进入 writing-plans skill，给出 M5-A 的具体实现计划。
- M5-A 落地并 demo 通过后再依次 M5-B / C / D。
- 每 phase 结束做 PR + POSTPR loop。
