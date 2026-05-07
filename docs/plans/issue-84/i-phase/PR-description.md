## Summary

- **R1 决策固化**：8 个 FASTPROBE probe 完成（P1–P8），合并 spec 7 条 grill 决策 + 8 features 浮
  第一/二屏；跨 probe 矛盾 G1–G6 全部记录，G1–G4 有 escalation 建议。
- **R2 产物拓扑**：12 个 R2 artifact 全部 syntax/parse 通过——`apps/landing/`（README +
  package.json）、`release-prep/install.sh.draft`（bash -n OK，P4 7 项 mitigation 全覆盖）、
  `.github/workflows/landing-deploy.yml`（deploy-pages@v4）、4 份 worker summary、
  `pages-source-decision.md`（Option 3 决策 + §G3 escalation）、CLAUDE.md/README install block 草稿。
- **I-phase 矛盾修复**：§C-1 pages-source-decision hash 化措辞 drift 已修（build 步为未来
  hash/压缩留位，preview deployment 为当前主驱动）；§C-2 `pnpm-workspace.yaml` 已补 `apps/*`
  glob，令 `pnpm install --filter landing` CI 可解析 `@teamagent/landing`。
- **I2 文档同步**：`CLAUDE.md` Project tools 表新增 landing 行（带 Pages endpoint + install
  one-liner）；`README.md` 顶部新增 install block（两步主推 + `| sh` 备选，双 URL 对照）。
- **P2 release branch 准备**：`release-prep/gen-sha256.sh`（bash -n OK，macOS/Linux 双兼容）+
  `release-publish-checklist.md`（完整 branch ops → SHA256 → publish → verify → rollback runbook，
  push/Release 两步需用户确认）。
- **P1 设计探索（TBD）**：3 variant HTML（A-minimalist、B-bold-typo；C-doc-style TBD）——
  worker-10 仍 in_progress，最终 `apps/landing/src/index.html` 由用户选 variant 后落盘，
  本 PR description 以占位符标注。

---

## What changed

| File | Lines | 说明 |
|------|------:|------|
| `pnpm-workspace.yaml` | +2 | 加 `apps/*` glob（§C-2 fix） |
| `CLAUDE.md` | ~+5/-4 | Project tools 表新增 landing 行；TEAMAGENT marker 去字面 HTML 注释 |
| `README.md` | +49 | 顶部 install block（主推两步 + `\| sh` 备选） |
| `docs/plans/issue-84/r2/pages-source-decision.md` | ~+4/-3 | §R1 措辞修正（§C-1 fix） |
| `apps/landing/README.md` | 96 | landing 子包说明 + AI-slop 反例清单 |
| `apps/landing/package.json` | 19 | `@teamagent/landing`；scripts.build = `cp -r` |
| `release-prep/install.sh.draft` | 198 | P4 7 项 mitigation 全覆盖；bash -n OK |
| `release-prep/install-sh-checklist.md` | 55 | P4 → install.sh 行号映射 + acceptance probe |
| `release-prep/gen-sha256.sh` | 52 | SHA256 生成；macOS/Linux 双兼容；bash -n OK |
| `.github/workflows/landing-deploy.yml` | 49 | push main → deploy-pages@v4 |
| `docs/plans/issue-84/r2/pages-source-decision.md` | 84 | Option 3 决策文档（含 §G3 escalation） |
| `docs/plans/issue-84/r2/claude-md-row-draft.md` | 52 | CLAUDE.md landing 行 unified diff 草稿 |
| `docs/plans/issue-84/r2/readme-install-block-draft.md` | 69 | README install block 草稿 |
| `docs/plans/issue-84/i-phase/release-publish-checklist.md` | 146 | P2 runbook（文档只读，不自动执行） |
| `docs/plans/issue-84/i-phase/design-variants/A-minimalist/index.html` | TBD | variant A HTML（worker-10） |
| `docs/plans/issue-84/i-phase/design-variants/B-bold-typo/index.html` | TBD | variant B HTML（worker-10） |
| `docs/plans/issue-84/i-phase/design-variants/C-doc-style/index.html` | TBD | variant C HTML（worker-10，TBD） |
| `docs/plans/issue-84/{plan,research,report}.md` | — | 计划/研究/报告文档（0 commit） |
| `docs/plans/issue-84/r2/INDEX.md` | — | R2 产物索引（0 commit） |

---

## How verified

6 项跨 worker 一致性检查（来自 r2/INDEX.md §B）：

| Check | 结果 |
|-------|------|
| install one-liner 三处同一 raw URL | ✅ |
| claude-md-row 引用 vs worker-5 实际 apps/landing/ 路径 | ✅ |
| workflow build 命令 vs package.json scripts.build | ✅ |
| TEAMAGENT marker 纯名写法（无字面 HTML 注释） | ✅ |
| §G4 双 URL（release 分支 raw + Release asset tarball）共存无冲突 | ✅ |
| pnpm-workspace.yaml `apps/*` glob 加后 `bash -c 'python3 -c "import yaml; ..."'` parse OK | ✅（worker-9 验证）|

单文件 probe：

| Tool | 对象 | 结果 |
|------|------|------|
| `bash -n` | `release-prep/install.sh.draft` | OK |
| `bash -n` | `release-prep/gen-sha256.sh` | OK |
| `python3 yaml.safe_load` | `pnpm-workspace.yaml` | OK |
| markdown lint | 所有 `r2/*.md` | OK |

---

## Outstanding

以下为已知 follow-up，本 PR 不 block merge：

1. **design variant 用户选择**：用户选 A/B/C 后，`apps/landing/src/index.html` 才能落盘；
   worker-10 r10-summary 给出选择矩阵，用户确认后 apply。
2. **release branch publish**：`git push origin release` + `gh release create v0.9.4 ...`
   两步需用户明确确认后执行（见 `release-publish-checklist.md`）。
3. **C-doc-style variant**（worker-10 TBD）：如已完成，PR reviewer 可在 design-variants/ 下看到；
   未完成则下一轮补。
4. **H6 self-update**：`install.sh` 自更新机制 punt，列 follow-up issue。
5. **V1 真用户 dogfood**：≥ 1 位真实陌生用户 TTHW ≤ 5 min，需 Pages 上线后安排；
   本 PR 合并门禁暂以 CI green + Codex silent/👍 为准，V1 在 release 分支 publish 后独立跑。

---

## Test plan

- [ ] `pnpm install` 无报错（`pnpm-workspace.yaml` 已加 `apps/*`）
- [ ] `pnpm --filter landing build` 退出码 0（`apps/landing/package.json` build script 存在）
- [ ] `bash -n release-prep/install.sh.draft` 通过
- [ ] `INSTALL_DRY_RUN=1 bash release-prep/install.sh.draft` 退出码 0，打印 `[dry-run]` 行，无副作用
- [ ] `bash -n release-prep/gen-sha256.sh` 通过
- [ ] `python3 -c "import yaml,sys; yaml.safe_load(open('pnpm-workspace.yaml')); print('OK')"` 输出 OK
- [ ] `grep "apps/landing" CLAUDE.md` 命中 Project tools 表 landing 行
- [ ] `grep "install.sh" README.md` 命中 raw URL
- [ ] PR CI green（`pnpm test`、`pnpm typecheck`）
- [ ] `bash scripts/verify-all-rules.sh` PASS
- [ ] `bash docs/postpr/verify-canned-answer.sh` PASS
- [ ] Codex bot inline review：triage P1/P2 before merge

---

Closes #84

🤖 Generated with [Claude Code](https://claude.com/claude-code)
