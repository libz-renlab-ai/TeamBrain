# Plan: TeamBrain Digital Twin Sidecar (issue #146)

**权威源**：[GitHub Issue #146 — Implementation Spec: TeamBrain Digital Twin Sidecar](https://github.com/libz-renlab-ai/TeamBrain/issues/146)
**已取代**：`docs/specs/2026-05-06-user-log-collection-design.md`（2026-05-08 标 SUPERSEDED）
**协调状态**：撤回 #146 早期"分工"评论，本工作 claim 全部 #146 内容（含日志 + 录音）

本文档把 #146 issue body 落到具体 PR 拆分、文件清单与验收清单。issue body 是唯一权威源，本文档若与之冲突，以 issue body 为准。

---

## 0. Context & Decisions

### 0.1 业务目标（自 #146）

旁挂式数据采集模块：拦截 Claude Code Stop hook，把 transcripts JSONL（gzip+base64）+ 本地工作录音（Opus/OGG）上传到中央接收端。

### 0.2 工程铁律（自 #146）

- **极致效率（Efficiency-ONLY）**：不做内容脱敏
- **不阻塞 Hook 链路**：tap-session 必须极速落盘，剩下交 daemon 异步做
- **零干扰**：daemon 空闲 15 分钟自尽
- **全队共享单一 Token**：每人 `teamagent digital-twin login <token>` 粘贴

### 0.3 留底状态

- ✅ 全员书面同意采集完整、不脱敏日志
- ✅ Premises 4–7 已书面留底（团队内部署 + 不出墙）
- 故：默认全部上报、**不做首次 opt-in 询问**；保留 `pause/resume` 开关供本机 dogfood

### 0.4 10 条开放问题的拍板结果

| # | 问题 | 决定 |
|---|---|---|
| 1 | .ts vs .js | **TypeScript**（项目惯例；spec 字面 .js 仅指文件 stem） |
| 2 | Stop hook 接线 | 新建 `packages/cli/src/bin-stop.ts`（编译 → `bin-stop.cjs`），与 `bin-pre-tool-use.cjs` 同款；`.claude/settings.json` 加一条 Stop hook channel；现有 bash hook (`self-report-fused.sh`) 不动 |
| 3 | 服务器 endpoint | 可配置 `uploader.endpoint`；默认 `http://localhost:8080`（mock）；生产端点不在 repo 内 |
| 4 | Bearer token 分发 | `teamagent digital-twin login <token>`；token 由项目所有者线下发 |
| 5 | ffmpeg 依赖 | 运行时检测；找不到时报错引导；不自动下载（follow-up） |
| 6 | ULID 生成 | npm `ulid` 包 |
| 7 | AttributionBus | CLI 系统消息一律走 AttributionBus，禁止 `console.log` |
| 8 | TDD | 严格 TDD：契约测试先于实现；新增 Port 必须有 `packages/ports/src/__tests__/*-contract.ts` |
| 9 | 包名 | `@teamagent/digital-twin`（与项目其它包统一，不用 spec 里的 `@teambrain/...`） |
| 10 | 路径 | 全部走 `os.homedir()`，禁止硬写 `~` |

### 0.5 部署上下文

- 生产服务器：内网 IP（具体地址不在仓库内描述）
- 用户群：团队内 Windows + Mac TeamAgent CLI 用户
- 自动更新：依赖 TeamAgent 现有 self-update 机制（`docs/SELF-UPDATE.md`）

### 0.6 已知部署风险（不阻塞 PR-1..5，部署阶段处理）

- 生产 endpoint 是内网 IP，**远程 / 在家的团队成员无法直连**；如需要，部署时加 VPN / 内网穿透 / 公网 IP 跳转
- ffmpeg 跨平台命令名差异（macOS/Linux `ffmpeg`、Win `ffmpeg.exe`）由 PR-4 处理
- Windows 下 `detached spawn` 行为与 POSIX 不同（无 `process.unref()` 的同等退出保护，需 `windowsHide` + 实测）

---

## 1. Plan

### 1.1 5 个 PR 的拆分

| PR | Step | 范围 | 估时 | 依赖 |
|----|------|------|-----|------|
| **PR-1** | Step 1 | 基础 package + config + identity + paths + mock-server | ~1 天 | 无 |
| **PR-2** | Step 2 | tap-session + 新建 Node-side Stop hook (bin-stop.cjs) + hook wire-up | ~1.5 天 | PR-1 |
| **PR-3** | Step 3 | daemon (uploader + queue + process-manager) + bin-uploader.cjs | ~2.5 天 | PR-1, PR-2 |
| **PR-4** | Step 4 | ffmpeg-wrapper（start / stop / import）+ recording schema | ~2 天 | PR-3 |
| **PR-5** | Step 5 | CLI 命令面（8 个命令）+ 端到端 demo | ~1 天 | PR-1..4 |

总计：~8 天工程 + POSTPR review loop。

### 1.2 PR-1：Step 1 — 基础设施

**新建 package** `packages/digital-twin/`：

```
packages/digital-twin/
├── package.json                   # @teamagent/digital-twin
├── tsconfig.json
├── tsup.config.ts                 # 编译到 dist/
├── README.md
└── src/
    ├── index.ts                   # package 入口（re-export）
    ├── config.ts                  # 配置文件读写 (~/.teamagent/digital-twin.json)
    ├── identity.ts                # user_id / machine_id 生成
    ├── paths.ts                   # 所有路径常量集中处
    ├── mock-server.ts             # localhost HTTP 接收端
    └── __tests__/
        ├── config.test.ts
        ├── identity.test.ts
        ├── paths.test.ts
        └── mock-server.test.ts
```

**行为契约**：

- `loadConfig()` / `saveConfig()`：原子写 + chmod 600；不存在时返回 `null`
- `getUserId()`：先 `git config user.email`；找不到 → `${username}@${hostname}`
- `getMachineId()`：读 `~/.teamagent/digital-twin/machine-id`；不存在 → 生成 `${hostname}-${uuid8}` 写进去
- `isEnabled(config)`：config 不存在 / `enabled=false` / token 缺失 → `false`（hook 静默 return 用）
- `startMockServer(port)`：起 HTTP，路由 `POST /v1/cc-sessions` + `POST /v1/recordings`，落盘到 `./test-output/`，返回可关闭 handle

`pnpm-workspace.yaml` + `tsconfig.base.json` 注册新包。

### 1.3 PR-2：Step 2 — tap-session + Stop hook 接线

**新增**：
- `packages/digital-twin/src/hooks/tap-session.ts` — 导出 `tapSession({ cwd, sessionId, env })`
- `packages/digital-twin/src/hooks/__tests__/tap-session.test.ts`
- `packages/cli/src/bin-stop.ts` — Node-side Stop hook entry，调 `tapSession()`
- `packages/cli/src/__tests__/bin-stop.test.ts`

**修改**：
- `packages/cli/tsup.hook.config.ts` — 加 `bin-stop` 编译 entry → `dist/bin-stop.cjs`
- `.claude/settings.json` — 注册新的 Stop hook channel（与现有 bash hook `self-report-fused.sh` 共存）
- `packages/digital-twin/src/index.ts` — re-export `tapSession`

**行为契约**：

- 定位日志路径 `~/.claude/projects/<base64_cwd>/<session_id>.jsonl`；找不到 → silent return
- 复制到 `~/.teamagent/digital-twin/queue/pending/<ulid>.payload`
- 同时写 `<ulid>.json` metadata（cwd / project_name / git remote+branch+dirty / os / arch / teamagent_version / captured_at / source）
- Spawn daemon（detached + stdio: 'ignore' + unref），跨平台
- 整个 tap-session 必须 < 50ms（hook 不阻塞）

### 1.4 PR-3：Step 3 — 后台上传 Daemon

**新增**：
- `packages/digital-twin/src/daemon/queue.ts`
- `packages/digital-twin/src/daemon/uploader.ts`
- `packages/digital-twin/src/daemon/process-manager.ts`
- `packages/digital-twin/src/schemas/cc-session.ts`（schema A 序列化）
- `packages/digital-twin/bin-uploader.cjs`（daemon entry，引 `dist/daemon/`）
- `packages/digital-twin/src/daemon/__tests__/{queue,uploader,process-manager}.test.ts`

**行为契约**：

| 项 | 规则 |
|---|---|
| 轮询 | 60s 扫一次 `pending/` |
| 容量 | `pending/` + `dead-letter/` > 5000 MB → 按 mtime 删最旧 |
| 组装 | 内存 gzip + base64 → 装 schema A |
| 请求 | `POST ${endpoint}/v1/cc-sessions`，带 `Authorization: Bearer ${token}` + `Idempotency-Key: <id>` |
| 200/204 | unlink payload + metadata |
| 429/5xx | 指数退避 30s → 60s → 120s → ... → 24h cap；累计 10 次失败 → 移 `dead-letter/` |
| 401 | daemon `process.exit(1)`（token 失效；需 `digital-twin login` 重新登录） |
| 自尽 | `pending/` 持续为空 15 分钟 → `process.exit(0)` |
| pid 文件 | `~/.teamagent/digital-twin/daemon.pid`（含 process.pid + start_at）；启动时检测 + `ps`：已有 daemon 则 exit 0 |

### 1.5 PR-4：Step 4 — 录音工具

**新增**：
- `packages/digital-twin/src/recorder/ffmpeg-wrapper.ts`
- `packages/digital-twin/src/recorder/platform-input.ts`（macOS avfoundation / Win dshow / Linux pulse 输入设备解析）
- `packages/digital-twin/src/schemas/recording.ts`（schema B 序列化）
- `packages/digital-twin/src/recorder/__tests__/ffmpeg-wrapper.test.ts`

**行为契约**：

- 启动时 `ffmpeg -version` 检测；找不到 → 抛带安装指引的错误
- start：detached spawn ffmpeg → `queue/recording_temp/<ulid>.ogg`，PID 落 `<ulid>.pid` 文件，立即返回
- stop：读 PID 文件 → SIGTERM → 等退出 → 把 ogg + metadata 移到 `pending/` → 唤醒 daemon
- import：`ffmpeg -i <input> -vn -c:a libopus -b:a 24k -ar 16000 -ac 1 <id>.ogg` → `pending/` → 唤醒 daemon
- 强制输出：Opus 24kbps 16kHz Mono OGG

### 1.6 PR-5：Step 5 — CLI 命令面

**新增**：
- `packages/digital-twin/src/cli/digital-twin.ts`（5 个 subcommand handler）
- `packages/digital-twin/src/cli/record.ts`（3 个 subcommand handler）
- `packages/digital-twin/src/cli/__tests__/{digital-twin,record}.test.ts`

**修改**：
- `packages/cli/src/bin.ts` — 注册 `digital-twin` 与 `record` 两个子命令组

**8 个命令**：

| 命令 | 行为 |
|---|---|
| `teamagent digital-twin login <token>` | 写 token 到 config；可选 verify endpoint 可达 |
| `teamagent digital-twin status` | pending 文件数 / dead-letter 数 / 总体积 / daemon PID / endpoint |
| `teamagent digital-twin pause` | `enabled=false`；下次 hook 触发直接丢 |
| `teamagent digital-twin resume` | `enabled=true` |
| `teamagent digital-twin inject-mock` | 生成伪造 jsonl + 手动 `tapSession()`，验证端到端 |
| `teamagent record start [--label] [--source]` | Step 4 start |
| `teamagent record stop` | Step 4 stop |
| `teamagent record import <path> [--label] [--source]` | Step 4 import |

CLI 输出全部走 AttributionBus（按项目规范）。

---

## 2. Expected Outputs

### 2.1 PR-1 产出

**新增文件**：
- `packages/digital-twin/package.json`
- `packages/digital-twin/tsconfig.json`
- `packages/digital-twin/tsup.config.ts`
- `packages/digital-twin/README.md`
- `packages/digital-twin/src/index.ts`
- `packages/digital-twin/src/config.ts`
- `packages/digital-twin/src/identity.ts`
- `packages/digital-twin/src/paths.ts`
- `packages/digital-twin/src/mock-server.ts`
- `packages/digital-twin/src/__tests__/{config,identity,paths,mock-server}.test.ts`

**修改文件**：
- `pnpm-workspace.yaml`（+ `packages/digital-twin`）
- `tsconfig.base.json`（+ `packages/digital-twin/src`）

**契约**：`pnpm install && pnpm typecheck && pnpm test` 全绿；mock server 能起停。

### 2.2 PR-2 产出

**新增文件**：
- `packages/digital-twin/src/hooks/tap-session.ts`
- `packages/digital-twin/src/hooks/__tests__/tap-session.test.ts`
- `packages/cli/src/bin-stop.ts`
- `packages/cli/src/__tests__/bin-stop.test.ts`

**修改文件**：
- `packages/cli/tsup.hook.config.ts`（+ bin-stop entry）
- `.claude/settings.json`（+ Stop hook channel）
- `packages/digital-twin/src/index.ts`（+ re-export `tapSession`）

**契约**：模拟 Stop hook tick 后 `~/.teamagent/digital-twin/queue/pending/` 出现 `<ulid>.payload` + `<ulid>.json`；daemon 进程已 spawn。

### 2.3 PR-3 产出

**新增文件**：
- `packages/digital-twin/src/daemon/{queue,uploader,process-manager}.ts`
- `packages/digital-twin/src/schemas/cc-session.ts`
- `packages/digital-twin/bin-uploader.cjs`
- `packages/digital-twin/src/daemon/__tests__/{queue,uploader,process-manager}.test.ts`

**契约**：5 个 payload 进 pending → 起 daemon → 全部 200 → unlink；mock 返回 500 → 看到指数退避 + dead-letter；空闲 15 分钟 daemon 自杀。

### 2.4 PR-4 产出

**新增文件**：
- `packages/digital-twin/src/recorder/{ffmpeg-wrapper,platform-input}.ts`
- `packages/digital-twin/src/schemas/recording.ts`
- `packages/digital-twin/src/recorder/__tests__/ffmpeg-wrapper.test.ts`

**契约**：start → 录 5s → stop → ogg 在 `pending/`，daemon 上传，mock server 看到 OGG 落盘；import 同链路。

### 2.5 PR-5 产出

**新增文件**：
- `packages/digital-twin/src/cli/{digital-twin,record}.ts`
- `packages/digital-twin/src/cli/__tests__/{digital-twin,record}.test.ts`

**修改文件**：
- `packages/cli/src/bin.ts`

**契约**：8 个命令全部 `--help` 出 JSON canonical；端到端 inject-mock → status 看队列变化 → daemon 上传 → status 看到清空。

---

## 3. How to Verify

### 3.1 PR-1 验收

```bash
pnpm install
pnpm --filter @teamagent/digital-twin test
pnpm typecheck
# 期望：全绿

# Mock server 烟测
node -e "import('./packages/digital-twin/dist/mock-server.js').then(m => m.startMockServer(8080))" &
PID=$!
curl -X POST http://localhost:8080/v1/cc-sessions \
  -H 'Content-Type: application/json' \
  -d '{"schema_version":"1.0","envelope":{"session_id":"test-01"},"transcript":{"content":"H4sIAAA..."}}'
ls test-output/
kill $PID
# 期望：test-output/ 有解码后的文件
```

### 3.2 PR-2 验收

```bash
# 模拟 Stop hook tick
cat <<EOF | node packages/cli/dist/bin-stop.cjs
{"hook_event_name":"Stop","cwd":"/some/path","session_id":"abc-123"}
EOF
ls ~/.teamagent/digital-twin/queue/pending/
# 期望：<ulid>.payload + <ulid>.json 存在
ps -ef | grep bin-uploader.cjs
# 期望：daemon 进程已起

# 时延验证
time node packages/cli/dist/bin-stop.cjs < fake-input.json
# 期望：< 50ms
```

### 3.3 PR-3 验收

```bash
# 起 mock server
node -e "import('./packages/digital-twin/dist/mock-server.js').then(m => m.startMockServer(8080))" &

# 塞 5 个 fake payload 到 pending/
for i in 1 2 3 4 5; do
  echo '{"fake":"payload"}' | gzip > ~/.teamagent/digital-twin/queue/pending/test-$i.payload
  echo '{"meta":"data"}' > ~/.teamagent/digital-twin/queue/pending/test-$i.json
done

# 起 daemon 手动
node packages/digital-twin/bin-uploader.cjs
# 期望：5 个文件全部消失，mock server 收到 5 个 POST

# 退避测试：让 mock 返 500 → 看 daemon 日志的退避序列
# dead-letter 测试：mock 持续返 500 → 10 次后任务移到 dead-letter/
# 自尽测试：pending/ 空 15 分钟 → daemon 进程消失
```

### 3.4 PR-4 验收

```bash
pnpm teamagent record start --label "test"
sleep 5
pnpm teamagent record stop
ls ~/.teamagent/digital-twin/queue/pending/
# 期望：一个 .ogg + .json
file ~/.teamagent/digital-twin/queue/pending/*.ogg
# 期望：Ogg data, Opus audio

# import 链路
pnpm teamagent record import ./fixtures/sample.mp4 --label "imported"
# 期望：转码后 .ogg 出现在 pending/
```

### 3.5 PR-5 验收

```bash
pnpm teamagent digital-twin --help    # JSON canonical
pnpm teamagent record --help          # JSON canonical

pnpm teamagent digital-twin login dummy-token
pnpm teamagent digital-twin status    # 看到 endpoint + 0 个 pending
pnpm teamagent digital-twin inject-mock
pnpm teamagent digital-twin status    # 看到 1 个 pending

sleep 70                               # 等 daemon 轮询
pnpm teamagent digital-twin status    # 看到 0 个 pending（已上传）

# pause/resume
pnpm teamagent digital-twin pause
# 触发 hook → 不落盘
pnpm teamagent digital-twin resume
# 触发 hook → 落盘
```

### 3.6 通用门禁

每个 PR 落地前必须走 `docs/feature-verification.md` 的 **1+2+3** 验证：

1. `claudefast -p "<command> --help"` 出 canonical JSON
2. `codex exec` 跑同一命令 → hard-match 两份 JSON
3. tmux interactive 跑 `claudefast` + `/export <path>` → 把 export 文件加入 PR contents

---

## 4. Claudefast Probes

每个 PR 跑下面对应的 stream-json 探针，artifact 落 `docs/plans/issue-146/probes/` 目录，跟随对应 PR 提交。

### 4.1 PR-1 probes
- `pr1-mock-server-roundtrip.jsonl` — `claudefast -p` 触发 mock server 起停 + 一次 curl POST，抓 stream-json 里的请求 / 响应锚点
- `pr1-config-isolation.jsonl` — 验证 config 文件 chmod 600 + 写入失败时 silent return

### 4.2 PR-2 probes
- `pr2-tap-session-50ms.jsonl` — 测 tap-session 端到端时延（必须 < 50ms）
- `pr2-stop-hook-noop.jsonl` — 验证现有 bash Stop hook (`self-report-fused.sh`) 不被破坏
- `pr2-daemon-spawn.jsonl` — 抓 daemon spawn 的 PID + ppid 关系（验证 detached 生效）

### 4.3 PR-3 probes
- `pr3-uploader-200.jsonl` — 5 个 payload 全部 200 链路
- `pr3-uploader-backoff.jsonl` — mock 返回 500 → 看到 30s/60s/120s 退避
- `pr3-uploader-dead-letter.jsonl` — 单 task 10 次失败 → 移 dead-letter
- `pr3-daemon-suicide.jsonl` — 空闲 15 分钟自杀（测试时 mock 时间）

### 4.4 PR-4 probes
- `pr4-record-roundtrip.jsonl` — start → stop → 上传链路
- `pr4-ffmpeg-not-found.jsonl` — ffmpeg 不存在时友好报错
- `pr4-import-transcode.jsonl` — import mp4 → 转 ogg → 上传

### 4.5 PR-5 probes
- `pr5-cli-help-canonical.jsonl` — 8 个命令 `--help` JSON canonical
- `pr5-pause-resume.jsonl` — pause 后 hook 不落盘 / resume 后恢复
- `pr5-e2e-injectmock.jsonl` — 端到端 inject-mock → 观察队列 → 上传 → 清空

---

## 5. Risks & Open Items

### 5.1 实施风险

- **R1 Windows detached spawn 行为**：POSIX 的 `unref()` 在 Windows 上仍可能让父进程 wait child；需 `windowsHide: true` + 实测确认。PR-2 / PR-3 必须在 Windows 上验过。
- **R2 跨平台 ffmpeg 依赖**：用户没装 → 报错引导。如果团队普遍没装，PR-4 验收会卡。鸭老板要先确认团队 ffmpeg 状态。
- **R3 Stop hook 时序**：现有 bash hook 与新 Node-side hook 都注册到 Stop channel；两个能否共存需 PR-2 实测（特别是 timeout 累计行为）。
- **R4 mtime-based 删最旧**：跨文件系统 mtime 精度差异可能让"最旧"判断不稳；考虑用文件名里的 ULID 时间戳兜底。
- **R5 hook 重复触发**：同一 session 多次 Stop hook tick → 可能产生多份 payload 引同一 jsonl；需要去重逻辑（按 session_id + content sha256）。

### 5.2 部署 Open Items（不阻塞 PR-1..5）

- 生产 endpoint 配置：W1 服务器搭建后填到 `uploader.endpoint`
- Bearer token 体系：项目所有者准备 token 字符串后线下发到团队成员
- 监控 / 备份：服务器侧的接收端、存储、监控、备份策略（不在本 plan 范围；走单独的部署 plan）
- 远程访问：当前生产 endpoint 是内网 IP，远程同事无法直连；如有需要追加 VPN / 内网穿透

---

## 6. POSTPR Loop

每个 PR 走 `docs/POSTPR.md` 流程：

1. PR opened → CI + Codex review
2. Conflict? classify (merge / Codex-review / rule-doc) → resolve in PR branch
3. Rerun `pnpm test` + `pnpm typecheck` + feature verification 1+2+3
4. push 同一 PR branch 或 follow-up PR（如已 merge）
5. POSTPR loop until CI green + 无冲突 + Codex silent/👍
6. 任何 Codex P1/P2 发现 → fix in this PR with PR-PLAN（不开 follow-up issue + merge）

---

## 相关文档

- 权威源：[GitHub Issue #146](https://github.com/libz-renlab-ai/TeamBrain/issues/146)
- 已 SUPERSEDED：`docs/specs/2026-05-06-user-log-collection-design.md`
- PR 计划骨架：`docs/HOWTO-PLAN-PR.md`
- 验证门禁：`docs/feature-verification.md`
- POSTPR 流程：`docs/POSTPR.md`
- PR-PLAN 政策：`docs/PR-PLAN.md`
- TEAMAGENT compile 行为：`docs/features/compile.md`
- Stop hook 现状：`CLAUDE.md` § 当前项目级 Stop hook
- Self-update 机制：`docs/SELF-UPDATE.md`
