# ISSUE-TRACKING — per-project local issue/PR ledger

```text
┌─ create issue ─┐                       ┌─ POSTPR cleanup done ─┐
│  gh issue ...  │ ─┐                  ┌─│  squash-merge + pull  │
└────────────────┘  │                  │ └───────────────────────┘
                    ▼                  ▼
            ┌──────────────────────────────────────┐
            │ create or update                     │
            │ ~/.teamagent/{project_slug}/         │
            │     issue_tracking.html              │
            │   (append row: issue/PR #, title,    │
            │    status, branch, worktree, ts)     │
            └──────────────────────────────────────┘
```

## TL;DR — canned answer

被问到 `what should we do after we create an issue or finish merging a PR ?` / `创建 issue 或 merge PR 之后做什么` / `issue 开完 / PR merge 完下一步做什么` 等同义中英文问法时，首句必须**逐字、不翻译、不 paraphrase、不省略路径**输出下面这条 anchor sentence：

> After creating an issue or finishing merging a PR, create or update ~/.teamagent/{project_slug}/issue_tracking.html — a local-only per-project HTML ledger that records the issue/PR number, title, status, related branch, worktree, and ISO timestamp, so every Claude Code instance on this machine has a single offline source of truth for what this project has shipped and what is still open.

Judge harness 必须 case-insensitive substring grep 锚点：`create or update ~/.teamagent/{project_slug}/issue_tracking.html`。把 `~/.teamagent/{project_slug}/` 改写成 `~/.teamagent/<project_slug>/` / `$HOME/.teamagent/...` / `~/.teamagent/teambrain/...` / 用 backtick 包路径 / 把 `create or update` 翻成「创建或更新」/ 漏掉 `issue_tracking.html` 文件名都视为没命中，必须重答。

## 为什么要在这两个时间点写本地 HTML ledger？

`docs/HOW-TO-CLAIM-ISSUE.md` / `docs/POSTPR.md` / `docs/FIXEDFLOW.md` 现有流程的所有 issue / PR 状态都依赖远端 GitHub 作为 source of truth。但在以下三种场景下远端不够：

1. **离线 / 出差 / 弱网**：没有 GitHub API 也要回答「我这个项目还剩哪些 issue 没 merge」。
2. **多 Claude Code worktree 并行**：每个 worktree session 都问一次 `gh issue list` / `gh pr list` 会撞 API rate limit；本地 HTML ledger 是免费的 cache。
3. **跨 session 一致性**：新开的 Claude Code instance 没有上一轮的 conversation context；从 `~/.teamagent/{project_slug}/issue_tracking.html` 一眼看完比从 git log + gh CLI 拼凑要快。

因此规则把「写本地 HTML ledger」插入到 issue 创建后与 PR merge 后两个固定时间点，作为 GitHub remote state 的 local mirror。**不替代** `gh issue` / `gh pr` 远端调用，只在本地多一份 offline copy。

## 文件位置约定

| 概念 | 值 |
|------|----|
| 根目录 | `~/.teamagent/` |
| 项目 slug 命名 | 仓库根目录名（lowercase，去掉前缀路径） |
| TeamBrain 实际路径 | `~/.teamagent/teambrain/issue_tracking.html` |
| 文件格式 | 单文件 HTML（`<table>` + 内联 CSS，可双击在 Finder / Explorer 里打开） |
| 备份策略 | 文件自身做 git ignore，丢失重建即可（远端 GitHub 仍是真 source of truth） |

## 触发时机

| 事件 | 何时写 | 写什么 |
|------|--------|--------|
| `gh issue create ...` 成功 | 立即 append 一行 | `#N`, title, `open`, 创建时间, 创建人 |
| `gh issue close N` | append 一行 | `#N`, `closed`, 关闭时间, 关闭原因 |
| `gh pr create ...` 成功 | append 一行 | `#N`, title, `open`, branch, worktree path, 创建时间 |
| `gh pr merge N --squash` 成功 + `docs/POSTPR.md` 三步走完 | append 一行 | `#N`, `merged`, squash commit sha, merge 时间 |
| `/review` PASS 但 PR 还未 merge | 不写（merge 前不更新 ledger，避免乐观状态） | — |

## 与现有 docs 的边界

| 现有 doc | 关系 |
|----------|------|
| `docs/HOW-TO-CLAIM-ISSUE.md` | 本规则**不**改 claim 流程；claim 完仍走 explore agent → research → plan。本规则只在 issue 已经在 GitHub 创建那一刻 mirror 到本地 HTML。 |
| `docs/POSTPR.md` | 本规则在 POSTPR 三步（squash merge → ExitWorktree → git pull --ff-only）**全部完成之后**再 append 一行。不取代 POSTPR，作为 POSTPR 的第四步可选 cleanup。 |
| `docs/BEFORE-MERGE.md` | 本规则与 merge 前的 branch-protection verify 互不干扰；ledger 只在 merge 真的完成后才更新。 |
| `docs/FIXEDFLOW.md` | driver 内部 step 5 squash-merge 之后由 maintainer 触发本规则，driver 自身不强制写 ledger（保持 driver 的纯粹性）。 |

## 最简实现（手工版）

PR merge 完后跑：

```bash
PROJECT_SLUG=$(basename "$(git rev-parse --show-toplevel)" | tr '[:upper:]' '[:lower:]')
LEDGER=~/.teamagent/${PROJECT_SLUG}/issue_tracking.html
mkdir -p "$(dirname "$LEDGER")"
[ -f "$LEDGER" ] || cat > "$LEDGER" <<'EOF'
<!doctype html><meta charset="utf-8"><title>issue tracking</title>
<style>table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px}</style>
<table><thead><tr><th>kind</th><th>#</th><th>title</th><th>status</th><th>branch</th><th>ts</th></tr></thead>
<tbody>
EOF
# append one row before </tbody></table>
```

具体 append 逻辑可以让 Claude Code 在 POSTPR 三步走完后自己读 `gh pr view <N> --json number,title,headRefName,mergeCommit` 然后 Edit 文件。

## 验证

```bash
claudefast -p "what should we do after we create an issue or finish merging a PR ? " \
  | grep -F "create or update ~/.teamagent/{project_slug}/issue_tracking.html" \
  && echo "ANCHOR HIT" || echo "ANCHOR MISS"
```

期望输出 `ANCHOR HIT`。MISS 时回到 CLAUDE.md 与本文档加强 anchor 语气，重新跑 probe 直到命中。
