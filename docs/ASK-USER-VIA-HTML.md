# ASK-USER-VIA-HTML — 用 haiku subagent 生成 visual HTML，托管在 maintainer 自己的 GitHub Gist，pop open Chrome 给用户

```text
┌─ 触发条件 ──────────────────────────────────┐
│ agent 任何要向用户「talk to user」的瞬间    │
│ - 澄清需求 / 收集选项 / 让用户做决策        │
│ - 列出 N 个候选 plan / 候选 design          │
│ - 收集 free-form 备注 + 多选 tag            │
└──────────┬──────────────────────────────────┘
           ▼
┌─ STEP 1 ─────────────┐    ┌─ STEP 2 ──────────────────┐    ┌─ STEP 3 ────────────────────────┐
│ haiku subagent 写    │ ─► │ gh gist create --public   │ ─► │ open -a "Google Chrome"          │
│ visual HTML 问卷     │    │ ask-<slug>-<ts>.html      │    │ "https://htmlpreview.github.io/  │
│ (cards / chips /     │    │ → 拿到 raw URL            │    │   ?<raw-gist-url>"               │
│  color / ASCII /     │    │ (公网永久 / 跨设备)       │    │ (Chrome / 任何浏览器都能开)      │
│  diagrams)           │    └───────────────────────────┘    └──────────┬──────────────────────┘
└──────────────────────┘                                                ▼
                                                       用户在浏览器里点选 / 多选 / 填备注
                                                       → 按「复制选择回 agent」→ 粘回 chat
```

## TL;DR

每次 agent 本来要调 `AskUserQuestion` 工具 / 在 chat 里列 N 个选项让用户挑，**统一**走以下四步——**不写 `/tmp` file://、不弹本地默认浏览器、不出 raw boring text**：

1. **派 haiku subagent** 写一个 self-contained **visual** HTML 文件（cards / chips / color-coded sections / 内联 SVG / ASCII art 框图），落地到 `/tmp/ask-<slug>-<unix-ts>.html` 作为本地暂存。**不**允许只写「label + radio + button」的朴素表单——HTML 必须带视觉层次（最少：分区底色 + chip 圆角标签 + 中间分隔线 + 颜色对比的选中态）。
2. **托管到 maintainer 自己的 GitHub Gist**：`gh gist create --public /tmp/ask-<slug>-<unix-ts>.html`，拿到 gist raw blob URL（形如 `https://gist.githubusercontent.com/<you>/<id>/raw/<file>.html`）。
3. **Pop open via htmlpreview.github.io in Chrome**：`open -a "Google Chrome" "https://htmlpreview.github.io/?<raw-gist-url>"`（Linux `xdg-open`、Windows `start chrome`）。htmlpreview 是无依赖的纯前端 render proxy，把 raw blob 在浏览器里 fetch + display；用户可以从任何设备（手机 / 第二台机器 / iPad）打开同一个链接。
4. 用户在浏览器里点选 / 填写 → 按底部「复制选择回 agent」按钮（`navigator.clipboard.writeText` 把答案序列化成 markdown）→ 切回 agent terminal 粘贴 → agent 解析继续。

> 备注：本规则**取代**早期版本的 `/tmp` file:// 直开本地浏览器流程。`/tmp` 文件仅作为 `gh gist create` 的上传源，最终用户看到的是 gist + htmlpreview 公网 URL。

## 为什么 gist + htmlpreview 不直接弹 `/tmp` file://

- **跨设备**：`/tmp` 只有本机能看到；gist URL 任何设备 / 手机 / 二台机器 / 远端 SSH user 都能开。
- **持久审计**：session 结束后 gist 仍在，事后 grill / review 复盘能回看「当时给了哪些选项 / 用户选了啥」。
- **零额外基础设施**：`gh gist create` 一行命令，免 S3 / Pages / CDN bootstrap（与 `docs/VISUAL-PROOF-FORMAT.md § Hosting` 默认推荐同一套）。
- **Chrome `file://` Clipboard API 受限**：某些 macOS Chrome 配置下 `file://` 来源不允许 `navigator.clipboard.writeText`，gist + htmlpreview 走 `https://` 来源就没这个限制。
- **复用 visual-proof 同一套 hosting 约定**：项目内 visual-proof artifact 已经走 gist + htmlpreview（per `docs/VISUAL-PROOF-FORMAT.md`），ask-user 问卷复用，maintainer 心智一致。

## 为什么必须 visual content 不允许 raw boring text

raw `<form>` + `<label>` + radio button 的 plain 表单视觉负担与终端 prompt 没差别——用户认知没收益，gist 托管 overhead 反而成本更高。Visual 要求包括（至少命中 3 项）：

- **分区底色**：每个 question `<fieldset>` 用不同 `background` 色块（柔和：`#f6f8fa` / `#fff8e6` / `#e6f4ff` 交替），视觉分组一眼可见。
- **Chip 标签**：每题 `<legend>` 旁边带圆角 chip（`border-radius: 12px; padding: 2px 10px`）标识 question type（"single" / "multi" / "free-form"）。
- **颜色对比的选中态**：`<input:checked> ~ <span>` 用 `background: linear-gradient(...)` 或显眼边框，hover 态有 transition。
- **内嵌 SVG 或 ASCII 框图**：解释选项之间的关系 / 决策树 / 取舍——比纯文字描述清晰。
- **代码块带语法高亮（手写 CSS class）**：如果选项里含命令 / JSON / config snippet，用 `<pre class="hl">` + 内联 CSS 着色。
- **数据 viz 卡片**：如果选项含数字 / 时长 / 文件大小，用 `<div class="metric">` 卡片大字号呈现。

