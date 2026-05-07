```
 ╔══════════════════════════════════════════════════════════════════════════╗
 ║  Pages Source Decision — Why Option 3 (apps/landing/dist + Actions)  ║
 ╚══════════════════════════════════════════════════════════════════════════╝

  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐
  │  dispatch    │───►│    build     │───►│ upload artifact  │───►│ deploy-pages  │
  │  (push main) │    │ (Pretext HTML│    │  (actions/       │    │  (GitHub      │
  │              │    │  + hash refs) │    │   upload-artifact)│    │   Pages host) │
  └──────────────┘    └──────────────┘    └──────────────────┘    └───────────────┘
         │                   │                      │                       │
    trigger CI         dist/ output          artifacts/               live site
    workflow          真正发版物             留存可追              libz-renlab-ai.github.io
```

---

## 决策结论（一句话）

**选 Option 3，因为 PR 上 preview deployment 是验证链路的核心依赖，且 build 步为未来 hash/压缩留位，无需重构即可接入。**

---

## 三个选项原始评分摘要

| 选项 | migration_cost | CI required | 单一事实来源 | 回滚难度 | P3 推荐 |
|------|---------------|-------------|-------------|---------|---------|
| Option 1: gh-pages 分支 | low | ❌ | ❌ 双分支同步 | 低（git push -f） | ❌ |
| **Option 3: apps/landing/dist + Actions** | **high** | **✅** | **✅** | 中（revert YAML commit） | ❌ |
| Option 2: main:/docs | low | ❌ | ✅ | 极低（git revert） | **✅** |

> P3 probe (`.fastprobe/issue84/p3.json`) 推荐 Option 2，三维：migration_cost=low / CI required=❌ / 单一事实来源=✅。

---

## 反方主张：P3 推荐 Option 2 的理由

**P3 probe 论点**（来源：`research.md §G3` + `p3.json#rationale`）：

1. **migration_cost 低**：main:/docs 只是把已有文件路径映射到 Pages，零迁移代价。
2. **无 CI 依赖**：git push 直接触发 Pages 重建，链条最短，无 workflow 模板学习成本。
3. **单一事实来源**：源码即部署物，`main` 分支以外不存在独立的"部署状态"，不担心分支 drift。

> "docs/ 方案最轻量，单分支工作流，源码即部署物，迁移与回滚成本最低；CI 非必须，初期迭代最快。"  
> — `p3.json#rationale`

---

## 正方反驳：本仓库需要 Option 3 的两个不可省略理由

### R1：必须 build 步 — build 步骤为未来 hash/压缩留位

`apps/landing/dist/` 是 `pnpm --filter landing build` 的输出目录。build 步骤为未来 content-hash 化 asset（`index.a1b2c3d4.js`）与 gzip/brotli 压缩留位，使 preview deployment 链路在生长过程中无需重构。main:/docs 是源码目录，**不含 build 产物**；若让 Pages 直接 serve `apps/landing/src/`，则 future hash/压缩基础设施无法接入。preview deployment（PR 上独立 URL）是当前主驱动，hash 化是顺水推舟的副产物。

> 引用：`plan.md §I1`："Pages source = Actions deploy `apps/landing/dist/`"

### R2：必须 preview deployment — PR 上验证是核心门禁

本 issue 的停止条件要求"≥1 真陌生用户 TTHW ≤ 5 min"，而 dogfood 验证链路（`judge.sh` + Lighthouse + design review）依赖 **PR 上真实 Pages URL** 才能跑通。若走 main:/docs，则 PR 开出来 Pages URL 指向的是上一次 push 到 main 的 `main:/docs` 内容，无法在 PR 内预览未合并的 landing 改动。Actions deploy 每个 PR 都生成独立 preview URL（`pages-preview.example.com/pr-<n>`），这是验证链路的必要基础设施。

> 引用：`plan.md §3` judge harness 中 Pages live probe 使用 `https://libz-renlab-ai.github.io/TeamBrain/`

---

## Open Question H7：紧急回滚路径

当 Actions deploy workflow 本身出问题（workflow 模板 bug / Actions 卡死 / Pages source 配置损坏）时，两条 fallback：

| Fallback | 操作步骤 | 恢复时间 |
|----------|---------|---------|
| **A：临时切回 main:/docs** | 1. GitHub Pages settings 改 Source 为 `main:/docs`（手动在 GitHub UI Pages 配置页操作）<br>2. `cp -r apps/landing/dist/* docs/` 并 `git add docs/ && git push`<br>3. Pages 从 main:/docs 直接 serve，不再走 Actions | ~5–10 min（手动操作 + Pages rebuild） |
| **B：禁用 workflow，直接 GitHub Pages settings 选 None/Branch** | 1. 在 GitHub repo Settings → Pages → Source 选 **None** 暂时下线 landing<br>2. 修好 workflow 后重新 enable 并 push 触发 | ~2–5 min（仅 Pages 配置变更，无文件操作） |

> 两种 fallback 均不依赖 `gh-pages` 分支（Option 1 的回滚路径），也不需要 revert 任何 commit。**推荐优先选 B**（最快下线、最小侵入），修好后再开回 Actions。

---

## 何时复评估

| 触发条件 | 复评估内容 |
|---------|-----------|
| Pages billing 超额 | 比对 Option 1 / Option 2 / Option 3 的 Actions minutes 消耗，决定是否切到无 CI 方案 |
| Actions 卡住连续 ≥ 2 次 | 检查 `landing-deploy.yml` 模板稳定性；若 runner 层面问题考虑降级到 main:/docs（临时Fallback A） |

复评估时重跑 P3 probe 对比三项指标（migration_cost / CI_required / rollback_path），用 JSON 结果更新本文件第 3 节评分表。