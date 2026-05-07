```
 ┌─────────────────────────────────┐
 │  R2 worker-7 summary           │
 │  landing-deploy.yml + Pages    │
 │  source decision               │
 └─────────────────────────────────┘
```

# R2 Worker-7 Summary

## 产出文件

| 文件 | 行数 | 状态 |
|------|------|------|
| `.github/workflows/landing-deploy.yml` | 49 | YAML parse OK |
| `docs/plans/issue-84/r2/pages-source-decision.md` | 84 | 在 60-90 行区间 |

## Workflow 触发器验证

- `workflow_dispatch`: ✅ 手动触发
- `push` 到 `main` 带 `paths` 过滤: ✅ 仅 `apps/landing/**` 和 `.github/workflows/landing-deploy.yml`
- 无意外 CI 触发风险: ✅ 其他路径 push 不触发
- 不冲突现有 `ci.yml` / `nightly-llm-smoke.yml` / `release-branch.yml`: ✅ 独立文件、独立 job

## Workflow 结构

- `build` job: Node 20 + pnpm 9 → `pnpm --filter landing build` → `upload-pages-artifact@v3`
- `deploy` job: `needs: build` → `deploy-pages@v4`
- `permissions`: `pages:write` + `id-token:write` 在 deploy job 作用域
- `concurrency`: `group: pages` + `cancel-in-progress: false`
- `environment`: `name: github-pages` + `url: steps.deployment.outputs.page_url`

## G3 决策落地情况

选定 Option 3 (apps/landing/dist + Actions)，与 plan.md §I1 一致。
pages-source-decision.md 已补充反方主张（P3 推荐 Option 2）和正方反驳（build 步 + preview deployment 必要性），
平息 PR review 阶段潜在质疑（research.md §G3 escalation 要求）。

## H7 回滚路径

两条 fallback 均已在 pages-source-decision.md §Open Question H7 列出：
- **Fallback A**: GitHub Pages settings 切 `main:/docs` + 复制 dist → docs/（~5-10 min）
- **Fallback B**: Pages settings 选 None 暂时下线，修好 workflow 后重新 enable（~2-5 min）

推荐优先 Fallback B（最快、最小侵入）。
