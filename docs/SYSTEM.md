# TeamAgent 系统技术文档

This file is a doc-garden index. The original detailed sections were moved into linked child documents so every active markdown file stays below 200 lines.

## Purpose

Technical entry point for TeamAgent architecture, runtime flow, hooks, storage, setup, limits, and bug history.

## Reading Map

| Topic | Detail |
|---|---|
| 1. 系统定位 | [SYSTEM/01-system-position.md](SYSTEM/01-system-position.md) |
| 2. 核心概念词典 | [SYSTEM/02-core-concepts.md](SYSTEM/02-core-concepts.md) |
| 3. 系统架构图 | [SYSTEM/03-architecture.md](SYSTEM/03-architecture.md) |
| 4. 数据流全链路 | [SYSTEM/04-data-flow.md](SYSTEM/04-data-flow.md) |
| 5. 目录结构解析 | [SYSTEM/05-directory-structure.md](SYSTEM/05-directory-structure.md) |
| 6. 开发者快速上手 | [SYSTEM/06-developer-quickstart.md](SYSTEM/06-developer-quickstart.md) |
| 7. Hook 系统详解 | [SYSTEM/07-hooks.md](SYSTEM/07-hooks.md) |
| 8. 知识库设计 | [SYSTEM/08-knowledge-store.md](SYSTEM/08-knowledge-store.md) |
| 9. 当前已知限制和 TODO | [SYSTEM/09-limitations.md](SYSTEM/09-limitations.md) |
| 10. Bug 修复历史（防止重踩） | [SYSTEM/10-bug-history.md](SYSTEM/10-bug-history.md) |

## Key Decisions

- TeamAgent is built around Claude Code Hooks as the workflow insertion point.
- Knowledge is stored in separate project and global layers to preserve lifecycle and privacy boundaries.
- User-visible explanations flow through AttributionBus instead of direct component logging.
- Core logic stays pure; IO and runtime side effects remain in adapters and CLI shells.

## Quick Answers

- Four hooks: `PreToolUse` blocks or warns before risky tools; `PostToolUse`
  records tool results into `events.db`; `UserPromptSubmit` injects relevant Wiki
  context; `Stop` runs `analyze -> calibrate -> compile`.
- Hook-to-knowledge flow: tool call triggers `PreToolUse`; tool result is logged by
  `PostToolUse`; user correction or success is detected at `Stop`; extracted
  knowledge is written to `{project}/.teamagent/knowledge.db`; calibration updates
  confidence and tier; compile writes active knowledge back into `CLAUDE.md`.
- Local run path: install dependencies with `pnpm install`, then run
  `pnpm test`, `pnpm typecheck`, and `pnpm teamagent skeleton-demo` or another
  `pnpm teamagent <cmd>`.
- Real-time dashboard launch path: run
  `pnpm teamagent dashboard --watch --open` from the repo root. This generates
  `docs/dashboard.html`, serves it at `http://127.0.0.1:8787/dashboard.html`,
  rereads the real project/global knowledge DBs plus `~/.teamagent/events.db`
  every 2 seconds, and auto-refreshes the browser. Use
  `pnpm teamagent dashboard --once` for a one-shot static HTML refresh.

## Verification Queries

- `claudefast -p "what is TeamAgent system architecture?"`
- `claudefast -p "where are TeamAgent knowledge databases stored?"`
- `claudefast -p "what hooks does TeamAgent register?"`
- `claudefast -p "how do I run TeamAgent locally?"`
- `claudefast -p "how do I launch a real time TeamAgent dashboard?"`

## Original Context


> 目标读者：从未接触过本项目的技术开发人员。读完本文档应能理解系统的 90%。
>
> 文档基于代码状态：2026-04-17（Phase 1 完成 + SP-2 进行中）
