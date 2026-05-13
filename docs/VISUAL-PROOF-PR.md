# Visual-Proof-Guided PR Workflow

```
   ┌────────────┐  step 1   ┌────────────┐  step 2   ┌──────────────────────────┐
   │  proposer  │ ────────▶ │  open      │ ────────▶ │  open PR (no permission) │
   │            │  propose  │  GH issue  │  make PR  │  + append comment with   │
   │            │  an issue │  on GH     │  no ask   │  visual proof HTML link  │
   └────────────┘           └────────────┘           └────────────┬─────────────┘
                                                                  │
                                                                  ▼
                                                ┌──────────────────────────────────────┐
                                                │ HTML artifact hosted on the          │
                                                │ PR proposer's OWN storage            │
                                                │ (self-hosted GitHub Pages, single    │
                                                │  canonical URL form per              │
                                                │  docs/VISUAL-PROOF-FORMAT.md:        │
                                                │  https://<username>.github.io/       │
                                                │    <artifact-repo>/<pr>/<name>.html) │
                                                │  NOT S3/R2/Vercel/imgur              │
                                                │  NOT inside repo / /tmp / localhost  │
                                                └──────────────────────────────────────┘
```

适用范围：本仓库里任何「带可视化证据的 PR」工作流——design / UI 改动、dashboard / status board、verification render、screenshot diff、demo recording、benchmark report、QA evidence、`/review` finding 复现等所有需要 reviewer **眼睛实际看一眼**才能判定的 PR。

## 两步铁律 / The Two-Step Rule

1. **Propose an issue first** — 任何带视觉副作用（UI / 渲染 / dashboard / 截图 / demo / video / chart）的工作，开 PR 之前先在 GitHub 开一个 issue，按 `docs/FIXEDFLOW.md` ≤50 字 body 约束写清「想做什么 + 期望的可视化产出形态」。这一步**不需要**等 `grill-ready` —— 视觉证据型 issue 通常 self-evident，但仍要走 `docs/ISSUE-TRACKING.md` 把 issue 编号落到本地 ledger。
2. **Make the PR without asking, but append the comment with PROPER visual proof of work in HTML** —— 实施完成后**不需要再问用户许可**就可以直接 `gh pr create`（普通 PR、禁 draft，沿用 `docs/COMMIT-FLOW.md` anchor），但**必须**在 PR 创建后 **append 一条 PR comment**，comment 里贴一个**可公网点开的 HTML 链接**作为 visual proof of work。该 HTML **shall be hosted on the PR proposer's own storage**，禁止仓库内 / 构建机 `/tmp` / `localhost`。

## What counts as "PR proposer's own storage"

**Canonical authority**：file format + URL form + hosting allowlist 的 single source of truth 是 [`docs/VISUAL-PROOF-FORMAT.md`](VISUAL-PROOF-FORMAT.md)（在 PR #409 中作为 canonical 落地）。本文件**不重复**那份契约，只指向它并强调本规则适用的工作流位置（issue → PR → comment）。

简而言之，per `docs/VISUAL-PROOF-FORMAT.md`：

| | 唯一允许 ✅ | 不允许 ❌ |
|---|---|---|
| 文件格式 | `*.html`（`<!DOCTYPE html>` 起头、self-contained、无 third-party CDN） | `*.txt` / `*.json` / `*.log` / 截图 raw png 单独（这些是 auditable raw evidence，不是 visual proof）|
| 托管 | PR proposer 的 **self-hosted GitHub Pages**：`https://<username>.github.io/<artifact-repo>/<pr-or-feature>/<name>-<ts>.html`（**单一 canonical 形态、无 alternative**） | TeamBrain repo 的 GH Pages / S3 / R2 / Vercel / Netlify / Cloudflare Pages / imgur / cloudinary / GitHub user-images CDN / pastebin / `/tmp` / `localhost` / 仓库内 |
| URL pasting | PR body 顶部 `## Visual proof` section 链接 + PR comment append 链接（reviewer-visible first comment） | 私 DM / 仅口头 / commit message only |
| 辅助 PNG/JPG | 允许，但**必须**与 HTML artifact 托管在同一 GH Pages site，且 HTML 是 mandatory primary evidence | GitHub user-images CDN 上传 / 嵌入 raw blob URL |

