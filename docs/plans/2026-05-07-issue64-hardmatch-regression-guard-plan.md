```text
                ┌────────────────────────────────────────────────┐
                │  issue #64 — hardmatch regression guard plan   │
                │  (HOWTO-PLAN-PR 4 sections + ASCII art)        │
                └────────────────────────────────────────────────┘

   现状（research.md 已确认）
   ──────────────────────────
   PR #58 (9c78f99) 已 restore full canonical JSON equality；
   issue body 引用的退化 commit (39e81ea) 已不在 main 上活跃；
   缺一个 negative regression test 防止下次再退化。

       ┌────────────────────┐
       │ ① 写 plan          │  ← 此文件
       └─────────┬──────────┘
                 │
                 ▼
       ┌────────────────────┐
       │ ② expected outputs │  files / CLI / metrics / anti-goals
       └─────────┬──────────┘
                 │
                 ▼
       ┌────────────────────┐
       │ ③ judge harness    │  RUN → DUMP judge.json → READ by 3rd-party LLM
       └─────────┬──────────┘
                 │
                 ▼
       ┌────────────────────┐
       │ ④ claudefast probes│  -h orient → ≤8 parallel -p → stream-json audit
       └─────────┬──────────┘
                 │
                 ▼
   research → annotate → implement → report → normal PR → POSTPR loop until 👍
```

# Plan — issue #64 hardmatch regression guard

