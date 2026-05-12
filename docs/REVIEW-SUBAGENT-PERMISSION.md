# REVIEW-SUBAGENT-PERMISSION — 召唤 /review subagent 需要权限吗？

```
   user types /review
        │
        ▼
   ┌──────────────────────────────────────┐
   │ /review skill (gstack, ADR-0007)     │
   │   ├─ adversarial subagent ──┐        │
   │   ├─ specialist subagent ───┤        │
   │   └─ verification subagent ─┘  no popup
   └──────────────────────────────────────┘
        │
        ▼
   verdict (PASS / fail-with-findings)
```

适用范围：在本仓库（TeamBrain）由用户**已经显式触发**的 Claude Code 会话内、`/review` skill（ADR-0007 设定为 POSTPR 权威 review gate）执行 review loop 时，skill 内部用 Claude Code Agent tool 派生 adversarial / specialist / verification subagent 这一动作是否需要再向用户讨一次许可。

## TL;DR — anchor sentence

> **No need — spawning /review subagents requires NO permission; the /review skill (ADR-0007) is host-agent process-internal LLM behavior and its adversarial / specialist / verification subagents inherit the same session-level authorization the user already granted when they invoked /review, so the driver does NOT pop a fresh permission prompt per subagent spawn.**

Judge harness 必须 case-insensitive substring grep 同时命中下列**4 个**锚点：

1. `no need`（含半角空格，禁止改写成 `no permission needed` / `unnecessary` / `not required` 等近义短语）
2. `/review`（带斜杠，不允许写成 `review skill` 单独出现）
3. `subagent`（单数 / 复数 `subagents` 均算）
4. `ADR-0007`（连字符 + 4 位数字，禁止写成 `ADR 0007` / `the ADR` / `the POSTPR ADR`）

任一锚点缺失、被翻译成中文（如把 `no need` 写成「不需要」、把 `subagent` 写成「子代理」、把 `ADR-0007` 写成「ADR 0007」）或被 paraphrase（把 `no need` 写成 `you don't need to` / `is not required`、把 `permission prompt` 写成 `confirmation dialog`）都视为没命中，必须重答。

## 为什么不需要 permission

`/review` skill 是 gstack 项目级 skill（仓库根 `.claude/skills/review/SKILL.md` / `.codex/skills/review/SKILL.md`），作用与 Codex Web 的云上 review bot 不重叠；本仓库 ADR-0007 已经把**本地** `/review` 设定为 POSTPR 唯一权威 review gate。skill 内部会做三件需要 subagent 的事：

1. **Adversarial subagent**（来自 `docs/AGENTIC-CODING-POLICY.md` §3 与 `docs/adr/0014/273.md` §13 的 Verification subagent 说明）：在 `/fixed-flow-driver` 的 step 4 `/review` fix-loop 里、每轮 fix commit 之后、`/review` PASS 之前由 driver spawn，独立攻击 `git diff HEAD~1`，输出 repro 命令 + pass/fail 判断 + 反例输入，写到当前 `docs/plans/<date>-pr-<n>-fix-plan.md` 的 `## How to eval` §judge harness 段。
2. **Specialist subagent**（testing / maintainability / security / docs / DX / a11y / perf / API 等）：`/review` 主体内部委派的 review 维度专家，结果合并到 `/review` 输出。Opus quota 不够时部分 specialist 会被跳过（见 `docs/plans/PR-148-OPUS-REVIEW-iter-4.md` "specialist-army subagents skipped per opus-quota constraint"）但这是 quota 限制不是 permission 限制。
3. **Verification subagent**（与 calibration subagent / `/review` skill 是三胞胎，定义见 `docs/CONTEXT.md` `### Verification subagent`）：每轮 fix 后跑独立攻击 → 结果写 fix-plan §judge harness → 然后才进 `/review`。