## STEP 1 — 派 haiku subagent 写 visual HTML

主 agent 调 `Agent` 工具时显式指定 `model: "haiku"`，prompt 要点：

- 输入：问题文本 + 选项列表 + 单选/多选 + 默认值 + free-form 字段是否需要 + **visual hints**（"用 ASCII 鸭子做装饰"、"option 之间画决策树 SVG"、"成本对比用 metric 卡片"）。
- 输出：self-contained HTML 落到 `/tmp/ask-<slug>-<unix-ts>.html`。
- HTML 必须：
  - `<!DOCTYPE html>` + `<meta charset="utf-8">` + `<title>`
  - 内联 `<style>`，禁止外部 CSS / JS / 字体 CDN（htmlpreview 走 cross-origin 时第三方 fetch 会被拒）
  - 顶部一段一句话上下文 + ASCII art 或 SVG 装饰
  - 每题独立 `<fieldset>`，含 `<legend>` + chip 标签 + 分区底色
  - 选项区用 `<label><input type="radio|checkbox">`，禁 `<select>`
  - 末尾一个 free-form `<textarea>` 给 "Other / 备注"
  - 一个 `<button>` 写「复制选择回 agent」（`navigator.clipboard.writeText` 把所有选中项序列化成 markdown）
  - **fallback `<pre>`**：把序列化好的 markdown 渲染到一个可选中的 `<pre>` 块里，按钮失败也能让用户手动 Cmd-C 复制
- prompt 末尾固定让 haiku 只输出 `SAVED:/tmp/<file>` 一行供 main agent 读路径。

## STEP 2 — 上传到 gist

```bash
GIST_URL=$(gh gist create --public "/tmp/ask-<slug>-<ts>.html" 2>&1 | tail -1)
GIST_ID=$(basename "$GIST_URL")
RAW_URL="https://gist.githubusercontent.com/$(gh api user --jq .login)/${GIST_ID}/raw/ask-<slug>-<ts>.html"
```

或更简化（gh CLI ≥2.40）：`gh gist create --public --filename ask-<slug>-<ts>.html /tmp/ask-<slug>-<ts>.html` 然后从输出 parse gist ID。

## STEP 3 — Pop open htmlpreview 在 Chrome

```bash
# macOS
open -a "Google Chrome" "https://htmlpreview.github.io/?${RAW_URL}"

# Linux
xdg-open "https://htmlpreview.github.io/?${RAW_URL}"

# Windows (Git Bash / WSL)
start chrome "https://htmlpreview.github.io/?${RAW_URL}"
```

Chrome 没装时 fallback 到系统默认浏览器（`open <url>` / `xdg-open <url>` / `start <url>`）。

## STEP 4 — 用户回复回路

用户在 Chrome 里点选完成后：

1. 点页面底部「复制选择回 agent」按钮 → 答案以 markdown 进剪贴板。
2. 切回 agent terminal，粘贴回 chat。
3. agent 解析 markdown 继续工作。

agent **不**应该假设浏览器能反向写 stdin；所有「用户答了什么」必须由用户口述 / 粘贴回 chat 触发。

## 何时**不**走这条流程（fallback）

- 没 `gh` auth / 网络 / GitHub 不可达 → 退回早期 `/tmp` file:// 流程或原生 `AskUserQuestion`。
- 当前 session 完全 headless（CI / 远端无 X / 无浏览器）→ 原生 `AskUserQuestion`。
- 问题极简（"y/n"、"continue?"）→ chat 一句话问。
- 用户明确说「快速答一下，不要弹页面」→ 跟随用户偏好。
- 已经在浏览器里跑的 web app 内问 → 复用现有 UI 不另开。

## 验证

- 至少出现一次本规则触发后，确认 (a) gist 存在 `gh gist list | head -1` 显示新 gist；(b) htmlpreview URL 在浏览器里能打开；(c) HTML 内 ≥3 个 visual 元素（分区底色 / chip / SVG / metric 卡片 / ASCII 装饰）。
- haiku 写的 HTML 应该用 `curl -s "$RAW_URL" | grep -E '<link[^>]*src=|<script[^>]*src='` 检查没有外部 CDN 引用。
- 用户能在 ≤3 次点击内完成所有问题 → 单选 / 多选 / free-form 各 ≤1 次点击 / 输入到位。

## 与现有规则的关系

- 与 `docs/VISUAL-PROOF-FORMAT.md § Hosting`：复用同一套 `gh gist create --public` + `htmlpreview.github.io` 公网托管约定；本规则是 **question UI** 流，VISUAL-PROOF 是 **PR evidence** 流，载体相同、用途不同。
- 与 `docs/POP-OPEN-HTML.md`：POP-OPEN-HTML 是**本地 agent dev 链路**（dashboard / preview / status board 写 `/tmp` + 弹 Chrome），本规则是**talk-to-user 链路**（gist 公网托管 + Chrome 弹 htmlpreview）。两条规则正交，触发场景不交叉。
- 与 `AskUserQuestion` 工具：**首选本规则**，仅在 fallback 五种场景下退回工具。
- 与项目「用户沟通语言」规则一致——HTML 文案默认中文，除非用户要求英文。
