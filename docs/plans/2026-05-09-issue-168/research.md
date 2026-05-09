```text
                  ┌─────────────────────────────────────┐
                  │  RESEARCH — issue 168 statusline    │
                  │                                     │
                  │  事件 kinds × 来源 × 当前归属 ×     │
                  │  正确归属                            │
                  └─────────────────────────────────────┘
```

# Research — Issue 168

调查 statusline `helped` / `risk` 字段的事件来源和当前归属逻辑，确定方案 C 的精确分类。

## 事件 kinds 实际来源

`scripts/teamagent-statusline.cjs:115-136` 当前定义：

```js
const HELPED_EVENT_KINDS = [
  "hook-pre.passive_matched",       // 静默命中
  "hook-pre.warned",                // ⚠️ ALSO in RISK
  "hook-pre.blocked",               // ⚠️ ALSO in RISK
  "hook-post.result",
  "ai.narrative.injected",
  "ai.narrative.complied",
  "pitfall.added",
  "compiler.updated",
  "extractor.extracted",
  "calibrator.adjusted",
  "init.completed",
];

const RISK_EVENT_KINDS = [
  "hook-pre.warned",                // ⚠️ overlap
  "hook-pre.blocked",               // ⚠️ overlap
  "ai.output.bad_pattern",
  "ai.narrative.recurred",
  "ai.user_input.flagged",
  "error.candidate.added",
];
```

`CONTRIBUTION_HINTS` 罗列的所有可能 kinds（line 138-160）：

| kind                                | 当前 HELPED | 当前 RISK | 新归属 |
|-------------------------------------|-------------|-----------|--------|
| `hook-pre.passive_matched`          | ✓           |           | HELPED |
| `hook-pre.warned`                   | ✓           | ✓ ❌ 重叠 | RISK   |
| `hook-pre.blocked`                  | ✓           | ✓ ❌ 重叠 | RISK   |
| `hook-post.result`                  | ✓           |           | HELPED |
| `ai.override.ignored`               |             |           | RISK   |
| `ai.override.complied`              |             |           | HELPED |
| `ai.override.blocked_circumvented`  |             |           | RISK   |
| `pitfall.added`                     | ✓           |           | HELPED |
| `compiler.updated`                  | ✓           |           | HELPED |
| `extractor.extracted`               | ✓           |           | HELPED |
| `calibrator.adjusted`               | ✓           |           | HELPED |
| `init.completed`                    | ✓           |           | HELPED |
| `scenario.run`                      |             |           | HELPED |
| `error.candidate.added`             |             | ✓         | RISK   |
| `error.candidate.approved`          |             |           | HELPED |
| `error.candidate.rejected`          |             |           | HELPED |
| `ai.output.bad_pattern`             |             | ✓         | RISK   |
| `ai.narrative.injected`             | ✓           |           | HELPED |
| `ai.narrative.recurred`             |             | ✓         | RISK   |
| `ai.narrative.complied`             | ✓           |           | HELPED |
| `ai.user_input.flagged`             |             | ✓         | RISK   |

新分类原则：**HELPED = "工具正向贡献了什么"** (silent matches + 信息/学习事件 + accept-after-warn)；**RISK = "工具拦下/标记了什么风险"** (warned/blocked + bypass + bad pattern + flag)。两组互不重叠。

`hook-pre.warned` / `hook-pre.blocked` 当前同时计入两组。这是数学不一致的根源——它们本质是"风险事件"，工具的"贡献"在于阻止它，但归类应当只走 RISK 一边；HELPED 是工具的正向输出，不应混入风险事件。

`hook-post.result` 是 hook-post 的执行汇总，归 HELPED（工具记录了一次执行）。

`init.completed` 等基础设施事件归 HELPED（工具完成了某个里程碑）。

`pitfall.added` / `compiler.updated` / `extractor.extracted` / `calibrator.adjusted` 是 KB 增长事件，归 HELPED。

`error.candidate.added` 是捕获到一个潜在新错误模式，归 RISK（工具识别了一个问题信号）；其后续 `approved` / `rejected` 是审查动作，归 HELPED。

`ai.narrative.complied` 是 AI 听了提醒（HELPED）；`ai.narrative.recurred` 是 AI 没听、再次踩坑（RISK）；`ai.narrative.injected` 是工具发出了提醒（HELPED）。

