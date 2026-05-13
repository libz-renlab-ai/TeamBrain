```
                                 ┌─────────────────────────┐
                                 │  ~/.claude/projects/    │
                                 │  <encoded-cwd>/         │
                                 │   <session>.jsonl       │
                                 │   (mtime today)         │
                                 └────────────┬────────────┘
                                              │ scan
                                              ▼
  UserPromptSubmit ──► prompt-matcher ──► daily-summary ──► additionalContext
  ("总结一下今天的日报")     (whitelist/LLM)    (per-project enum)    (→ Claude window)
                                              │
                                              └─► archive: ~/.teamagent/daily/<YYYY-MM-DD>.md
```

# research.md — issue #371 日报总结功能

## 1. Grill 锁定的产品形态

源头：[issue 371 grill comment](https://github.com/libz-renlab-ai/TeamBrain/issues/371) 与
[ADR-0014 §371](../../adr/0014/371.md)。两个文档共同锁定了：

- **数据源**：仅本机 `~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl`，零网络
- **触发载体**：UserPromptSubmit hook + 三层 matcher（严格白名单 / `日报` 关键词 + LLM 兜底意图 / 放行）
- **聚合层级**：member × project 一句话（per §31 verdict row），层 B 团队聚合留二期
- **生成方**：TeamAgent 改写 prompt，让员工自己的 Claude Code 窗口生成总结；TeamAgent 主流程 0 LLM 调用
- **归档**：`~/.teamagent/daily/<YYYY-MM-DD>.md`（覆盖式）

## 2. 既有 hook 与 session 解析基础设施

### 2.1 UserPromptSubmit hook 入口（已就位）

- 源文件：`packages/cli/src/bin-user-prompt-submit.ts:96-316`
- 注入通道：`hookSpecificOutput.additionalContext`（已被 M4-A / rule retriever / recording memory 各自往里塞 block）
- 现有 `blocks` 数组拼接模型可直接复用：`blocks.push(dailyInjectionText)`
- killer switch：`TEAMAGENT_DISABLED=1` 已在 `bin-user-prompt-submit.ts:113` 整体短路；daily 子模块继承

### 2.2 Session JSONL 解析（已就位）

- `parseSessionFile(raw)` — 纯函数，位置 `packages/core/src/session-parser/index.ts:77`，re-export 自 `@teamagent/core`
- `ClaudeSessionSource` — `packages/adapters/src/session-source/claude-session-source.ts`：
  - 构造接收 `projectsRoot`，默认 `~/.claude/projects`
  - `listRecent(n)` 按 mtime 倒排
  - 关键复用点：内层 `readdir` 项目目录 + `.jsonl` 文件 mtime 已成熟

但 daily-summary 需求与 `listRecent` 不同：
- 按 **日期窗口** 过滤（本地时区 0:00 ~ now），不是 top-N
- 按 **项目** 分组（同 cwd 的多 session 合并）
- 跨 **worktree** 合并（`.codex/worktrees/<task>` / `.claude/worktrees/<task>` 都聚到 host repo）

所以 daily-summary 不直接复用 `listRecent`，而是写一个新 scanner 走类似的 readdir 流程。

### 2.3 `~/.teamagent/` 根目录约定

- `packages/cli/src/session-start-logic.ts:147`：`return process.env["TEAMAGENT_HOME"] ?? join(os.homedir(), ".teamagent")`
- daily archive 落 `${TEAMAGENT_HOME}/daily/<YYYY-MM-DD>.md`，路径常量内联即可（不需要新增 `paths.ts` 入口）

## 3. CWD-encoded 项目目录解码

Claude Code 把当前 cwd 编码成 `<.claude/projects/>` 子目录名：把绝对路径里所有 `/` 替换成 `-`，结果整体以 `-` 起头。例：

```
/Users/m1/projects/TeamBrain      ↔ -Users-m1-projects-TeamBrain
/Users/m1/projects/TeamBrain/.claude/worktrees/issue-371
                                  ↔ -Users-m1-projects-TeamBrain--claude-worktrees-issue-371
```

注意：路径里本就含 `-`（如 `issue-371`）会与分隔符 `-` 冲突，所以从目录名 → 绝对路径是**模糊的**。实测 Claude Code 的处理是：双 `-` 表示原路径里的 `/` 边界，单 `-` 是原路径里的 `-`，所以本仓库 worktree 目录长这样：`-Users-m1-projects-TeamBrain--claude-worktrees-issue-371`（`TeamBrain/.claude` 之间是 `--`）。decoder 跟着这个规则跑。

实际实现选择：直接把目录名按 `-` split，得到 path segments，然后 join 回 `/...`；遇到 `--` 视为一个 `/` + 一个空段。基础场景能 round-trip，少数 corner case（路径里本就有 `--`）不命中也只是显示得不漂亮，不影响功能。

## 4. Worktree 合并启发

cwd 含 `/.codex/worktrees/<task>` 或 `/.claude/worktrees/<task>` 段时，剥到该段之前的部分作为 canonical project root；项目名取 `basename(canonical)`。例：

```
/Users/m1/projects/TeamBrain                                  → project = "TeamBrain"
/Users/m1/projects/TeamBrain/.codex/worktrees/issue-371       → project = "TeamBrain" (merge)
/Users/m1/projects/TeamBrain/.claude/worktrees/issue-371      → project = "TeamBrain" (merge)
/Users/m1/projects/OtherRepo                                  → project = "OtherRepo"
```

Out of scope：跨 git 仓库的同名合并（碰到 `TeamBrain` 与 `forks/TeamBrain` 同时出现，按 canonical-root 区分即可，不再做更智能的 dedupe）。

## 5. 三层 prompt matcher

层 1：**严格白名单**（O(K) substring 命中即 fire，K ≤ 10）
- `总结一下今天的日报` / `总结今天的日报` / `今日日报` / `生成日报` / `daily summary today` / `today's daily summary`
- `/daily` slash 命令（前缀匹配，可带 `/daily --archive` 等参数）

层 2：**LLM 兜底**（仅在 prompt 含 `日报`/`daily` 但未命中白名单时调用）
- 默认 disabled（grill §4：找不到 claudefast / `ANTHROPIC_API_KEY` 时降级为只走白名单 + slash）
- 实现为可注入 `intentChecker: (prompt: string) => Promise<boolean>` seam，单测可 stub
- 真实 LLM 调用本 PR 不接（grill §4 接受 stub），留 `intent-checker.ts` 作为后续接 claudefast 的扩展点

层 3：放行，走原 hook 路径（rule retriever + recording memory）。

## 6. 既有 verify 体系映射

`docs/feature-verification.md` 两条路径：
1. `claudefast -p 'daily --help' --output-format ...` → JSON 对照 `snapshots/daily-help.canonical.json`
2. tmux 交互 `claudefast` → 触发 "总结一下今天的日报" → `/export` 拷贝

本 PR 实现 `pnpm teamagent daily --help` 输出 canonical JSON，并把 snapshot 落到
`packages/cli/src/__tests__/__snapshots__/daily-help.canonical.json`（或 `snapshots/`，按既有惯例就近放）。

## 7. ADR-0010 fixture replay 是否触发？

不触发。daily-summary 不消费 attribution events，不进 dual-layer store，不参与 calibration。
ADR-0010 适用于 rule-based learning 路径，daily-summary 是只读 jsonl + 模板渲染。

## 8. 已知风险

- **R1 cwd 解码 ambiguity**：`-` 既是路径分隔符也是合法字符。解决：单元测试覆盖 round-trip 常见场景，doc 注明 corner case 不严格保真但不崩。
- **R2 jsonl 解析慢**：`parseSessionFile` 在 50KB+ jsonl 上 < 30ms，今天的 ≤20 个 session 足够 5s timeout（继承 `HOOK_TIMEOUT_MS`）。
- **R3 archive 覆盖竞争**：员工同一秒多终端同时触发；用 `writeFileSync` 原子写（mkdtemp + rename）以避免半写文件。
- **R4 中文 prompt 漏匹**：grill §4 允许在 `~/.teamagent/config.json:daily.triggers` 增删；本 PR ship 默认白名单 + env override `TEAMAGENT_DAILY_TRIGGERS=...,...`，config.json 留二期。
- **R5 当前会话 jsonl 被并发写**：Claude Code 写 jsonl 是 append-only line-buffered，`parseSessionFile` 已 skip 坏行（`packages/core/src/session-parser/index.ts:80-86`），不会因为 last line 半截而崩。
