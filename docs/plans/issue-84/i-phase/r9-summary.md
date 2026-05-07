```
 ┌──────────────────────────────────────────────────────┐
 │  r9-summary: I-phase worker-9 — §C-1 + §C-2 fixes  │
 │                                                      │
 │   pnpm-workspace.yaml                                │
 │     packages/*  (existing)                           │
 │     apps/*      (NEW — #84)                          │
 │                          │                           │
 │   pages-source-decision.md §R1                       │
 │     before: "hash 化 asset 引用必须 build 步"         │
 │     after:  "build 步骤为未来 hash/压缩留位"          │
 └──────────────────────────────────────────────────────┘
```

# r9-summary — I-phase worker-9

## 改动文件

### 1. pnpm-workspace.yaml（§C-2 fix）

**Before:**
```yaml
packages:
  - "packages/*"
```

**After:**
```yaml
packages:
  - "packages/*"
  # apps/ subprojects (landing page etc; introduced in #84)
  - "apps/*"
```

- 加入 `apps/*` glob，令 `pnpm install --filter landing` 在 GitHub Actions 中能解析 `@teamagent/landing`。
- 保留 `packages/*` 在前；注释标明引入版本 #84。
- Python yaml 解析 + globs 检查：PASS。

### 2. docs/plans/issue-84/r2/pages-source-decision.md（§C-1 fix）

**改动 1 — 决策结论（L20）**

Before: `选 Option 3，因为 Pretext-native landing 含 hash 化 asset 引用必须 build 步...`

After: `选 Option 3，因为 PR 上 preview deployment 是验证链路的核心依赖，且 build 步为未来 hash/压缩留位...`

**改动 2 — §R1 段落（L51-53）**

Before: 主张"JS/CSS 引用须携带 content hash（`index.a1b2c3d4.js`），确保浏览器强制缓存失效..."

After: 主张"build 步骤为未来 content-hash 化 asset 与 gzip/brotli 压缩留位，preview deployment（PR 上独立 URL）是当前主驱动，hash 化是顺水推舟的副产物。"

不动章节：§R2、§H7 Fallback A/B、何时复评估表。

## Lighthouse 影响

无。本次改动只改文档措辞与 workspace 配置，不改 HTML/CSS/build script。

## 结论

| drift | 状态 |
|-------|------|
| §C-1 pages-source-decision hash 化 asset 措辞 | ✅ closed |
| §C-2 pnpm-workspace.yaml 缺 apps/* glob | ✅ closed |
