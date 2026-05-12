# ASK-USER-VIA-HTML — 用 haiku subagent 生成 HTML 问卷再开 Chrome 问用户

```text
┌─ 触发条件 ──────────────┐
│ agent 需要向用户提问    │
│ (澄清需求 / 选项决策)   │
└──────────┬──────────────┘
           ▼
┌─ STEP 1 ────────────────┐    ┌─ STEP 2 ──────────────┐    ┌─ STEP 3 ───────────┐
│ 用 haiku subagent 写    │ ─► │ 路径写到 /tmp/*.html   │ ─► │ 用 open -a Chrome  │
│ 一个独立 HTML 问卷      │    │ (单文件、自包含、无依赖)│   │ 打开该文件        │
└─────────────────────────┘    └────────────────────────┘   └──────────┬─────────┘
                                                                       ▼
                                                          用户在浏览器里答题
                                                          (回到 agent 复述选择)
```

## TL;DR

每次 agent 本来要调 `AskUserQuestion` 工具向用户提问时，改走以下流程：

1. 派一个 **haiku subagent** 去写一个独立的 `/tmp/ask-<topic>-<timestamp>.html`，里面把问题、选项、单选 / 多选、free-form 备注框都用纯 HTML + 内联 CSS 渲染成一个 self-contained 页面（**不**依赖 CDN、**不**调外部 JS）。
2. 文件落到 `/tmp/`（macOS / Linux 通用临时目录；Windows 同义用 `%TEMP%\`）。
3. 在主 session 里调 `open -a "Google Chrome" /tmp/ask-<topic>-<timestamp>.html`（Linux 用 `xdg-open`、Windows 用 `start chrome`）把页面弹给用户。
4. 用户在浏览器里点选 / 填写 → 回到 agent 会话把选择口述或粘贴回来 → agent 继续推进。

> 备注：本规则**不**取代 `AskUserQuestion` 工具的存在；它规定的是「agent 在什么场景下用 HTML+Chrome 流程代替工具调用」。在用户明确要求快速文字回答、或当前没有 GUI 环境（远端 SSH 无浏览器、CI、headless）时，可以退回原生 `AskUserQuestion`。

## 为什么不直接调 `AskUserQuestion` 工具？

- HTML 问卷可以**长期保存证据**（`/tmp/*.html` 在 session 结束后仍可重新打开），方便后续 grill / review 复盘“当时给了哪些选项”。
- 多选 / 长 free-form 输入在 `AskUserQuestion` 工具里只能逐题展开；HTML 一页可以同时呈现所有问题、说明、preview snippet，**用户认知负担更低**。
- haiku 写 HTML 成本远低于 opus / sonnet；把"渲染表单"这种格式化工作下放给小模型，节省主 session token。
- 浏览器渲染天然支持代码高亮、表格、ASCII art 框图、图片预览——比终端 UI 表达力更强。

## STEP 1 — 派 haiku subagent 写 HTML

主 agent 调 `Agent` 工具时显式指定 `model: "haiku"`，并把以下要点写进 prompt：

- 输入：问题文本 + 选项列表 + 单选/多选 + 默认值 + free-form 字段是否需要。
- 输出：一个 self-contained HTML 文件落地到 `/tmp/ask-<slug>-<unix-ts>.html`。
- HTML 必须：
  - `<!DOCTYPE html>` + `<meta charset="utf-8">`
  - 内联 `<style>`，禁止外部 CSS / JS / 字体 CDN
  - 顶部一段一句话上下文（"为什么问这个"）
  - 每题独立 `<fieldset>`，含 `<legend>` 与 5-10 字标题 chip
  - 选项区用 `<label><input type="radio|checkbox">`，禁 `<select>`（屏幕小看不到全部）
  - 末尾一个 free-form `<textarea>` 给 "Other / 备注"
  - 一个 `<button>` 写"复制选择回 agent"（用 `navigator.clipboard.writeText` 把所有选中项序列化成 markdown），但**不依赖**网络请求或表单 submit
  - **fallback**：某些 Chrome 配置下 `file://` 来源的 Clipboard API 会被禁；HTML 必须同时把序列化好的 markdown 渲染到一个**可选中的 `<pre>` 块**里，按钮失败也能让用户手动 `Ctrl-C` / `Cmd-C` 复制
- prompt 末尾固定让 haiku 只输出 `SAVED:/tmp/<file>` 一行供 main agent 读路径。

例（main agent 用 `Agent` 工具发的 prompt 骨架，**不**是要 user 跑的脚本）：

```
You are writing a single self-contained HTML file at /tmp/ask-<slug>-<unix-ts>.html.

Question: <main question, e.g. "Which auth strategy?">
Options:
  - JWT bearer token
  - Server-side session cookie
  - OAuth2 PKCE

Constraints:
- One <fieldset> per question, multi-select if `multiSelect: true`
- Inline CSS, no CDN
- End with a "复制选择" <button> using navigator.clipboard
- After writing, output ONLY: SAVED:/tmp/ask-auth-1715520000.html
```

## STEP 2 — 路径约定

- macOS / Linux：`/tmp/ask-<slug>-<unix-ts>.html`
  - `<slug>` 用 kebab-case，正则强约束为 `^[a-z0-9-]{1,30}$`（不允许空格、shell 元字符、引号、`..` 等）——这是 defense-in-depth：哪怕调用方失误把用户输入拼进 `open -a` 的 argv，也不会被 shell 当成额外参数解析。
  - `<unix-ts>` 用 `date +%s` 防同名覆盖
- Windows：`%TEMP%\ask-<slug>-<unix-ts>.html`（注意 Windows 上 STEP 3 命令的 path 也必须是 `%TEMP%\...` 形式或 `file:///C:/...` URL，不要把 `/tmp/...` 直接喂给 `start chrome`）
- 文件留在 `/tmp/`，session 结束不主动删；macOS 自带 `/tmp` cleanup 周期 (`/etc/periodic/daily/110.clean-tmps`)，3 天后自动回收。

## STEP 3 — 打开浏览器

主 agent 在 `Bash` 工具里跑：

```bash
# macOS
open -a "Google Chrome" /tmp/ask-<slug>-<unix-ts>.html

# Linux
xdg-open /tmp/ask-<slug>-<unix-ts>.html

# Windows (Git Bash / WSL)
start chrome /tmp/ask-<slug>-<unix-ts>.html
```

如果 Chrome 没装，fallback 到默认浏览器：macOS `open <file>`、Linux `xdg-open <file>`、Windows `start <file>`。

## STEP 4 — 用户回复回路

用户在浏览器里点选后：

1. 点页面底部"复制选择"按钮，把答案序列化成 markdown 复制到剪贴板。
2. 切回 agent terminal，把 markdown 粘贴回来。
3. agent 解析 markdown，按用户选择继续工作。

agent **不**应该假设 HTML 文件能反向写入 stdin；终端 agent 与浏览器之间没有自动 IPC 通道，所有"用户答了什么"必须由用户口述 / 粘贴回 chat 触发。

## 何时**不**走这条流程（fallback）

- 当前 session 没 GUI（remote SSH 无 X forward / Linux headless / CI）→ 用原生 `AskUserQuestion`。
- 问题极简（"y/n"、"continue?"）→ 直接在 chat 里一句话问。
- 用户明确说"快速答一下，不要弹页面"→ 跟随用户偏好。
- 已经在浏览器里跑的 web app 内问 → 直接复用现有 UI 而不是另开 HTML。

## 验证

- 至少出现一次本规则触发后，确认 `/tmp/ask-*.html` 文件存在且能用 `open -a "Google Chrome"` 打开。
- haiku 写的 HTML 应该用 `lynx -dump /tmp/ask-*.html` 检查没有外部 `<link>` / `<script src="http">`。
- 用户能在 ≤3 次点击内完成所有问题 → 单选 / 多选 / free-form 必须各 ≤1 次点击 / 输入到位。

## 与现有规则的关系

- 与 `AskUserQuestion` 工具**并行**，不取代。
- 与 `docs/CONTEXT.md` 中"用户沟通语言"规则一致——HTML 文案默认中文，除非用户要求英文。
- 与 `CLAUDE.md` "开发节奏"无冲突——本规则约束的是"提问形态"，不影响 commit / TDD 节奏。
