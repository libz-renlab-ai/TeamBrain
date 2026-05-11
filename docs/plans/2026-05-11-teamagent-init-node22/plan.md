```text
        ┌──────────────────────────────────────────────────────┐
        │  PLAN: ship v0.11.0 to user so teamagent init works  │
        │       in tmux + cd ~/projects/demo-repo on Node 22   │
        └──────────────────────────────────────────────────────┘
            │
            ▼
   research.md   (←  ulid bundle root cause + 16e1a95 fix)
            │
            ▼
   build worktree v0.11.0     ──►  inspect dist/bin.js (no inlined ulid)
            │
            ▼
   npm install -g <worktree>  ──►  global teamagent → v0.11.0
            │
            ▼
   tmux verify in ~/projects/demo-repo   (3rd-party judge harness, judge.md)
            │
            ▼
   report.md + commit + PR + /review PASS + squash-merge + POSTPR cleanup
```

# Plan: ship teamagent v0.11.0 to unblock Node 22 fresh installs

参考 docs/PLAN-RESEARCH-REPORT.md 三段铁律；同目录 `research.md` / `judge.md` / `report.md` 配套。

## Task description

为这台机器上**实际安装**的全局 `teamagent` 升级到 main HEAD 的 v0.11.0（commit `16e1a95` 已修 ulid bundle bug），并在 `~/projects/demo-repo`（新建 + `git init` 后）的 tmux session 里跑 `teamagent init`，确认不再触发 `secure crypto unusable, insecure Math.random not allowed`。

具体动作：

1. 在 worktree 里 `pnpm --filter teamagent build` 生成 `packages/teamagent/dist/`。
2. grep 检查 `dist/bin.js` 不再 inline `ulid@2.4.0/.../index.esm.js`（fix 真在 build 输出里）。
3. `npm install -g /Users/m1/projects/TeamBrain/.claude/worktrees/wise-percolating-rainbow/packages/teamagent`，覆盖现在的 v0.10.1。
4. `teamagent --version` 必须打出 `0.11.0`，不能再炸 ulid。
5. `mkdir -p ~/projects/demo-repo && cd ~/projects/demo-repo && git init`。
6. `tmux new -d -s tb-verify`、`tmux send-keys ... 'cd ~/projects/demo-repo && teamagent init' C-m`，把完整 stdout/stderr/exit_code dump 到 `docs/plans/2026-05-11-teamagent-init-node22/evidence/`。
7. 把验证产出（命令、exit_code、stdout 关键行、`.claude/settings.json` diff）写进 `report.md`，跟 expected outputs 一条条对账。
8. 给 `INSTALL.md` 加一段「装到的是 0.10.x 且 init 报 secure crypto unusable」用户自助升级 hint，给 `CHANGELOG.md` 补一行 user-visible 锚点（仅当 changelog 当前没覆盖到这条用户症状时）。
9. 原子 commit per file edit（CLAUDE.md §开发节奏），开普通 PR（非 draft），跑本地 `/review` 循环直到 PASS，`gh pr merge <N> --squash --delete-branch`，按 `docs/POSTPR.md` 三步 cleanup。

**不做的事**：
- 不动 `packages/teamagent/tsup.config.ts` 或 `package.json` 的 ulid 配置（fix 已在 main，重复改是 churn）。
- 不动 ulid 版本（worktree 是 `^2.4.0`，与 fix 兼容）。
- 不发 npm publish（teamagent 不在公共 registry，本任务范围只是本机自验 + docs gap-fill）。
- 不动 `release` 分支或 `install.sh`（独立工作）。
- 不写新 e2e test suite（既有 issue #158 verification 已经覆盖；本任务是再次本地复现验证）。

## Expected outputs

- [ ] `docs/plans/2026-05-11-teamagent-init-node22/research.md`（本目录已存在）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/plan.md`（本文件）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/judge.md`（third-party md playbook judge harness，§V1/§V2/§V3 三段）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-init.stdout.log`（含 `teamagent init` 完整 stdout）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-init.exitcode.txt`（必须是 `0`）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-version.txt`（必须打 `0.11.0`）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/evidence/ulid-bundle-check.txt`（grep `dist/bin.js` for `ulid@2.4.0` should produce 0 lines AFTER build；before build it's reading installed v0.10.1 which has the inlined block）。
- [ ] `docs/plans/2026-05-11-teamagent-init-node22/report.md`（按 expected outputs 逐条对账 + 偏差 + 残余风险）。
- [ ] `INSTALL.md` 新增 v0.10.x 用户自助升级 hint（最多 10 行；grep `secure crypto unusable`）。
- [ ] `CHANGELOG.md` 新增 user-visible anchor `secure crypto unusable on Node 22`（如果 changelog 没有现成行）。
- [ ] PR opened on GitHub（普通 PR，非 draft），`/review` PASS，squash-merged 到 main，本地 main 跑通 `git pull --ff-only`。

