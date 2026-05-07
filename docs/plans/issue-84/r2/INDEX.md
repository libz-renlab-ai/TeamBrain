```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  R2 INDEX — issue #84 产物拓扑（FASTPROBE round 2 consolidation）     │
 │                                                                        │
 │   apps/landing/ ─┐                                                    │
 │                  ├──► .github/workflows/landing-deploy.yml ──► Pages  │
 │   release-prep/ ─┘                                                    │
 │     install.sh.draft + checklist  ──► release branch raw URL          │
 │                                                                        │
 │   docs/plans/issue-84/r2/  (Pages source decision · diff drafts ·     │
 │                              4 worker summaries · 本 INDEX)           │
 └────────────────────────────────────────────────────────────────────────┘
```

# R2 INDEX — Issue #84 产物拓扑

R2 round consolidation：4 个 sonnet worker（5/6/7/8）+ 本文件 reporter-r2。
所有产物 0 commit / 0 push，等待 I1/I2 阶段统一落盘。

---

## A. R2 产物总览

| File | Lines | Bytes | Status (syntax/parse) | 由 worker | 关联 §H/§G | 备注 |
|------|------:|------:|----------------------|-----------|------------|------|
| `apps/landing/README.md` | 96 | 3554 | markdown OK | worker-5 | §B/§C spec 决策 1/3/5/7 | landing 子包说明 + AI-slop 反例清单 |
| `apps/landing/package.json` | 19 | 436 | JSON parse OK | worker-5 | — | scripts.build 走 `cp -r`（见 §C-1） |
| `release-prep/install.sh.draft` | 198 | 8256 | `bash -n` OK | worker-6 | §G2 / §H1 / §H5 / §H6 | P4 7 项 mitigation 全覆盖 |
| `release-prep/install-sh-checklist.md` | 55 | 4464 | markdown OK | worker-6 | §G2 / §G4 / §H1/H5/H6 | P4 → install.sh 行号映射 + acceptance probe |
| `.github/workflows/landing-deploy.yml` | 49 | 980 | YAML parse OK | worker-7 | §G3 / §H7 | path filter 限定 `apps/landing/**`；deploy-pages@v4 |
| `docs/plans/issue-84/r2/pages-source-decision.md` | 84 | 5987 | markdown OK | worker-7 | §G3 / §H7 | Option 3 决策 + P3 反方反驳 + Fallback A/B |
| `docs/plans/issue-84/r2/claude-md-row-draft.md` | 52 | 3031 | markdown OK | worker-8 | I2 阶段 | unified diff 在第 131 行后插 apps/landing row |
| `docs/plans/issue-84/r2/readme-install-block-draft.md` | 69 | 2655 | markdown OK | worker-8 | §G4 / §H1 | 两步 install 主推 + `\| sh` 备选 |
| `docs/plans/issue-84/r2/r5-summary.md` | 62 | 2765 | markdown OK | worker-5 | — | r5 自描述 |
| `docs/plans/issue-84/r2/r6-summary.md` | 44 | 2107 | markdown OK | worker-6 | — | r6 自描述 |
| `docs/plans/issue-84/r2/r7-summary.md` | 45 | 1988 | markdown OK | worker-7 | — | r7 自描述 |
| `docs/plans/issue-84/r2/r8-summary.md` | 49 | 2455 | markdown OK | worker-8 | — | r8 自描述 |

---

## B. 跨 worker 一致性检查

| 检查项 | 期望 | 实测 | 结论 |
|--------|------|------|------|
| install one-liner 字符一致 | 三处使用同一 `release` 分支 raw URL | install.sh.draft `PRIMARY_BASE` / readme-install-block-draft L14+L22 / apps/landing/README L84 全部 = `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh` | ✅ |
| claude-md-row 引用 vs worker-5 实际 | row 引用 `apps/landing/` 路径 + `pnpm --filter landing build` | row L38/L49 使用 `apps/landing/`；worker-5 产出 `apps/landing/{README.md,package.json}`；package.json scripts.build 存在 | ✅ |
| workflow build 命令 vs package.json | `pnpm --filter landing build` 在 scripts | workflow L31 = `pnpm install --filter landing && pnpm --filter landing build`；package.json scripts.build = `cp -r src/. dist/ && cp -r public/. dist/ 2>/dev/null \|\| true` | ✅ 命令存在；⚠️ 见 §C-1 |
| pages-source-decision「hash 化 asset」主张 vs package.json build | build 步真生成带 content hash 的 asset | package.json build 是纯 `cp -r`，不生成 hash；decision §R1 主张 `index.a1b2c3d4.js` | ⚠️ 矛盾，见 §C-1 |
| pnpm-workspace.yaml 是否含 `apps/*` glob | 含 | 仅 `packages/*` | ⚠️ I2 必补，见 §D |
| TEAMAGENT marker 写法 | 纯名 `TEAMAGENT:START` / `TEAMAGENT:END`，禁字面 HTML 注释 | claude-md-row-draft L14 用纯名 | ✅ |
| §G4 双 URL 表达 | install.sh 在 release 分支 + tarball 在 Release asset 共存 | install.sh.draft `PRIMARY_BASE`（release branch raw）+ `TARBALL_BASE`（releases/download/{tag}）双轨；checklist §G4 resolution 明示无冲突；readme-install-block-draft §G4 节同步 | ✅ |

