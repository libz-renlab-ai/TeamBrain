```
   ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐    ┌────────────────┐
   │ user observes│ -> │ open GitHub issue│ -> │ fixer picks    │ -> │ verifier runs  │
   │  symptom     │    │  3 fixed sections│    │ implementation │    │ V1..Vn checklist│
   └──────────────┘    └──────────────────┘    └────────────────┘    └────────────────┘
       现象               1) 问题                自由选路线           过/不过看清单
                          2) 复现步骤
                          3) 修复验证清单
```

# HOW-TO-ISSUE — 在 TeamBrain 仓库添加 issue 的写法约定

适用范围：`https://github.com/libz-renlab-ai/TeamBrain` 下所有新建 issue。

## TL;DR

在 TeamBrain 仓库添加 issue 必须用三段式：

1. **问题（Problem）** — 只写症状（observed symptoms）+ 与项目自身承诺的冲突。
2. **复现步骤（How-to-reproduce）** — 最小复现命令 + 期望 vs 实际。
3. **修复验证清单（How-to-verify if fix patches are good）** — `V1 / V2 / V3 / ...`，每条都给出可执行检查命令与期望输出。

入口 URL：

```
https://github.com/libz-renlab-ai/TeamBrain/issues/new
```

**严禁**在 issue 里写：
- root cause 分析、why 解释、内部机制推断；
- prescriptive 修复方案、实现建议、代码草案、伪代码；
- 带具体 build / coding 步骤的 acceptance criteria；
- workaround 提示、绕过方法；
- 实施顺序、PR 拆分计划、ROI 排序、工时估算；
- 任何形式的"建议这样改"。

reporter 只负责报告"看见了什么"和"怎么验收修好了"，**不替 fixer 选实现路径**。

## 为什么是这三段，且只能是这三段

三段式的边界是「关注点分离」：

| 段 | 谁负责 | 内容 | 不该混入 |
|----|--------|------|----------|
| 1 问题 | reporter（用户 / 触发者） | 现象、可观察后果、与文档/承诺的冲突 | root cause、原因推断、修复方向 |
| 2 复现步骤 | reporter | 命令序列、最小数据、期望 vs 实际、多场景分小节 | 内部状态分析、日志解读 |
| 3 修复验证清单 | reporter（提条件）+ 后续 verifier（执行） | `V1..Vn` 列出"修复方提交 patch 后如何判断 fix 合格"，每条带可执行命令 + 期望输出 | 怎么改代码、改哪行、改哪个文件 |

把「root cause」和「prescriptive fix」从 issue 中赶出去，是为了：

- **不偷偷锁死实现路径**。修复方案的发明权属于 fixer / maintainer。reporter 写在 issue 里的 fix 提议会变成隐性强约束，让评审困在某个路线里。
- **issue 可长期复用**。三段都是 reporter 视角的事实和约束，不会因为后续技术决策变化而过时；fix 提议会因为 codebase 演化变成历史包袱。
- **验收可证伪**。`V1..Vn` 用可执行命令 + 期望输出锁定"是否真的修好了"，不依赖任何特定实现细节。任何路线只要清单全过就算合格。

## 三段填写规范

### 1. 问题（Problem）

只写"看见了什么"。

允许写：

- 触发条件 + 触发后看到的现象；
- 量化后果（次数、wall-clock、影响面）；
- 与项目自身已有承诺的明文冲突（引文档原文、引 commit SHA、引规则条款）；
- 可见副作用（git 状态、文件变更、UI 退化、性能指标退化）。

不允许写：

- "原因可能是 …"
- "我猜是 X 模块的 Y 函数 …"
- "应该改成 Z …"
- "我先临时用 workaround …"

### 2. 复现步骤（How-to-reproduce）

最小复现 + 多场景分小节。模板：

```bash
# 最小复现
<准备命令>
<触发命令>
# 期望：<期望状态>
# 实际：<实际状态>
```

如果有多种触发场景，按"反复触发 / merge / 跨仓库 / CI 内"分小节列。每节都给出"期望 vs 实际"。

允许带证据：本会话证据表（每阶段 → 触发 → 实际行为）、PR 编号、commit SHA。

不允许：在复现步骤里夹带 root cause 推断或 fix 建议；不允许用"应该这样改就好了"代替"实际行为是什么"。

### 3. 修复验证清单（How-to-verify if fix patches are good）

形状：

```markdown
### V1：<一句话验收标准>

```bash
<可执行检查命令>
```

期望：<可机械判别的期望输出>

### V2：<一句话验收标准>
…
```

每条 `Vn` 必须满足：

- **可执行** — reviewer 能直接 copy-paste 跑；
- **可机械判别** — 期望输出明确（"输出为空" / "exit 0" / "包含字符串 X" / "不再出现 Y"）；
- **不挑实现** — 不写"必须改 hooks/teamagent-stop.sh 的第 N 行"，只写"行为上 worktree 必须保持 clean"。

