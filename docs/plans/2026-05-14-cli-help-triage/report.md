# report — CLI surface triage

```
   [DONE] 67 命令 ──▶ 8 门面 / 13 折叠 / 46 后台   （纯呈现层，零实现改动）
```

## 实际执行

| 文件 | 改动 |
|---|---|
| `packages/cli/src/help-text.ts` | **新增**。三层清单（8/13/46）+ `ALL_TRIAGED_COMMANDS`(67) + `buildStorefrontHelp()` 纯函数。 |
| `packages/cli/src/bin.ts` | `case "--help"`：现有数组改名 `fullHelpLines`（内容逐字未动）；加 `showAll` 分流到 `buildStorefrontHelp()`；加 import。其余 67 个 `case` 分发 0 改动。 |
| `packages/cli/src/__tests__/bin-help-triage.test.ts` | **新增**。6 测试：tier 尺寸 8/13/46、三层不相交、storefront 名单、默认 help 含 8 门面、默认 help 不泄漏后台命令、**drift guard**（三层 union == bin.ts 67 个 `case` 标签）。 |
| `CLAUDE.md` | 「跑命令」段 + 「已知限制」段两处「`--help` 列全部」→「`--help` 只列 8 门面，`help --all` 列全部」。 |
| `docs/plans/2026-05-14-cli-help-triage/` | research / plan / judge / report。 |

## judge harness 判决（`docs/plans/2026-05-14-cli-help-triage/judge.md`）

raw `judge.json`（`.judge/<run_id>/`，未入库）：

```json
{ "p1_tests": {"passed": 6, "failed": 0}, "p2_typecheck_exit": 0,
  "p3_storefront_has_all_8": true, "p3_has_all_hint": true,
  "p3_leaks_background": false, "p4_all_linecount": 144,
  "p4_all_has_m5_infect": true }
```

**verdict: PASS** —— 6/6 单测绿、typecheck exit 0、storefront 含全 8 门面且不泄漏后台命令、
`--all` 仍是完整 full help（144 行，含 `m5-infect`）。

## /review 第一轮（adversarial + testing + maintainability 三 reviewer 交叉）

全部 finding 已 AUTO-FIX（commit `fix(cli): address /review findings on the help triage`）：

| finding | 交叉确认 | 修复 |
|---|---|---|
| `bin.ts` 把裸 `all` 当 `--all`（position-blind、未文档化） | adversarial + maintainability | 抽 `isShowAll(rest)` 纯函数，只认 `--all` flag |
| drift-guard regex 命中注释里的 `case "team":` | 全部 3 位 | regex 锚到 `^\s*case`，注释/字符串内不再误匹配 |
| `STOREFRONT_COMMANDS` 与 `buildStorefrontHelp()` 文本双份硬编码 | adversarial + maintainability(conf 9) | 改 `STOREFRONT_ENTRIES`（结构化对象）作唯一源，名单与 help 文本都 derive |
| `showAll` 分支无 committed 测试 | adversarial + testing | 加 `isShowAll` 单测（钉死 `--all`-only）+ folded 命令渲染测试 |
| 注释 "verbatim 67-command" 误导 | maintainability(conf 7) | 改写：legacy help 本就不全（如 `presence` 无 help 行） |

测试 6 → 8 个，仍全绿；typecheck exit 0；`help all` 裸 token 退回 storefront、`help --all` 给完整 143 行。

## 偏差

- 用户口径「52 命令 → 8/13/31」；实测 `bin.ts` 有 **67** 个命令 `case`，故后台桶为 **46**（非 31），
  8 / 13 门面桶按采纳的 strawman 不变。drift-guard 测试用例已把 67 这个数字钉死。
- judge.md 初稿 `p4_all_linecount` 阈值写 145（`wc -l` 口径），实测 python 计数 144，已改为 `>= 140` 基线 144。

## 后续

- `/talk-html`：8 门面命令各录一段 tmux/asciinema，嵌进 self-contained HTML（独立交付物，见 task #4）。
- 用户原话「13 该折叠进 init 和 flag」：本 PR 在 `--help` 层把 13 个折成一行清单；把它们真正做成
  `teamagent init` 的子命令 / flag（而非仍是独立顶层 `case`）是更大改动，留作 follow-up issue。
- maintainability reviewer 提的 `fullHelpLines`（仍内联在 `bin.ts`）与 tier 名单两份枚举：理想做法是把
  full help 也 derive 自 tier 数据。本 PR 不做——legacy full help 本就不完整（部分命令无 help 行），
  现在加「每个 background 命令都出现在 fullHelpLines」的 drift 测试会因 legacy 缺漏直接 fail。
  正确顺序是先补全 legacy help 再 derive，留作 follow-up issue。
