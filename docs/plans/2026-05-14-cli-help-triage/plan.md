# plan — CLI surface triage（67 命令 → 8 门面 / 13 折叠 / 46 后台）

```
   teamagent --help          teamagent help --all
        │                          │
        ▼                          ▼
   8 门面命令               67 命令全展开
   + 13 折叠指针            （full help 原样）
   + help --all 提示
```

## 1. task description（做什么 / 怎么做 / 不做什么）

**做什么**：把 `teamagent --help` 从 67 命令扁平清单，改为默认只列 8 个门面命令（按 3 大业务特性分组），
13 个 install/config/lifecycle 命令折叠成一行指针，46 个引擎室命令仅在 `teamagent help --all` 下展开。

**怎么做**：
- 新增 `packages/cli/src/help-text.ts`：导出 `STOREFRONT_COMMANDS`(8) / `FOLDED_COMMANDS`(13) /
  `BACKGROUND_COMMANDS`(46) / `ALL_TRIAGED_COMMANDS`(67) + `buildStorefrontHelp()` 纯函数。
- `bin.ts` `case "--help"`：把现有数组改名 `fullHelpLines`（内容不动），加 `showAll = rest.includes("--all")||rest.includes("all")`，
  `showAll ? fullHelpLines.join() : buildStorefrontHelp()`。
- 更新 `CLAUDE.md` 两处「`--help` 列全部」表述。

**不做什么**：不删命令、不动任何命令 `case` 的实现、不动 full-help 数组内容、不改任何命令行为。纯呈现层 triage。

## 2. expected outputs（可验收交付物）

- `packages/cli/src/help-text.ts` — 三层清单 + storefront 渲染器。
- `packages/cli/src/bin.ts` — `--help` 分支分流 + import；`fullHelpLines` 数组内容逐字保留。
- `packages/cli/src/__tests__/bin-help-triage.test.ts` — 6 个测试，含 drift guard。
- `CLAUDE.md` — 「跑命令」段 + 「已知限制」段两处表述更新。
- `docs/plans/2026-05-14-cli-help-triage/{research,plan,report}.md`。
- 行为验收：`teamagent --help` 输出含 8 个 `teamagent <storefront>` 行 + `teamagent help --all` 提示，
  不含任何 background 命令行；`teamagent help --all` 输出 = 改动前的 full help（145 行，含 `m5-infect`）。
- 普通 PR（英文 title/body），`/review` PASS，squash-merge。

## 3. how-to-eval-from-3rd-party-harness（第三方 judge harness）

judge playbook：`docs/plans/2026-05-14-cli-help-triage/judge.md`（本 PR 同目录）。
MAIN agent 派 subagent / `claudefast -p` 跑下列固定探针，dump JSON，另一只 LLM 只读 raw JSON 判 PASS/FAIL：

| probe | 固定命令 | PASS 阈值 |
|---|---|---|
| P1 单测 | `npx vitest run packages/cli/src/__tests__/bin-help-triage.test.ts --reporter=json` | `numPassedTests==6 && numFailedTests==0` |
| P2 typecheck | `npx tsc --noEmit -p packages/cli/tsconfig.json; echo $?` | `exit==0` |
| P3 storefront | `npx tsx packages/cli/src/bin.ts --help` | 含全部 8 门面命令名 + `teamagent help --all`；`grep -c m5-infect`==0 |
| P4 --all 完整 | `npx tsx packages/cli/src/bin.ts help --all \| wc -l` & `grep -c m5-infect` | 行数>=140（基线 144）&& m5-infect==1 |
| P5 drift | drift-guard 测试用例单独跑 | 8+13+46 union == bin.ts 67 个命令 `case` 标签 |

raw JSON 落 `.judge/<run_id>/judge.json` + 各 probe stdout。LLM judge 只读 raw JSON，不凭感觉。