`ai.override.*` 系列：
- `ai.override.complied` = 工具警告后 AI 让步（HELPED）。
- `ai.override.ignored` = AI 越过警告（RISK）。
- `ai.override.blocked_circumvented` = AI 绕过 block（高 RISK）。

`ai.output.bad_pattern` / `ai.user_input.flagged` 都是模式标记，归 RISK。

`scenario.run` 是一次 dogfood / verify 跑场景，归 HELPED（工具被有用地用了一次）。

## 当前格式 vs 新格式

```
old: TeamAgent · rules:57 · helped:77/393 · risk:23 · 护航中
new: TeamAgent · 规则:57 · 帮过:77今/393周 · 拦过:23今 · 护航中
```

字符数对比（无 emoji 路径）：
- 老：`TeamAgent · rules:57 · helped:77/393 · risk:23 · 护航中` — 53 chars
- 新：`TeamAgent · 规则:57 · 帮过:77今/393周 · 拦过:23今 · 护航中` — 中文每字 2 列宽，统计长度看显示器；CC statusLine 单行无硬截断（issue #104 验证过）。

## SQLite ExperimentalWarning 噪音来源

Node.js 22.5+ 的 `node:sqlite` 内置模块还在 experimental 阶段，import 时 emit 一个 ExperimentalWarning 到 stderr：

```
(node:46569) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

CC 在渲染 statusLine 时把 stdout + stderr 都拼到同一行 → 用户看到一坨混乱字符。

修复方案：在 statusline 进程启动最早期 `process.removeAllListeners('warning')`，让 warning 不再被默认 `console.warn` 打到 stderr。其它 warning（`DeprecationWarning` 等）也会被一并抑制——这对 statusline 这种 sub-shell 短命脚本是合理的，因为它本身就是只读 SQLite 聚合，没有"开发者要看到的"warning 来源。

`audit/runners/feature-19-statusline.ts:189-200` 的 `stderrIsAllowed` 已经把 ExperimentalWarning 列为 allowed——说明这个噪音长期存在但 audit 容忍了。修复后这条 allowance 仍然保留（不强求 stderr 完全空，只是 statusline 自己不再生成它）。

## 0/0/0 时的待命引导

issue 方案 B 完整版要求"前 7 天 / 前 100 hooks"切换文案，需要持久化 install timestamp。本 PR 取 B-lite：当 `getLatestContributionHint` 找不到任何近期事件时（`eventsDb` 为空或最新 row 不存在），原本输出 `护航中`，现在改输出：

```
待命中（让我学几条规则吧）
```

命中过一条事件后，因为 `getLatestContributionHint` 能查到最新 row，会回到 `CONTRIBUTION_HINTS` 里的具体文案（`刚静默命中规则` 等）。

这避免了"用了 1 天工具，状态栏永远显示 0/0 + 护航中"的死气沉沉。

## 引用：issue #104 statusline 既往学到的

- `dist/teamagent-statusline.cjs` 不能被 tsup bundle —— `require("node:sqlite")` 会被改写成 `require("sqlite")` 然后 MODULE_NOT_FOUND（见 `packages/teamagent/tsup.config.ts:105-110`）。所以本 PR 改 `scripts/teamagent-statusline.cjs`，build 时 `onSuccess` 会拷过去。
- CC `statusLine.command` 单行渲染，无硬截断（issue #104 实测）。中文标签长度安全。
- 历史上 `installHook` 写入 `_teamagentTag: "teamagent-statusline"` 标签，本次不需要碰 install path（不改命令字符串本身）。

## 引用：当前 audit runner 已经过时

`audit/runners/feature-19-statusline.ts:301` expects `exact:TeamAgent正在运行 · 规则库：5条`，但当前生产代码输出 `TeamAgent · rules:N · helped:T/W · risk:T · hint`。这意味着 audit 跑出的 stdout 早就和 expected 不匹配；CI 不跑 audit（`grep -l "audit/runners" .github/workflows/*.yml` 无结果），所以这个 drift 一直没暴露。本 PR 顺手把 audit 同步到新格式 + 给 events.db 加 seed，让 audit 真实可执行。

## 不变量

- `hasProjectDb` / `isProjectDir` 早返路径不变（"未初始化提醒" / "未安装提示"）。
- `formatMetric` 行为不变（`null → "-"`, `number → str`）。
- `CONTRIBUTION_HINTS` map 不变。
- `process.cwd()` 解析项目 DB 的逻辑不变。
- 全程同步执行，不引入 async / fs.promises。
