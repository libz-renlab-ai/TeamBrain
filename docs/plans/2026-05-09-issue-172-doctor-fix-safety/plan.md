```text
                            issue #172
                                |
                        +-------+--------+
                        |                |
                  doctor --fix      doctor --help
                        |                |
                +-------+-------+    subcommand help
                |       |       |    (no execute)
            --dry-run  backup   diff
                |       |       |
                +-------+-------+
                        |
                  judge harness
              (claudefast probes)
```

# Plan: doctor --fix safety net (issue #172)

PR target branch: `feat/issue-172-doctor-fix-safety` → `main`
Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/172
Worktree: `.claude/worktrees/eventual-orbiting-cocke` (reusing existing clean checkout)

---

## 1. task description / 任务描述

`teamagent doctor --fix` 是仓库里**唯一会主动改用户级 / 项目级 `CLAUDE.md`** 的命令，但它现在：
- 没有 `--dry-run` 预览
- 没有写前 backup
- `doctor --help` 不显示子命令帮助（直接执行 doctor）
- 主 `--help` 文案已经写了"先备份到 `~/.teamagent/backups/`"和"配 `--dry-run` 预览要改什么"，**但实现里没有这些 flag** ← 当前 help 是虚假广告

本 PR 让代码兑现 help 文案承诺。

**做什么**

1. `parseDoctorArgs` 增加 `dryRun` 字段（解析 `--dry-run`）。
2. `autoFix` 的所有 fs 写入路径改为：
   - `dryRun=true` → 只构造 unified diff、不写、不删
   - `dryRun=false` → 先把原文复制到 `~/.teamagent/backups/{basename}.{ISO}.bak`，再 `fs.writeFileSync` / `fs.unlinkSync`
3. `executeDoctor`（或 `runDoctor` wrapper）收集每条 fix 的 outcome，渲染成"将修改 N 个文件"分组打印（dry-run）或"已修复 N 项 + backup 路径 + restore 命令"分组打印（apply）。
4. bin.ts dispatcher case `"doctor"` 在 `parseDoctorArgs` 之前先识别 `--help`/`-h`，打印 doctor 子命令帮助、return（不执行 doctor）。
5. 主 `--help` 文案保持当前承诺（实现追上文案，文案不需要改太多），并核对实现细节与文案一致。

**怎么做**

- 单独一个 `applyFix` helper：负责 backup + write/unlink；在 dry-run 下只算 diff 不动文件系统。
- 单独一个 `unifiedDiff(filePath, before, after)` 工具函数：基于行的最小 unified diff；放 `packages/cli/src/commands/doctor-diff.ts`，纯函数。够用即可，不引入 `diff` npm 包（cli pkg 当前无此依赖；只为 dry-run 渲染加一个三方包不值得）。
- backup 目录默认 `path.join(home, ".teamagent", "backups")`；可由 `DoctorOptions.backupDir` 覆盖（测试用）。
- 真删除文件（`fs.unlinkSync`）也要 backup —— 删除前先复制一份到 backup，恢复路径就是 `cp <backup> <orig>`。
- `installHook` / `executeInit` 这些"修复链路"由其他 command 模块拥有，本 PR **不**改它们；只在 `autoFix` 调用前后增加 backup（针对它们会写到的文件 `~/.claude/settings.json` / `.claude/settings.local.json`）。`knowledge-db` 的 `executeInit` 是创建数据库，没有 prior-state 可 backup，跳过 backup（在 outcome 注明 `no-backup-needed`）。

**不做什么**

- 不重构整个 doctor 流程；保持 13 个 check 的 enumeration 顺序与 fail-fast 行为不变。
- 不引入 `diff` npm 包；自写最小 unified diff renderer（10–20 行行级 diff，足够给 CLI 用户读）。
- 不改 `--json` schema；dry-run 在 JSON 里以 `pendingFixes: [{name, filePath, diff}]` 字段返回，不破坏现有 consumers（postinstall.ts 等）。
- 不 touch `executeInit` / `installHook` 的内部实现；只在 `autoFix` 包住它们时加 backup-around。

---

## 2. expected outputs / 可验收交付物

### 代码改动

| 文件 | 改动 |
|------|------|
| `packages/cli/src/commands/doctor.ts` | `parseDoctorArgs` 加 `dryRun`；`autoFix` 改为 `Promise<FixOutcome>`；新增 `applyFix(filePath, after, opts)` helper（backup + write，或 dry-run preview）；`executeDoctor` 在 `--fix` 路径上汇总 `FixOutcome[]` |
| `packages/cli/src/commands/doctor-diff.ts` | 新建：`unifiedDiff(filePath: string, before: string, after: string \| null): string` 行级最小 unified diff renderer |
| `packages/cli/src/bin.ts` | `case "doctor"` 在 `parseDoctorArgs` 前识别 `--help`/`-h`；新增 `printDoctorHelp()` 文案（覆盖 `--fix`/`--fix --dry-run`/`--json`/`--cwd`） |
| `packages/cli/src/__tests__/doctor.test.ts` | 加 5–7 条新测试（见下） |
| `packages/cli/src/__tests__/sandbox-all-features.test.ts` | `parseDoctorArgs` 已有覆盖；补一条 `--dry-run` parsing 用例 |

