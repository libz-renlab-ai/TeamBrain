# CAPTURE-RECIPE.md — 终端截图录制流程

```
  录制 (asciinema)
       |
       v
  转换 (svg-term-cli / agg)
       |
       v
  脱敏 (REDACTION-CHECKLIST.md)
       |
       v
  嵌入 README (Markdown img tag)
```

> 本文件记录将终端会话录制为可嵌入公开 README 图片的标准流程。
> 目标：`2026-05-07-intercept-warn.png`（hook 拦截）和 `2026-05-07-learn-rule.png`（规则学习）。

---

## 工具栈 / Tool Stack

| 工具 | 用途 |
|------|------|
| `asciinema` | 录制终端会话为 `.cast` 文件（文本格式，可重放，多次重录输出一致） |
| `svg-term-cli` | `.cast` → `.svg`（含终端调色板，GitHub dark mode 兼容） |
| `agg` | 备选：`.cast` → `.gif`（Rust 实现，无需浏览器渲染） |
| `rsvg-convert` | SVG → PNG（需要 PNG 时使用） |

---

## 前置条件 / Prerequisites

```bash
brew install asciinema          # 录制工具
npm install -g svg-term-cli     # cast → SVG
brew install agg                # 备选 GIF 转换
brew install librsvg            # SVG → PNG（可选）
```

验证：`asciinema --version && svg-term --version`

---

## Step 1 — 沙箱环境 (DOGFOOD Tier 2)

使用 DOGFOOD Tier 2 隔离（详见 `docs/DOGFOOD.md`）确保录制不含用户真实 `~/.claude/` 配置。

```bash
bash scripts/dogfood.sh
```

后续所有 `asciinema rec` 命令在**右侧 sandbox pane** 中执行。
沙箱验证：`echo $CLAUDE_CONFIG_DIR`，期望输出沙箱路径（非真实 `~/.claude`）。

---

## Step 2 — 录制 Hook 拦截会话 (intercept-warn)

```bash
asciinema rec /tmp/intercept.cast

# 在录制会话内：触发 wrong_pattern 拦截
npm install moment
# 等待 hook 拦截输出后，按 Ctrl-D 结束录制

# 验证
asciinema play /tmp/intercept.cast
```

---

## Step 3 — 录制规则学习会话 (learn-rule)

```bash
asciinema rec /tmp/learn-rule.cast

# 在录制会话内：
# 1. 触发 wrong_pattern 行为
# 2. 输入用户纠正，例如：
#    "不要用 console.log，请改用 AttributionBus"
# 3. 观察 Stop hook 输出 <self-report> 与 "learned a rule" 片段
# Ctrl-D 结束
```

---

## Step 4 — 转换为图片

```bash
# SVG（推荐，矢量清晰，GitHub 原生渲染）
svg-term --in /tmp/intercept.cast \
         --out docs/screenshots/2026-05-07-intercept-warn.svg \
         --window --width 220 --height 40

svg-term --in /tmp/learn-rule.cast \
         --out docs/screenshots/2026-05-07-learn-rule.svg \
         --window --width 220 --height 40

# PNG（如需要）
rsvg-convert -w 1200 docs/screenshots/2026-05-07-intercept-warn.svg \
             -o docs/screenshots/2026-05-07-intercept-warn.png

rsvg-convert -w 1200 docs/screenshots/2026-05-07-learn-rule.svg \
             -o docs/screenshots/2026-05-07-learn-rule.png
```

---

## Step 5 — 脱敏检查

对照 [`./REDACTION-CHECKLIST.md`](./REDACTION-CHECKLIST.md) 逐项核查，并快速扫描：

```bash
grep -i "Users/$(whoami)" docs/screenshots/2026-05-07-intercept-warn.svg \
  && echo "FAIL: 含真实用户名" || echo "PASS"
grep -i "api.key\|anthropic_api\|minimax" docs/screenshots/2026-05-07-intercept-warn.svg \
  && echo "FAIL: 含 key 关键词" || echo "PASS"
```

---

## Step 6 — 嵌入 README

```markdown
![Hook 拦截示例](./docs/screenshots/2026-05-07-intercept-warn.png)
![规则学习示例](./docs/screenshots/2026-05-07-learn-rule.png)
```

SVG 版（体积更小）：

```markdown
<img src="./docs/screenshots/2026-05-07-intercept-warn.svg" alt="Hook 拦截示例" width="1000">
```

---

## 命名约定 / Naming Convention

格式：`YYYY-MM-DD-<slug>.<ext>`
- slug 小写、连字符分隔，描述截图内容（如 `intercept-warn`、`learn-rule`）
- 扩展名：`.svg`（首选）或 `.png`

---

## 目标尺寸 / Target Dimensions

- **宽度**：≈ 1200px（GitHub desktop 渲染约 1000px 宽，留余量）
- **高度**：按内容自适应（`--height` 以终端行数为单位，40–60 行通常足够）
- **深色/浅色兼容**：`svg-term` 嵌入完整终端调色板，不依赖系统主题，GitHub dark mode 下显示一致

---

## 已知问题与备选方案

| 问题 | 备选方案 |
|------|----------|
| `asciinema` 无法安装 | `tmux capture-pane -p -S -3000 > /tmp/pane.txt`，再用 `screencapture -i` 手动截取 |
| `svg-term-cli` Node 版本过旧 | `agg /tmp/intercept.cast docs/screenshots/2026-05-07-intercept-warn.gif` |
| PNG 背景透明异常 | `rsvg-convert --background-color '#1e1e1e' ...` 填充深色背景 |
| `.cast` 含敏感路径 | 录制前 `export HOME=/tmp/sandbox-home`，或手动编辑 `.cast` 替换路径 |
