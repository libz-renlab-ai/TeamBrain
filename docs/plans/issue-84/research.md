```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Research — Issue #84 实际上下文沉淀                                │
 │                                                                      │
 │  现存 spec ──► 7 grill 决策 ──► 8 features 浮第一/二屏              │
 │      │                                       │                       │
 │  release 分支 ◄── install.sh raw URL ◄──── 决策 5                  │
 │      │                                                               │
 │  待 close: P1–P8 (claudefast probes 输出 JSON 后填表)              │
 └──────────────────────────────────────────────────────────────────────┘
```

# Issue #84 — Research

本文档汇总 issue #84 真正的上下文。**不是** plan 的背景说明，**是**实际可引用的事实清单。所有事实带来源；P1–P8 行待 FASTPROBE 跑完回填。

---

## A. 仓库现状（已确认事实）

| 事项 | 现状 | 来源 |
|------|------|------|
| `@teamagent/cli` 包 | `private: true`，发版前需翻面或走 tarball | `packages/cli/package.json:3` |
| CLI binary | `teamagent → packages/cli/src/bin.ts` | `packages/cli/package.json:bin` |
| 已有 landing copy spec | `docs/specs/2026-05-07-landing-copy-actually-needed.md` 包含 7 条 grill 决策、8 features 浮上来 | 本仓库 |
| 已有产品功能清单 | `docs/PRODUCT-FEATURES.md`（编号 1–58 全 VERIFIED；50–58 为 M5 viral sync） | 本仓库；`CLAUDE.md` 强调以此为 SOT |
| Project tools 表 | `CLAUDE.md` 内现有 8 行；issue 任务要求新增 landing 行 | `CLAUDE.md` Project tools 段 |
| `apps/` 目录 | **不存在**，本 issue 落地时新建（`apps/landing/`） | `ls apps/ → not found` |
| `release` 分支 | spec 决策 5 选定为 `install.sh` 出处的 raw URL host，本仓库需要新建该分支 | `2026-05-07-landing-copy-actually-needed.md` 决策 5 |
| 默认 compile 行为 | 不动 `CLAUDE.md`，规则只写 Skills（M4+）；`--legacy-claude-md` 才回到 managed block | `CLAUDE.md` `pnpm teamagent compile` 行为速查 |
| GitHub account | `LiuShiyuMath`（不要 `liush2yuxjtu`）；`gh` 命令前置 `env -u GITHUB_TOKEN` | `CLAUDE.md` GitHub account 段 |

---

## B. 已落地的 7 条 grill 决策（spec 摘录）

来源：`docs/specs/2026-05-07-landing-copy-actually-needed.md`。本 issue 的 plan 默认遵循这 7 条；任何偏离都要在 `report.md` 显式记录。

1. landing 定位 = **外部转化**，不是内部文档；30 秒读完，做出装/不装判断。
2. install 必须携带 **avoidance starter pack** + `teamagent demo` 命令 + GIF（B+C+GIF）。
3. Hero 区域 = **强对比表**（CLAUDE.md / .cursorrules / Claude memory vs TeamAgent）；4 条症状降级到第二屏。
4. GIF = **double-moment**：先纠正一次（`moment` → `dayjs`），切到下一会话被 PreToolUse 拦截。
5. 安装入口固定为：
   ```text
   curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh
   teamagent init
   ```
   `install.sh` 放 **`release` 分支根目录**；不要自有域名；`init` 30 秒完成（substring matcher + universal pack 立即可拦截，~120MB Xenova 模型后台 10 分钟内升级）。
6. **stack pack 选择**委托用户自己的 coding agent，`init` 只装 universal pack（~15 条字面关键词规则），向 stdout 打印 markdown prompt 让 agent 决定下一步 `teamagent pack add ...`。
7. 第二屏 team-layer / 多工具 / 卸载段落用 `<details>` 折叠（GitHub 原生支持，零 JS）。

---

## C. 8 个 features 浮第一/二屏（spec 摘录）

