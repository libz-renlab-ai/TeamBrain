```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   toohot debugging — too many `claude.exe --bg-spare` workers      │
   │                                                                    │
   │   symptom : loadavg 27-61 on 8-core M1, mouse / keystroke lag      │
   │   root    : 20 user-spawned `claude agents` worker pairs leaked    │
   │   fix     : SIGTERM the bg-spare/bg-pty-host pairs (preserve own)  │
   │   ref     : ADR-0013 (same scheduler-overload mechanism, different │
   │              trigger — vitest workers there, agent workers here)   │
   └────────────────────────────────────────────────────────────────────┘
```

# toohot — too many `--bg-spare` workers

诊断 macOS 本机出现「鼠标 / 按键 / Terminal 渲染都卡」的一个**新触发器**：用户开了大量 Claude Code background agent（`claude agents` 子命令）后 worker 不回收，把 8 核 M1 的 scheduler 队列撑爆。

跟 ADR-0013 是**同一种 scheduler-overload 病**（kernel thermal flag normal，但 loadavg 远超 core 数），但触发器不一样：

| ADR-0013 | 本文档 |
|---|---|
| N×`pnpm test` × vitest worker × libuv pool | N×`claude agents` × `--bg-spare` × `--bg-pty-host` |
| 一次性 fork burst | 长寿命常驻 worker (4h+ etime) |
| 修法：搬到 CI | 修法：定期回收 worker pool |

## 现场画像

```
┌──────────────────────────────────────────────────────────────┐
│ Apple M1, 8 cores                                            │
│   loadavg  27.33 / 46.24 / 46.47   ←  3-7× oversubscription │
│                                                              │
│   31134  claude.exe daemon run  ← Claude Code 后台 agent 总管 │
│     ├── 20 对 (bg-pty-host + bg-spare)  ← 20 个并行 session  │
│     │      每对 ≈ 1 个 'claude agents' background 任务       │
│     └── 1 个空闲预热 spare (claim.sock 存在)                  │
└──────────────────────────────────────────────────────────────┘
```

`~/.claude/jobs/<short>/state.json` 里 19 个登记 job：

| state | 数 | worker 是否回收 |
|---|---|---|
| working | 10 | 占 CPU 中（合理） |
| blocked | 3 | 等输入（轻量） |
| done | 6 | **未回收（泄漏）** |

## 为什么会卡

- 20 个 `--bg-spare` × 平均 ~10% CPU = **~200% CPU**（≈ 2 个核被吃满）
- 20 个 `--bg-pty-host` 监工 × ~1.5% CPU = **~30% CPU**
- + daemon (12%) + Chrome / Slack / WindowServer
- 总和：~46 个 runnable 线程 ÷ 8 核 = **每个线程排队 5-7× 才轮一次时间片**
- 用户体感：鼠标 / 按键 / Terminal 渲染都被推后

kernel thermal pressure flag = `normal`（用 `pmset -g therm` 或 `powermetrics` 验证），证明**不是热墙**。

## 安全 kill recipe

⚠️ 任何 kill 步骤都可能丢掉正在跑的 background agent 进度——`~/.claude/jobs/<id>/timeline.jsonl` 是唯一的事后 transcript，不会自动续跑。**先确认你不在意那些 working session 的产出**再动手。

### Step 1 — 识别自己的 PID 锁链（绝不能动）

```bash
# 从当前 shell 往上爬到 Terminal.app，全部 PID 都保护
P=$$; while [ "$P" != 1 ] && [ -n "$P" ]; do
  ps -o pid,ppid,command -p "$P"
  P=$(ps -o ppid= -p "$P" | tr -d ' ')
done
```

记下 `--bg-spare`、`--bg-pty-host`、`daemon run` 这三个 PID。

### Step 2 — 列出所有 worker，排除自己的锁链

```bash
ps -axo pid,command \
  | awk '/--bg-spare \/tmp\/cc-daemon|--bg-pty-host \/tmp\/cc-daemon/ {print $1}' \
  | grep -vE '^(MY_BGSPARE|MY_PTYHOST|MY_DAEMON)$'
```

### Step 3 — SIGTERM → SIGKILL 两段式

```bash
KILL_PIDS=$(ps -axo pid,command | awk '/--bg-spare \/tmp\/cc-daemon|--bg-pty-host \/tmp\/cc-daemon/ {print $1}' | grep -vE '^(MY_BGSPARE|MY_PTYHOST|MY_DAEMON)$')

echo "$KILL_PIDS" | xargs kill -TERM
sleep 2

# straggler 收尾
echo "$KILL_PIDS" | xargs -r ps -o pid= -p | xargs -r kill -KILL
```

daemon 会自动重新预热 3-5 个空闲 spare（这是它的健康行为，不会再炸回 20 个）。loadavg 是 1/5/15 分钟指数滑动平均，**~1 分钟后才看到回落**。

### Step 4 — 核武选项（从另一个 Terminal）

```bash
# 把整个 daemon + 它管理的全部 worker 一锅端
kill 31134                                  # daemon PID, graceful shutdown
# 或：
pkill -TERM -f 'claude.exe.*--bg-' ; sleep 2 ; pkill -KILL -f 'claude.exe.*--bg-'
```

这条**会同时杀死当前 Claude Code session**，所以必须在另一个 Terminal 跑，不能在你正在用的 session 里跑。

## 验证

```bash
# 应该从 40+ 降到 < 10（daemon + 我自己 + 几个 prewarm）
ps -axo command | grep -c 'claude\.exe'

# loadavg 1 分钟后应当 < core 数
uptime
```

## 关联

- [ADR-0013](../adr/0013-inner-loop-on-ci.md) — 同一种 scheduler-overload，触发器是 `pnpm test`
- 用户级 CLAUDE.md `show temperature` recipe — Bash-only 温度 + Top7 监视器
- `~/.claude/jobs/<id>/state.json` schema：`state` ∈ {`working`,`blocked`,`done`}；`daemonShort` 是 sessionId 前 8 字符（**不是** spare socket 的 short id，两套独立 ID）

## 历史案例

| 日期 | loadavg 峰值 | worker 数 | 触发器 |
|---|---|---|---|
| 2026-05-10 | 274 / 273 / 258 | N×`pnpm test` × 4 sessions | ADR-0013 |
| 2026-05-12 | 61 / 51 / 48 | 20 `claude agents` workers | 本文档 |