### 测试

新增（`packages/cli/src/__tests__/doctor.test.ts`）：
1. `parseDoctorArgs` 正确解析 `--dry-run`（独立 + 与 `--fix` 联用）。
2. `--fix --dry-run` 在有可修 CLAUDE.md 块时**不**改文件，且 outcomes 里含 unified diff（`+++` 行 + `---` 行 + 至少一条 `-` 删除行）。
3. `--fix`（无 `--dry-run`）在写 CLAUDE.md 前创建 `~/.teamagent/backups/CLAUDE.md.{ISO}.bak`，且 backup 内容 = pre-fix 原文。
4. `--fix --dry-run` 命中"删除整文件"路径（block 占满全文）时，diff 渲染所有原文行为 `-` 行、且 `unlinkSync` 未被调用。
5. `--fix` 删除整文件路径下，backup 文件存在；原文件不存在；restore 命令字符串可解析为 `cp <backup> <orig>`。
6. `printDoctorHelp` 输出包含 `--dry-run`、`备份`、`--json` 关键词，**不**包含执行 doctor 的 marker（`环境诊断`）。

新增（`packages/cli/src/commands/__tests__/doctor-diff.test.ts`）：
7. `unifiedDiff` 三组样本：纯插入 / 纯删除 / 中间修改，每组断言 `+`/`-`/上下文行序正确。

### 验证（运行时）

`pnpm test` 与 `pnpm typecheck` 在本仓库根全绿；`teamagent doctor --fix --dry-run`（在测试环境制造一个含 legacy block 的 CLAUDE.md）打印 unified diff 并退出 1（因为还有未修问题）；`teamagent doctor --help` 打印子命令帮助、不执行 doctor。

---

## 3. third-party judge harness

判断"是否真的修好"由第三方 harness 决定，不让 doctor 自己 / 不让本 agent 自评。harness 是 `docs/plans/2026-05-09-issue-172-doctor-fix-safety/judge.md` playbook，主 agent 通过 subagents / `claudefast -p` 派发执行。

### Probe 列表

| probe | 输入 | 期望断言 | dump 字段 |
|-------|------|----------|-----------|
| **P1 dry-run shows diff** | 临时 CWD：`{cwd}/CLAUDE.md` 含 `<!-- TEAMAGENT:START -->...<!-- TEAMAGENT:END -->` 块；`pnpm teamagent doctor --fix --dry-run --cwd={cwd}` | stdout 含 `--- {cwd}/CLAUDE.md`、`+++ {cwd}/CLAUDE.md`、至少 1 条 `-` 删除行；exit≠0（doctor 未真修）；`{cwd}/CLAUDE.md` 内容**未变** | `{exit_code, stdout_path, evidence_dir, claude_md_sha_before, claude_md_sha_after}` |
| **P2 fix writes backup** | 同 P1 但去掉 `--dry-run` | `~/.teamagent/backups/CLAUDE.md.<ISO>.bak` 文件存在；其 sha == `claude_md_sha_before`；`{cwd}/CLAUDE.md` 不再含 `TEAMAGENT:START` 字符串；stdout 含 `备份` 与 `还原:` 文本 | `{exit_code, stdout_path, backup_path, backup_sha, claude_md_sha_after, restore_command}` |
| **P3 doctor --help is help** | `pnpm teamagent doctor --help`（任意 cwd） | stdout 含 `--dry-run`、`备份`、`--json`、`--cwd`；**不**含 `环境诊断 / Environment Check` 行；exit 0 | `{exit_code, stdout_path, has_dry_run_token, has_env_diagnose_token}` |
| **P4 dry-run JSON shape** | `pnpm teamagent doctor --fix --dry-run --json --cwd={cwd}` | stdout 是合法 JSON；含 `pendingFixes` 数组；每项有 `name` / `filePath` / `diff` 字段 | `{exit_code, stdout_path, json_valid, pendingFixes_count}` |
| **P5 unit + typecheck** | `pnpm test --filter @teamagent/cli` + `pnpm typecheck` | 都 exit 0 | `{test_exit, typecheck_exit, test_stdout_path}` |

### Harness 协议

