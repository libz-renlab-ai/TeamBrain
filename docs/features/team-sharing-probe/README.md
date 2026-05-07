```text
   ┌─────────────────────────────────────────────────────────────┐
   │ team-sharing-probe                                          │
   │   harness scaffold for issue #82 e2e verification           │
   │                                                             │
   │   default: --dry-run (prints what it would do, hits nothing)│
   │   real:    --real-run (creates GitHub repo, spends tokens)  │
   └─────────────────────────────────────────────────────────────┘
```

# team-sharing-probe — third-party judge harness

Spec: `docs/specs/2026-05-07-issue82-team-sharing-e2e-probe.md`
Plan: `docs/specs/2026-05-07-issue82-team-sharing-plan.md`
Glossary: `docs/CONTEXT.md`

本目录是 issue #82 e2e probe 的可执行 scaffold。**默认 dry-run**：打印每一步会做什么但不真碰 GitHub、不真跑 claudefast。`--real-run` 才会触发真动作。

---

## Files

| 路径 | 角色 |
|---|---|
| `run-judge.sh` | orchestrator；按 spec §6 run 生命周期跑一遍；每跑写 `tmp/.judge/team-sharing-probe/<run_id>/` |
| `prompts/scenario-designer.md` | blind 协议 prompt：仅得 `trigger_phrase`，输出 25 prompts JSON |
| `prompts/judge.md` | judge LLM prompt：只看 raw artifacts，不看 rule body |
| `README.md` | 本文件 |

## Prerequisites

- `pnpm install` 已跑过
- `claudefast` 在 PATH 上（CLAUDE.md `claudefast 约定`）
- `gh` CLI logged in（`gh auth status` 通过）
- `tmux` 可用（C3-hybrid 拓扑）
- `jq` 可用（合成 judge.json）

## Env vars

| 名 | 必填 | 含义 |
|---|---|---|
| `PROBE_REPO_OWNER` | yes | 默认 `libz-renlab-ai` |
| `PROBE_REPO_NAME` | yes | 默认 `TeamBrain-team-sharing-probe` |
| `PROBE_AUTHOR_EMAIL` | yes | alice 端 git config user.email；建议 `alice@probe.example` |
| `PROBE_TEAMMATE_EMAIL` | yes | bob 端 git config user.email；建议 `bob@probe.example` |
| `BRANCH_PROTECTION` | yes | `off` 或 `on`；调用方提前在 GitHub 端配好 |
| `K_COUNT` | no | 默认 5 |
| `N_COUNT` | no | 默认 20 |
| `CLAUDEFAST_BIN` | no | 默认 `claudefast` |
| `GH_TOKEN` / `GITHUB_TOKEN` | yes（real-run） | token 永不写入文件 / URL，仅由 `gh auth setup-git` 注入 git credential helper |

注意：

- CLAUDE.md 明文规定 token 在文档 / 测试 / commit 中只能写 `[redacted]`；本 harness 严守。
- 远端 URL 用 **HTTPS**（`https://github.com/...`），不用 SSH (`git@github.com:...`)。原因：token-only 环境（CI / bot）没有 SSH key 也能推。harness 在 real-run 起手会跑 `gh auth setup-git`（idempotent），让 git 用 gh 的 credential helper 自动认证，token 永不出现在 stdout / stderr / git remote URL。

## Static gates

```bash
bash -n docs/features/team-sharing-probe/run-judge.sh    # 语法
shellcheck docs/features/team-sharing-probe/run-judge.sh # 可选；本仓库没强制
```

## Dry-run（默认；安全）

```bash
BRANCH_PROTECTION=off bash docs/features/team-sharing-probe/run-judge.sh --dry-run
```

输出每一步会跑的命令；不创建 GitHub repo、不跑 claudefast、不写 evidence。

## Real run（hit GitHub + spend tokens）

```bash
# Step 0 一次性准备：
gh repo create libz-renlab-ai/TeamBrain-team-sharing-probe --public --confirm

# Step 1 第一遍 protection=off：
BRANCH_PROTECTION=off \
  bash docs/features/team-sharing-probe/run-judge.sh --real-run

# Step 2 GitHub 端启用 main 保护：
gh api -X PUT repos/libz-renlab-ai/TeamBrain-team-sharing-probe/branches/main/protection \
  --input docs/features/team-sharing-probe/branch-protection.json   # TODO（执行时手 craft）

# Step 3 第二遍 protection=on：
BRANCH_PROTECTION=on \
  bash docs/features/team-sharing-probe/run-judge.sh --real-run
```

## Exit codes

per `2026-05-07-issue82-team-sharing-e2e-probe.md` §7：

| code | 含义 |
|---|---|
| 0 | 当前 run 的 pass 公式满足 |
| 1 | metric 偏离阈值 |
| 2 | scenarios sha256 不一致 |
| 3 | attribution chain 断裂 |
| 4 | claudefast / git / pnpm 系统级失败 |
| 5 | branch_protection=on 但 push 居然成功（M5 spec 假设破裂） |

## What this harness does NOT do

- **不**改 hook bin / 不加 instrumentation（C3-strict 留给 follow-up）
- **不**测 LWW / tombstone（已被 `xsync/run-judge.sh` 覆盖）
- **不**测闸门 1 / 闸门 2（已被 `pii-redaction/run-judge.sh` 覆盖）
- **不**自动开 follow-up issue（HOWTOISSUE / `/to-issues` 由 user 触发）
- **不**修改主仓库 `libz-renlab-ai/TeamBrain` 的任何分支或保护设置
