# 数据收集 schema

> Per acceptance.md §M4 「记录维度」: 每个任务、每个成员都要记下 5 个维度。
> 全自动收集，**不允许**任何维度由 coordinator / 成员手填整数（除 1-5 主观分）。

## 文件布局

每位成员每天 1 个 JSONL 文件：

```
collection/daily/<YYYY-MM-DD>/<member-id>.jsonl
```

每行是一个 `Event`，按 ISO timestamp 升序写入。

## Event types

### 1. task-start

成员开始一个任务时由 `start-task.sh <task-slug>` 写入。

```json
{
  "type": "task-start",
  "ts": "2026-05-15T09:23:11.412Z",
  "member_id": "P-001",
  "task_slug": "01-parse-duration",
  "group": "mining-enabled"
}
```

### 2. task-end

成员结束任务时由 `end-task.sh <task-slug> --result=pass|fail --rating=<1-5>` 写入。

```json
{
  "type": "task-end",
  "ts": "2026-05-15T10:18:54.992Z",
  "member_id": "P-001",
  "task_slug": "01-parse-duration",
  "group": "mining-enabled",
  "result": "pass",
  "duration_ms": 3343580,
  "subjective_rating": 4,
  "code_quality_score": 0.87
}
```

`code_quality_score` 由 `collection/quality-score.sh <task-slug>` 计算（综合 eslint warnings、tsc clean、circular deps），范围 0-1。

### 3. ai-correction

成员在与智能助手对话中说出"纠正语"（如「不对」「再来」「写错了」）时
由 hook `collection/correction-hook.sh` 写入。

```json
{
  "type": "ai-correction",
  "ts": "2026-05-15T09:37:22.123Z",
  "member_id": "P-001",
  "task_slug": "01-parse-duration",
  "transcript_snippet_hash": "sha256:abc123…",
  "matched_keyword": "不对"
}
```

不保存原文，只保存 sha256 hash + 命中关键词。原文留在 BPP 上传通道（已脱敏）。

匹配关键词词典（`collection/correction-keywords.txt`）：

```
不对
再来
这个不对
你写错了
我让你做的是
重做
错了
not correct
wrong
redo
```

### 4. bp-inbox-action

成员对 BPP inbox 里的推送做了动作（采纳 / 拒绝 / 搁置）时由 BPP server 写入。

```json
{
  "type": "bp-inbox-action",
  "ts": "2026-05-15T11:00:00.000Z",
  "member_id": "P-001",
  "bp_id": "bp-2026-05-15-mock-db",
  "action": "accept",
  "during_task": "01-parse-duration"
}
```

`during_task` 是可选——根据时间戳 backfill 到当前正在做的任务（如果有）。

### 5. heartbeat

每分钟一次（或成员每次切换上下文时），用于检测成员当日是否活跃。

```json
{
  "type": "heartbeat",
  "ts": "2026-05-15T09:24:11.412Z",
  "member_id": "P-001",
  "current_task": "01-parse-duration",
  "session_idle_seconds": 12
}
```

## 上传聚合

每位成员的 daily JSONL 当日结束（或日翻页）后由
`collection/daily-uploader.sh` 推送到 BPP server 的实验数据收集端点，
存到 `<SERVER>/experiment-data/<member-id>/<YYYY-MM-DD>.jsonl`。

coordinator 在 day 28 后跑 `aggregate.py` 把全部 N 个成员 × 28 天 = 28N
个 JSONL rolled-up 成一个 `experiment-rollup.json`。

## 复现性约束

- Event 不可改：append-only，写完不允许编辑
- ts 用 UTC 毫秒精度
- duration_ms 由 task-end ts - task-start ts 计算，不允许任意覆盖
- subjective_rating 由 end-task.sh 在终端弹一次 CLI 提示，超 24h 不填即标缺失（不重弹）
- code_quality_score 由 quality-score.sh 自动跑，失败 = null（不允许成员手填）

## Dry-run 例子

`collection/example-daily/2026-05-15/P-001.jsonl` 是一个合成示例，
专门给 `aggregate.py` / `judge.py` 跑通流程用。**不**是真实实验数据。
