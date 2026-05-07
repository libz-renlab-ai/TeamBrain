```text
                ┌─────────────────────────────────────────────┐
                │  research.md — issue #117 terminal theme    │
                │                                             │
                │  上下文 / prior art / macOS 平台知识        │
                │  → 喂给 plan.md 的事实底料                  │
                └──────────────────┬──────────────────────────┘
                                   │
       ┌────────────┬──────────────┼──────────────┬────────────┐
       │            │              │              │            │
   issue #117   issue #104     现有 init 流程   iTerm2        Terminal.app
   (本任务)     (statusLine    (init.ts /        DynamicProfiles  .terminal
                不覆盖)        install-hook.ts)   /JSON           plist
```

# Issue #117 — Terminal 主题安装研究

本文件不是计划，是 `plan.md` 的事实底料。`plan.md` 的设计决策必须能反向 trace 到这里的某一节。

## 1. Issue #117 的可验收契约（issue 原文剥离）

issue 原文要求 5 项验证：

| ID  | 名称                                | 关键判据                                                                                        |
|-----|-------------------------------------|-------------------------------------------------------------------------------------------------|
| V1  | 安装期间 stdout 提示 opt-in         | 抓取安装期间 stdout，能命中 `terminal` / `主题` / `Profile` / `theme` 关键字之一，且提供 yes / no / skip 三选项 |
| V2  | 同意后实际装好且可被 Terminal 选中 | iTerm2 DynamicProfiles 目录下落地 JSON 或 Terminal.app 的 `Window Settings` 里出现 `TeamBrain` 命名 Profile |
| V3  | 不破坏用户已有自定义                | 用户原 Profile（例 `MY_OWN_PROFILE`）安装后仍存在；未被覆盖、未被改 default                     |
| V4  | 卸载 / opt-out 能还原               | 卸载只清 TeamBrain 装的 Profile；用户原 default 设置一致；不留垃圾 font 文件                    |
| V5  | claudefast 锚点不退化               | `claudefast -p "what project tools we have?"` 仍含 `FASTPROBE` / `POSTPR` / `TEAMWORK`           |

issue #117 把"实现路径"留空：可以是新命令、可以是 init 子步骤、可以是单独脚本——但**必须满足 V1–V5**。这给我们 scope 自由度。

## 2. 与 issue #104 的设计契约同源

issue #104（`statusLine` 不覆盖）已合并落地，方法论可以**等价复用**到 terminal Profile：

`packages/cli/src/commands/install-hook.ts:222-244`：

```ts
// statusLine 注册。CC 只有一个 statusLine 槽位 — 若用户已有非 teamagent 的
// statusLine（例如 caveman），不覆盖，标记 skipped=true 让调用方打提示。
const existing = settings.statusLine;
if (existing && !isTeamagentStatusLine(existing)) {
  statusLineSkipped = true;
} else {
  settings.statusLine = {
    type: "command",
    command: `node ${shellQuote(toForwardSlash(statusLineEntry))}`,
    _teamagentTag: STATUS_LINE_TAG,
  };
}
```

**核心契约**：

1. 探测用户已有自定义（`existing && !isTeamagentTag(existing)`）。
2. 已有 → **不覆盖**，标 `skipped`，让上层（`init.ts:773` 的 `r.statusLineSkipped`）打提示。
3. 没有 → 注册自己，用 `_teamagentTag` 打标记。
4. 卸载只清"打了 teamagent 标记"的那一份（`install-hook.ts:316-318`）。

Terminal Profile 等价做法：

- iTerm2: 通过 **Profile 名前缀 `TeamBrain `** 与 GUID 命名空间区分。
- Terminal.app: 写入 `Window Settings` 时用键名 `TeamBrain Default` / `TeamBrain Solarized` 区分。
- 卸载只清前缀匹配的那几个；用户原 Profile 完全不动。
- 设 default 前先备份用户原 default 到 settings.json 的 `_teamagentBackup.terminalDefault` 字段，卸载时还原。

issue #104 的 `statusLineSkipped` 提示模板（`init.ts:773`）：

```ts
if (r.statusLineSkipped) {
  parts.push("⚠️  检测到已有 statusLine，未覆盖；如要启用 TeamAgent 状态栏，请手动删除原有再重跑");
}
```

terminal theme 应给同等量级的提示（"检测到已有 default Profile = X，未替换"）。

## 3. 现有 init 流程把 terminal 这一步放哪里最合理

`packages/cli/src/commands/init.ts` 的步骤组（`stepGroups`，第 1035-1043 行）：

```ts
{ icon: "🔍", label: "检测项目环境", stepKeys: ["detect-stack"] },
{ icon: "📦", label: "初始化知识库", stepKeys: ["pre-check", "create-dirs", "load-preset", "load-seed", "scan-rules", "structure-rules"] },
{ icon: "🔗", label: "注册 Hook", stepKeys: ["install-hook"] },
{ icon: "🔌", label: "安装团队标配插件", stepKeys: ["install-plugins"] },
{ icon: "📄", label: "导出 Skills", stepKeys: ["compile-skills"] },
{ icon: "🔗", label: "链接 Codex 文件", stepKeys: ["link-codex-files"] },
{ icon: "📦", label: "Stack packs", stepKeys: ["load-pack", "pack-prompt"] },
```

