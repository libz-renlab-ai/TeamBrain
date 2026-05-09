# Project Tools

This is a reference of the tools, workflows, and named commands available in the TeamBrain project.

| Tool | Purpose |
|------|---------|
| `pnpm install` / `pnpm test` / `pnpm typecheck` | 依赖、测试、类型检查 |
| `pnpm teamagent <cmd>` | TeamAgent CLI（M0：`skeleton-demo`） |
| `claudefast` / `!claudefast` | MiniMax fast Claude Code wrapper（详见 `docs/CLAUDEFAST.md`） |
| **`FASTPROBE`** | 本项目调研/审计的 `claudefast` 三步固定组合（详见 `docs/FASTPROBE.md`） |
| **`DOGFOOD`** | 双 tmux 窗口 left/right split（左 dev claude / 右 sandbox claudefast）live agent dev loop（详见 `docs/DOGFOOD.md`） |
| **`BUGREPORT`** | 报 bug 流程：开 issue 在 `https://github.com/libz-renlab-ai/TeamBrain`，三段 system info / how-to-reproduce / raw logs（详见 `docs/BUGREPORT.md`，自动收集 `bash scripts/bugreport-collect.sh`） |
| **`FIXEDFLOW`** | 仓库唯一允许的 issue → PR → merge 工作流：<50 字 issue + grill 评论 + `grill-ready` label 之后，maintainer 在 Claude Code 里**手动**跑 `/fixed-flow-driver` skill 完成 step 3-5（**禁止 watcher / 后台轮询 / 自动 dispatch**）；非此模板的 issue 一律 close；详见 `docs/FIXEDFLOW.md`（取代已归档的 `docs/HOW-TO-ISSUE.md`） |
| **`POSTPR`** | 每个 PR 开完后必做：跑 `/review` skill → triage P1/P2 → loop until /review PASS（详见 `docs/POSTPR.md`） |
| **`PR-PLAN`** | commit-push-pr 之后又找出 issue 时的修法：do NOT merge、do NOT 开 follow-up issue；在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写三段 plan（task / expected outputs / judge harness），用 TEAMWORK 并行修在同一个 PR branch，POSTPR loop 到 /review PASS（详见 `docs/PR-PLAN.md`） |
| **`PRESHIP`** | 发版前给 CEO/VC 小鸭看的 verified-only 产品功能状态 CSV（详见 `docs/PRESHIP.md`） |
| **`TEAMWORK`** | N+1+(2N) 成员 agent 团队模式：N 个 sonnet worker（每人跑 2 个 claudefast probe 更新文档）+ 1 个 opus 1M reporter 汇总验收；lead 必须在非 main 分支/worktree 上操作，绝不在 main 直接工作（详见 `docs/TEAMWORK.md`） |
| **Feature reference** | 每个 feature（Calibrator v2、Team knowledge sharing 等）的 6 节模板入口在 `docs/features/INDEX.md` |
| **`apps/landing/`** | GitHub Pages landing page 子包（`pnpm --filter landing build`）；关联 `docs/plans/issue-84` + `.github/workflows/landing-deploy.yml` |

For FASTPROBE usage patterns, parallel scheduling, stream-json schema, and examples, see `docs/FASTPROBE.md`.
