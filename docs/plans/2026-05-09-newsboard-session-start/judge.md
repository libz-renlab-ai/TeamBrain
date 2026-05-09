# Judge harness — newsboard-session-start

```
       __
     >( o )>     呷呷~ 第三方 LLM-judge
      \   /     （我不评我自己 / code does not evaluate itself）
       \ /
        v
        ^^
   ┌─────────────────────────────────────────────┐
   │   RUN  →  DUMP  →  READ                     │
   │   (固定工具) (canonical JSON) (independent  │
   │                                  LLM-judge) │
   └─────────────────────────────────────────────┘
```

> 依据 `~/.claude/docs/rules/testing-judge-harness.md` 与 `plan-content.md` 第 3 条铁律：
> **代码不评价自己**。Hook 由固定 harness 跑出来，evidence 全 dump 到磁盘；一只独立 LLM
> （`claudefast -p`）**只读 evidence + judge.json，不读 hook 源码**，给 PASS/FAIL。
>
> 本文件是 **md 播本**，不是脚本。LLM 实施者拷贝 bash 块逐步执行。
> （依据 `docs/legacy/judge-scripts/README.md` exemption：utility 可以是 .sh，judge 不行。）

---

## RUN — 固定工具执行

> 用单个 `python3` 进程包住 hook 调用计时；避免 `python3 -c 'time...'` 调两次时
> 各自吞 ~150ms 启动开销污染 duration_ms（实测会把 ~200ms 的 hook 测成 600+ms）。

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)
EVIDENCE_DIR=".judge/$RUN_ID"
mkdir -p "$EVIDENCE_DIR"

python3 - "$EVIDENCE_DIR" <<'PY'
import subprocess, sys, time, pathlib, json, os
ed = pathlib.Path(sys.argv[1])
run_id = ed.name
payload = {
    "hook_event_name": "SessionStart",
    "session_id": f"judge-{run_id}",
    "cwd": os.getcwd(),
    "source": "startup",
}
t0 = time.time()
p = subprocess.run(
    ["bash", ".claude/hooks/newsboard-session-start.sh"],
    input=json.dumps(payload).encode(),
    capture_output=True,
)
dt_ms = int((time.time() - t0) * 1000)
(ed / "stdout.txt").write_bytes(p.stdout)
(ed / "stderr.txt").write_bytes(p.stderr)
(ed / "exit_code.txt").write_text(str(p.returncode))
(ed / "duration_ms.txt").write_text(str(dt_ms))
PY
EXIT=$(cat "$EVIDENCE_DIR/exit_code.txt")
DURATION_MS=$(cat "$EVIDENCE_DIR/duration_ms.txt")
```

## DUMP — canonical judge.json

```bash
jq -n \
  --arg run_id "$RUN_ID" \
  --argjson exit_code "$EXIT" \
  --argjson stdout_bytes "$(wc -c < "$EVIDENCE_DIR/stdout.txt" | tr -d ' ')" \
  --argjson stderr_lines "$(wc -l < "$EVIDENCE_DIR/stderr.txt" | tr -d ' ')" \
  --argjson stderr_bytes "$(wc -c < "$EVIDENCE_DIR/stderr.txt" | tr -d ' ')" \
  --argjson duration_ms "$DURATION_MS" \
  --arg evidence_dir "$EVIDENCE_DIR/" \
  '{
    run_id:       $run_id,
    exit_code:    $exit_code,
    stdout_bytes: $stdout_bytes,
    stderr_lines: $stderr_lines,
    stderr_bytes: $stderr_bytes,
    duration_ms:  $duration_ms,
    evidence_dir: $evidence_dir
  }' > "$EVIDENCE_DIR/judge.json"

cat "$EVIDENCE_DIR/judge.json"
```

## READ — independent LLM judge

```bash
claudefast -p "$(cat <<EOF
You are a 3rd-party judge. **Do not** look at the hook source code
(\`.claude/hooks/newsboard-session-start.sh\`). Read **only** these files:

  - $EVIDENCE_DIR/judge.json
  - $EVIDENCE_DIR/stdout.txt
  - $EVIDENCE_DIR/stderr.txt
  - docs/PRODUCT-FEATURES.md   (reference catalog only)

Evaluate these 6 assertions and return PASS or FAIL with a one-line reason each.

  A1. judge.json.exit_code == 0
      (hook never blocks)

  A2. stdout.txt is empty (stdout_bytes == 0)
       OR stdout.txt is valid JSON containing no top-level
       "additionalContext" or "hookSpecificOutput.additionalContext" field.
      (hook MUST NOT leak content into Claude's context — "to user not to cc")

  A3. stderr.txt contains the literal string "TEAMBRAIN NEWSBOARD"
      (header rendered)

  A4. stderr.txt contains all 4 section labels (case-insensitive substring):
        "Install" AND "Update"
        "Just shipped"
        "haven't tried" OR "give it a try"  (the new + try section)
        "random"
      (4 sections all present)

  A5. stderr.txt contains at least 1 feature name from
      docs/PRODUCT-FEATURES.md numbered list (any item from "1." through "64.").
      Match by substring on the feature description.
      (data source actually wired)

  A6. judge.json.duration_ms < 500
      (does not delay session startup perceptibly)

Output format (literal):

  A1: PASS|FAIL — <one-line reason>
  A2: PASS|FAIL — <one-line reason>
  A3: PASS|FAIL — <one-line reason>
  A4: PASS|FAIL — <one-line reason>
  A5: PASS|FAIL — <one-line reason>
  A6: PASS|FAIL — <one-line reason>
  OVERALL: PASS|FAIL

OVERALL is PASS only if all 6 are PASS.
EOF
)"
```

---

## Re-run protocol

After every edit to `.claude/hooks/newsboard-session-start.sh`:

1. 拷贝上面 RUN block 跑一次
2. 拷贝上面 DUMP block 写 `judge.json`
3. 拷贝上面 READ block，喂 `claudefast -p`
4. 读 `OVERALL`：PASS → 收工；FAIL → 看 reason → 修脚本 → 重跑

> ⚠️ **Don't shortcut**: 不要让 implementing agent 自己看 stderr 然后说 "looks good"。
> 必须走 RUN → DUMP → READ 三段，让 claudefast 当 judge。这是规则，不是建议。