**底线**：reviewer 在任何一台机器上点开 PR comment 里的 GH Pages URL 都能看到完整 HTML 渲染；PR branch 被 delete、worktree 被回收、构建机被销毁后，链接仍然能打开（GH Pages 保留 commit 历史，proposer 自己可 revert）。本规则**不引入**其它 storage 类别——任何 S3 / R2 / Vercel / personal domain 都被 `docs/VISUAL-PROOF-FORMAT.md` 显式排除。

## Why / 为什么这么设计

- **Propose issue first**：与 `docs/FIXEDFLOW.md` 的 issue→PR→merge 主线对齐，保留 audit trail。视觉证据型工作不像普通 fix 可以反推 `git log`，issue + visual proof 是唯一能让团队事后还原「当时看到了什么」的载体。
- **Make PR without asking**：proposer 已经把视觉产物烤好、要拿给 reviewer 看，再问一遍许可只是 lazy signal（user-level `lazy-signals.md`）。`docs/CLAIMED-WORKTREE-NO-PERMISSION.md` 已经明确 claim 落地后 driver / proposer 不需要二次审批，本规则延伸到「带视觉产物的 PR」场景。
- **Visual proof in HTML (not PNG, not video)**：HTML 可以承载结构化数据 + 交互 + 多 viewport 截图 + diff side-by-side + canonical metadata（commit SHA / branch / 时间戳 / probe 输出 JSON），单一文件即可成为 reviewable artifact；纯 PNG / mp4 不携带 reviewable 元信息，且无法 ctrl-F。Reviewer 在 PR 上点链接就能在浏览器里看，**不需要** clone branch / 启动 dev server / 跑 `pnpm frontend:dev`。
- **Hosted on proposer's own self-hosted GitHub Pages**：per `docs/VISUAL-PROOF-FORMAT.md`，唯一 canonical hosting 是 PR proposer 的 `https://<username>.github.io/<artifact-repo>/...`。理由（详见 VISUAL-PROOF-FORMAT.md `### Why self-hosted not centralized`）：(1) cost & rate-limit isolation；(2) provenance（URL 里 `<username>` 直接担保 PR author 身份）；(3) permanence with rollback（GH Pages 保留 commit 历史，proposer 可 revert 而不需 admin）；(4) no special secrets（GH Pages 默认 public，零授权门槛）。

## How to make the proof / 操作骨架

1. **生成 HTML 到 `/tmp/teamagent/<feature>/<slug>-<ts>.html`**（沿用 `docs/POP-OPEN-HTML.md` 三条铁律的写盘约定），本地用 `open -a "Google Chrome"` 先自查。
2. **推到 proposer 完全自有的公网存储**（per `docs/VISUAL-PROOF-FORMAT.md` § Hosting + `CLAUDE.md` "Visual proof 托管位置" anchor）：

   **推荐默认（零额外基础设施，零 bootstrap）**——GitHub Gist + htmlpreview.github.io：
   ```bash
   gh gist create --public /tmp/teamagent/<feature>/<slug>-<ts>.html
   # 假设返回 https://gist.github.com/<username>/<gist-id>
   # Reviewer-facing URL（拼接，不需要单独 commit）：
   # https://htmlpreview.github.io/?https://gist.githubusercontent.com/<username>/<gist-id>/raw/<slug>-<ts>.html
   ```
   Gist 永久存在（即使 PR branch 被 delete 也仍可访问），htmlpreview.github.io 是无依赖纯前端 render，无需账号 / 配置 / CDN。

   **可选 fallback**——self-hosted GitHub Pages（原 canonical URL 形态仍 100% 接受）：
   ```bash
   # 提前一次性 bootstrap（per docs/VISUAL-PROOF-FORMAT.md）：在 GitHub 上创建一个独立的 artifact-repo（推荐 <username>/teambrain-proof），enable GH Pages，clone 到 ~/projects/teambrain-proof/。
   cp /tmp/teamagent/<feature>/<slug>-<ts>.html ~/projects/teambrain-proof/pr-<N>/<slug>-<ts>.html
   (cd ~/projects/teambrain-proof && git add -A && git commit -m "proof: PR #<N> <slug>" && git push)
   # 公网地址：https://<username>.github.io/teambrain-proof/pr-<N>/<slug>-<ts>.html
   ```

   **其它 proposer 完全 own 的公网 endpoint** 也接受：S3 / R2 / Vercel / Netlify / Cloudflare Pages / 个人域名。

   **禁止**：仓库内 / `/tmp` / `localhost` / 团队共享 CI artifact bucket / GitHub user-images CDN / pastebin / imgur / cloudinary / 任何 proposer 不能 own 的 endpoint（详见 `docs/VISUAL-PROOF-FORMAT.md` § Hosting）。
