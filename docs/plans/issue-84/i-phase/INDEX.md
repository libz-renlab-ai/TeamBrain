```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  I-phase INDEX — Issue #84 (FASTPROBE round 3 consolidation)          │
 │                                                                        │
 │   worker-9   ──► §C-1 / §C-2 fix (workspace.yaml + decision §R1)     │
 │   worker-10  ──► 3 design variants (A/B/C) under design-variants/    │
 │   worker-11  ──► release publish prep (checklist + gen-sha256.sh)    │
 │   worker-12  ──► I2 apply (CLAUDE.md + README.md install block)      │
 │   worker-13  ──► PR description + REVIEW-FOR-USER (option c)         │
 │                                                                        │
 │   下一步：用户选 design variant ──► commit + open PR ──► POSTPR loop │
 └────────────────────────────────────────────────────────────────────────┘
```

# I-phase INDEX — Issue #84 产物拓扑

I-phase round 3 consolidation：5 个 sonnet worker（9/10/11/12/13）+ 本文件 reporter-i opus 1M。
全部产物 0 commit / 0 push，等待用户决策后由 main agent 统一落盘。

---

## A. I-phase 产物总览

| File | Type | Lines | Status (syntax/parse) | 由 worker | 关联 §G/§H/§C | 备注 |
|------|------|------:|----------------------|-----------|---------------|------|
| `pnpm-workspace.yaml` | modified | 5 | YAML parse OK | worker-9 | §C-2 | 加 `apps/*` glob |
| `docs/plans/issue-84/r2/pages-source-decision.md` | modified | 84 | markdown OK | worker-9 | §C-1 | §R1 措辞修正（hash drift closed） |
| `docs/plans/issue-84/i-phase/design-variants/A-minimalist/index.html` | new | 131 | HTML well-formed | worker-10 | §H4 | 极简白底+橙红 accent，对比表第一屏 |
| `docs/plans/issue-84/i-phase/design-variants/B-bold-typo/index.html` | new | 332 | HTML well-formed | worker-10 | §H4 | 黑底大排印 + 60% GIF 占视口 |
| `docs/plans/issue-84/i-phase/design-variants/C-doc-style/index.html` | new | 295 | HTML well-formed | worker-10 | §H4 | RFC/编程书风格，§1-7 章节编号 |
| `release-prep/gen-sha256.sh` | new | 52 | bash -n OK | worker-11 | §G4 / §H1 | macOS shasum / Linux sha256sum 双兼容 |
| `docs/plans/issue-84/i-phase/release-publish-checklist.md` | new | 146 | markdown OK | worker-11 | §G4 / §H1 / §H6 | 完整 runbook（push/Release 两步要 USER CONFIRMATION） |
| `CLAUDE.md` | modified | 132 | preserved | worker-12 | I2 / §H1 | Project tools 表 +1 row（apps/landing/） |
| `README.md` | modified | +49 | markdown OK | worker-12 | I2 / §G4 | 顶部 install block（两步主推 + `\| sh` 备选） |
| `docs/plans/issue-84/i-phase/PR-description.md` | new | 108 | markdown OK | worker-13 | — | GitHub PR body 草稿（Summary / What changed / How verified / Outstanding / Test plan / Closes #84） |
| `docs/plans/issue-84/i-phase/REVIEW-FOR-USER.md` | new | 117 | markdown OK | worker-13 | — | 用户审 PR 前单页概览（option c），3 决策树 + 已落地状态 + 风险 |
| `docs/plans/issue-84/i-phase/r{9,10,11,12,13}-summary.md` | new | 4–65 | markdown OK | 各 worker | — | 每 worker 自描述 |

---

## B. §C 矛盾闭环检查

| Drift | 来源 | 状态 |
|-------|------|------|
| §C-1 pages-source-decision §R1 主张「必须 build 步生成 hash 化 asset」与 package.json `cp -r` 不一致 | r2/INDEX.md §C | ✅ closed —— worker-9 把 §R1 改为「build 步骤为未来 hash/压缩留位，preview deployment（PR 上独立 URL）是当前主驱动」；保留 Option 3 决策本身。 |
| §C-2 pnpm-workspace.yaml 仅 `packages/*`，CI `pnpm install --filter landing` 会失败 | r2/INDEX.md §C | ✅ closed —— worker-9 加 `apps/*` glob；YAML parse OK；landing-deploy.yml 已可在 CI 解析 `@teamagent/landing`。 |
| 本轮新浮：design variant B install 文案与其它两 variant + README 不一致 | I-phase round | ⚠️ open —— worker-10 B-bold-typo `index.html:255-257` 用 `npx teamagent init` 作为 install 命令，但 A、C variant + README.md + apps/landing/README.md 全部统一使用 `curl -fsSL .../release/install.sh \| sh`。见 §C 跨 worker 一致性。 |

---

## C. 跨 worker 一致性检查（I-phase round）

