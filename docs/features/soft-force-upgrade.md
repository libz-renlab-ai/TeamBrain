```
   __
 <(o.o)___    soft-force upgrade prompt
  ( <_< /     issue #225 — gstack-style A/B/C banner with snooze
   `---'
```

# Feature: Soft-Force Upgrade Prompt (issue #225)

**TL;DR**：每次 SessionStart 升级提示从沉默 advisory banner 升级为 gstack 风格的三选一弹窗。snooze 退避 24h → 48h → 7d；`--never` 永久关；CHANGELOG 自动渲染 5-7 个 user-facing bullet。

## 用户看到什么

第一次开 Claude Code（旧版本 + 后台已发现新版）：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TeamAgent 0.10.5 可用 (你装的是 0.10.1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

本次新增:
  • [Added] Soft-force upgrade prompt — 三选一弹窗, snooze 退避
  • [Fixed] Issue #158: Windows install no longer destroys teamagent
  • [Fixed] warmup exits 0 with friendly skip message
  • [Changed] Hooks staged at ~/.teamagent/hooks/

三选一:
  A) teamagent update --now      立刻升级 (前台执行, 几十秒)
  B) teamagent update --snooze   下次再说 (24h → 48h → 7d 退避)
  C) teamagent update --never    永远别问 (--enable 可恢复)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

什么都不动 → 下次 SessionStart 再弹。

## 三个选项的语义

```
                             user 不响应 → 下次再弹
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
   teamagent                 teamagent                 teamagent
   update --now              update --snooze           update --never
        │                         │                         │
        ▼                         ▼                         ▼
   前台执行 npm i           snooze_level += 1        never_prompt = true
   (几十秒)                 snooze_until_ts +=       永久禁银幕 banner
   清 snooze, 清 never        24h → 48h → 7d        (auto-update 仍开)
```

### `teamagent update --now`
立刻在前台跑 updater。会清 `snooze_level` `snooze_until_ts` `never_prompt`，重置为「下次再有新版正常提示」。

### `teamagent update --snooze`
本轮静音；snooze_level 加 1，snooze_until_ts 按 24h → 48h → 7d 三档退避。第 N 次 snooze 时，banner footnote 会显示 `(已 snooze N 次, 下次 snooze 将延长退避窗口)`。

### `teamagent update --never`
永久关 banner（写 `never_prompt=true`）。**注意**：auto-update 本身不关——你仍可以手动跑 `teamagent update --now`，只是不再被打扰。撤销：`teamagent update --enable`。

### `teamagent update --enable`
原本只清 `auto-update.disabled` marker；issue #225 起还把 `never_prompt`、`snooze_level`、`snooze_until_ts` 全部重置为默认值。完整复位升级提示状态用这一条。

## env 变量

| 变量 | 作用 | 持久化 |
|------|------|--------|
| `TEAMAGENT_NEVER_PROMPT=1` | 当前进程不显示升级 banner | 否（运行时 only） |
| `TEAMAGENT_AUTO_UPDATE=0` | 不轮询远端 | 否 |
| `TEAMAGENT_HOME=<dir>` | 改 state file 位置（测试用） | 否 |

`TEAMAGENT_NEVER_PROMPT` 适合 CI / dogfood probe — 不写状态，不影响真实用户。

## 看本版变更：`teamagent whatsnew`

```bash
teamagent whatsnew                  # 最新版的变更
teamagent whatsnew --since 0.10.1   # 从 0.10.1 起的全部变更
teamagent whatsnew --until 0.10.2   # 截至 0.10.2
teamagent whatsnew --limit 3        # 只显示前 3 条
```

输出格式与 SessionStart prompt / `teamagent init` 末尾的 "🆕 本次新增" 一致——三处共用 `parseChangelog` + `renderWhatsNewTail`。

## 状态文件

`~/.teamagent/update-state.json` 多了三个字段（向后兼容，旧 state 缺字段时填 default）：

```json
{
  "snooze_until_ts": 1715342400000,
  "snooze_level": 2,
  "never_prompt": false
}
```

`teamagent update --status` 顺便打印这三个字段，方便 support 排查「为啥 banner 不弹」。

## 回滚 recipes

| 想要 | 执行 |
|------|------|
| 永远不再看 banner（保留 auto-update） | `teamagent update --never` |
| 静音 24h | `teamagent update --snooze` |
| 把全部状态恢复出厂 | `teamagent update --enable` |
| 整个 auto-update 禁掉（含轮询） | `teamagent update --disable` |
| 旧 advisory 行为（不弹 A/B/C） | 编辑 `~/.teamagent/update-state.json` 设 `never_prompt: true` 然后写 `auto-update.disabled` marker；或全程 `TEAMAGENT_NEVER_PROMPT=1 TEAMAGENT_AUTO_UPDATE=0` |
| 单个 SessionStart 不要 banner | `TEAMAGENT_NEVER_PROMPT=1 claude` |

## 实现入口

| 模块 | 位置 |
|------|------|
| 纯函数 — snooze 状态机 | `packages/core/src/update/snooze.ts` |
| 纯函数 — CHANGELOG parser | `packages/core/src/update/changelog-parser.ts` |
| 纯函数 — banner 文案 | `packages/core/src/update/prompt-text.ts` |
| State schema 扩展 | `packages/core/src/update/update-state.ts` |
| Imperative shell — banner 触发 | `packages/cli/src/session-start-logic.ts:maybeShowUpgradePrompt` |
| Imperative shell — CLI 子命令 | `packages/cli/src/commands/update.ts` (`--snooze` `--never`) |
| 新命令 | `packages/cli/src/commands/whatsnew.ts` |
| Bundling — CHANGELOG copy | `packages/teamagent/tsup.config.ts` `onSuccess` |
| Bundling — 加载 dist/CHANGELOG.md | `packages/cli/src/changelog-loader.ts` |

## 与 gstack 的差异

| 维度 | gstack | TeamAgent |
|------|--------|-----------|
| 触发点 | skill 启动早期 preamble | SessionStart hook stderr |
| 选择 UI | `AskUserQuestion`（模型 dance） | 直接 stderr banner（更可测试） |
| 持久化 | `~/.gstack/last-update-check` + `~/.gstack/update-snoozed` | 单个 `~/.teamagent/update-state.json` |
| 永久关 | `gstack-config set update_check false` | `teamagent update --never` |
| 退避档 | 24h → 48h → 7d | 24h → 48h → 7d |
| What's new | CHANGELOG 5-7 bullets | CHANGELOG 5-7 bullets |
| Auto-upgrade opt-in | `gstack-config set auto_upgrade true` | `teamagent update --now`（手动） |

设计参考详见 `docs/plans/2026-05-09-issue-225/research.md`。
