```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  REVIEW-FOR-USER — issue #84 PR 审前概览                              │
 │                                                                        │
 │  已落地 ──► 待用户决策 ──► 不需你决定的                              │
 │      │              │                   │                              │
 │  R1+R2           design variant      已 close 的                      │
 │  I-phase         release publish     §C-1 / §C-2                      │
 │                  GIF 录制时机                                          │
 └────────────────────────────────────────────────────────────────────────┘
```

# REVIEW-FOR-USER — Issue #84 PR 审前单页概览

这是给你在审 PR / 合并之前的单页决策地图。读完约 3 分钟。

---

## 1. 你需要做的 3 个决策

```
┌─────────────────────────────────────────────────────────────────┐
│  Decision A: 选 landing 设计 variant                            │
│                                                                 │
│   A-minimalist ──► 极简白底，单色代码块，快速跑完 Lighthouse    │
│   B-bold-typo  ──► 粗体对比表 Hero，黑白强对比，印刷风         │
│   C-doc-style  ──► TBD（worker-10 若完成则可选）               │
│                                                                 │
│   → 看 design-variants/{A,B,C}/index.html，选一个              │
│   → 告诉 team，worker-12 将 apply 到 apps/landing/src/         │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Decision B: release branch publish 时机                        │
│                                                                 │
│   PR 合并后 ──► Pages URL live ──► 此时才需要:                 │
│     git push origin release                                     │
│     gh release create v0.9.4 ...                               │
│                                                                 │
│   → 查 release-publish-checklist.md 确认两步                   │
│   → 给 team lead 一声"可以 push"即可                           │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Decision C: GIF 录制时机                                       │
│                                                                 │
│   spec 决策 4：GIF = double-moment                             │
│     moment1: correct-once (moment → dayjs)                     │
│     moment2: 下次被 PreToolUse 拦截                            │
│                                                                 │
│   → Pages live + install.sh 上线后录                           │
│   → 本 PR 无需录；但决定"谁录 / 什么时候录"可以现在           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 已落地状态总览

| 阶段 | 状态 | 产物 / 路径 | 备注 |
|------|------|-------------|------|
| R1 决策固化 | done | `research.md §B/§C/§G/§H`；`.fastprobe/issue84/p1-p8.json` | spec 7 条已锁；G1–G4 矛盾记录并有 escalation |
| R2 产物拓扑 | done | `apps/landing/`、`release-prep/`、`.github/workflows/landing-deploy.yml`、`r2/INDEX.md` | 12 artifact；bash -n / yaml parse / json parse 全 OK |
| §C-1 措辞修复 | done | `docs/plans/issue-84/r2/pages-source-decision.md`（worker-9） | hash 化 drift 已消；Option 3 决策保留 |
| §C-2 workspace glob | done | `pnpm-workspace.yaml` 已加 `apps/*`（worker-9） | CI `pnpm install --filter landing` 可解析 |
| P2 release 准备 | done | `release-prep/gen-sha256.sh`、`release-publish-checklist.md`（worker-11） | 文档 runbook；push 两步待用户确认 |
| I2 CLAUDE.md/README | done | `CLAUDE.md`（landing 行）、`README.md`（install block）（worker-12） | diff 已 apply 到真实文件 |
| P1 设计探索 | partial | `design-variants/A-minimalist/index.html`、`B-bold-typo/index.html`（worker-10） | C-doc-style TBD；**需你选 variant** |
| P1→apps/landing/src/ | pending | 等用户选 variant 后 apply | 见 Decision A |
| I1 GitHub Pages | pending | Pages live 需 PR 合并后 Actions 跑起来 | — |
| V1 真用户 dogfood | pending | ≥1 真实陌生用户 TTHW ≤5min | Pages live 后安排 |

---

## 3. 已知风险与缓解状态（research.md §E）

| Risk | 状态 | 缓解 |
|------|------|------|
| R1：`@teamagent/cli` 翻面发布供应链问题 | 缓解中 | Route B（保留 private:true + tarball）；release-publish-checklist.md 有 rollback 步骤 |
| R2：`curl \| sh` 防火墙拦截 | 缓解中 | install.sh.draft 内置 `FALLBACK_BASE`；两步安装 + `--dry-run` 均已实现 |
| R3：landing 文案 AI slop | 缓解中 | P5 8 条 must-avoid + AI-slop 反例清单在 apps/landing/README.md；设计 review 是 verdict.json gate |
| R4：真实陌生用户 dogfood 人选 | 待处理 | Pages live 后主动招募；占位：codex web session（不算验收） |
| R5：Pages source 权限问题 | 缓解中 | deploy-pages@v4 官方 action；Option 3 经过 pages-source-decision.md 评估 |

---

## 4. 推荐下一步

**主路径（你只需要做这 3 件事）：**

1. 看 `design-variants/A/B/C` 三个 index.html，选一个，告诉 team。
2. PR 审完后点 merge（CI green + Codex silent/👍 是门禁）。
3. Pages live 后告诉 team "可以 push release branch"——team 按
   `release-publish-checklist.md` 走，你只需在两个 `USER CONFIRMATION` 步骤点头。

**备选（如果 CI/Pages 有问题）：**

- `pnpm --filter landing build` 失败 → 检查 `apps/landing/package.json` scripts.build
- `pnpm install --filter landing` 找不到包 → 确认 `pnpm-workspace.yaml` 含 `apps/*`（已 done）
- Pages 404 → 检查 repo Settings → Pages source 是否切到 GitHub Actions

---

## 5. 不需要你决定的项（已 close）

| 项目 | 决策结论 |
|------|---------|
| install 通道选哪个 | `curl -fsSL .../release/install.sh \| sh`（spec 决策 5 锁定，P2 安全评分为附属参考） |
| Pages source 拓扑 | Option 3：`apps/landing/dist` + Actions deploy（pages-source-decision.md） |
| 安装文案 one-liner 字符 | 三处统一 `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh`（r2/INDEX.md §B 验证 ✅） |
| P4 7 项安全 mitigation | 全部映射到 install.sh.draft（bash -n OK）；landing hero 仍保持单行 |
| TEAMAGENT marker 写法 | 纯名 `TEAMAGENT:START` / `TEAMAGENT:END`（CLAUDE.md 约束；worker-8 验证 ✅） |
| H6 self-update | punt，列 follow-up issue（不在本 PR 实现） |
| §C-1 hash 化措辞 | 已修正为"build 步为未来 hash/压缩留位"（worker-9 done ✅） |
| §C-2 pnpm-workspace.yaml | 已补 `apps/*`（worker-9 done ✅） |
