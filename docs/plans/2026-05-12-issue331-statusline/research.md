```text
        ┌──────────────────────────────────────────────────┐
        │  research.md · issue #331 statusline 扩展        │
        │                                                  │
        │   CC stdin JSON ──┐                              │
        │   transcript.jsonl ├──► statusline.cjs ──► stdout│
        │   .teamagent DB ──┘                              │
        └──────────────────────────────────────────────────┘
```

# Research — Issue #331: TeamAgent 状态栏暴露 Claude Code 运行时状态

> 配套：[`plan.md`](./plan.md)、[`judge.md`](./judge.md)。issue body 见 https://github.com/libz-renlab-ai/TeamBrain/issues/331 。

## 1. 用户诉求

issue body：

> 希望能通过 teamagent 看到尽可能全的 cc 状态信息：5h / 7d 限额、使用百分比、reset 时间、上下文用量、当前模型、会话健康度等等——而不是只看到 quota 一项。

落到字段层级（按用户原文拆 6 项）：

| # | 用户原话 | 真实可得来源 | 现状 |
|---|---|---|---|
| 1 | 模型 | CC statusline stdin `model.display_name` / `model.id` | **未暴露** |
| 2 | 上下文 | 最近一条 assistant `message.usage` 的 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` | **未暴露** |
| 3 | 用量 | CC stdin `cost.total_cost_usd`（session 累计美刀） | **未暴露** |
| 4 | 会话健康 | CC stdin `exceeds_200k_tokens` | **未暴露** |
| 5 | 5h 用量 / 限额 | 同一项目目录下 `~/.claude/projects/<encoded>/*.jsonl` 中 5h 滑窗内 assistant usage 之和 | **CC 没有原生限额 API**——只能由本地 transcript 累加，"limit" 不可信 |
| 6 | 7d 用量 / 限额 / reset | 同上，7d 滑窗 | 同上 |

结论：**模型 / 上下文 / 用量 / 会话健康** 4 项可干净拿到；**5h / 7d 用量**只能给 best-effort 本地累加，不报"limit / reset"。这是 V1 范围。

## 2. CC statusline 调用契约（实测）

CC 启动 `statusLine.command` 时通过 stdin 灌 JSON，shape（取自 `docs/plans/issue-117/probes/*.jsonl` + 实测）：

```json
{
  "hook_event_name": "Status",
  "session_id": "01907b07-fb0e-49aa-bf3e-252d9164c2ee",
  "transcript_path": "/Users/m1/.claude/projects/<encoded-cwd>/<session_id>.jsonl",
  "cwd": "/Users/m1/projects/TeamBrain/.claude/worktrees/dynamic-popping-newt",
  "model": { "id": "claude-opus-4-7[1m]", "display_name": "Opus 4.7 (1M context)" },
  "workspace": { "current_dir": "...", "project_dir": "..." },
  "version": "...",
  "output_style": { "name": "default" },
  "cost": { "total_cost_usd": 0.123, "total_duration_ms": 12345, "total_api_duration_ms": 11000,
            "total_lines_added": 100, "total_lines_removed": 50 },
  "exceeds_200k_tokens": false
}
```

- stdin 一次性写完 → close，cjs 读到 EOF 即可
- 当前 `scripts/teamagent-statusline.cjs` 不读 stdin（所有信息都从本地 sqlite 取），这是要改的口子
- 旧测试通过 `spawnSync("node", [STATUSLINE])` 不喂 stdin → 新代码必须容忍空 stdin，回落到旧行为

## 3. transcript JSONL 真实 usage shape

`/Users/m1/.claude/projects/-Users-m1-projects-TeamBrain/<session>.jsonl` 实测：

```jsonc
{
  "type": "assistant",
  "message": {
    "model": "MiniMax-M2.7-highspeed",
    "usage": {
      "input_tokens": 202,
      "cache_creation_input_tokens": 24484,
      "cache_read_input_tokens": 29954,
      "output_tokens": 208,
      "service_tier": "standard"
    }
  }
}
```

- 一次 turn 真正"喂给模型"的 context 总量 = `input_tokens + cache_creation + cache_read`（cache 也是 input 的一部分，只是计费 / 时延不同）。这个就是用户问的"上下文已用"。
- 一行就够拿到当下 ctx 用量；不需要遍历整个文件
- 文件结尾倒序读 → 找到最近一条 assistant `usage` 即可

5h / 7d 滑窗：同目录所有 `*.jsonl`，按 `mtime` 预过滤；对入选文件按行扫 `timestamp >= since` 的 assistant usage 求和。

## 4. project-level settings 约束

per `CLAUDE.md` + `docs/STATUSLINE.md` + `docs/INIT-PROPAGATION.md`：

- TeamBrain **只读写 `<repo>/.claude/settings.local.json::statusLine.command`**（gitignored、per-host），**永远不动 `~/.claude/settings.json`**
- 已有 chain-wrap（`bash -c '<user>; echo; <teamagent>'`）保持原样
- `pnpm teamagent init` / `install-hook` 已注册路径 `node <cliRoot>/dist/teamagent-statusline.cjs`——cjs 自包含，所有新字段从 stdin / 文件读，**不需要改 install-hook.ts**（只在 cjs 内部加逻辑）
- `scripts/teamagent-statusline.cjs` 是 single source；`packages/cli/tsup.hook.config.ts onSuccess` 把它原样 `copyFileSync` 到 `dist/`——保持纯 cjs，不能 bundle（CJS 重写会破 `require("node:sqlite")`）

## 5. 现有 4 metric 必须保持兼容

`packages/cli/src/__tests__/statusline-format.test.ts` 锁了大量断言：

- `expect(r.stdout).toContain("规则:2")`
- `expect(r.stdout).toMatch(/TeamAgent \| 规则:/)`
- `expect(r.stdout).toContain("帮过:0今/0周")`
- `expect(r.stdout).toContain("拦过:0今")`
- `expect(r.stdout).toContain("待命中（让我学几条规则吧）")`
- `expect(r.stdout).not.toMatch(/\| 护航中$/)`（idle hint 必须替换护航中而非追加）

**这些 case 都不喂 stdin**——新字段只在 stdin 有内容时追加，老 test 全绿。

## 6. 性能预算

CC 每次 input 都会重跑 statusline，user-perceived budget < 300 ms：

- 读 stdin：JSON 解析 ms 级
- 读 transcript 最近一行：`fs.readFileSync(transcript_path).split('\n').slice(-100)` 倒序找 → < 30 ms 即便 50 MB 文件（macOS NVMe）
- 5h / 7d 滑窗：限只扫 `mtime > now - 7d` 的文件，最多 10 个，每个读 200 KB tail → < 200 ms
- 总预算 < 250 ms

如果某项慢 / 拿不到 → 字段写 `n/a`，不挂整条状态栏。

## 7. 不做的事（明确 scope）

- ❌ 不动 user-level `~/.claude/settings.json`
- ❌ 不报"limit / reset"（CC 没暴露权威值；本地猜测会误导用户）
- ❌ 不删除 / 重命名现有 4 个 metric（规则 / 帮过 / 拦过 / hint）
- ❌ 不改 install-hook.ts 行为（统一 entry 路径不变）
- ❌ 不引入新依赖（继续 pure node、`node:sqlite` builtin）
- ❌ 不重写 statusline 为 TS / 不接管 bundle（CJS 必须保留以避免 `require("node:sqlite")` 被重写）

## 8. 关联资料

- 现状代码：`scripts/teamagent-statusline.cjs:1-353`
- install 注册：`packages/cli/src/commands/install-hook.ts:868`、`:917-972`
- 既有测试：`packages/cli/src/__tests__/statusline-format.test.ts:1-455`
- 设计文档：`docs/STATUSLINE.md`
- 历史 plan：`docs/plans/2026-05-07-issue104-statusline-{research,plan,report}.md`（chain wrap 决策）
- 同向 issue：#326（landing → init → statusline 大 epic 的实现支）、#168（PR #212：标签 + de-overlap + warning suppression）