---

## C. 跨 R2 矛盾（escalation）

### C-1 ⚠️ pages-source-decision 主张「必须 build 步生成 hash 化 asset」vs package.json build 实际是纯 `cp -r`

- **decision §R1**（`pages-source-decision.md:51-53`）：选 Option 3 的核心理由 1 是"HTML 模板含 hash 化 asset 引用"，举例 `index.a1b2c3d4.js`；声称 `apps/landing/dist/` 专为 hash 化产物设计。
- **package.json build 实测**：`cp -r src/. dist/ && cp -r public/. dist/ 2>/dev/null \|\| true`，**未引入** esbuild / vite / 任何 hash 工具；r5-summary.md L38–L40 显式声明 "esbuild 未引入：源文件是纯 HTML/CSS，无需 JS bundler"。
- **后果**：当前 build 不生成 hash；浏览器缓存失效将依赖 HTTP cache-control / GitHub Pages 默认头部，不是 decision §R1 说的 content-hash 机制。
- **escalation 建议**：保留 Option 3 决策（preview deployment 这条 R2 仍成立），但在 P1 设计探索 / I1 阶段二选一：
  1. **改 decision §R1 主张**——把"hash 化 asset"措辞改成"build 步骤为未来 hash/压缩留位（preview deployment 是当前主驱动）"；
  2. **或** 在 P1/P2 阶段升级 build script，引入最小 hash 化（例如 `esbuild --entry-names=[name].[hash]` 或脚本生成 manifest）。
- **不需推翻 Option 3 决策本身**，只需消除两份文档的措辞 drift。

### C-2 ⚠️ pnpm-workspace.yaml 仍只 `packages/*`；workflow 假设 `pnpm install --filter landing` 可解析 `@teamagent/landing`

- 实测 `pnpm-workspace.yaml` 内容只 `packages: ["packages/*"]`。
- `landing-deploy.yml:31` 跑 `pnpm install --filter landing`；如不补 glob，CI 拉不到 `@teamagent/landing` 包。
- r5-summary.md "pnpm-workspace.yaml 注意事项" 节已显式标记 I2 阶段补 `apps/*`；本 INDEX 升级到 §D 前置依赖。

---

## D. 推进到 I1 / P1 / P2 阶段的前置（按依赖序）

1. **I2 必做（先于 I1 CI 跑）**：补 `pnpm-workspace.yaml` 加 `apps/*` glob。否则 landing-deploy.yml 的 `pnpm install --filter landing` 在 GitHub Actions 失败。
2. **P1 设计探索**：接 worker-5 README.md 框架（hero 文案、AI-slop 反例清单、Lighthouse 门禁已凝固）跑 `/design-shotgun ≥ 3 variant` + `/design-html` 出 `src/index.html` + `src/styles.css`；H4 决定 variant 数（3 vs 8）。
3. **P2 安装产物**：把 `release-prep/install.sh.draft` 提到 `release` 分支根目录；CI 同时 publish `install.sh.sha256` 解决 H1（双路径：raw URL + Release asset）。
4. **I1 GitHub Pages**：消除 §C-1 措辞 drift（改 decision 或加 hash 化）后才合并 workflow。
5. **决策点未解（带回 R3 或 P 阶段）**：
   - **H1** SHA256 文件位置（install.sh.draft 已实现 dual-path，但 CI publish 端待 R3 决定）
   - **H2** universal pack ~15 条字面关键词规则的 commit 来源（手写 vs 抽取）
   - **H4** design-shotgun variant 数（plan 写 ≥3，P5 给 8 条 negative_prompt_seeds）
   - **H6** Route B install.sh self-update（worker-6 punt）

---

## E. 总结

R2 round 12 个 artifact 全部 syntax/parse 通过；3 处一致性 ✅，2 处 ⚠️（C-1 build 措辞 drift / C-2 pnpm-workspace.yaml glob 缺失）。无 spec 决策推翻。开发者下一步进入 I2（补 workspace glob）→ P1（design-shotgun）→ P2（install.sh 落 release 分支）。
