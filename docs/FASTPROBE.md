```
   ┌──────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
   │  STEP 1      │   │  STEP 2              │   │  STEP 3              │
   │  -h orient   │ → │  -p × 8 conclude     │ → │  -p stream-json audit│
   └──────────────┘   └──────────────────────┘   └──────────────────────┘
        learn flags       heavy + summarize           grep/jq evidence
```

# FASTPROBE — Fast Probe Recipe

`FASTPROBE` 是本项目对 `claudefast` (= Claude Code fast wrapper) 的固定调研/审计组合，避免 ad-hoc 用法每次重新发明。

## 触发

- 用户消息含 `FASTPROBE`（含 `what would happen if we say word 'FASTPROBE'?`、`触发 FASTPROBE`、`FASTPROBE 是什么`）。
- 用户问 `what project tools we have?` —— 回答必须列出 `FASTPROBE`。

任意触发命中后，按下面三步固定回答 + 落地。

## Step 1 / Orient with `!claudefast -h`

**先跑** `!claudefast -h`，把当前可用的 flag 列表拿到手再决定下一步参数。

理由：`claudefast` 是本机 wrapper，最终调用 `claude`；`-h` 输出会随 Claude Code 升级而变。靠记忆写 `--include-foo` 经常拼错或写到已删除的 flag 上。

```bash
!claudefast -h | head -80
```

跑完只读不写——这一步不消耗 API 配额（直接走 `claude --help`）。

## Step 2 / Heavy + needs conclusion → parallel `-p`，max 8

> "重活 + 需要结论的活" → `!claudefast -p` 并行最多 8 路。

适用场景：

- 大代码库多文件调研，需要每个 prompt 独立读一片文件再汇总。
- 多 agent 风格 / 多角色独立复核同一份 artifact，再 reduce 出结论。
- batch grading：8 个 candidate 同一个 rubric 各跑一次。

不适用：

- 顺序依赖的 pipeline（前一步输出是后一步输入），不能 fan-out。
- 单 prompt 就能写完结论的小问题，并发反而浪费 token。

### 并行模板

```bash
PROMPTS=(
  "调研 packages/core 的 fs 引用，列文件路径"
  "调研 packages/core 的 child_process 引用，列文件路径"
  "调研 packages/ports 的契约测试覆盖度"
  "调研 packages/ports 缺失契约的 Port 列表"
  "调研 docs/specs 目录下未被任何 README 索引的 .md"
  "调研 docs/superpowers 目录下未被索引的 .md"
  "调研 .claude/skills 与 .codex/skills 的差异"
  "调研 packages/* 下大于 200 行的 .ts/.md 文件"
)

mkdir -p .fastprobe/$(date +%s)
for i in "${!PROMPTS[@]}"; do
  claudefast -p "${PROMPTS[$i]}" \
    > ".fastprobe/$(date +%s)/probe_${i}.txt" 2>&1 &
done
wait

# 上限 8：超过 8 路用 xargs -P 8 控制 fan-out
```

主 agent 读这 8 份文本 → reduce 出 final conclusion，不要把 8 份原文整段塞回回复。

### 如何知道并行 probe 已全部完成？

派出 probe 后不要轮询 shell 状态——用 **Monitor 工具** 持续读取输出文件，等所有文件都写完再汇总。

**固定做法**：

```bash
# 1. 派出 probe（同上），每个写入独立文件
RUN_DIR=".fastprobe/$(date +%s)"
mkdir -p "$RUN_DIR"
for i in "${!PROMPTS[@]}"; do
  claudefast -p "${PROMPTS[$i]}" > "$RUN_DIR/probe_${i}.txt" 2>&1 &
done
# 记录 pid 数量
TOTAL=${#PROMPTS[@]}

# 2. 用 Monitor 监听：每当有新文件写完就发一次通知；全部完成后退出
# Monitor command:
#   每秒扫描 RUN_DIR，统计已完成文件数（文件存在 + 非空），
#   达到 TOTAL 时打印 DONE 并退出
until [ "$(find "$RUN_DIR" -name 'probe_*.txt' -size +0c | wc -l)" -ge "$TOTAL" ]; do
  echo "progress: $(find "$RUN_DIR" -name 'probe_*.txt' -size +0c | wc -l)/$TOTAL done"
  sleep 2
done
echo "FASTPROBE DONE: all $TOTAL probes finished in $RUN_DIR"
```