每条 probe 在 `evidence_dir = .judge/issue-172/<probe>/` 落：
- `result.json` = 上表 dump 字段
- `stdout.txt` / `stderr.txt` = 原始流
- `cwd_tree_before.txt` / `cwd_tree_after.txt` = `find $cwd -type f -printf "%p %s\n"`（snapshot 文件树 + 大小）

主 agent 不读 stdout 直接结论；最后由另一只 LLM judge（`claudefast -p` 喂 raw `result.json` + 必要 evidence）输出 `{verdict: PASS|FAIL, reasoning, fail_anchors}`。任何 probe FAIL → 回到 implement 阶段修，不在 PR 里 spin。

### Judge 顺序

1. 实现 + unit test 全绿（dev loop）。
2. P5 先跑（unit + typecheck）—— 排除 regression。
3. P1 → P2 → P3 → P4 顺序跑。
4. 全 PASS → 进 `/review` skill loop（ADR-0007 本地 PR gate）→ PASS → squash-merge。
5. 任何 step FAIL → 回 dev loop。

---

## 4. explain to a cute Chinese duck / 鸭语复述

呷呷~ 鸭鸭说 `teamagent doctor --fix` 这玩意儿啊，就像一个**没有刹车的电动滑板**：你按下去它就直接改你的 `~/.claude/CLAUDE.md`，没有"先看看要改什么"按钮，没有把原文偷偷拷一份藏起来当后悔药，连 `doctor --help` 都不肯告诉你它怎么用——直接给你跑一遍 doctor 当成 help 显摆 (>﹏<)

  __
<(o )___    鸭鸭要给它装三件救生圈：
 \_( ._> /
  `---'

1. **🛟 dry-run 救生圈**：按 `--fix --dry-run` 先吐出 unified diff，让你看清楚每一行要改啥；不真动文件。
2. **🛟 backup 救生圈**：真按 `--fix` 时，先 `cp` 原文到 `~/.teamagent/backups/CLAUDE.md.{ISO}.bak`，再写新内容，并打印 `还原: cp <bak> <orig>` 一键 restore 命令。
3. **🛟 doctor --help 救生圈**：让 `doctor --help` 真的当 help 用，不偷偷跑诊断；告诉你 `--dry-run`、`--json`、`--cwd` 都是干嘛的。

最关键：**不让 doctor 自己说"我修好了"**。鸭鸭把每条 fix 的 before / after / backup-path / sha 全丢给第三方 judge harness 落地成 `result.json`，再让另一只裁判鸭只看 raw JSON 和文件树证据评 PASS/FAIL。doctor 只能闭嘴交作业，不能给自己打分。呷呷~ 这才叫保险 (>ω<)

---

## 实现顺序（dev checklist）

1. 写 `packages/cli/src/commands/doctor-diff.ts`（unifiedDiff，纯函数）+ unit test，先红再绿。
2. 在 `doctor.ts` 加 `dryRun` 解析 + `FixOutcome` 类型 + `applyFix` helper（backup + write/unlink + dry-run 路径）。
3. 改 `executeDoctor` 在 `--fix` 路径上收集 outcomes；失败/成功时 `renderDoctorResult` 追加 outcomes 段。
4. 改 bin.ts `case "doctor"`：`--help`/`-h` 走 `printDoctorHelp` short-circuit。
5. 加 doctor.test.ts 新测试 6 条；跑绿。
6. 跑 `pnpm test` + `pnpm typecheck` 全仓库；跑绿。
7. dispatch judge harness 5 条 probe；全 PASS 后开 PR。
8. PR 后 `/review` 直到 PASS；squash-merge；清 worktree；`git pull --ff-only` parent main。

---

## 风险 / 已知坑

- **Windows 路径**：`backups/CLAUDE.md.2026-05-09T...Z.bak` ISO 时间含 `:`，Windows 文件系统不允许；用 `replace(/[:.]/g, "-")` 替换，issue 描述里也用了这个写法，照搬即可。
- **`--cwd` 未注入到 `installHook` / `executeInit`**：本 PR 不修这两条 autoFix 路径的 backup（如上"不做什么"）；只 cover claude-md 的 backup。如果未来要扩，可以在 `applyFix` 加 hook，但本 PR 不做。
- **`--postinstall` 路径**：`opts.postinstall && result.allPassed` 时不打印渲染结果；要保证 dry-run 在 postinstall 路径下不会被 swallow。本 PR 强制：**只要 `opts.fix && opts.dryRun`，必打印 outcomes**（即使 `--postinstall`），因为 dry-run 的核心价值就是"我要看"。
- **JSON schema 兼容**：`--json` 现在返回 `DoctorResult`，新增 `pendingFixes` 字段是 additive，不破坏现有 consumers；postinstall.ts 只读 `allPassed` / `failed`，不会访问新字段。