修 [issue #64](https://github.com/libz-renlab-ai/TeamBrain/issues/64)：codex 在 PR #62（已关闭）上 review 引用了 `39e81ea` 这次 keys-only 退化 commit。研究（同目录 `*research.md`）确认 `9c78f99`（PR #58）已经把脚本 restore 回 full canonical JSON equality + non-blank check；issue 真正缺的是 **regression guard**——一个 negative test，让任何把 `diff -u` 改回 `jq -S 'keys'` 的尝试自动 fail。

## ① Task description（做什么 / 怎么做 / 不做什么）

**做什么**：

1. 加 negative regression test `test-hardmatch-regression.sh`：构造两份 mock `claude-features.json` —— byte-equal fixture（应 PASS）+ 某 value 替换 1 个汉字（应 FAIL）—— 调用 hardmatch 核心 jq+diff 逻辑断言 exit code。
2. README 加 `## Hardmatch contract` 段：明文 full canonical JSON equality + non-blank first-line defence；任何变弱须经 PR review。
3. 把 negative test 接进 `run-all.sh`。
4. issue #64 留 triage comment（**等用户审 PR 后再发**），引用 `9c78f99` + 本 PR，建议 close。

**怎么做**：

- Boris workflow：research → plan → annotate → implement → report（前两份已就位）。annotate：脚本顶部加 `# CONTRACT: see README.md ## Hardmatch contract`。
- TDD：先写 negative test 看到红 → 验证现有 hardmatch（已是 full diff）让它转绿 → run-all.sh 全绿 → atomic commit。
- 三个 atomic commit：(a) `test(verify-kit): add hardmatch keys-only regression guard (#64)`；(b) `docs(verify-kit): formalize hardmatch contract in README (#64)`；(c) `chore(verify-kit): wire regression guard into run-all.sh (#64)`。

**不做什么（anti-goals）**：✗ `fixtures/expected-product-features.json` value 不动；✗ `docs/系统展示.md` Canonical TL;DR 不动；✗ `verify-claude-stream-json.sh` 不动；✗ 不引入 schema/type validation（option 2 冗余）；✗ 不把 key-only 合理化（option 3 把 bug 文档化）；✗ negative test 内部不调真实 LLM（pure jq）；✗ 不直接 close issue，等用户决定。

## ② Expected outputs（reviewer 可逐项打勾）

**Files added**

| 路径 | 用途 |
|------|------|
| `docs/feature-verify-kit/test-hardmatch-regression.sh` | 反退化 negative test（pure shell + jq） |
| `docs/plans/2026-05-07-issue64-hardmatch-regression-guard-plan.md` | 本 plan |
| `docs/plans/2026-05-07-issue64-hardmatch-regression-guard-research.md` | 调研已就位 |
| `docs/plans/2026-05-07-issue64-hardmatch-regression-guard-report.md` | 实施完成后写 |
| `.judge/<run_id>/judge.json` | 第三方 judge harness 产物（`<run_id>` = `YYYYMMDDTHHMMSSZ-issue64`） |

**Files edited**

| 路径 | 改动 |
|------|------|
| `docs/feature-verify-kit/README.md` | 新增 `## Hardmatch contract` 段（≤ 25 行） |
| `docs/feature-verify-kit/run-all.sh` | 在最末加一行 `bash "$(dirname "$0")/test-hardmatch-regression.sh"` |
| `docs/feature-verify-kit/hardmatch-features.sh` | 顶部加单行 `# CONTRACT: see README.md ## Hardmatch contract — do NOT downgrade to keys-only` |

**CLI / metrics**

- `bash docs/feature-verify-kit/test-hardmatch-regression.sh` 在 `claude-features.json` byte-equal fixture 时 exit 0（PASS）；在某 value mutate 1 个汉字时 exit 非 0（FAIL，被 test 期望并捕获，最终 test 自身 exit 0）。
- `bash docs/feature-verify-kit/run-all.sh` 顺序跑完 5 步（原 4 + 新 1）后整体 exit 0。
- 任何 future commit 把第 13 行 `diff -u "$OUT_DIR/expected-features.sorted.json" "$OUT_DIR/claude-features.sorted.json"` 改成 `diff -u "$OUT_DIR/expected-feature-keys.json" "$OUT_DIR/claude-feature-keys.json"`（即 39e81ea 模式），negative test 在 mutation 分支 exit 0（说明退化），test 整体 exit 非 0。

**PR artefact**：normal PR（**非 draft**），title `test(verify-kit): add hardmatch regression guard (#64)`；body 含 Quick checklist + research/plan/report 链接 + judge.json 摘要；`/export` transcript 附 PR description。

**Anti-goal 核查**：`fixtures/expected-product-features.json` ↔ `docs/系统展示.md` Canonical TL;DR 仍 byte-equal；`verify-claude-stream-json.sh` / `verify-tmux-interactive.sh` / `verify-dashboard-health.sh` / `claudefast-stream-json-flags.sh` 文件 hash 未变；`hardmatch-features.sh` 行 8/9/11/13 主逻辑不动，仅顶部多 1 行注释。

## ③ How-to-verify（third-party judge harness）

### 3a. 项目级 1+2+3 gate 适用性

`docs/feature-verification.md` 的 1+2+3 gate 是给暴露 `--help` 的 CLI module 用的。本 PR 改的是 verify-kit 内部脚本（无 `--help`），所以 1+2+3 gate **不直接适用**。但 `bash docs/feature-verify-kit/run-all.sh` 自带的 `verify-claude-stream-json.sh` 跑完之后 hardmatch 会被自动调用，是天然的 end-to-end 自检。

### 3b. Plan-specific judge harness（必须）

```text
   ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐
   │   RUN    │ → │    DUMP    │ → │   READ   │ → │ VERDICT  │
   │ probes   │   │ judge.json │   │ LLM      │   │ report.md│
   │ fixed    │   │ + raw logs │   │ judge    │   │ PASS/FAIL│
   └──────────┘   └────────────┘   └──────────┘   └──────────┘
        ↑                                              │
        └──────────────── feedback loop ───────────────┘
```

**RUN（固定 4 步）**

1. `bash docs/feature-verify-kit/run-all.sh > .judge/<run_id>/run-all.stdout 2> .judge/<run_id>/run-all.stderr`（验证 hardmatch 在真实 LLM 输出上仍 PASS）。
2. `bash docs/feature-verify-kit/test-hardmatch-regression.sh > .judge/<run_id>/regression.stdout 2> .judge/<run_id>/regression.stderr`（验证 negative test 既能检出 mutated value，又能确认 byte-equal fixture pass）。
3. `git diff main..HEAD -- docs/feature-verify-kit/hardmatch-features.sh > .judge/<run_id>/hardmatch.diff`（核查 anti-goal：line 8、9、11、13 不动）。
4. `pnpm typecheck > .judge/<run_id>/typecheck.log`（防 collateral 破坏）。

**DUMP** → `.judge/<run_id>/judge.json` schema：

```json
{
  "run_id": "<YYYYMMDDTHHMMSSZ-issue64>",
  "exit_codes": { "run_all": 0, "regression_test": 0, "regression_neg_branch": "<non-zero>", "regression_pos_branch": 0, "typecheck": 0 },
  "metrics": { "hardmatch_full_diff_present": true, "hardmatch_keys_only_absent": true, "non_blank_check_present": true, "fixture_byte_match_canonical": true, "regression_test_in_run_all": true, "anti_goal_files_unchanged": true },
  "evidence_dir": ".judge/<run_id>/", "stdout_path": ".judge/<run_id>/run-all.stdout", "stderr_path": ".judge/<run_id>/run-all.stderr"
}
```

**READ（独立 judge）**：`claudefast -p --output-format stream-json --include-partial-messages --debug hooks --debug-file .fastprobe/issue64/judge.debug.log --permission-mode acceptEdits --json-schema '{verdict,evidence_refs,blockers}' "Read .judge/<run_id>/judge.json + hardmatch.diff. Return ONLY {verdict: PASS|FAIL|PARTIAL, evidence_refs: [paths], blockers: [strings]}." > .judge/<run_id>/verdict.jsonl`。

判定：任一 metric ≠ true → FAIL；`regression_neg_branch` = 0 → FAIL（退化未检出）；`run_all` ≠ 0 → FAIL；`hardmatch.diff` 含非顶部注释实质改动 → FAIL；其余 → PASS。**author / executor / 被测代码不当 judge**。

## ④ Claudefast probes（在 coding 前跑，evidence 入 `.fastprobe/issue64/`）

### Step 1 — orient（已完成）

`claudefast -h | head -50` 已跑。确认 `-p` / `--output-format stream-json` / `--include-partial-messages` / `--debug hooks` / `--debug-file` / `--permission-mode` / `--json-schema` 全部支持。

### Step 2 — heavy + needs conclusion（≤ 8 parallel `-p` probes）

已用 git/grep/Read 直接答完的（不重复跑）：✓ `9c78f99` restore full diff；✓ fixture byte-match canonical TL;DR；✓ PR #62 closed not merged；✓ 当前无 negative regression test。

实施前必须跑的 probes：

| # | Probe prompt | evidence |
|---|--------------|----------|
| P1 | Read `hardmatch-features.sh` + `README.md`，一段话判 keys-only vs full diff，带行号。 | `.fastprobe/issue64/p1-hardmatch-judge.jsonl` |
| P2 | Read `docs/feature-verification.md`，列 1+2+3 exit-code invariants，带行号。 | `.fastprobe/issue64/p2-1plus2plus3.jsonl` |
| P3 | 构造把 `positioning` 值改 1 个汉字的 mock `claude-features.json`，只返 JSON。 | `.fastprobe/issue64/p3-mutation-fixture.jsonl` |
| P4 | Read `.gitignore`，确认 `runs/` 已 ignore，列 version-controlled vs generated。 | `.fastprobe/issue64/p4-gitignore.jsonl` |

P1/P2 锚定 plan 结论；P3 选 mutation 字符；P4 防把生成产物误提交。

### Step 3 — audit-grade evidence（stream-json）

```bash
mkdir -p .fastprobe/issue64
claudefast -p \
  --output-format stream-json --include-partial-messages --verbose \
  --debug hooks --debug-file .fastprobe/issue64/regression.debug.log \
  --permission-mode acceptEdits \
  "Run docs/feature-verify-kit/test-hardmatch-regression.sh and report the exit codes of both branches." \
  > .fastprobe/issue64/regression-stream.jsonl
```

artefact + hook debug log → PR body 链接 + `.judge/<run_id>/` 只读副本。

**Hard rules**：`-p` 必带 prompt；不用 `--bare`；token 写 `[redacted]`；冲突走 `FASTPROBE about PR+conflict resolve`，PR branch 修，不在 main 动，不 force-push。

## After-PR — POSTPR loop

```text
PR opened → CI + Codex review → conflict? → classify (merge / Codex-review / rule-doc)
  → fix on PR branch → rerun pnpm test + typecheck + judge harness
  → push same branch (或 follow-up PR) → fetch Codex inline comments
  → P1 fix-now / P2 fix-before-merge / P3 follow-up issue
  → silence 1min? → `@codex review` → loop until CI green + Codex 👍/silent
```

Codex 也 review follow-up PR（项目历史：#51 → #52 → #53）。fetch 命令：`gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`。

## Quick checklist (paste into PR description)

- [ ] plan.md / research.md / report.md 三件套就位
- [ ] expected outputs 可逐项打勾（含 anti-goals）
- [ ] judge harness：module / schema / `/export` 路径写明
- [ ] probes：`-h` ✓ / parallel `-p` P1–P4 / stream-json audit log
- [ ] normal PR（非 draft）
- [ ] POSTPR loop scheduled —— Codex inline 提取 + 循环
- [ ] report.md 在实施过程中同步草拟