| ID | Feature 名 | 位置 | 用途 |
|----|-----------|------|------|
| #3  | PreToolUse intercept | Hero + GIF moment 2 | 拦截，而非事后纠正 |
| #4  | correct-once-remembered | Hero + GIF moment 1 | 纠正一次下次记住 |
| #10 | Stop hook auto-capture | 第二屏「工作原理」 | 自动从对话提炼规则 |
| #21–25 | team layer + xsync | 第二屏 `<details>` | 团队共享维度 |
| #31–33 | MCP / Cursor / Codex 多工具 | 第二屏 `<details>` | 不只 Claude Code |
| #38–40 | A/B benchmark | 第一屏底部 trust anchor | positiveTriggerRate / falsePositiveRate 实测 |
| #48 | uninstall | 第二屏 `<details>` | 「装了能卸」降低试用摩擦 |
| #44 | `teamagent verify` | Footer trust anchor | 机器可验证质量承诺 |

`docs/PRODUCT-FEATURES.md` 是 SOT。落地时 ID/描述以该文件为准；如果 spec 描述与 SOT 不符，以 SOT 为准并在 `report.md` 记差异。

---

## D. 待 close 的开放点（FASTPROBE P1–P8 输出后回填）

| Probe | 子题 | 状态 | 结论填入 |
|-------|------|------|----------|
| P1 现状盘点 | spec + features 是否还有 gap | done | spec 7 决策已锁；8 features 位置已定；余 10 gaps 全为实现侧（N1–N6 + apps/landing/ + Pages workflow + TTHW）。`.fastprobe/issue84/p1.json#decisions_already_made,features_to_surface,gaps` |
| P2 install one-liner 对比 | npm / npx / curl\|sh / plugin marketplace | done | 评分推荐 D=marketplace（fri=9, sec=8, audit=3, rb=9）；runner-up A=npm i -g。spec 决策 5 已锁 C=curl\|sh（与 P2 评分相左，见 §G1）。`.fastprobe/issue84/p2.json#matrix,recommendation` |
| P3 GitHub Pages 拓扑 | gh-pages 分支 vs main:/docs vs Actions deploy `apps/landing/dist` | done | 推荐 Option 2 (main `/docs`，迁移 low、无 CI、单一事实来源)；plan.md R2 选 Option 3 (apps/landing/dist + Actions)，与 P3 推荐相左，见 §G3。`.fastprobe/issue84/p3.json#options,recommendation` |
| P4 install.sh 安全审计 | curl\|sh 的 supply-chain / TLS / pinning / fallback | done | 4 HIGH risks (S-01/S-02/P-01/N-03) + 7 v1 必做：URL 含 SHA、SHA256 校验文件、显式 CA、两步安装、redirect 校验、fallback URL、--dry-run。`.fastprobe/issue84/p4.json#risks,must_have_in_v1` |
| P5 AI-slop 反例库 | openclaw.ai vs typical AI-slop landing | done | 8 must-avoid（紫蓝渐变光斑/匿名推荐/营销热词/通用图标/企业独白/模糊定位/markdown 残留/巨型 CTA）+ 8 negative_prompt_seeds 直接喂 /design-shotgun。`.fastprobe/issue84/p5.json#must_avoid_patterns,negative_prompt_seeds` |
| P6 a11y / SEO 基线 | Lighthouse a11y ≥ 90、SEO ≥ 90 最低要求 | done | 10 a11y rules + 9 SEO rules + 12 meta tags 模板；perf 目标 ≥85，LCP≤2.5s/CLS≤0.1/INP≤200ms。判定文档级验收清单。`.fastprobe/issue84/p6.json#a11y_requirements,seo_requirements,meta_tags,perf_baseline` |
| P7 TTHW dogfood 脚本 | 5 分钟录屏脚本 step-by-step | done | total_budget=300s，6 步：open-landing 8s/copy-install 5s/paste 5s/install 120s/demo 30s/first-pretooluse 20s（占用 188s + 安全 buffer）；abort 280s；install 步占 40% 预算是瓶颈。`.fastprobe/issue84/p7.json#steps,checkpoints,abort_signals` |
| P8 发布路径 | npm publish vs GitHub Release tarball（含 `private:true → false` commit 序列） | done | 推荐 Route B=tarball（保留 private:true + install.sh + Releases asset，3 commits）；Route A=npm 受 OTP/workspace bundle/scope 顺序约束。Route B 与 spec 决策 5 的 raw URL 路径关系见 §G4。`.fastprobe/issue84/p8.json#route_b_tarball,chosen_path,rationale` |

回填时只填 raw JSON 抽出来的字段，禁止凭记忆补；每条标注产生它的 stream-json artifact 路径（`.fastprobe/issue84/<probe>.debug.log`）。

