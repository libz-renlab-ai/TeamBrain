```
   _   _   _  ____   _____  _____
  | | | | | ||  _ \ / ____|| ____|
  | |_| | | || | | | |  __ |  _|
  |  _  | | || |_| | |_| || |___
  |_| |_|_| ||____/ \____||_____|

  Issue #218 judge harness — V1 RUN / V2 DUMP / V3 READ playbook
  feature-verification.md 三段；不让代码自己评，只读 raw judge JSON
```

# Issue #218 judge harness

按 [docs/feature-verification.md](../../feature-verification.md) 三段实现的 third-party judge playbook。原则：固定工具跑 → 固定 JSON dump → 另一只 LLM 只读 JSON 当裁判。**任何 PR 自评 / 被测代码自评一律 reject**。

## V1 RUN — 固定工具

| 工具 | 命令 | 检查点 |
|------|------|--------|
| vitest | `pnpm --filter @teamagent/cli test packages/cli/src/__tests__/init.test.ts` | 3 个新 case 全 PASS |
| typecheck | `pnpm typecheck` | 无 TS 错误 |
| init dry-run | `pnpm teamagent init --dry-run --target both` 在 `.judge/<run_id>/sandbox/` tmpdir | exit 0；stdout 含 FIXEDFLOW banner |
| canonical probe | `claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, what's manual vs auto"` | 命中 5 步 + manual/auto 切分 |
| mirror 一致性 | `diff -q .claude/skills/claim-to-merge/SKILL.md .codex/skills/claim-to-merge/SKILL.md` | 两份文件 byte-identical（exit 0）。仓库整体 mirror 一致性见 `scripts/verify-gstack-skill-mirrors.sh`，但该脚本含 pre-existing 不一致（11 个 .claude skill 未镜像到 .codex），不在本 PR judge 范围内 |

## V2 DUMP — 固定 JSON

dump 到 `.judge/<run_id>/judge.json`：

```json
{
  "issue": 218,
  "exit_code": 0,
  "metrics": {
    "vitest_pass": true,
    "typecheck_pass": true,
    "init_dry_run_exit": 0,
    "stdout_contains_fixedflow_banner": true,
    "stdout_contains_verify_prompt": true,
    "skill_file_present": true,
    "codex_mirror_present": true,
    "user_skill_present_after_init": true,
    "canonical_probe_hit_5_steps": true,
    "canonical_probe_hit_manual_auto": true,
    "mirror_consistency_pass": true
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/init.stdout",
  "probe_path": ".judge/<run_id>/probe.txt"
}
```

`evidence_dir/` 必须含完整 stdout / stderr / probe 输出文本；裁判可读但不可改。

## V3 READ — LLM 裁判

跑：

```bash
claudefast -p "$(cat <<'PROMPT'
你是 TeamBrain Issue #218 的 third-party judge。读 .judge/<run_id>/judge.json 与 evidence_dir 内容，按以下规则给 PASS / FAIL：

PASS 条件（all must hold）:
- exit_code == 0
- vitest_pass && typecheck_pass
- stdout_contains_fixedflow_banner && stdout_contains_verify_prompt
- skill_file_present && codex_mirror_present && user_skill_present_after_init
- canonical_probe_hit_5_steps && canonical_probe_hit_manual_auto
- mirror_consistency_pass

任意 false → FAIL，列出具体 false 项与 evidence 截取。

输出严格 JSON: {"verdict": "PASS"|"FAIL", "reasons": [...], "evidence_refs": [...]}
PROMPT
)"
```

- 裁判 LLM 不得读源码、不得跑工具，只读 JSON + evidence 文件
- 裁判产物落盘 `.judge/<run_id>/verdict.json`
- 任意 metric 为 false → 实施者需写 [PR-PLAN fix-plan](../../PR-PLAN.md) 修后重跑

## claudefast probes（FASTPROBE 并行 ≤8）

- `claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, what's manual vs auto"`
- `claudefast -p "what does pnpm teamagent init print at the end about FIXEDFLOW?"`
- `claudefast -p "what file holds the claim-to-merge skill in this repo?"`
- `claudefast -p "after pnpm teamagent init runs, where is claim-to-merge skill installed user-level?"`
- `claudefast -p "what is TeamBrain's PR-PLAN protocol when /review finds issues?"`
- `claudefast -p "what's the canonical merge command in TeamBrain POSTPR?"`

probe 全过 + V3 verdict=PASS → `/review` 进 POSTPR squash-merge 收尾。
