```
   __
 <(o.o)___    research: how gstack does (or doesn't) force upgrades
  ( <_< /     captured 2026-05-09 via Explore subagent, read-only scan
   `---'
```

# Research: gstack force-upgrade mechanism

**目的**：在为 TeamAgent 设计 soft-force upgrade 之前，先摸清同机已装的 gstack 实际怎么干。**关键反转**：gstack 自己研究了这个问题，最后**没**真硬来——选了 advisory + escalating snooze + permanent opt-out。

调研方式：Explore subagent，read-only，限制在 `/Users/m1/.claude/skills/gstack/`。

## 1. Trigger

每个 skill 启动时跑 `gstack-update-check`（不是 SessionStart hook，而是 skill 调用早期）。
- `/Users/m1/.claude/skills/gstack/scripts/resolvers/preamble/generate-upgrade-check.ts`
- `/Users/m1/.claude/skills/gstack/bin/gstack-update-check`

另：`bin/gstack-session-update` 在 SessionStart hook 触发，仅当 `auto_upgrade: true` 配置时跑后台升级，永远 exit 0、永不 block。

## 2. Forcing mechanism — NOT actually forced

**Advisory only with opt-out.** 升级完全自愿：preamble 输出 `UPGRADE_AVAILABLE <old> <new>` 时，模型读到这行后调用 `AskUserQuestion` 弹 4 选 1：
- "Yes, upgrade now"
- "Always keep me up to date"（启用 auto_upgrade）
- "Not now"（snooze 24h → 48h → 7d）
- "Never ask again"（`gstack-config set update_check false`）

**No blocking mechanism.** 用户可以 dismiss，继续用旧版。Skills 不会 exit non-zero、不会拒绝执行、不会 deny 工具。

## 3. Version detection

GitHub raw URL fetch + 本地 cache：
- 拉 `https://raw.githubusercontent.com/garrytan/gstack/main/VERSION`
- 缓存到 `~/.gstack/last-update-check`，up-to-date 60min TTL，有 upgrade 720min TTL
- 网络 fail 用 cache fallback
- regex `^[0-9]+\.[0-9.]+$` 校验，防 HTML 错误页

## 4. What's new surfacing — yes, CHANGELOG-driven

`gstack-upgrade/SKILL.md` Step 6 (lines 227-241)：
> "Read `$INSTALL_DIR/CHANGELOG.md`. Find all version entries between the old version and the new version. Summarize as 5-7 bullets grouped by theme. Don't overwhelm — focus on user-facing changes. Skip internal refactors unless they're significant."

输出格式：`gstack v{new} — upgraded from v{old}!\n\nWhat's new:\n- [bullets]\n\nHappy shipping!`

## 5. Opt-out — three knobs

1. `update_check: false` — 永久禁用所有提示（`gstack-config set update_check false`）
2. Snooze 退避 — `~/.gstack/update-snoozed`，level 1=24h、2=48h、3+=7d
3. `auto_upgrade: true` — 默认 false，opt-in
4. Env: `GSTACK_AUTO_UPGRADE=1`

## 6. Hook examples

**没用 PreToolUse / PreToolUseBlock。** 实际只用：
- SessionStart hook → `bin/gstack-session-update`，永远 exit 0
- Preamble injection → 不是 hook，是 skill markdown 里的指令注入，靠模型读完后主动调 AskUserQuestion

**No Claude Code hooks configured in settings.json** — 升级机制全在 skill preamble 和 bin 工具里。

## Takeaway for TeamAgent

**gstack 选 advisory 是有理由的**：硬来 = 用户每次开会话先卡升级提示 = 怒删工具。我们走方向 (b)（gstack-style）就是承认这个 tradeoff。

**TeamAgent 与 gstack 的实现差异**：
- gstack 走 skill preamble 注入 → 依赖模型读到 `UPGRADE_AVAILABLE` 后主动调 AskUserQuestion
- TeamAgent 已有真 SessionStart hook（`bin-session-start.ts`），可直接 stderr 输出 banner + CLI 三选一指令。无需走 AskUserQuestion 模型 dance，更可测试、更可靠。
- CHANGELOG 解析逻辑 100% 可复用 gstack 的策略：5-7 个 bullet、按 theme 分组、跳内部 refactor。