末尾 `Stack packs` 这一步用 `pack-prompt` 给 agent 打印一段 markdown 提示让用户决定（不直接交互）。这个范式可以**直接复用**到 terminal theme：

- 默认安装：不动 terminal Profile，但在末尾打印一段 markdown 提示，告诉用户「跑 `teamagent setup-terminal` 一键装个推荐主题」。
- `--setup-terminal` flag（M0 不上）：未来可以让 init 直接调用 `teamagent setup-terminal`。

新命令 `teamagent setup-terminal` 是 interactive 本体，与 `init` 的 non-interactive 心智模型不冲突。

`init.ts` 现有 `installPlugins` opt-in flag（第 73 行）已经是「默认 false、显式 opt-in」的模板，新功能直接照抄。

## 4. iTerm2 DynamicProfiles 平台事实（claudefast probe #1 + 官方文档）

来源：`docs/plans/issue-117/probes/iterm2-dynamic-profiles.jsonl`（2026-05-07 跑的 `claudefast -p` 探针）+ iTerm2 官方文档。

- **存放路径**：`~/Library/Application Support/iTerm2/DynamicProfiles/*.json`
- **JSON 顶层必填字段**：`Name`（字符串）、`Guid`（字符串，UUID 推荐）。
- **颜色键**（`Colors` 对象内）：`Background Color`、`Foreground Color`、`Cursor Color`、`Ansi 0..15 Color`，每个值为 RGBA 浮点 `{Red Component, Green Component, Blue Component, Alpha Component}`。
- **同名 Profile 行为**：iTerm2 以 `Name` 加载 DynamicProfiles。如果用户已有同名命名 Profile，DynamicProfile 会**覆盖渲染**（动态版本优先）。**所以我们用 `TeamBrain ` 前缀避免撞名**。
- **设默认**：iTerm2 不会自动把 DynamicProfile 设为 default；要靠 `defaults write com.googlecode.iterm2 "Default Bookmark Guid" -string "<our-guid>"`，但这一步必须先备份用户原 `Default Bookmark Guid`。

**TeamBrain 的实现选择**：

- 装到 `~/Library/Application Support/iTerm2/DynamicProfiles/teambrain.json`
- 文件内 1–N 个 Profile（`TeamBrain Default`、未来再加 `TeamBrain Solarized` 等），每个用稳定 GUID（命名空间 UUID v5，便于幂等更新）
- **不动** `Default Bookmark Guid`（V3 强契约）
- 卸载：只删 `teambrain.json`

## 5. macOS Terminal.app `.terminal` plist 平台事实

来源：macOS 系统约定（`man 5 plist`、Apple Terminal Settings 文档）。

- **导入命令**：`open path/to/foo.terminal` 会让 Terminal.app 把这个 Profile 导入到 `Window Settings`。
- **存储位置**：导入后写到 `~/Library/Preferences/com.apple.Terminal.plist` 的 `Window Settings` 键下。
- **关键 plist 键**：
  - 顶层：`name`（字符串，UI 显示）、`type` = `Window Settings`、`ProfileCurrentVersion` = `2.07`（macOS 14+）。
  - 字体：`Font`（NSArchiver-encoded NSFont，二进制 `<data>`，**不易手写**——更稳的做法是 ship 一份现成 `.terminal` 文件而不是动态生成 plist）。
  - 颜色：`ANSIBlackColor`、`ANSIRedColor`、…、`TextColor`、`BackgroundColor`，每个是 NSArchiver-encoded NSColor `<data>`。
- **设默认**：`defaults write com.apple.Terminal "Default Window Settings" -string "<ProfileName>"` + `defaults write com.apple.Terminal "Startup Window Settings" -string "<ProfileName>"`。需要先备份用户原值。
- **生效**：用户重启 Terminal.app 后生效（不重启不会读新 plist）。

**TeamBrain 的实现选择**：

- ship 一份预构建 `release/terminal-themes/TeamBrain.terminal`（开发期用 GUI 在 Terminal.app 里捏一个再 export，落到 git）
- `setup-terminal` 时 `cp` 到 `~/Library/Application Support/TeamBrain/themes/TeamBrain.terminal`，然后 `open` 一次让 Terminal.app 导入
- 设 default 前：`defaults read com.apple.Terminal "Default Window Settings"` 备份到 `~/.teamagent/.terminal-backup.json`
- 卸载：从 `Window Settings` 删除 `TeamBrain` 键、还原 default。
- 所有 `defaults write` 操作必须打印命令行，让用户能看到、能撤销。

## 6. Nerd Font 安装事实