| Check | 期望 | 实测 | 结论 |
|-------|------|------|------|
| install one-liner: A/C variant vs README.md vs CLAUDE.md row | 三处同一 raw URL `release/install.sh` | A `:.../release/install.sh \| sh`、C 同 A、README L29+L37 同 URL、CLAUDE.md row 引用 `apps/landing/` 路径 | ✅ |
| install one-liner: B variant vs 其它 | 同 release/install.sh | B `:255-257` 用 `npx teamagent init`，与其它 variant 不一致 | ⚠️ 见 §B 表 row 3 / §D-1 |
| SHA256 路径一致：worker-11 gen-sha256.sh 输出 vs worker-6 install.sh.draft 期望 | install.sh.draft 期望 `${PRIMARY_BASE}/install.sh.sha256` 与 `${FALLBACK_BASE}/install.sh.sha256` 双轨；gen-sha256.sh 写 `<install_dir>/install.sh.sha256` | install.sh.draft `:143-153` 对接 `release/install.sh.sha256`；gen-sha256.sh `SHA256_OUT="${INSTALL_DIR}/${INSTALL_BASENAME}.sha256"`；release-publish-checklist.md 把生成产物 cp 到 release branch 根 | ✅ |
| release-publish-checklist 的 raw URL vs README install block 的 raw URL | 同 `release/install.sh` | checklist L107+L119 = README L29+L37 = `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh` | ✅ |
| CLAUDE.md row 引用 vs apps/landing/ + workflow 实际路径 | row 提到 `apps/landing/` + `.github/workflows/landing-deploy.yml` | CLAUDE.md `:132` 命中两条 path；landing-deploy.yml 存在；apps/landing/ 存在 | ✅ |
| TEAMAGENT marker 写法 | 纯名 `TEAMAGENT:START` / `TEAMAGENT:END` | worker-12 改 CLAUDE.md 不引入字面 HTML 注释 marker；TEAMAGENT 自动 recompile 区段保持纯名 | ✅ |

---

## D. 跨 I-phase 矛盾（escalation）

### D-1 ⚠️ B-bold-typo install 文案与产品决策（spec 决策 5）冲突

- **现象**：`design-variants/B-bold-typo/index.html:255-257` 用 `<h2>npm install</h2><pre><span class="cmd">npx</span> teamagent init</pre>`，把 install 通道从 `curl ... release/install.sh | sh` 替换为 `npx teamagent init`。
- **冲突**：spec 决策 5（已锁定，REVIEW-FOR-USER §5）规定 install 入口是 `curl -fsSL .../release/install.sh | sh`；A 和 C variant 都遵守了；B variant drift。
- **影响**：如果用户选 B，apps/landing/src/index.html 落盘时会引入 install URL 不一致，破坏 r2/INDEX.md §B 已 ✅ 的「三处同一 raw URL」一致性。
- **escalation 建议**：在用户做 Decision A 之前，把 B variant 的 install 段改成与 A/C 一致的两步主推格式；不需要重画整个 B variant，只换 `installation` section 的 HTML。或在 user 选 B 时由 main agent apply 时强制覆盖 install 段。
- **不需推翻 design 探索本身**——仅消除 install 文案 drift。

---

## E. 推进到 V1 / Ship 阶段需要的前置

1. **design variant 决策**（用户）：在 A / B / C 中挑一个；worker-10 推荐 A（minimalist，对比表第一屏，Lighthouse 兼容度最高）。如果选 B，先解 §D-1 的 install 文案 drift。
2. **release branch publish 实际执行**（用户决策点）：worker-11 已给出 `release-publish-checklist.md` runbook；两步 `git push origin release` + `gh release create v0.9.4 ...` 都需 USER CONFIRMATION。
3. **GIF 录制**（用户决策点）：spec 决策 4 = double-moment（moment1 correct-once `moment → dayjs`；moment2 下次被 PreToolUse 拦截）；本 PR 不阻塞，但需安排谁录、何时录。
4. **V1 真用户 dogfood**：≥ 1 真实陌生用户 TTHW ≤ 5 min；Pages live + install.sh 上线后启动；codex web for github 自动 session 不算验收。
5. **未解 open question**（research §H）：
   - **§H1** SHA256 publish 端策略（CI publish 路径决策）—— release-publish-checklist 已实现 dual-path runbook，但具体 CI workflow 待 R3 决定。
   - **§H2** universal pack ~15 条字面关键词规则的 commit 来源（手写 vs 抽取）。
   - **§H4** design-shotgun variant 数（plan ≥3，本轮 = 3）—— 已答；C 完成后可视为 3 variant 闭环。
   - **§H6** Route B install.sh self-update —— punt，列 follow-up issue。

---

## F. 总结

I-phase round 5 worker × 2 probe = 10 probe 全部 syntax/parse OK；§C-1 / §C-2 关闭；本轮新增 1 个 ⚠️（D-1 B variant install 文案 drift），属 design variant 内可手术修复，不阻塞 PR。R1+R2+I-phase 全部产物收口；下一步是 main agent 按用户 design variant 选择落盘 → atomic commit → push → POSTPR loop。

