# @teamagent/digital-twin

旁挂式数据采集模块（TeamBrain Digital Twin Sidecar）。

实施依据：[GitHub Issue #146](https://github.com/libz-renlab-ai/TeamBrain/issues/146)
计划文档：`docs/plans/issue-146/plan.md`

## 模块边界

- 拦截 Claude Code Stop hook，把 transcripts JSONL（gzip+base64）+ 录音 (Opus/OGG) 落本地 queue
- 后台 daemon 异步上传到中央接收端（`/v1/cc-sessions` + `/v1/recordings`）
- daemon 空闲 15 分钟自尽
- 全队共享单一 token，通过 `teamagent digital-twin login <token>` 配置

## 当前 PR 范围（PR-1）

- `src/paths.ts` — 所有路径常量集中处
- `src/identity.ts` — user_id / machine_id 生成
- `src/config.ts` — 配置文件 r/w（atomic + chmod 600 on POSIX）
- `src/mock-server.ts` — localhost HTTP 接收端（开发与测试用）

后续 PR：tap-session 落盘 → daemon 上传 → 录音封装 → CLI 命令面。