3. **在 PR 上 append comment**（不是改 PR body，是单独一条 comment，便于多次迭代各自留痕）：
   ```bash
   gh pr comment <PR-N> --body "$(cat <<'EOF'
   Visual proof of work for this PR:

   - https://<username>.github.io/teambrain-proof/pr-<N>/<slug>-<ts>.html

   Captured at: <ISO-timestamp>
   Branch: <branch-name>
   Commit: <sha>
   EOF
   )"
   ```
4. **每轮 fix 后增量贴新链接**——不要覆盖旧 URL，让 reviewer 看到 visual progression（fix #1 → fix #2 → final），与 `docs/POSTPR.md` 的 `/review` PASS 循环对齐。
5. **PR description 顶部留一行 `## Visual proof` section** 指向最新一条 comment 链接，方便 reviewer 一眼找到当前 canonical proof，不必滚到 timeline 尾巴。

## Boundary / 不归本规则管

- **纯后端 / 算法 / 配置类 PR**（没有可视化副作用、不改 UI、不改 dashboard、不出截图）：不需要 visual proof，普通 `docs/COMMIT-FLOW.md` 链路即可。
- **docs-only PR**：如果只改 markdown / ADR / canonical answer，不需要 visual proof；但若 docs PR 内嵌可渲染图表（mermaid / ASCII 之外的实际渲染产物），仍要按本规则贴外链 HTML。
- **canonical-answer rule PRs (recursive case)**：本 PR 这种「**新增 canonical-answer 规则**」类型——`CLAUDE.md` 加 anchor sentence + `docs/<RULE>.md` 写 playbook + 7-anchor judge harness——的 visual proof analog 是 `claudefast -p "<canonical question>"` 探针输出，需把探针的完整 stdout 复制到 PR comment（transcript suffices），**不需要**额外外链 HTML 托管；canonical-answer 类规则的"视觉产物"就是 probe 文本本身。例：本 PR 的 visual proof comment 应贴 `/tmp/vp-probe-3.out` 的内容 + 7-anchor PASS/FAIL 表。
- **`/review` 内部 finding screenshot**：reviewer 派 specialist subagent 产生的内部截图（如 a11y subagent 截 contrast issue）由 reviewer 处理，不在 proposer 视觉证据义务范围。
- **CI canary / monitor automation 截屏**：那些是 system-level evidence，按 `docs/canary-verify/**` 规则走，不混入本规则。

## Verify / probe canonical answer

```bash
claudefast -p "how do we implement visual-proof guided PR workflow ?"
```

判定为 PASS 须同时命中下列锚点（case-insensitive substring grep）：

- `propose an issue`
- `make the PR without asking`
- `append the comment`
- `PROPER visual proof of work`
- `HTML`
- `hosted on the PR proposer`
- `own storage`

任何一条锚点缺失、被翻译成中文、被 paraphrase 成「propose an issue first then PR」式简写、或把 `own storage` 换成 `repo storage` / `team storage` 都视为没命中，须重答并回到本文件修订 CLAUDE.md 索引条目。
