# research — CLI surface triage

```
   67 commands ───┐
                  ├──[ knife: "proves a business feature?" ]──┐
                  │                                           │
            8 storefront   13 folded(init+flags)   46 background(help --all)
```

## 现状

- `packages/cli/src/bin.ts`（1772 行）`main()` 的 `switch (command)` 有 67 个真实子命令 `case`
  （另加 `--version/-V/version`、`--help/-h/help`、`case undefined` 非命令分支）。
- `case "--help"` 是一个 ~147 行的扁平字符串数组，**无分层**，把大部分命令平铺列出。
- `case "presence"` 等命令有 `case` 分发但从未出现在顶层 `--help` 文本里 —— 既有 help 本身就不完整。
- 顶层 `teamagent --help` 没有任何 vitest 快照测试锁定（grep `"teamagent — TeamAgent CLI"` 在 `__tests__/` 0 命中）。

## 3 大业务特性（`docs/BUSINESS-FEATURES.md`）

1. 新 Claude Code 实例不再重犯旧错（自动捕获 + 学习）。
2. 团队负责人秒级实时看到每个成员的 Claude Code 在干什么。
3. 工作录像 + 上传中心化存储，开箱即用。

## 切法

用「这个命令能不能证明一个业务特性」当刀：

- **8 门面**：`init`（前门）/ `analyze`+`doctor`（特性①）/ `dashboard`+`presence`+`daily`（特性②）/ `record`+`video`（特性③）。
- **13 折叠**：`install*`×5 / `uninstall*`×3 / `enable` / `disable` / `config` / `docs-propagate` / `warmup` —— 安装·卸载·开关·配置 plumbing，折进 `teamagent init --help`。
- **46 后台**：其余全部（`m5-*` / `migrate*` / `verify*` / `compile*` / `e2e-evaluate` / `fixture` / `symphony` / `pr-cycle` / `team*` / `pack` / `bpp` / `ingest` / `calibrate` / `digital-twin` / `skeleton-demo` / `demo` / `try` / `pitfall` / `stats` / `recording` / `scan-errors` / `review*` / `required-check` / `inspect-member` / `dogfood-report` / `bug-report` / `update` / `whatsnew` / `pair` / `reclassify` / `sync`）—— 引擎室，仅 `teamagent help --all` 可见。

## 与用户口径的差异

用户原话「52 命令 → 8/13/31」。实测 `bin.ts` 有 **67** 个 `case`，所以后台桶是 **46** 不是 31；
8 / 13 两个门面桶按用户采纳的 strawman 不变。差异已在 `report.md` 与 PR body 标注。

## 约束

- 「没动一行实现代码」：只重构 `--help` 呈现，所有 67 个 `case` 分发逻辑原样保留，命令全部仍可调用。
- full help（`--all`）数组在 `bin.ts` 内**原地不动**，零 mangle 风险；只新增可测试的 `help-text.ts` 纯模块。
