```
                  ┌───────────────────────────────────┐
                  │  §V0 RUN-ID   │  ISO + git short  │
                  │  §V1 RUN      │  shell commands   │
                  │  §V2 DUMP     │  evidence/*.json  │
                  │  §V3 READ     │  PASS/FAIL grep   │
                  └───────────────────────────────────┘
```

# judge.md — issue #371 daily-summary verification playbook

> Hard rule per `docs/HOWTO-PLAN-PR.md` & `docs/PLAN-RESEARCH-REPORT.md`：本文件是 **md playbook**，由 main agent dispatch 执行；**不是** `scripts/*.sh`。
>
> 结构 §V1 RUN → §V2 DUMP → §V3 READ，evidence 落 `evidence/<run-id>/*.json`，main agent 读 JSON 出 PASS/FAIL — 不用 LLM-judge。

---

## §V0 RUN-ID

每次跑生成 `<run-id>` = `YYYYMMDD-HHMM-<git-short-sha>`，例 `20260513-0830-abc1234`。

evidence 路径：`docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/`。

获取方式：
```bash
RUN_ID="$(date -u +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"
EVID="docs/plans/2026-05-13-issue-371-daily-summary/evidence/$RUN_ID"
mkdir -p "$EVID"
```

## §V1 RUN

### §V1.1 — typecheck (CI-equivalent root `pnpm typecheck`)

The repo's CI runs `pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json`),
not per-package `pnpm -F @teamagent/{core,cli} typecheck` — the latter
hits pre-existing `rootDir` errors on `packages/core/src/scenario/__tests__/runner.test.ts`
that pre-date this PR (see `2ae70c8a` `feat(m7): add fixture replay`). We
follow CI here:

```bash
pnpm typecheck 2>&1 | tee "$EVID/typecheck-root.stdout"
echo "{\"exit_code\":${PIPESTATUS[0]}}" > "$EVID/typecheck-root.json"
```

期望 `exit_code: 0`。失败 → §V3 FAIL on typecheck.

For belt-and-suspenders, also run the CLI per-package typecheck because
issue #371 lives mostly in `@teamagent/cli`:

```bash
pnpm -F @teamagent/cli typecheck 2>&1 | tee "$EVID/typecheck-cli.stdout"
echo "{\"exit_code\":${PIPESTATUS[0]}}" > "$EVID/typecheck-cli.json"
```

### §V1.2 — vitest (core daily-summary suite)

```bash
pnpm vitest run \
  --reporter=json \
  --outputFile="$EVID/vitest-core.json" \
  packages/core/src/daily-summary/__tests__/ \
  2>&1 | tee "$EVID/vitest-core.stdout"
```

期望：所有 5 个测试文件全绿。

### §V1.3 — vitest (cli daily + hook injection)

```bash
pnpm vitest run \
  --reporter=json \
  --outputFile="$EVID/vitest-cli-daily.json" \
  packages/cli/src/__tests__/daily.test.ts \
  packages/cli/src/__tests__/bin-user-prompt-submit-daily-injection.test.ts \
  2>&1 | tee "$EVID/vitest-cli-daily.stdout"
```

期望全绿。

### §V1.4 — cli bundle build (用于 §V1.5 / §V1.6 真实跑)

```bash
pnpm -F @teamagent/cli build 2>&1 | tee "$EVID/cli-build.stdout"
echo "{\"exit_code\":${PIPESTATUS[0]}}" > "$EVID/cli-build.json"
```

期望 `exit_code: 0`。

### §V1.5 — `daily --help` canonical JSON

```bash
pnpm --silent teamagent daily --help > "$EVID/daily-help.json" 2> "$EVID/daily-help.stderr"
echo "{\"exit_code\":$?}" > "$EVID/daily-help-exit.json"
```

期望：`daily-help.json` 合法 JSON，含 `command`, `usage`, `flags`, `summary` 字段；exit 0。

### §V1.6 — fixture scan + archive smoke

```bash
TMP_HOME="$(mktemp -d)"
TEAMAGENT_HOME="$TMP_HOME" pnpm --silent teamagent daily \
  --projects-root="docs/plans/2026-05-13-issue-371-daily-summary/evidence/fixture-projects" \
  --archive \
  --cwd="/fake/project/TeamBrain" \
  > "$EVID/fixture-scan.json" 2> "$EVID/fixture-scan.stderr"

cp "$TMP_HOME/daily/$(date -u +%Y-%m-%d).md" "$EVID/archive-sample.md" || echo "(archive missing)" > "$EVID/archive-sample.md"
```

