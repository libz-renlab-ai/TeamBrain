# Newsboard 模板

```
   __
  /  \____      呷呷~ 鸭鸭迎客
 ( o    o )    docs/newsboard.md
  \______/     SessionStart banner template
     ^^

+-----------------+      +----------------------------+      +-----------------+
| docs/newsboard  | ───► | newsboard-session-start.sh | ───► | TUI sysmessage  |
| (this file)     |      | (read + token substitute)  |      | (banner output) |
+-----------------+      +----------------------------+      +-----------------+
```

`.claude/hooks/newsboard-session-start.sh` 在每次 SessionStart 读这个文件，
按 `{{TOKEN}}` 替换四段动态内容，再通过 stdout JSON `systemMessage` 通道
渲染到 Claude Code TUI。**所有中文文案在这里维护，bash 不存任何字面文案。**

## 文案表 / Labels

下方 LABELS 区块（HTML 注释 marker，独占一行）里每行 `- KEY: value` 由
bash 解析为 `LABEL_KEY` shell 变量。value 内的 `${V}` / `${L}` / `${P}`
/ `${C}` / `${I}` / `${N}` / `${F}` 是子占位符，运行时由对应数据替换：

| 子占位符 | 含义 | 来源 |
|----------|------|------|
| `${V}` | 当前版本号 | `package.json` 或 `VERSION` |
| `${L}` | 本地 VERSION | `VERSION` 文件 |
| `${P}` | package.json 版本 | `package.json` |
| `${C}` | git commit (短 hash + 标题) | `git log` |
| `${I}` | 随机功能编号 | `date +%s % count + 1` |
| `${N}` | 功能总数 | `docs/PRODUCT-FEATURES.md` 编号行计数 |
| `${F}` | 功能描述 | `docs/PRODUCT-FEATURES.md` 第 ${I} 条 |

bash 已把每段的统一缩进（4 空格）写在脚本里，因此 LABELS 里的 value
**不要**再加额外行首空格，写裸文案即可。

<!-- LABELS -->
- INSTALL_CURRENT: 当前版本：${V}
- INSTALL_MISMATCH: VERSION=${L}  package.json=${P}  →  跑 `pnpm teamagent update`
- INSTALL_UNKNOWN: 版本未知
- COMMIT_LINE: - ${C}
- TRY_LINE: 还没试过？试试看：${C}
- QUIET_WEEK: 本周很安静，没有 feat/fix commits
- RANDOM_LINE: 第 ${I} / ${N} 个：${F}
- RANDOM_MISSING: 功能列表缺失（docs/PRODUCT-FEATURES.md）
- RANDOM_EMPTY: 功能列表为空
<!-- /LABELS -->

## Banner 模板 / Banner template

下方 BANNER 区块（HTML 注释 marker，独占一行）是 bash 读取的整段文本，
按 `{{INSTALL}}` / `{{JUST_SHIPPED}}` / `{{NEW_AND_TRY}}` / `{{RANDOM}}`
四个段级占位符替换为对应渲染好的多行文本：

<!-- BANNER-START -->
  __
 /  \____      呷呷~ 欢迎回来
( o    o )    TEAMBRAIN 新闻板
 \______/     (banner 仅展示，不进 Claude 上下文)
    ^^
+--------------------------------------------------------+
[1] 安装 / 更新
{{INSTALL}}

[3] 最近上线（近 7 天）
{{JUST_SHIPPED}}

[2] 新功能 + 还没试过？
{{NEW_AND_TRY}}

[4] 今日随机功能
{{RANDOM}}
+--------------------------------------------------------+
<!-- BANNER-END -->

## 数据源 / Data sources

| 段 | 数据源 | 说明 |
|----|--------|------|
| `[1] 安装 / 更新` | `VERSION` + `package.json` 的 `version` 字段 | 不一致时提示升级 |
| `[2] 新功能 + 还没试过？` | `git log --since="7 days ago" --grep='^(feat\|fix)' -2` | 取最近 2 条 |
| `[3] 最近上线（近 7 天）` | `git log --since="7 days ago" --grep='^(feat\|fix)' -3` | 取最近 3 条 |
| `[4] 今日随机功能` | `docs/PRODUCT-FEATURES.md` 编号列表 | `date +%s % count + 1` 选 |

## 可改什么 / What can be changed without touching bash

| 改动 | 在哪改 | 不需要碰 bash |
|------|--------|---------------|
| 任何中文文案 | 本文件 LABELS 区块 | ✓ |
| ASCII 鸭子样子 | 本文件 BANNER 区块 | ✓ |
| 段落顺序 | 本文件 BANNER 区块 | ✓ |
| section 标题 | 本文件 BANNER 区块 | ✓ |
| 取多少条 commit | hook 脚本里 `git log -2` / `-3` | ✗ 需要 |
| 数据源切换 | 同上 hook 脚本 | ✗ 需要 |
| 段间统一缩进 | hook 脚本里 `INDENT` 变量 | ✗ 需要 |
