# README.md — Install block 插入草稿 (I2 阶段)

本文件是 I2 阶段插入 README.md 顶部（或 `## 5–10 分钟上手` 区域替换）的 install block。
保留现有"为什么需要它"段落结构；**仅替换或增强 install 代码块及紧跟其后的说明**。

---

## Install block（markdown，直接插入）

### 快速安装

```bash
# 推荐：先下载 install.sh，确认内容后再执行
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh -o /tmp/teambrain-install.sh
cat /tmp/teambrain-install.sh          # 建议先 review，确认脚本内容符合预期
sh /tmp/teambrain-install.sh
```

也支持直接执行（适合已熟悉该脚本、或在 CI 中使用）：

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh
```

校验文件（SHA256）：**TBD H1** — SHA256 校验文件位置待 H1 open question 决定后填入。
参考：[release-prep/install-sh-checklist.md](release-prep/install-sh-checklist.md)

安装完成后进入你的项目目录，初始化：

```bash
teamagent init
```

`init` 约 30 秒完成：注册 PreToolUse hook、注入 universal pack（~15 条跨语言
avoidance 规则）、立即可拦截。背景任务将在 ~10 分钟内静默升级为 BM25+dense 语义匹配。

---

### 立即验证（30 秒内看到第一次拦截）

```bash
teamagent demo
```

`demo` 命令模拟一次 `moment → dayjs` 纠正 → 下一会话被 PreToolUse 拦截的完整闭环。
GIF 演示同样展示这两个时刻（[见 landing page](https://libz-renlab-ai.github.io/TeamBrain/)）。

---

### 注意事项

- **建议先 review install.sh**（`curl ... -o /tmp/... && cat ...`），确认来源和内容，
  再决定是否执行。这是 P4 mitigation P4-M04 的最佳实践建议。
- `install.sh` 固定来自仓库 `release` 分支根目录，不依赖自有域名。
- 安装过程中不需要 SSH key，走 HTTPS tarball。

---

## G4 双 URL 说明（I2 apply 时核对）

research §G4 指出以下两个 URL 共存不冲突，I2 应用时在 README 中两者都应体现或至少不矛盾：

1. `install.sh` 本身：`https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh`
   （spec 决策 5 锁定，install.sh 在 `release` 分支根目录）

2. install.sh 内拉取的 tarball：`https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/{asset}`
   （P8 Route B 锁定，tarball 在 GitHub Release asset）

本 install block 只展示用户侧第一条 URL（curl 入口），第二条在 install.sh 内部处理，无需在 README 暴露。
