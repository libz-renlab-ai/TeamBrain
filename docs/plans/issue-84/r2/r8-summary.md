```
  ____  ___      ____                                        __
 / __ \( _ )    / __ \__  __ ____ ___  ____ ___  ____ ______/ /_
/ /_/ // _ \   / /_/ / / / // __ `__ \/ __ `__ \/ __ `/ ___/ __/
\__, /\___/    \____/\_,_//_/ /_/ /_/\__,_/_/ /_/\_,_/_/  \__/
/____/

  worker-8 R2 summary  —  CLAUDE.md row + README install block drafts
  docs/plans/issue-84/r2/
```

# R2 Worker-8 Summary

## 产出文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `docs/plans/issue-84/r2/claude-md-row-draft.md` | ~45 行 | CLAUDE.md Project tools 表新增行的 unified diff 草稿 |
| `docs/plans/issue-84/r2/readme-install-block-draft.md` | ~55 行 | README.md install block 插入草稿 |
| `docs/plans/issue-84/r2/r8-summary.md` | 本文件 | R2 worker-8 汇总 |

## 关键决策

1. **CLAUDE.md 插入位置**：在 `| **Feature canned answers** | ...` 行（当前第 131 行）之后插入新行：
   `| **\`apps/landing/\`** | GitHub Pages landing page 子包（\`pnpm --filter landing build\`）；关联 \`docs/plans/issue-84\` + \`.github/workflows/landing-deploy.yml\` |`

2. **README install block**：采用两步安装策略——主推 `curl -o /tmp/... && cat && sh`（P4-M04 建议先 review），
   兼容 `curl | sh` 直接执行形式（spec 决策 5 锁定的 hero 文案）。

3. **SHA256 校验文件**：位置标记为 `TBD H1`（research §H open question H1 未决），
   并引用 `release-prep/install-sh-checklist.md` 作为占位。

4. **TEAMAGENT marker 写法**：draft 中一律只写纯名 `TEAMAGENT:START` / `TEAMAGENT:END`，
   不写字面 HTML 注释形式，遵守 CLAUDE.md 既定告诫。

## G4 双 URL 核对

research §G4 要求 R2 文档统一表达以下两条 URL：
- `install.sh` 入口（release 分支 raw URL）——已在 README draft 的用户侧 curl 命令中体现
- tarball 下载（GitHub Release asset）——README draft 中标注"由 install.sh 内部处理，无需暴露"

reporter 检查时请确认 readme-install-block-draft.md 末尾"G4 双 URL 说明"节完整体现这两条。

## I2 阶段 apply 步骤摘要

1. CLAUDE.md：在第 131 行（Feature canned answers）后插入 apps/landing 行（见 diff 草稿）
2. README.md：用 readme-install-block-draft.md 的 install block 替换现有 `## 5–10 分钟上手` 代码块
3. 运行 `pnpm typecheck` + `pnpm test` 确认绿
4. Commit：`docs(m5): add apps/landing to CLAUDE.md + update README install block`