---

## E. 风险登记（提前列出 → `report.md` 收尾时勾选）

- **R1**：`@teamagent/cli` 翻面发布触发供应链 / license / npm scope 占用问题。缓解：P8 决策；`release` 分支锁版本。
- **R2**：`curl ... | sh` 在公司内网/防火墙下被拦。缓解：spec 决策 5 已固定 raw GitHub URL；`install.sh` 内置 `--mirror` 参数留 fallback hook（不在本 PR 实现，列 follow-up）。
- **R3**：landing 文案翻车成 generic AI slop。缓解：P5 反例库 + `/plan-design-review` 评分进 verdict.json。
- **R4**：陌生用户 dogfood 找不到人。缓解：先在 Slack/Discord 内挂招募；保底从 codex web for github 镜像跑一个 “伪陌生用户” session 留作占位证据，但 issue 验收仍以真实陌生用户为准。
- **R5**：Pages 部署被 GitHub 改 source 限制。缓解：P3 决策；workflow 走 Actions `actions/deploy-pages` 官方 path。

---

## F. 不再做的事

- 不重写 `docs/specs/2026-05-07-landing-copy-actually-needed.md`；本 issue 把它当 SOT。
- 不在 `research.md` 写「先去读 X 文件获取上下文」；上下文在本文件本身。
- 不在 `research.md` 提前下结论。所有结论等 P1–P8 raw JSON 出来再写到 D 节回填栏。

---

## §G. 跨 probe contradictions（FASTPROBE round 1 surfaced）

### G1 ⚠️ install one-liner: P2 推荐 vs spec 决策 5
- P2 (`.fastprobe/issue84/p2.json#recommendation`): D=Claude Code marketplace 三维（sec=8/audit=3/rb=9）最优；C=curl\|sh 评分最差（sec=2/audit=10）。
- spec 决策 5 / research §B (`docs/specs/2026-05-07-landing-copy-actually-needed.md`): C 已锁定为发布通道，install.sh 放 release 分支根目录。
- evidence 倾斜: spec 决策基于"开发者社区惯用 curl\|sh + 用户即开发者"现实约束；P2 是纯安全/审核评分。两者前提不同，不直接相消。
- escalation: 不重启 spec；通过 §G2 P4 mitigation 加固对冲（SHA256 + 版本 pin + 两步安装 + dry-run）即可保留 C。

### G2 ⚠️ install.sh 安全门槛: P4 must-have-in-v1 vs spec 决策 5 的 raw URL 简洁形态
- P4 (`.fastprobe/issue84/p4.json#must_have_in_v1`): 7 项硬要求——URL 含 tag/SHA、SHA256 校验文件、显式 CA、默认两步安装（禁默认 \| sh）、redirect 校验、fallback URL、--dry-run 模式。
- spec 决策 5: 一行 `curl -fsSL .../release/install.sh | sh` + 后续 `teamagent init`，未提及 SHA / 两步安装。
- evidence 倾斜: P4 mitigations 是供应链最低底线；landing 一行 hero 文案不必把 7 项全展示，但 install.sh 实现层必须覆盖。
- escalation: 把 P4 must-have 全部映射到 R2 的 install.sh 实现 checklist，hero 仍可保持单行；report.md §2 加 install.sh syntax+dry-run 两个 probe 行，对应 P4 第 1/2/4/7 项。

### G3 ⚠️ Pages 拓扑: P3 推荐 (main:/docs) vs plan.md R2 (apps/landing/dist + Actions)
- P3 (`.fastprobe/issue84/p3.json#recommendation`): Option 2=main:/docs（migration_cost=low、无 CI、单一事实来源）；Option 3=Actions deploy 标注 migration_cost=high、CI required。
- plan.md R2 / I1 (`docs/plans/issue-84/plan.md:35,45`): 选定 `apps/landing/` + `.github/workflows/landing-deploy.yml` Actions deploy → 这是 P3 评估的 Option 3。
- evidence 倾斜: P3 评估假设"零 build 静态 HTML"；plan.md 选 Option 3 是因为已经决定 Pretext-native HTML 仍走 build 步，并需 preview 部署。两者不是同纬度。
- escalation: 选项不需推翻；在 R2 文档里加一句"评估过 Option 1/2，选 Option 3 因为 Pretext-native build 与 preview deployment 需求"，平息 PR review 阶段的潜在质疑。