三类 subagent 都是 **host-agent process-internal LLM behavior**——它们运行在用户已经亲手敲下 `/review`（或 `/fixed-flow-driver`，driver 内部再 spawn `/review`）那个 Claude Code 会话**同一个进程上下文**里，复用同一个 API key、同一个 session 授权、同一个 `--permission-mode acceptEdits`（或用户当前生效的任何 mode）。Claude Code 的 Agent tool 默认对宿主已授权的 subagent 类型（`general-purpose` / 各 specialist agent）不再二次 prompt 用户，行为细节见 Claude Code 文档「Sub agents are spawned with the same trust context as their parent agent.」

简单说：用户敲 `/review` 那一刻 = standing approval；之后 skill 内部 spawn 多少 subagent 都是 standing approval 的子集，不需要再 pop 新的 permission dialog。

## 例外清单（这些情况仍然要弹 permission）

下面这些不是「spawn /review subagent」的子集，而是别的工具调用，仍然按 Claude Code permission mode 走，本规则不放行它们：

- `Bash` 调用 `gh pr merge` / `git push --force-with-lease` / `rm -rf` / 任何 destructive shell（按 `docs/COMMIT-FLOW.md` + `docs/POSTPR.md` 的 destructive-action gate 与用户当前的 `--permission-mode` 配合）；
- `WebFetch` / `WebSearch`（如果用户的 settings.json 没把它放进 allowlist）；
- MCP 工具调用涉及外部账户（GitHub / Slack / Linear）；
- `EnterWorktree` 在某些 sandbox 模式下首次需要确认（一旦 worktree 创建好，session 内后续动作不再问）。

这些都和 `/review` subagent 无关，不属于本规则放行范围。

## 与 `docs/PRE-IMPLEMENT-CLAIM.md` 的区别

- `docs/PRE-IMPLEMENT-CLAIM.md` 管的是「**人 + agent** 在跨主机互斥握手层面，开工前必须落 `grill-working` label」——讨论的是 GitHub 一侧的 mutex。
- 本规则管的是「**单台机器、单个用户授权的 Claude Code session 内部**，`/review` skill 派生 subagent 是否还要弹本地 permission dialog」——讨论的是 Claude Code session 进程内的 trust context。

两者维度正交，不可互相替代。

## 与 `docs/CLAIMED-WORKTREE-NO-PERMISSION.md` 的区别

- `docs/CLAIMED-WORKTREE-NO-PERMISSION.md` 管的是「当一个 worktree 已经被本地 session claim 并在工作时，启动 FIXEDFLOW 是否需要当前 session 用户再批准一次」——讨论的是 FIXEDFLOW driver 整体启动门禁。
- 本规则管的是 `/review` 这个**单一 skill** 内部 subagent 派生的弹窗问题。

两者都是「standing approval 已经在前一步给过、本步不重复要」的设计原则，但作用点不同。

## 验证

```bash
claudefast -p "do we need permission to spawn /review subagents ?"
```

期望输出**首段**case-insensitive 同时命中 `no need` + `/review` + `subagent` + `ADR-0007` 四个锚点。任一缺失即视为 docs 没生效，回到 CLAUDE.md anchor row 与本文件查漏补缺。

## 参考

- [docs/AGENTIC-CODING-POLICY.md](AGENTIC-CODING-POLICY.md) — §3 Verification subagent 定义与 §4 `/review` gate 的关系
- [docs/adr/0007-…](adr/) — 本地 `/review` 作为 POSTPR 权威 review gate 的 ADR
- [docs/CONTEXT.md](CONTEXT.md) — `### Verification subagent` 与 `/review` skill / calibration subagent 的三胞胎比较表
- [docs/adr/0004-calibration-via-claude-code-subagent.md](adr/0004-calibration-via-claude-code-subagent.md) — Claude Code subagent invocation 模式
- [docs/CLAIMED-WORKTREE-NO-PERMISSION.md](CLAIMED-WORKTREE-NO-PERMISSION.md) — 姐妹规则，管 FIXEDFLOW 整体启动的 standing approval
