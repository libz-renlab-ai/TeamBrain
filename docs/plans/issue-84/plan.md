```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Issue #84 — Easy-Install Landing Page (GitHub Pages)               │
 │                                                                      │
 │  research ──► plan ──► annotate ──► implement ──► report            │
 │     │           │           │            │             │             │
 │   决策固化   产物拓扑    设计探索    Pages 部署     真用户验证       │
 │                                                                      │
 │  门禁：3rd-party judge harness → verdict.json.passed = true         │
 │  停止：CI green ∧ Codex silent/👍 ∧ ≥1 真陌生用户 TTHW ≤ 5 min      │
 └──────────────────────────────────────────────────────────────────────┘
```

# Issue #84 — Easy-Install Landing Page Plan

GitHub: <https://github.com/libz-renlab-ai/TeamBrain/issues/84>
Owner: `LiuShiyuMath`（已 self-assign）
关联 spec: `docs/specs/2026-05-07-landing-copy-actually-needed.md`（7 条 grill 决策、8 features 浮上来）

---

## 1. Task description

**做什么**
一个 GitHub Pages 上的 landing page + ≤1 行 easy install 命令，让陌生用户从打开网页到跑通 `teamagent demo` 第一次拦截 ≤ 5 分钟。

**怎么做**（Boris workflow）

| 阶段 | 内容 | 关键产物 |
|------|------|----------|
| R1 决策固化 | 把 issue body 4 个开放设计点逐条 close（install one-liner / landing 内容 / 托管方式 / 风格），与现有 spec 7 条决策合并 | `research.md` 决策表 |
| R2 产物拓扑 | 落定 landing 子包位置（`apps/landing/`）、`install.sh` 出处（`release` 分支 raw URL）、Pages source、CNAME 策略 | `apps/landing/README.md` 框架 |
| P1 设计探索 | gstack `/design-shotgun` ≥ 3 variant 对标 openclaw.ai；`/design-html` 出最终 Pretext-native HTML/CSS；禁 generic AI slop | `apps/landing/src/index.html` |
| P2 安装产物 | `release` 分支 `install.sh`（`curl ... \| sh`）+ 配套 publish 脚本；`@teamagent/cli` 由 `private: true` 切到可发版（npm publish 或 GitHub Release tarball 二选一，由 P8 probe 决定） | `release` 分支 `install.sh` |
| I1 GitHub Pages | Pages source = Actions deploy `apps/landing/dist/`；`.github/workflows/landing-deploy.yml` push 到 `main` 触发 | workflow yaml |
| I2 文档同步 | `CLAUDE.md` Project tools 表 + `README.md` 顶部 install block 同步 one-liner；`docs/PRODUCT-FEATURES.md` 不动 | diff |
| V1 真用户 dogfood | ≥ 1 位陌生用户从 landing 跑完整流程，掐表，结果回写 issue 评论 | issue #84 评论 |
| Report | 实际执行结果、偏差、风险、follow-up | `report.md` |

**不做什么**
- 不动 `packages/core/` / `packages/ports/` 的 Port 接口（M0 冻结）
- 不在本 PR 搞自定义域 / DNS（CNAME 留 follow-up）
- 不引入 React / Vue / Next.js 等重 SPA 框架（Pretext-native 静态 HTML 即可）
- 不写 generic “AI-powered productivity” slop 文案；hero 用 spec 决策 3 的强对比表
- 不写 draft PR；未通过验证前继续本地修

---

## 2. Expected outputs

| 类型 | 交付物 | 验收信号 |
|------|--------|----------|
| 文件 | `apps/landing/src/index.html` + 静态资源 | `pnpm --filter landing build` 退出码 0 |
| 文件 | `release` 分支 `install.sh` | `bash -n install.sh` 通过；`INSTALL_DRY_RUN=1 bash install.sh` 退出码 0 |
| 文件 | `.github/workflows/landing-deploy.yml` | push 到 `main` 后 Pages job 绿 |
| Endpoint | `https://libz-renlab-ai.github.io/TeamBrain/` | `curl -fsS -o /dev/null -w '%{http_code}'` = 200 |
| Endpoint | landing 引用的 install.sh raw URL | `curl -fsSL ... \| sh -n` 通过 |
| Metric | TTHW（landing → `teamagent demo` 第一次拦截） | ≤ 5 分钟（issue 验收条件） |
| Metric | install one-liner 行数 | ≤ 1 行可复制粘贴 |
| Metric | Lighthouse perf / a11y | perf ≥ 85、a11y ≥ 90、SEO ≥ 90 |
| Doc | `CLAUDE.md` Project tools 表新增 landing 行；`README.md` 顶部 install block | grep `install.sh` raw URL 命中 |
| PR | 普通 PR（非 draft）against `main` | CI green、Codex silent/👍、无 merge conflict |
| Issue evidence | issue #84 ≥ 1 条真实陌生用户安装时间评论 | 含具体分钟数与 commit SHA |

