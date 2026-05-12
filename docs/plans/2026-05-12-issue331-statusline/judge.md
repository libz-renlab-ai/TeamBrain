```text
        ┌──────────────────────────────────────────────────┐
        │  judge.md · third-party harness for issue #331   │
        │                                                  │
        │   MAIN agent  ──dispatch──►  5 probes (J1..J5)   │
        │                                  │               │
        │                                  ▼               │
        │                          .judge/<run_id>/        │
        │                            └── J*.json + raw     │
        │                                  │               │
        │                                  ▼               │
        │                       another LLM ──verdict──►   │
        │                          PASS / FAIL JSON        │
        └──────────────────────────────────────────────────┘
```

# Judge harness — Issue #331 statusline 扩展

> 严格按 `~/.claude/memory/feedback_judge_harness_md_playbook.md`：本文件是 **MD playbook**，MAIN agent 用 `Bash` / `claudefast -p` subagent 把每个 probe 跑起来，dump 大量 JSON 到 `.judge/<run_id>/`；最后让独立 LLM judge **只读 raw JSON + evidence dirs** 输出 verdict。**禁止**用 `scripts/*.sh` 一锤定 PASS/FAIL；**禁止**让 `scripts/teamagent-statusline.cjs` 自证。

## Run-id 约定

```
RUN_ID=2026-05-12-issue331-$(date +%H%M%S)
JUDGE_DIR=.judge/$RUN_ID
mkdir -p "$JUDGE_DIR"
```

每个 probe 自己起子目录 `$JUDGE_DIR/J<N>/`，里面 `stdout.txt` / `stderr.txt` / `<probe_id>.json`。

## J1 — Statusline 老格式回归（空 stdin）

**目的**：证 stdin 被解析失败 / 空时，老 4 字段 byte-identical（**T3**）。

**Dispatch**：

```bash
mkdir -p "$JUDGE_DIR/J1"
# 用最小 fixture：tmp HOME + 空 events / 空 knowledge → 走 "待命中" 路径
TMP_HOME=$(mktemp -d)
mkdir -p "$TMP_HOME/.teamagent"
node -e "
  const sql=require('node:sqlite').DatabaseSync;
  const fs=require('node:fs');
  const path=require('node:path');
  const dir='$TMP_HOME/.teamagent';
  for (const f of ['global.db','events.db']) {
    const db=new sql(path.join(dir,f));
    if (f==='global.db') db.exec('CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)');
    else                 db.exec('CREATE TABLE events (kind TEXT, timestamp TEXT)');
    db.close();
  }
"
# 关键：< /dev/null = stdin 已 EOF；新代码必须把 6 个新字段全部跳过
HOME="$TMP_HOME" node scripts/teamagent-statusline.cjs < /dev/null \
  > "$JUDGE_DIR/J1/stdout.txt" 2> "$JUDGE_DIR/J1/stderr.txt"
EXIT=$?
```

**JSON 评估**：

```bash
node - <<EOF
const fs=require('fs');
const out=fs.readFileSync('$JUDGE_DIR/J1/stdout.txt','utf-8');
const legacyAnchors=['TeamAgent','规则:','帮过:','今/','周','拦过:','今','待命中'];
const forbiddenNew=['模型:','上下文:','用量:','5h:','7d:','会话:'];
const present=legacyAnchors.filter(a=>out.includes(a));
const leaked=forbiddenNew.filter(a=>out.includes(a));
fs.writeFileSync('$JUDGE_DIR/J1.json', JSON.stringify({
  probe_id:'J1', exit_code:$EXIT,
  metrics:{ legacy_anchors_present: present, new_fields_leaked: leaked, stdout_bytes: out.length },
  evidence_dir:'$JUDGE_DIR/J1/', stdout_path:'$JUDGE_DIR/J1/stdout.txt', stderr_path:'$JUDGE_DIR/J1/stderr.txt'
}, null, 2));
EOF
```

**通过条件（pinned）**：`legacy_anchors_present.length === 8` AND `new_fields_leaked.length === 0` AND `exit_code === 0`。

## J2 — Statusline 新字段渲染（mock stdin）

**目的**：证 6 个新字段在合法 stdin 下都被拼出。

**Dispatch**：

