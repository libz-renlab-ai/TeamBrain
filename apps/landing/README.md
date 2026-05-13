# apps/landing (DEPRECATED — 2026-05-13)

> **Retired.** This single-page `apps/landing/` was the original 30-second
> landing page deployed to `libz-renlab-ai.github.io/TeamBrain/`. As of
> 2026-05-13 (PR for issue 「frontend → RocketTeam」) the deployed Pages
> artefact is built from the RocketTeam Next.js submodule via
> `landing/build-static.sh` and `.github/workflows/landing-deploy.yml`.
>
> The new entry point is:
>
> - **Source**: `landing/rocketteam/` (git submodule, upstream
>   `hrdAI3/RocketTeam`) + `landing/overlay/` (TeamBrain-side static-export
>   patches) + `landing/build-static.sh` (overlay + build script).
> - **Deployed URL**: `https://libz-renlab-ai.github.io/TeamBrain/` (now
>   serves the RocketTeam static export with 22 pre-rendered pages and
>   demo data inlined into `/data/*.json`).
>
> `apps/landing/` is kept for one release cycle as a fallback / history
> reference and will be removed afterwards. The `pnpm --filter landing
> build` script still works locally (`pnpm install --filter landing` ;
> `pnpm --filter landing build`) but is no longer reached by CI.

---

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 框架 | Pretext-native 静态 HTML/CSS | landing 无需 SPA 复杂度；减少攻击面、简化 Pages 部署 |
| 构建产物 | `apps/landing/dist/` | Actions workflow 直接 push 到 Pages |
| 部署 | GitHub Actions (`landing-deploy.yml`) | main push 触发，构建与发布解耦 |
| 禁止 | React / Vue / Next.js / 任何 JS 框架 | spec 强制；AI-slop landing 特征之一 |
| 字体/图标 | 系统字体栈 + 手工 SVG | 避免 AI-generic 资产污染品牌辨识度 |

决策来源：`docs/specs/2026-05-07-landing-copy-actually-needed.md` 决策 1 / 7；P5 anti-slop patterns。

---

## 目录布局

```
apps/landing/
├── package.json          # pnpm workspace 包定义
├── README.md             # 本文件
├── src/
│   ├── index.html        # 页面入口（Pretext-native，无构建工具）
│   └── styles.css        # 纯 CSS（无 preprocessor、无框架）
├── public/               # 静态资源：favicon、og-image 等
└── dist/                 # 构建产物（pnpm --filter landing build 输出，由 CI 部署）
```

---

## 构建命令

```bash
pnpm --filter landing build   # 构建 → dist/
pnpm --filter landing preview # 本地预览 dist/
pnpm --filter landing lint    # htmlhint src/
pnpm --filter landing verify  # Lighthouse 跑 lh.json
```

CI 在 main push 时自动触发；本地开发可直接打开 `src/index.html` 预览。

---

## Lighthouse 验收门禁

| 指标 | 最低分 |
|------|--------|
| Performance | ≥ 85 |
| Accessibility | ≥ 90 |
| SEO | ≥ 90 |

CI 中集成 `@lhci/cli` JSON report，满足门禁方可 merge。
来源：P6 a11y/SEO baseline（`docs/plans/issue-84/probes/p5-p6.md`）。

---

## AI-slop 反例清单

以下特征出现任意一条，PR 将被 block 并要求重设计（来源：P5 8 must-avoid patterns）：

1. **抽象渐变宇宙背景 + 漂浮光点** — 用品牌色块或真实产品截图替代装饰性粒子效果
2. **无作者名的虚假推荐语卡片** — 必须引用真实用户姓名/头像/GitHub 链接，或完全移除
3. **堆砌营销热词 hero 文案**（Revolutionize / Synergy / AI-powered） — 改用 pain-first 句式（参见 spec Leaf 1 决策）
4. **通用 AI 生成 feature 图标**（大脑/灯泡/齿轮） — 用产品截图或手工 SVG 替代
5. **全页企业独白，缺乏用户声音** — 每屏至少一处真实用户视角引用或实测数字

---

## Hero 文案（定稿，来自 spec Leaf 1）

```
Claude Code 没有记忆。你纠正它的每一句话，下次都白说。
— 不是 CLAUDE.md。是会自己进化的活规则库。
```

安装入口（spec 决策 5）：

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh
teamagent init
```

---

## 与 plan.md Stage 关系

| Stage | 交付物 | 说明 |
|-------|--------|------|
| **P1** | 静态 HTML 骨架（`src/index.html` + `src/styles.css`） | 本 README 凝固设计边界；hero 文案、对比表结构来自 spec |
| **P2** | Hero GIF（double-moment 拦截演示）+ 对比表 | 依赖 P1 骨架；内容以 spec 决策 2/3/4 为准 |
| **P3+** | install.sh、Pages workflow、TTHW dogfood 验证 | 见 `docs/plans/issue-84/plan.md` |
