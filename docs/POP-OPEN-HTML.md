# Pop-Open HTML Rule

```
   ┌────────────┐    write       ┌──────────────────┐    open -a   ┌────────────────┐
   │  generator │ ─────────────▶ │  /tmp/<name>.html │ ───────────▶ │ Google Chrome  │
   └────────────┘   NOT in repo  └──────────────────┘   immediate  └────────────────┘
```

适用范围：本项目里任何「生成 HTML 然后弹给用户看」的命令、脚本、skill、demo、dashboard、status board、verification render、design preview 等所有「pop-open HTML」入口。

## 三条铁律 / The three rules

1. **Open in Chrome** — 必须用 Google Chrome 打开，而不是系统默认浏览器、不是 Safari、不是 Edge、不是 Firefox。
2. **Write NOT in project but in `/tmp`** — HTML artifact 写到 `/tmp/<name>-<timestamp>.html`（或 `/tmp/teamagent/<feature>/<name>.html`），**严禁**写进 repo 内的任何路径（`docs/dashboard.html` / `docs/**/*.html` / `packages/**/*.html` / `.codex/**/*.html` / `.claude/**/*.html` 都不允许）。
3. **Pop open immediately** — 生成完毕即 pop open，不留 `--open` 这种 opt-in flag，不要求用户复制 URL 再粘贴，不要求用户手动 `open <path>`。生成命令的最后一步 = `open -a "Google Chrome" <abs-path>`（macOS）。

## Why / 为什么

- **Open in Chrome**：本项目 dogfood 与 design-html / dashboard 渲染都依赖 Chrome 的 devtools、stable layout 与 DevTools Protocol（QA / canary / browse skill 默认 Chrome）；其它浏览器导致截图、QA、benchmark 跑分不可复现。
- **Write to `/tmp` not project**：repo 里的 HTML artifact 会被 git 追踪 / `pnpm typecheck` 扫描 / dashboard generator 覆盖 / `compile` 误改 / `/review` 报噪。`/tmp` 是 OS 级 ephemeral 目录，session 结束系统会自然回收。AGENTS.md 也限制项目里只能 edit `AGENTS.md` / `CLAUDE.md` / `docs/`，HTML artifact 不属于其中任意一类。
- **Pop open immediately**：opt-in `--open` 在 dogfood loop 里反复忘按、demo 现场卡壳；一次性 pop open 是 zero-friction 的 default。需要 headless 模式只允许加 `--no-pop`（CI / 远端 / 测试用），不允许把 `--open` 当默认开关。

## How / 操作骨架

任何新的 pop-open HTML 入口必须满足以下骨架：

```ts
// 1. 写到 /tmp
const tmpDir = "/tmp/teamagent/<feature>";
await fs.mkdir(tmpDir, { recursive: true });
const outPath = path.join(tmpDir, `${slug}-${Date.now()}.html`);
await fs.writeFile(outPath, html, "utf8");

// 2. 立即 pop open in Chrome
const { spawn } = await import("node:child_process");
spawn("open", ["-a", "Google Chrome", outPath], { detached: true, stdio: "ignore" }).unref();
```

非 macOS 平台 fallback（仅当 CI / Linux 远端）：

- Linux：`google-chrome --new-window <path>` 或 `chromium --new-window <path>`，若都没装则降级 `xdg-open <path>` 并在 stdout 打印 `WARN: chrome not found, falling back to xdg-open`。
- Windows：`cmd /c start chrome <path>`。
- 这些 fallback 只在 `os.platform() !== "darwin"` 时走；macOS 必须命中 `open -a "Google Chrome"`。

## Existing call sites / 现有入口对账

| 入口 | 当前行为 | 是否符合规则 | 备注 |
|------|---------|------------|------|
| `pnpm teamagent dashboard --watch --open` (`packages/cli/src/commands/dashboard.ts`) | 写 `docs/dashboard.html`、`--open` opt-in、用平台 default browser | ❌ 三条都违规 | 需要后续 PR 改造：写 `/tmp/teamagent/dashboard/dashboard.html`、`--open` 翻面成默认、`openBrowser` 改 `open -a "Google Chrome"` |
| `pnpm teamagent dashboard --once` | 写 `docs/dashboard.html`，不 open | ❌ 路径违规 | 改写 `/tmp/...` 并 pop open（如需 headless 加 `--no-pop`） |
| `/design-html` / `/design-shotgun` (gstack project-level skills) | 默认行为见 gstack | 待审 | 走 gstack 时仍要遵守本规则，artifact 落 `/tmp` |

