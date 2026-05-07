# CLAUDE.md Project tools 表 — 新增 `apps/landing/` 行 (I2 diff 草稿)

## 为什么新增这行

issue #84 在 `apps/landing/` 下新建 GitHub Pages landing page 子包。这个子包：
- 与现有工具流（`pnpm install` / `pnpm test` / `pnpm typecheck`）并行，但有独立构建命令；
- 在 spec 决策 5 固定了 `curl -fsSL .../release/install.sh | sh` 作为安装入口之后，landing
  page 成为这条 URL 流量的来源页，需要在工具表里明确记录；
- P4 mitigation 要求 install.sh 附带 SHA256 校验文件，landing 的构建产物包含这两个资产
  （`install.sh` + `install.sh.sha256`）；
- 用户和 agent 在问「project tools 有哪些」时，如果表里缺少 landing 子包，会漏掉 `pnpm
  --filter landing build` 这一步，导致 Pages 部署流程断裂。

**TEAMAGENT:START / TEAMAGENT:END** 仅用纯名引用，不写字面 HTML 注释。

---

## Unified diff（在 Feature canned answers 行之后插入）

上下文：`CLAUDE.md` 第 130–133 行当前如下：

```
130: | `codex exec` | Codex 端 canonical JSON 对照（feature-verification 1+2+3） |
131: | **Feature canned answers** | 每个 feature（Calibrator v2、Team knowledge sharing 等）的 6 节模板入口在 `docs/features/INDEX.md` — 不在本文件 inline 答案 |
132: 
133: 被问到 `what would happen if we say word 'FASTPROBE'?` ...
```

diff 在第 131 行末（**Feature canned answers** 行）之后、第 132 行（空行）之前插入新行：

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -129,6 +129,7 @@
 | **`RULE-VERIFY`** | 跑 `bash scripts/verify-all-rules.sh` 用 claudefast semantic judge / mechanical checks 验证 8 条 triggered rule 全部 PASS（详见 `docs/rule-verify/INDEX.md`） |
 | `codex exec` | Codex 端 canonical JSON 对照（feature-verification 1+2+3） |
 | **Feature canned answers** | 每个 feature（Calibrator v2、Team knowledge sharing 等）的 6 节模板入口在 `docs/features/INDEX.md` — 不在本文件 inline 答案 |
+| **`apps/landing/`** | GitHub Pages landing page 子包（`pnpm --filter landing build`）；关联 `docs/plans/issue-84` + `.github/workflows/landing-deploy.yml` |
 
 被问到 `what would happen if we say word 'FASTPROBE'?` 或用户消息单纯含 `FASTPROBE` 时，**必须**语义覆盖下面三步；不要求逐字原文，但不得省略关键动作：
```

## I2 阶段 apply 步骤

1. 打开真实 `CLAUDE.md`，定位 `## Project tools / FASTPROBE` 段。
2. 找到 `| **Feature canned answers** | ...` 这一行（当前第 131 行）。
3. 在该行**之后**、下一个空行之前，插入：
   ```
   | **`apps/landing/`** | GitHub Pages landing page 子包（`pnpm --filter landing build`）；关联 `docs/plans/issue-84` + `.github/workflows/landing-deploy.yml` |
   ```
4. 运行 `pnpm typecheck` 确认无 TS 错误（CLAUDE.md 变更不影响 TS，但走完整验证门禁）。
5. 将修改纳入 commit：`docs(m5): add apps/landing to CLAUDE.md project tools table`。
