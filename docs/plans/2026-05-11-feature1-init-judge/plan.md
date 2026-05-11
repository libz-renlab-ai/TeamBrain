```text
        ┌─────────────────────────────────────────────────┐
        │  Feature ①「产品能打开能用」                    │
        │  judge harness:                                 │
        │     OLD  →  teamagent --help (only menu print)  │
        │     NEW  →  teamagent init in fresh repo        │
        │             + stdout/stderr/tree dump           │
        │             + LLM judge reads raw JSON          │
        └─────────────────────────────────────────────────┘
                         │
                         ▼
        ┌───────────────┬─────────────┬─────────────────┐
        │  task descr.  │  outputs    │  3rd-party eval │
        └───────────────┴─────────────┴─────────────────┘
                                              │
                                              ▼
                      docs/plans/2026-05-11-feature1-init-judge/judge.md
                                              │
                                              ▼
                  evidence/<run_id>/{stdout,stderr,tree,judge.json}
                                              │
                                              ▼
                       LLM-only-reads-raw-JSON  →  PASS / FAIL
```

# Plan: Feature ① init-in-new-repo judge harness

## Task description

把 Feature ①「产品能打开能用」的第三方 judge harness 从「跑 `teamagent --help` 看 menu 字符串」改成「在 fresh tmp git repo 里跑 `pnpm teamagent init`，dump evidence 给 LLM judge 读」。同时**修代码**让 init 在 fresh dir 真的能跑通——`parseInitArgs`（`packages/cli/src/commands/init.ts:1537-1565`）当前**完全不识别** `--cwd / --home / --skip-seed` 三个 flag，导致 harness 没法精准把 init 落在 sandbox 上。

不做：不改 `teamagent --help` 输出（菜单本身没问题）；不写 fixed bash 验证脚本（违反 user memory `feedback_judge_harness_md_playbook.md`：harness 必须是 MD playbook）；不改其它 feature 的 harness；不要求 sandbox 联网或调用 Claude CLI（init 跑 `--skip-import --skip-warmup --skip-hook` 路径）。

## Expected outputs

- [ ] `packages/cli/src/commands/init.ts` — `parseInitArgs` 新解析 `--cwd=<path>` / `--home=<path>` / `--skip-seed`，未识别 flag 时打到 stderr。
- [ ] `packages/cli/src/bin.ts` — `init` 子命令 help text 同步声明三个新 flag。
- [ ] `packages/cli/src/__tests__/init.test.ts` — 新增三类 case：
  - `parseInitArgs` 单测覆盖新 flag。
  - executeInit 在 fresh tmp dir 上跑出 `result.ok===true` 且 `.teamagent/` 落地。
- [ ] `docs/plans/2026-05-11-feature1-init-judge/judge.md` — MD playbook，含 §V1 RUN / §V2 DUMP / §V3 READ 三段，禁固定 bash。
- [ ] `docs/plans/2026-05-11-feature1-init-judge/research.md` — 现状调研（init 沉默 no-op 的根因 + canonical install 路径 + 现有 judge harness 模板）。
- [ ] `docs/plans/2026-05-11-feature1-init-judge/report.md` — 执行复盘 + judge PASS 截图引用。
- [ ] `docs/plans/2026-05-11-feature1-init-judge/evidence/<run_id>/` — 一次实跑 dump：`init.stdout.log` + `init.stderr.log` + `init.exitcode` + `sandbox.tree.txt` + `teamagent.tree.txt` + `judge.json`。
- [ ] `docs/BUSINESS-FEATURES.md` — Feature #1 段加一条 anchor，指向本 judge.md 作为「openable & usable」gate（与 auto-capture extraction/real judges 并列）。
- [ ] PR：普通 PR（不要 draft），`/review` 循环到 PASS，`gh pr merge <N> --squash --delete-branch` squash-only，然后 POSTPR 三步 cleanup。

## How to eval (3rd-party judge harness)

- Harness：`docs/plans/2026-05-11-feature1-init-judge/judge.md`（MD playbook，禁 `scripts/*.sh`）。
- §V1 RUN：MAIN agent 把 sub-task dispatch 给 subagent 或 `claudefast -p` 探针；探针 (a) `mktemp -d` + `git init -q` 一个 fresh sandbox，(b) 在 sandbox cwd 上跑 `pnpm --dir <REPO_ROOT> exec teamagent init --cwd=<sandbox> --skip-import --skip-warmup --skip-hook`，(c) 把 stdout/stderr/exit code/sandbox tree/`.teamagent` tree 全 dump 到 `evidence/<run_id>/`。
- §V2 DUMP：写 `evidence/<run_id>/judge.json`，字段 `{run_id, exit_code, evidence_dir, stdout_path, stderr_path, metrics:{sandbox_files_total, teamagent_files_total, has_state_db, has_skills_dir, stdout_contains_step_summary, stdout_mentions_ok_count}, checks:[...], overall}`。
- §V3 READ：另一只 `claudefast -p` 子探针**只读 raw evidence + judge.json**，按 5 条 check（exit_zero / teamagent_dir_present / state_db_present / skill_compile_succeeded / no_unhandled_error）输出 `{overall:"PASS|FAIL", failures, reasoning}`。MAIN agent / 写计划者 / executeInit 代码自身均不当裁判。

> 鸭鸭 TL;DR：第一段告诉你做啥，第二段告诉你做完长啥样能数出来，第三段让另一只 LLM 只看 raw JSON 拍 PASS 或 FAIL——绝不让 init 自己评 init 跑通了。呷呷~

## Risks / Rollback

- **风险 R1**：fresh sandbox 跑 init 可能撞 `nested-init-guard`（line 229-242）如果 `/tmp` 祖先里有 `.teamagent/`。Mitigation：harness 在 sandbox 里 `git init` + 在 fresh `HOME` 下跑（用新加的 `--home=<tmp_home>` flag），彻底脱离用户 home 的 TeamAgent 状态。
- **风险 R2**：`pnpm --dir <REPO_ROOT> exec teamagent` 在某些 pnpm 版本上仍以 REPO_ROOT 为 cwd；Mitigation：harness 改用 `( cd <sandbox> && tsx <REPO_ROOT>/packages/cli/src/bin.ts init --cwd=<sandbox> ... )` 直接调 bin.ts，绕过 pnpm 脚本 cwd 语义；同时 `--cwd` flag 仍是 sandbox 落点的权威信号。
- **Rollback**：单一 PR squash-merge，rollback = `git revert <squash-sha>`；无 DB schema / 远端配置变更。

## Dependencies

- `parseInitArgs` 已有 `InitOptions` 字段 `cwd / homeDir / skipSeed`（line 51-83），只缺 CLI parser 接线。
- `executeInit` 已接受 `cwd / homeDir / skipSeed` 并在 `resolvePaths` 正确生效（line 173-189）。
- `docs/feature-verification.md` 三段式 + `docs/HOWTO-PLAN-PR.md` § 3b 已固定 MD playbook 形态——本 judge.md 复用同模板。