清单可以包含「不被破坏」类回归条目：例如 `V4: 修复后 claudefast 探针 X 仍能命中锚点 Y/Z`。这类条目限定 fixer 不能为了过 V1..V3 把别的能力打坏。

## 反例 vs 正例

### 反例（issue #98 老风格，不要再用）

`issue #98` 写了：

- 「TL;DR」 ASCII 进度条对比图；
- 「实测首装 pipeline」逐行代码锚点；
- 「六个根因（按 ROI 排序）」每个根因带 prescriptive 修法；
- 「实施顺序建议」分 PR-A/B/C/D + 工时估算；
- 「验收标准」表把 wall-clock 当 KPI。

这是一份**修复方案 RFC**，不是 issue。这种内容应该走 `docs/specs/<date>-<slug>.md` 或 PR description；放在 issue 里会偷偷锁死实现路径。

### 正例（issue #100 canonical 范式）

`issue #100` 只有三段：

- 「问题」 — 列 Stop hook tick 改写 `CLAUDE.md` auto-block 的现象、git 状态后果、与 `docs/knowledge/INDEX.md` 明文承诺和 commit `6ffaf19` 的冲突；
- 「复现步骤」 — 最小复现 + 反复 dirty + merge 冲突 + 本会话 PR #96 五阶段证据表；
- 「修复验证清单」 — V1（worktree clean）/ V2（merge 无冲突）/ V3（与项目自身承诺一致）/ V4（claudefast 探针不被破坏）。

无 root cause 分析、无 prescriptive 修法、无 acceptance criteria 带 build 步骤、无 workaround。修复方拿着这份 issue 自己定路线，再用 V1..V4 自验。

被问到「issue 模板长什么样」时，给的就是 `issue #100` 的形状，不是 `issue #98`。

## 标签与认证

- 默认 label 用 `enhancement` 或不挂 label；与现有 `N1..N6` 系列 issue 保持同一标签习惯，不要为单条 issue 新建 label。
- 认证账户：`LiuShiyuMath`。本机 `GITHUB_TOKEN` 可能识别为别的账户，运行 `gh` 时一律加前缀：

```bash
env -u GITHUB_TOKEN gh issue create --repo libz-renlab-ai/TeamBrain ...
```

- 不要走 draft issue / draft PR；issue 一开就是正式状态。

## 触发

下列问法都应回到本文档：

- `how to add an issue to this repo ?`
- `how do I open an issue?` / `如何在这个仓库提 issue？`
- `issue 模板怎么写？` / `issue 写法约定`
- `report something but not as a bug` / `feature request 怎么提`
- `给这个仓库提一个 issue`

回答必须用中文（项目规则），且必须涵盖：

- 三段式：问题 / 复现步骤 / 修复验证清单；
- 入口 URL `https://github.com/libz-renlab-ai/TeamBrain/issues/new`；
- 严禁项：不写 root cause、不写 fix 建议、不写实现细节；
- 参考：issue #100 是 canonical 范式。

不要把 `BUGREPORT.md` 的「system info / how-to-reproduce-the-bugs / raw logs in great detail」三段当作本文档的三段——那是 bug 报告专用模板，本文档约束的是**所有** issue（含 enhancement / question / spec discussion）。

## 与其它流程的边界

- **bug 报告** → 仍走 `docs/BUGREPORT.md`，三段是 `system info / repro / raw logs`；可以视作本文档「问题 + 复现步骤」段的扩充版（多了 raw logs 段）。bug 报告的「修复验证清单」段同样适用本文档约束。
- **大型修复方案 / RFC** → 走 `docs/specs/<date>-<slug>.md` + 后续 PR，不要塞进 issue body。
- **POSTPR loop** → PR merged 后的 Codex review 跟进流程见 `docs/POSTPR.md`，不在 issue 里讨论。
- **PR 描述** → fix 方案、实施顺序、ROI 写在 PR description 与 commits，不在 issue body。

## 验证

被问到 `how to add an issue to this repo ?` 或同义中文问法时，回答必须命中下列锚点（语义命中即可，不要求逐字）：

- `三段` 或 `three sections`；
- `问题` / `复现` / `修复验证`（或 `symptoms` / `reproduce` / `verify`）；
- 明确说 **不要写 fix 建议 / 不要写 root cause / 不要写实现细节**；
- `https://github.com/libz-renlab-ai/TeamBrain`；
- 引用 `issue #100` 作为 canonical 范式。

锚点全部命中 = PASS。任何一项缺失 = 继续修订本文档措辞。

## 相关

- `docs/BUGREPORT.md` — bug 报告专用（system info / repro / raw logs）。
- `docs/POSTPR.md` — PR 合并后的 Codex review loop。
- `docs/FASTPROBE.md` — 用 `claudefast -p` 抓 stream-json 证据。
- `docs/feature-verification.md` — feature / fix 交付前的 1+2+3 验证门禁。