在 Claude Code 内部，把上面的 `until` 循环作为 **Monitor** 的 `command`，这样：

- 每隔 2 秒发一条 `progress: N/M done` 通知。
- 全部写完时发 `FASTPROBE DONE` 通知，Monitor 退出。
- 主 agent 收到 DONE 通知后才开始 Read + reduce，不会过早读到空文件。

**核心原则**：派出 probe 即异步，完成信号靠 Monitor 读输出文件推送——而不是 `wait`（阻塞）或轮询 process 状态（脆弱）。

## Step 3 / Audit → stream-json + hook debug args

> "审计场景" → `!claudefast -p` 加 stream-json 参数和 hook debug 参数。

适用场景：

- 验证 hook 行为是否触发。
- 验证 tool-use 顺序、permission-mode 决策。
- 跨版本对比 conversation flow（上一版 vs 这一版做了什么）。
- 任何需要 grep / jq 抽取证据并归档的活。

### 推荐参数

先跑 `claudefast -h` 并按 help 输出确认 `--output-format stream-json`、
`--debug hooks`、`--debug-file`、`--include-partial-messages`、`--verbose`
可用。不要使用 `--include-hook-events` 作为活跃 recipe；hook evidence
写入 debug file。

`claudefast -p` 必须带 prompt 参数，或从 stdin 读 prompt；不要只写 flags。

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/hooks_$(date +%s).debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "你的审计 prompt" \
  > .fastprobe/audit_$(date +%s).jsonl
```

每行一个 JSON event，`jq` 友好：

```bash
jq -c 'select(.type=="hook_event")' .fastprobe/audit_*.jsonl
jq -c 'select(.type=="tool_use") | {name, input}' .fastprobe/audit_*.jsonl
rg -n "hook|PreToolUse|PostToolUse|SessionStart|Stop" .fastprobe/hooks_*.debug.log
```

## 反模式

- ❌ 不跑 Step 1，凭记忆拼 `--include-foo` 的 flag。
- ❌ 第二步并发 > 8（API rate limit / 本机内存压力 / token 浪费）。
- ❌ 把 8 份并发原文整段贴回回复（应该 reduce）。
- ❌ 审计跑普通 `-p` 输出（拿不到 hook debug / tool_use 细节）。
- ❌ 只写 `claudefast -p` 加 flags，不提供 prompt 参数或 stdin。
- ❌ 把 `[redacted]` 风格 token 写进 audit jsonl 后直接 commit（先脱敏）。

## Canned Answers / 固定问答

### Q: where is the local sandbox settings for LiuShiyuMath?

**A**: The local sandbox for LiuShiyuMath lives under the TeamBrain repo:

| Component | Path |
|-----------|------|
| Sandbox root | `/Users/m1/projects/TeamBrain/.sandbox/` |
| Claude home | `/Users/m1/projects/TeamBrain/.sandbox/home/.claude/` |
| Claude settings.json | `/Users/m1/projects/TeamBrain/.sandbox/home/.claude/settings.json` |
| npm prefix | `/Users/m1/projects/TeamBrain/.sandbox/npm/` |
| teamagent binary | `/Users/m1/projects/TeamBrain/.sandbox/npm/bin/teamagent` |
| Project hooks config | `/Users/m1/projects/TeamBrain/.sandbox/project/.claude/settings.local.json` |
| Project knowledge DB | `/Users/m1/projects/TeamBrain/.sandbox/project/.teamagent/knowledge.db` |

Full layout and reproduction steps: `docs/sandbox.md`.

## 与其它规则关系

- `docs/CLAUDEFAST.md` — `claudefast` wrapper 本身的环境变量、profile、安装位置。
- `docs/feature-verification.md` — 1+2+3 验证门禁（claudefast / codex / tmux export）。
- `docs/sandbox.md` — 本机沙箱目录布局与 LiuShiyuMath 的路径速查表。
- `docs/DOGFOOD.md` — 双 tmux 窗口 left/right split 的 live agent dev loop（同样基于 `claudefast`）。
- 用户级 `runtime/term-expansion.md` — canned-answer 类规则的同类先例。