```bash
mkdir -p "$JUDGE_DIR/J2"
TMP_HOME=$(mktemp -d)
TRANS_DIR="$TMP_HOME/.claude/projects/-fake-cwd"
mkdir -p "$TRANS_DIR"
cat > "$TRANS_DIR/sess.jsonl" <<'JSONL'
{"type":"assistant","timestamp":"2026-05-12T10:00:00.000Z","message":{"model":"Test","usage":{"input_tokens":200,"cache_creation_input_tokens":40000,"cache_read_input_tokens":60000,"output_tokens":500}}}
JSONL
# 模拟最近 5h 内多一条
cat >> "$TRANS_DIR/sess.jsonl" <<JSONL
{"type":"assistant","timestamp":"$(date -u -v-2H +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S.000Z)","message":{"model":"Test","usage":{"input_tokens":100,"cache_read_input_tokens":900,"output_tokens":0}}}
JSONL

cat > "$JUDGE_DIR/J2/stdin.json" <<JSON
{"hook_event_name":"Status","session_id":"sess","transcript_path":"$TRANS_DIR/sess.jsonl","cwd":"/fake-cwd","model":{"id":"opus-4-7","display_name":"Opus 4.7 (1M)"},"workspace":{"current_dir":"/fake-cwd","project_dir":"/fake-cwd"},"cost":{"total_cost_usd":0.42,"total_duration_ms":12000,"total_api_duration_ms":11000,"total_lines_added":10,"total_lines_removed":3},"exceeds_200k_tokens":false}
JSON

# 也需要 .teamagent dbs 否则会先打 "TeamAgent 未安装"
mkdir -p "$TMP_HOME/.teamagent"
node -e "
  const sql=require('node:sqlite').DatabaseSync;
  const path=require('node:path');
  for (const f of ['global.db','events.db']) {
    const db=new sql(path.join('$TMP_HOME/.teamagent',f));
    if (f==='global.db') db.exec('CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)');
    else                 db.exec('CREATE TABLE events (kind TEXT, timestamp TEXT)');
    db.close();
  }
"

HOME="$TMP_HOME" node scripts/teamagent-statusline.cjs < "$JUDGE_DIR/J2/stdin.json" \
  > "$JUDGE_DIR/J2/stdout.txt" 2> "$JUDGE_DIR/J2/stderr.txt"
EXIT=$?
```

**JSON 评估**：

```bash
node - <<EOF
const fs=require('fs');
const out=fs.readFileSync('$JUDGE_DIR/J2/stdout.txt','utf-8');
const expectedFields=['模型:','上下文:','用量:','5h:','7d:','会话:'];
const presence={};
for (const k of expectedFields) presence[k] = out.includes(k);
const allPresent = expectedFields.every(k=>presence[k]);
fs.writeFileSync('$JUDGE_DIR/J2.json', JSON.stringify({
  probe_id:'J2', exit_code:$EXIT,
  metrics:{ field_presence: presence, all_present: allPresent, stdout_bytes: out.length, stdout: out },
  evidence_dir:'$JUDGE_DIR/J2/', stdout_path:'$JUDGE_DIR/J2/stdout.txt', stderr_path:'$JUDGE_DIR/J2/stderr.txt'
}, null, 2));
EOF
```

**通过条件**：`all_present === true` AND `exit_code === 0`。

## J3 — `teamagent init` 注册 statusline path 端到端

**目的**：证 `pnpm teamagent init` 落地 `.claude/settings.local.json::statusLine.command` 含 `teamagent-statusline.cjs`（**O5**）。

**Dispatch**：

```bash
mkdir -p "$JUDGE_DIR/J3"
FIXTURE=$(mktemp -d)
cd "$FIXTURE" && git init -q && touch README.md && git add . && git -c user.email=t@t.com -c user.name=t commit -qm init
# 装 dist + 跑 init（在原 worktree 跑 pnpm build:hook 先）
cd - >/dev/null
pnpm --filter @teamagent/cli build:hook > "$JUDGE_DIR/J3/build.log" 2>&1
node packages/cli/dist/bin.js install-hook --cwd "$FIXTURE" \
  > "$JUDGE_DIR/J3/init.stdout" 2> "$JUDGE_DIR/J3/init.stderr"
EXIT=$?
cp "$FIXTURE/.claude/settings.local.json" "$JUDGE_DIR/J3/settings.local.json" 2>/dev/null || true
```

**JSON 评估**：

```bash
node - <<EOF
const fs=require('fs');
let settings=null, err=null;
try { settings=JSON.parse(fs.readFileSync('$JUDGE_DIR/J3/settings.local.json','utf-8')); }
catch(e){ err=String(e); }
const cmd = settings?.statusLine?.command ?? null;
const hasCjs = typeof cmd==='string' && cmd.includes('teamagent-statusline.cjs');
const tagged = settings?.statusLine?._teamagentTag === 'teamagent-statusline';
fs.writeFileSync('$JUDGE_DIR/J3.json', JSON.stringify({
  probe_id:'J3', exit_code:$EXIT,
  metrics:{ has_settings: !!settings, status_line_command: cmd, has_cjs: hasCjs, _teamagentTag: tagged, read_error: err },
  evidence_dir:'$JUDGE_DIR/J3/'
}, null, 2));
EOF
```

**通过条件**：`has_cjs === true` AND `_teamagentTag === true`。

## J4 — `docs/STATUSLINE.md` 文档锚点

**目的**：证文档把新字段写进字段速查表（**O3**）。