> 本文件只是 **rule**——具体改造是 follow-up PR 的事；新增的 pop-open HTML 入口必须从 day-1 满足三条铁律。

## Verify / 怎么知道符合规则

每个 pop-open HTML 入口必须在自己的 PR 里提交 judge harness probe：

```bash
# probe 1: artifact 路径在 /tmp/teamagent/<feature>/ 下，文件扩展是 .html
# 路径含 ${Date.now()} 时间戳，用 glob 而不是字面 string 比较
out="$(<command> --print-output-path)"
case "$out" in
  /tmp/teamagent/*/*.html) ;;
  *) echo "FAIL probe 1: output path '$out' not under /tmp/teamagent/<feature>/*.html" >&2; exit 1 ;;
esac

# probe 2: 调用 open -a "Google Chrome"
# macOS（项目默认）：用 env-var spy — 实现侧在 spawn open 之前先 echo 命令到 $TEAMAGENT_OPEN_SPY
#   if (process.env.TEAMAGENT_OPEN_SPY) fs.appendFileSync(process.env.TEAMAGENT_OPEN_SPY, `${argv.join(" ")}\n`);
TEAMAGENT_OPEN_SPY="$(mktemp)" <command> >/dev/null 2>&1
grep -q 'open -a Google Chrome' "$TEAMAGENT_OPEN_SPY" || { echo "FAIL probe 2 (macOS): spawn args 未命中 open -a Google Chrome" >&2; exit 1; }
rm -f "$TEAMAGENT_OPEN_SPY"
# Linux 等价：strace -f -e execve <command> 2>&1 | grep -q 'google-chrome\|chromium' || exit 1

# probe 3: pop 是 default，不是 opt-in（必须有 --no-pop，且禁止 --open）
help_out="$(<command> --help 2>&1)"
echo "$help_out" | grep -q -- '--no-pop' || { echo "FAIL probe 3a: --help 缺 --no-pop" >&2; exit 1; }
echo "$help_out" | grep -q -- '--open\b' && { echo "FAIL probe 3b: --help 仍含 --open opt-in flag" >&2; exit 1; }
```

probe 全部 PASS 才能 merge；如果命令暂时不能符合，请在 PR 描述里挂 follow-up issue 链接，不要 retroactively 改 rule。

> Probe 2 的 macOS env-var spy 实现：pop-open 入口在 spawn 之前读 `process.env.TEAMAGENT_OPEN_SPY`，非空时 append 一行 `open -a Google Chrome <path>` 到该文件，再正常 spawn。CI / probe 把 `TEAMAGENT_OPEN_SPY` 指向 `mktemp` 临时文件 → 不需要 dtrace / 不需要 root / 不污染用户桌面。Linux probe 可以继续走 `strace`，因为 fallback chain 是 `google-chrome` / `chromium` / `xdg-open`，不一定走 `open`。

## Out of scope / 不归本规则管

- 纯 markdown 渲染到 terminal（无 HTML artifact）。
- 写入 repo 内的 **静态文档** HTML，**且没有任何 CLI / skill / 脚本会自动 `open` 它** —— 这些是手工提交的 source-of-truth 展示物（如 `docs/design-system/artifacts/.../html-preview/finalized.html`、`docs/teamagent-rules.html`、`docs/kanban-user-boss/index.html`、`docs/hyperframes/teamagent-hook/index.html`、`docs/specs/*.html`、`docs/plans/**/*.html`、`docs/plans/issue-84/i-phase/design-variants/{A,B,C}*/index.html`），不是 pop-open 入口，不会自动 open。判定规则：grep 整个 repo，如果没有任何 `spawn("open", ...)` / `open <path>` 命令 / dashboard generator 把该 .html 当 target，就算 out of scope；一旦有代码 auto-open 它，立刻回到三条铁律管辖。
- CI / headless 测试场景：允许加 `--no-pop` 跳过 step 3，仍必须满足 step 1 + step 2。