- **推荐字体**：JetBrainsMono Nerd Font（Mono variant，等宽 + powerline + dev icons），ship `release/fonts/JetBrainsMonoNerdFontMono-Regular.ttf` 即可。
- **安装路径**：`~/Library/Fonts/`（用户级，不需要 sudo）。系统级要写 `/Library/Fonts/`，本 PR 不用。
- **生效**：macOS 自动 watch `~/Library/Fonts`，新增字体 < 1s 内可被 NSFont 看到，无需 `atsutil`。
- **opt-in 子步骤**：默认不装；问 `要装 JetBrainsMono Nerd Font 吗？(y/N/skip)`。
- **卸载**：`rm ~/Library/Fonts/JetBrainsMonoNerdFontMono-Regular.ttf`（只删我们装的那一份；如果用户已经自己装了同名，跳过）。

**风险**：

- ttf 文件 ~2MB，gzip 后 ~1.5MB，加进 `release/` tarball 不算大。
- 需要在 install.sh / npm tarball 包含这个二进制（注意 `package.json` 的 `files` 字段、`.npmignore`）。
- 字体 license 检查：JetBrainsMono Nerd Font 是 OFL，可以随仓库分发；保留 `LICENSE` 文件在 `release/fonts/` 旁。

## 7. 用户原始反馈（issue 引用）

issue #117 的 reference 段：

> 用户报告（2026-05-07 14:21）：「用户不喜欢用命令行是因为没调命令行主题，建议给用户安装好 terminal 的主题」

→ **本次目标受众**：第一次装 TeamBrain 的非技术用户、嫌 macOS 默认 Terminal 难看的人。**不是**资深用户（资深用户已有自己 Profile，issue #104 契约保护他们）。

## 8. Worktree 与分支

- Worktree 路径：`/Users/m1/projects/TeamBrain/.claude/worktrees/install-terminal`（违反 `CLAUDE.md` 中 `.codex/worktrees/` 约定，但这是本 worktree 起初创建时的位置；新 worktree 之后再改）。
- 分支：`worktree-install-terminal`。
- PR 目标：`main`，普通 PR（非 draft，issue #100 之后强约束）。

## 9. 预期影响范围

会改：

- `packages/cli/src/commands/setup-terminal.ts`（新增）
- `packages/cli/src/commands/init.ts`（末尾追加 `terminal-prompt` step，类似 `pack-prompt`）
- `packages/cli/src/__tests__/setup-terminal.test.ts`（新增）
- `packages/cli/src/__tests__/init.test.ts`（追加 1 个 `terminal-prompt` 出现在 stdout 的断言）
- `release/terminal-themes/TeamBrain.terminal`（新增）
- `release/iterm2-profiles/teambrain.json`（新增）
- `release/fonts/JetBrainsMonoNerdFontMono-Regular.ttf`（新增，opt-in 才会被 cp）
- `release/fonts/LICENSE`（新增，OFL）
- `packages/teamagent/tsup.config.ts`（追加 `onSuccess` 把 `<repo>/release/*` cp 到 `dist/release/*`，与 `dist/seed/` 走同一条 build-time 复制路径）
- ~~root `package.json` `files`~~ —— **不动**。root manifest 是 `"private": true`，`pnpm build:publish` → `npm pack` 跑在 `packages/teamagent/`，发的是它的 `files: ["dist/", "postinstall.mjs"]`。所以让资源进 tarball 必须经过 `dist/`。Codex 在 PR #127 的 P1 抓的就是这一条，原 plan 写错。
- `docs/features/setup-terminal.md`（新增 feature canned answer 入口）
- `CLAUDE.md`（追加 `setup-terminal` 一行到 project tools 表）

不会改：

- 用户已有 `~/Library/Fonts` 里的字体（V3）
- iTerm2 `Default Bookmark Guid`（V3）
- Terminal.app `Default Window Settings`（V3 — 除非用户在 setup-terminal 里显式 yes）
- `install-hook.ts` 的 statusLine 逻辑（与本 PR 正交）
- `compile.ts` 行为（不动 CLAUDE.md 注入）

## 10. 留给 plan.md 的开放问题

1. **iTerm2 主题 vs Terminal.app 主题的视觉一致性**：能不能让两边长得一样？答：颜色可以一样（手动校对），字体不能一样（Terminal.app 字体是二进制 NSArchiver，不能做"用户没装就 fallback"的分支）。决策：iTerm2 颜色 + 字体名 = `JetBrainsMono Nerd Font Mono`；Terminal.app 颜色一致，字体走预构建 `.terminal` plist 里编码的 NSFont（同样指向 `JetBrainsMono Nerd Font Mono`，但用户没装会 fallback 到 SF Mono——可接受）。
2. **Ghostty / WezTerm 是否纳入 V1**：用户已经选 iTerm2 + Terminal.app 双开；Ghostty / WezTerm 推到下个 PR。
3. **是否在 macOS 之外做**：issue 没要求 Linux / Windows；M0 只做 macOS。`setup-terminal` 在非 darwin 平台直接 `console.log("当前只支持 macOS")` 退出 0。