## How to eval (third-party judge harness)

Harness：`docs/plans/2026-05-11-teamagent-init-node22/judge.md`（md playbook，禁固定 bash）。

- **§V1 RUN**：MAIN agent dispatch 三只 subagent / claudefast probe — (a) build + bundle-check probe；(b) install-global + version probe；(c) tmux + cd + teamagent init probe — 全部把 stdout/stderr 落盘 `evidence/`，落盘文件路径写进各 probe 的 stdout 末尾。
- **§V2 DUMP**：每只 probe 写一个 `.judge/<run_id>/<probe>.json`，schema `{tool, exit_code, metrics, evidence_dir, stdout_path}`。`metrics` 至少含 `{ulid_bundled: bool, teamagent_version: str, init_exit_code: int, init_seconds: number}`。
- **§V3 READ**：另一只 `claudefast -p`（haiku，必须独立、不读源码）只 cat 三份 `.judge/*.json` + 必要 evidence 文件首尾 50 行，按 rubric 输出 `pass | fail | uncertain + 下一步`。

Rubric (V3 LLM 读 JSON 时遵守)：

- **PASS** 当且仅当：`metrics.ulid_bundled == false` 且 `metrics.teamagent_version == "0.11.0"` 且 `metrics.init_exit_code == 0` 且 stdout 不含字符串 `secure crypto unusable`。
- **FAIL** 任意上面条件不满足。
- **UNCERTAIN** 任一 probe 缺 `evidence_dir` / `stdout_path`，重跑该 probe，再判一次。

禁止 PR 作者、执行 agent、本地直接 grep 当裁判——必须走 V3 LLM judge。

## Steps（执行序）

1. **Build**：`pnpm --filter teamagent build`，把 `packages/teamagent/dist/bin.js` 产出；grep 验 ulid 没 bundle。
2. **Install -g**：`npm install -g $PWD/packages/teamagent`；`teamagent --version` 必须打 `0.11.0`。
3. **Setup demo-repo**：`mkdir -p ~/projects/demo-repo && cd ~/projects/demo-repo && git init`（如已存在跳过 mkdir / git init）。
4. **tmux verify**：`tmux new -d -s tb-verify 'cd ~/projects/demo-repo && teamagent init >stdout 2>&1; echo $? >exitcode'`，落 evidence。
5. **Doc gap fix**：INSTALL.md 加 10 行 hint；CHANGELOG.md 加一行（必要时）。
6. **Atomic commit**：每个 Write/Edit 单独 commit，message 用 `fix(install): ...` / `docs(install): ...` / `docs(plans): ...`。
7. **PR**：普通 PR，title `fix(install): verify v0.11.0 unbricks Node 22 fresh installs from v0.10.1`。
8. **/review loop**：本地 `/review` 直到 PASS。
9. **Merge**：`gh pr merge <N> --squash --delete-branch`，跑 `docs/POSTPR.md` 三步 cleanup。
10. **/fixed-flow-driver**：merge 完毕后由 user / driver decide 是否还有 grill-ready issue 要处理。

## Risks / Rollback

- **Risk**: 全局覆盖 v0.10.1 后，如果 build 有别的 regression，用户本机 teamagent 也炸。
  - **Mitigation**: §V1 RUN probe 在 install 之前先验 `dist/bin.js --version`（直接 `node packages/teamagent/dist/bin.js --version`），不报 ulid crash 才进 install 步骤。
  - **Rollback**: 重跑 `bash scripts/bootstrap.sh` 或 `curl install.sh | bash` 恢复 release 分支 build。
- **Risk**: tmux 不可用（macOS 默认带 tmux 没安装的极少数）。
  - **Mitigation**: 先 `which tmux`，没有就 fallback 到 `bash -c 'cd ~/projects/demo-repo && teamagent init'` 直跑，judge 仍能判 pass / fail。
- **Risk**: postinstall hook 卡（vector 模型下载、SessionStart hook 注册）。
  - **Mitigation**: `teamagent init` 已有 `--skip-warmup` 等 flag；verify probe 仅看 `init` 是否 exit 0 + 无 ulid crash，不强制等 vector 预热完成。

## Owner / Timeline

- **Owner**: 本 worktree session（MAIN agent）。
- **Timeline**: 单次会话内完成 build → verify → docs → PR；merge 由 `/review` PASS 后立刻执行。
- **Termination clause**: `claudefast -p haiku` 读 `.judge/<run_id>/*.json` 输出 `pass`，且 GitHub PR 状态变成 `MERGED`，本任务完结。