期望：
- exit 0
- `fixture-scan.json` 是 JSON 含 `projects` 数组、`triggeredBy: "cli"`
- `archive-sample.md` 非空，首行 `# Daily activity` 起头
- fixture-projects 设计成至少两个 cwd-encoded 子目录映射到同一 host repo（验证 worktree 合并），故 `worktreeMergedCount >= 1`

## §V2 DUMP

`evidence/<run-id>/` 期望落以下文件（自动由 §V1 各步生成）：

| File | Source | 必含字段 |
|------|--------|---------|
| `typecheck-root.json` | §V1.1 | `exit_code` |
| `typecheck-cli.json` | §V1.1 | `exit_code` |
| `vitest-core.json` | §V1.2 | vitest JSON reporter（含 `numFailedTests`, `numPassedTests`） |
| `vitest-cli-daily.json` | §V1.3 | 同上 |
| `cli-build.json` | §V1.4 | `exit_code` |
| `daily-help.json` | §V1.5 | `command`, `usage`, `flags`, `summary` |
| `daily-help-exit.json` | §V1.5 | `exit_code` |
| `fixture-scan.json` | §V1.6 | `projects`, `triggeredBy`, `worktreeMergedCount`, `date` |
| `archive-sample.md` | §V1.6 | 非空，首行 `# Daily activity` |

不自动产；由 main agent 实施时拷贝/记录。

## §V3 READ

main agent 跑完 §V1 / §V2 后读这些 JSON 字段，逐项 grep / `jq` 判定：

```python
# 伪代码 - main agent 实际可用 jq + grep 等价实现
PASS = True

PASS &= read_json("typecheck-root.json")["exit_code"] == 0
PASS &= read_json("typecheck-cli.json")["exit_code"] == 0

vc = read_json("vitest-core.json")
PASS &= vc["numFailedTests"] == 0 and vc["numPassedTests"] >= 5

vd = read_json("vitest-cli-daily.json")
PASS &= vd["numFailedTests"] == 0 and vd["numPassedTests"] >= 2

PASS &= read_json("cli-build.json")["exit_code"] == 0
PASS &= read_json("daily-help-exit.json")["exit_code"] == 0

help = read_json("daily-help.json")
PASS &= all(k in help for k in ("command", "usage", "flags", "summary"))

scan = read_json("fixture-scan.json")
PASS &= isinstance(scan.get("projects"), list) and len(scan["projects"]) >= 1
PASS &= scan.get("triggeredBy") == "cli"
PASS &= scan.get("worktreeMergedCount", 0) >= 1

archive_md = read_text("archive-sample.md")
PASS &= archive_md.startswith("# Daily activity")

emit_verdict("PASS" if PASS else "FAIL")
```

### 不是 PASS 条件

- ❌ "LLM 兜底意图判定真实工作"：grill §4 允许降级；单测 stub 通过即可，本 PR 不要求接 claudefast 真调用。
- ❌ "现实场景 3 个项目都有今天活动"：本 PR 用 fixture 验证算法，员工真用时活动数因人而异。
- ❌ vitest `passed > N` 上限：只要 `failed == 0`。

## 风险 & 已知扰动

- **R1 mtime 漂移**：fixture jsonl 用 `touch -t` 设今天的 0:01 时间戳；GMT vs 本地时区差异可能让 CI runner 把 fixture 当昨天。mitigation：fixture 创建脚本用 `--touch-relative` 取 runner 当地"今天 0:01"。如果 §V1.6 fail 但其余全绿，主 agent 应 inspect fixture mtime，按需重 touch。
- **R2 archive 路径竞争**：`TMP_HOME` 走 `mktemp -d` 单进程独占，CI 并发安全。
- **R3 build cache**：本地连续跑时 `pnpm -F @teamagent/cli build` 可能因为 tsup cache stale 输出旧 bundle。如果 §V1.5 `daily --help` 出意外，先 `rm -rf packages/cli/dist` 再 §V1.4 重 build。