---

## 3. How-to-verify (3rd-party judge harness)

`docs/plans/issue-84/judge.sh` 跑固定工具，dump JSON 到 `.judge/issue-84-<run_id>/`，最后由另一只 LLM（claudefast 当 judge）只读 raw JSON + evidence 给 verdict。**禁止被测代码、计划作者、本会话 agent 自评。**

固定工具集：

| Probe | 工具 | 产物 |
|-------|------|------|
| Pages live | `curl -fsS -o page.html -w '%{http_code}\t%{size_download}\t%{time_total}\n' https://libz-renlab-ai.github.io/TeamBrain/` | `page.html` / `http.txt` |
| install.sh syntax | `bash -n install.sh` | `install_syntax.txt` |
| install.sh dry-run | `INSTALL_DRY_RUN=1 bash install.sh 2>&1` | `install_dryrun.log` |
| Lighthouse | `npx lighthouse <pages-url> --output=json --output-path=lh.json --chrome-flags='--headless'` | `lh.json` |
| HTML lint | `npx --yes htmlhint apps/landing/dist/index.html --format=json` | `htmlhint.json` |
| Link check | `npx --yes linkinator <pages-url> --recurse --format=json` | `linkinator.json` |
| Slop / design review | gstack `/plan-design-review` 读 `index.html` 出 0–10 评分 + AI-slop pattern 列表 | `design_review.json` |
| Feature truth | `pnpm teamagent stats --json` 对照 landing 提到的 feature ID 与 verified 列表 | `stats.json` / `feature_match.json` |
| TTHW dogfood | `asciinema rec session.cast` 录制 `open landing → 复制 one-liner → teamagent demo → 第一次拦截`，秒数 → `tthw.json` | `tthw.json` / `session.cast` |
| PR canon | `pnpm test`、`pnpm typecheck`、`bash scripts/verify-all-rules.sh`、`bash docs/postpr/verify-canned-answer.sh` | 各 `*.json` |

LLM judge 只读 raw JSON：

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  "你是 issue #84 第三方裁判。只读 .judge/issue-84-<run_id>/ 下所有 *.json + evidence。
   产出 verdict.json：{passed: bool, criteria: [{name, status, evidence_path, reason}]}。
   PASS 条件：HTTP 200 ∧ install.sh 通过 bash -n ∧ Lighthouse perf>=85 ∧ a11y>=90 ∧
   linkinator 0 broken ∧ design_review.slop_count==0 ∧ TTHW<=300s ∧ CI green ∧ Codex silent/👍。"
```

`verdict.json.passed=false` → 不合并，回到对应阶段修复。

---

## 4. claudefast probes（FASTPROBE，并行 ≤ 8）

先 `!claudefast -h` 拿 flag 列表，再并行 8 路探针填回 `research.md`：

| Probe | 子题 | 输出 JSON 字段 |
|-------|------|----------------|
| P1 现状盘点 | 复用 `2026-05-07-landing-copy-actually-needed.md` 决策与 features | `decisions_already_made` / `features_to_surface` / `gaps` |
| P2 install one-liner 对比 | npm i -g / npx / curl\|sh / Claude Code plugin marketplace | `friendliness` / `security` / `audit_cost` / `rollback` |
| P3 GitHub Pages 拓扑 | gh-pages 分支 vs main:/docs vs Actions deploy `apps/landing/dist` | `recommendation` / `tradeoffs` |
| P4 install.sh 安全审计 | curl\|sh 的 supply-chain / TLS / pinning / fallback | `risks` / `mitigations` |
| P5 AI-slop 反例库 | openclaw.ai 与 typical AI-slop landing 8 条特征 | `must_avoid_patterns` |
| P6 a11y / SEO 基线 | Lighthouse a11y ≥ 90、SEO ≥ 90 最低要求 | `requirements` / `tags` |
| P7 TTHW dogfood 脚本 | 5 分钟链路 step-by-step 录屏脚本 | `steps[].expected_seconds` / `steps[].failure_signals` |
| P8 发布路径 | `@teamagent/cli` 当前 `private: true` → npm publish vs GitHub Release tarball | `commits[]` / `chosen_path` |

每条都用审计模板：

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue84/<probe>.debug.log \
  --include-partial-messages \
  --verbose \
  "<probe prompt>"
```

主 agent 收 8 份 stream-json → 合并写入 `research.md`，不基于记忆作答。

---

## 停止条件

- `verdict.json.passed = true`
- CI green、无 merge conflict、Codex 在最新 commit silent 或 👍
- ≥ 1 位真实陌生用户在 issue 评论里贴出 TTHW ≤ 5 min
- POSTPR loop 跑到 Codex 不再留新 comment 为止