**Dispatch**：

```bash
mkdir -p "$JUDGE_DIR/J4"
node - <<EOF
const fs=require('fs');
const doc=fs.readFileSync('docs/STATUSLINE.md','utf-8');
const anchors=['模型','上下文','用量','5h','7d','会话健康','exceeds_200k_tokens','transcript_path','total_cost_usd','model.display_name'];
const present=anchors.filter(a=>doc.includes(a));
fs.writeFileSync('$JUDGE_DIR/J4.json', JSON.stringify({
  probe_id:'J4', exit_code:0,
  metrics:{ anchors_total: anchors.length, anchors_present: present, missing: anchors.filter(a=>!doc.includes(a)) },
  evidence_dir:'$JUDGE_DIR/J4/'
}, null, 2));
EOF
```

**通过条件**：`anchors_present.length >= 8`。

## J5 — tmux + interactive `claude` 真渲染 (SKIPPABLE)

**目的**：用户原话 `!tmux + shell + interactive claude code has a statusbar meets this`。证真启动一个 tmux session + interactive `claude`，状态栏渲染含 ≥ 3 个新字段锚点。

**Dispatch**（在有 API key 的本地环境）：

```bash
mkdir -p "$JUDGE_DIR/J5"
which tmux > "$JUDGE_DIR/J5/tmux-which" 2>&1 || true
which claude > "$JUDGE_DIR/J5/claude-which" 2>&1 || true
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
  echo "SKIPPED: no API credentials in env" > "$JUDGE_DIR/J5/skip-reason"
  EXIT=2
else
  pnpm --filter @teamagent/cli build:hook >> "$JUDGE_DIR/J5/build.log" 2>&1
  node packages/cli/dist/bin.js install-hook --cwd "$PWD" >> "$JUDGE_DIR/J5/install.log" 2>&1
  tmux kill-session -t sl-j5 2>/dev/null || true
  tmux new-session -d -s sl-j5 -x 200 -y 50 "claude"
  sleep 12
  tmux capture-pane -t sl-j5 -p > "$JUDGE_DIR/J5/pane.txt"
  tmux kill-session -t sl-j5 2>/dev/null || true
  EXIT=0
fi
```

**JSON 评估**：

```bash
node - <<EOF
const fs=require('fs');
let pane=null;
try { pane=fs.readFileSync('$JUDGE_DIR/J5/pane.txt','utf-8'); } catch {}
const skip=fs.existsSync('$JUDGE_DIR/J5/skip-reason')?fs.readFileSync('$JUDGE_DIR/J5/skip-reason','utf-8').trim():null;
const newAnchors=['模型:','上下文:','5h:','7d:','用量:','会话:'];
const legacyAnchors=['规则:','帮过:','拦过:'];
const newPresent = pane ? newAnchors.filter(a=>pane.includes(a)) : [];
const legacyPresent = pane ? legacyAnchors.filter(a=>pane.includes(a)) : [];
fs.writeFileSync('$JUDGE_DIR/J5.json', JSON.stringify({
  probe_id:'J5', exit_code:$EXIT, skipped: !!skip, skip_reason: skip,
  metrics:{ new_anchors_present: newPresent, legacy_anchors_present: legacyPresent, pane_bytes: pane?.length ?? 0 },
  evidence_dir:'$JUDGE_DIR/J5/', stdout_path:'$JUDGE_DIR/J5/pane.txt'
}, null, 2));
EOF
```

**通过条件**：`skipped === true`（无 API key → 接受 SKIPPED）**或** `new_anchors_present.length >= 3 AND legacy_anchors_present.length >= 2`。

## Verdict aggregation

MAIN agent 在所有 5 个 probe 跑完后，dispatch 给独立 LLM judge（`!claudefast -p`）：

```text
请只读以下 JSON + evidence 路径（不要重新执行任何代码 / 不要读源码）：
  .judge/<run_id>/J1.json … J5.json
输出 JSON：
{ "verdict": "PASS|FAIL", "reasons": [...], "pinned_thresholds_met": ["T1","T2","T3","T4"] }
规则：
- T1: 所有 vitest statusline test 通过（额外跑 `pnpm vitest run packages/cli/src/__tests__/statusline-format.test.ts`，读 stdout 判断 0 failed）
- T2: J1..J5 至少 4 个 PASS（J5 SKIPPED 不算 FAIL）
- T3: J1 metrics.new_fields_leaked.length === 0 且 legacy_anchors_present.length === 8
- T4: J4 metrics.anchors_present.length >= 8
```

verdict = `PASS` → 进入 `/review` 循环 → squash-merge；
verdict = `FAIL` → 回去 implement，**不允许**先 merge 后补。

## evidence retention

`.judge/<run_id>/` 整目录在 `report.md` 引用一次后保留至少 30 天。`.gitignore` 中已忽略 `.judge/`。
