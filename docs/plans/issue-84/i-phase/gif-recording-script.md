```
 ┌────────────────────────────────────────────────────────────────────┐
 │  GIF 录制脚本 — issue #84 spec 决策 4 double-moment                │
 │                                                                    │
 │   moment 1: 用户纠正 → 系统记录                                   │
 │       ↓                                                            │
 │   /clear  (新会话)                                                │
 │       ↓                                                            │
 │   moment 2: AI 准备用 moment → PreToolUse 拦截                    │
 └────────────────────────────────────────────────────────────────────┘
```

# GIF Recording Script — Decision 3

录完后扔进 `apps/landing/public/double-moment.gif`，A variant 的 `<div class="gif-placeholder">` 自动引用（编辑 `apps/landing/src/index.html` 把 placeholder div 换成 `<img src="public/double-moment.gif" alt="double moment demo" />`）。

---

## 0. 工具

```bash
brew install asciinema agg     # macOS
# 或 cargo install --git https://github.com/asciinema/agg
```

`asciinema` 录终端、`agg` 把 .cast 转 .gif。

---

## 1. 录制（约 25-30 秒，对标 P7 step `demo` 30s）

```bash
asciinema rec --idle-time-limit=2 --title "TeamAgent double-moment" /tmp/double-moment.cast
```

录制内的步骤（按 spec 决策 4）：

```
# moment 1 — 纠正
$ # 在 Claude Code 里说："用 moment.js 写个时间格式化函数"
$ # AI 写了用 moment 的代码
$ # 你说："不要用 moment, 用 dayjs"
$ # AI 改成 dayjs，TeamAgent Stop hook 自动捕获经验
$ teamagent stats --recent
  ⤳ +1 avoidance rule learned: avoid moment, use dayjs
$ exit  # 退出本会话
```

```
# === 切到下一会话（GIF 里画 cut 标记）===
$ /clear   # 或 退出 + 重启 Claude Code
```

```
# moment 2 — 拦截
$ # 在 Claude Code 里说："写个时区转换工具"
$ # AI 准备调 Edit/Write 时引入 moment
$ # PreToolUse hook 拦截:
  ⛔ TeamAgent: previous correction said use dayjs, not moment
$ # AI 改用 dayjs，无需用户再纠正
```

录完按 `Ctrl-D` 结束。

---

## 2. 转 GIF

```bash
agg \
  --font-size 14 \
  --theme monokai \
  --speed 1.5 \
  --idle-time-limit 1 \
  /tmp/double-moment.cast \
  apps/landing/public/double-moment.gif

# 检查大小（landing GIF 应该 < 2MB）
ls -lh apps/landing/public/double-moment.gif
```

---

## 3. 把 placeholder 换成真 GIF

```bash
# 找到 apps/landing/src/index.html 里的 .gif-placeholder div，替换：
# 原: <div class="gif-placeholder">[ GIF placeholder: moment → dayjs ]</div>
# 新: <img src="../public/double-moment.gif" alt="TeamAgent double-moment demo" loading="lazy" style="..." />
```

或保留 placeholder 框，img 加在框内（aspect-ratio 16:9 维持）：

```html
<div class="gif-placeholder">
  <img src="../public/double-moment.gif"
       alt="TeamAgent double-moment: moment→dayjs correction then auto-block"
       loading="lazy"
       style="width:100%; height:100%; object-fit:contain;" />
</div>
```

---

## 4. Verify

```bash
# 本地预览
pnpm --filter @teamagent/landing build
pnpm --filter @teamagent/landing preview
# 浏览器打开 http://localhost:3000/，hero 下应能看到 GIF 自动播放

# Lighthouse perf 不破（GIF 不应让 LCP > 2.5s）
pnpm --filter @teamagent/landing verify
```

---

## 5. Commit

```bash
git add apps/landing/public/double-moment.gif apps/landing/src/index.html
git commit -m "feat(issue-84): add double-moment demo GIF to landing hero

录制脚本: docs/plans/issue-84/i-phase/gif-recording-script.md
spec 决策 4: moment → dayjs 纠正 + 下一会话 PreToolUse 拦截

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Fallback：用静态截图 mosaic

如果不想录视频，3 张关键截图拼成竖排 PNG 也行：

```
┌────────────────────────────────┐
│ moment 1: 纠正发生              │ ← 截图 1
└────────────────────────────────┘
┌────────────────────────────────┐
│ ━━━ /clear: 新会话 ━━━          │ ← 分隔条
└────────────────────────────────┘
┌────────────────────────────────┐
│ moment 2: PreToolUse 拦截       │ ← 截图 2
└────────────────────────────────┘
```

但 GIF 更直观，推荐优先 asciinema 路径。