### G4 ⚠️ Route B (tarball) 与 spec 决策 5 的 raw URL 是否一致
- P8 (`.fastprobe/issue84/p8.json#route_b_tarball,chosen_path`): Route B = `release` tag → install.sh + GitHub Release asset (tarball)；rationale 强调与现有 `teamagent` 包发布方式一致。
- spec 决策 5 / research §B: `install.sh` 在 `release` 分支根目录的 raw URL，通过 `raw.githubusercontent.com` 直拉，未提到 Release asset。
- evidence 倾斜: P8 提到 install.sh 从 release asset 拉 tarball；spec 提到 install.sh 本身从 release 分支 raw URL 拉。两者不直接矛盾——install.sh 是 stub launcher，拉的内容（tarball）在 Release asset 上。但 spec 的"release 分支"和 P8 的"release tag + Release asset"需要在 R2 文档统一表达。
- escalation: R2 文档里明确：（1）install.sh 在 `release` 分支根目录、URL 走 `raw.githubusercontent.com/.../release/install.sh`（spec 锁）；（2）install.sh 内拉的 tarball 走 `https://github.com/.../releases/download/{tag}/{asset}`（P8 锁）；（3）双方共存不冲突。

### G5 ⚠️ TTHW 5 min 是否包含后台 Xenova 向量下载（~120MB）
- P7 (`.fastprobe/issue84/p7.json#total_budget_seconds=300, steps[install].expected_seconds=120`): install 步预算 120s，未单独列向量模型下载步骤。
- spec 决策 5 / research §B: substring matcher + universal pack 立即可拦截；~120MB Xenova 模型后台 10 分钟内升级（即不在 5 min 内完成）。
- evidence 倾斜: P7 把"first-pretooluse"作为终点，与 spec 一致——只验证立即可拦截路径，不等向量模型。两者一致，但 P7 step "install" 的 120s 预算是否够装 substring 路径需要 dogfood 实测。
- escalation: 不算 contradiction，记进 §H open questions：实测 120s 是否能涵盖完整 npm/tarball 解压 + universal pack 注入。

### G6 ⚠️ Markdown / JSON drift（无）
- 检查 4 份 worker markdown 与对应 JSON：P1/P3/P5/P7 完全一致；P2 markdown 提到「需要在 install.sh 加 TLS + checksum + dry-run 机制对冲（P4 安全审计 probe 接力）」是合理 narration，未脱离 JSON；P4/P6/P8 markdown 是 JSON 的 narrative 摘要，无字段层冲突。
- 本轮无 markdown/JSON drift 行。

---

## §H. Open questions（FASTPROBE round 1 涌现，plan/spec 未提）

| ID | Question | Origin probe | 影响 |
|----|----------|--------------|------|
| H1 | SHA256 校验文件放 `release` 分支根目录还是 GitHub Release asset？ | P4 must-have 第 2 项 | 决定 install.sh 校验逻辑：从 raw URL 拉 vs 从 Release API 拉 |
| H2 | universal pack ~15 条字面关键词规则的 commit 来源（手写 vs 从现有 rule corpus 抽取）？ | P1 gaps N1 + spec 决策 6 | R1 决策固化时需补足 |
| H3 | TTHW 120s install 步是否覆盖 npm/tarball 解压 + bin symlink + 首次 universal pack 注入实测？ | P7 install step | dogfood V1 阶段实测；若超时拆 install/init 两步独立计时 |
| H4 | design-shotgun 跑几个 variant 才能让 P5 的 8 条 negative_prompt_seeds 充分覆盖？ | P5 negative_prompt_seeds | P1 设计探索阶段决定（plan 写 ≥3，但 P5 给出 8 条 seed，3 variant 是否够？） |
| H5 | install.sh fallback URL 用 GitHub Release asset 直链还是设外置 CDN 镜像？ | P4 F-01 mitigation | R2 决定，影响 release CI workflow |
| H6 | Route B install.sh 的 self-update 机制是否本 PR 落地？ | P8 route_b_tarball.risks 第 5 项 | follow-up 候选；本 PR 暂不实现 |
| H7 | Pages source 既然选 Option 3，是否仍保留 main:/docs 作为低保真备选（spec 决策 5 之外的紧急回滚路径）？ | P3 vs plan.md R2/I1 | R2 + I1 阶段评估 |
