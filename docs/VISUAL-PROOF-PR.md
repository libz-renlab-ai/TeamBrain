# Visual-Proof-Guided PR Workflow

```
   ┌────────────┐  step 1   ┌────────────┐  step 2   ┌──────────────────────────┐
   │  proposer  │ ────────▶ │  open      │ ────────▶ │  open PR (no permission) │
   │            │  propose  │  GH issue  │  make PR  │  + append comment with   │
   │            │  an issue │  on GH     │  no ask   │  visual proof HTML link  │
   └────────────┘           └────────────┘           └────────────┬─────────────┘
                                                                  │
                                                                  ▼
                                                ┌──────────────────────────────┐
                                                │ HTML artifact hosted on the  │
                                                │ PR proposer's OWN storage    │
                                                │ (GH Pages / S3 / R2 /        │
                                                │  Vercel / personal domain)   │
                                                │  NOT inside repo             │
                                                │  NOT in /tmp on build agent  │
                                                │  NOT on localhost            │
                                                └──────────────────────────────┘
```

适用范围：本仓库里任何「带可视化证据的 PR」工作流——design / UI 改动、dashboard / status board、verification render、screenshot diff、demo recording、benchmark report、QA evidence、`/review` finding 复现等所有需要 reviewer **眼睛实际看一眼**才能判定的 PR。

## 两步铁律 / The Two-Step Rule

1. **Propose an issue first** — 任何带视觉副作用（UI / 渲染 / dashboard / 截图 / demo / video / chart）的工作，开 PR 之前先在 GitHub 开一个 issue，按 `docs/FIXEDFLOW.md` ≤50 字 body 约束写清「想做什么 + 期望的可视化产出形态」。这一步**不需要**等 `grill-ready` —— 视觉证据型 issue 通常 self-evident，但仍要走 `docs/ISSUE-TRACKING.md` 把 issue 编号落到本地 ledger。
2. **Make the PR without asking, but append the comment with PROPER visual proof of work in HTML** —— 实施完成后**不需要再问用户许可**就可以直接 `gh pr create`（普通 PR、禁 draft，沿用 `docs/COMMIT-FLOW.md` anchor），但**必须**在 PR 创建后 **append 一条 PR comment**，comment 里贴一个**可公网点开的 HTML 链接**作为 visual proof of work。该 HTML **shall be hosted on the PR proposer's own storage**，禁止仓库内 / 构建机 `/tmp` / `localhost`。

## What counts as "PR proposer's own storage"

| 类别 | 允许 ✅ | 不允许 ❌ |
|------|-------|----------|
| GitHub Pages | `username.github.io/*` / 仓库 fork 的 Pages | TeamBrain 主仓库的 GH Pages（构建机产物，非 proposer 个人 storage） |
| 对象存储 | proposer 个人 / 公司 AWS S3 公有 bucket、Cloudflare R2、阿里云 OSS、腾讯云 COS、Backblaze B2 | 仓库 CI 共享 S3、临时 presigned URL（过期后失效） |
| 静态站点托管 | proposer 个人 Vercel / Netlify / Cloudflare Pages / Render | TeamBrain 团队共享 Vercel 项目（视为 repo 内置不算个人 storage） |
| 个人域名 | proposer 自有域名 + 静态服务 | `localhost:*` / `127.0.0.1:*` / `192.168.*` / `10.*` LAN-only |
| Gist (proposer-served viewer) | GitHub Gist HTML 通过 **proposer 自托管的 viewer**（如 proposer 个人 GH Pages 上的 fetch + render） | 普通 gist 文本预览（不渲染 HTML） |
| Gist (third-party viewer) | ⚠️ `https://htmlpreview.github.io/?<gist-raw-url>` —— **`htmlpreview.github.io` 是第三方免费服务（cwong/htmlpreview），不在 proposer 控制下**，无 SLA、常被 rate-limit、拒绝 >2MB 的 gist；仅在没有更好选择时降级使用，并在 PR comment 里显式写「third-party viewer，可能失效」 | 把 `htmlpreview.github.io` 当作 proposer 自己的 storage 报给 reviewer |
| IMG-only escape hatch | ⚠️ imgur / cloudinary 截图链接 —— **仅当 evidence 本质是单张静态图且 HTML 反而冗余时**；**注意**：imgur 对匿名上传 6 个月低互动后会删，cloudinary free tier 30 天无访问转 cold storage，**默认违反 90 天 floor**，必须用 paid plan 或个人账号 + 显式 retention 设置；canonical anchor 仍 mandate HTML，本行只是退化场景 | 把 imgur / cloudinary 当作长期 HTML 托管（不是它们的设计场景） |
| 短期分享服务 | （无）| `transfer.sh`（14 天默认）/ `0x0.st`（变量 retention）/ `catbox.moe`（可永久但需登录、去匿名化）—— PR 还没 merge 链接可能已死 |

**底线**：reviewer 在任何一台机器上点开 PR comment 里的链接都能看到完整产物；PR branch 被 delete、worktree 被回收、构建机被销毁后，链接仍然能打开**至少 90 天**（建议永久，让 release notes / changelog 反查时还能用）。

## Why / 为什么这么设计

- **Propose issue first**：与 `docs/FIXEDFLOW.md` 的 issue→PR→merge 主线对齐，保留 audit trail。视觉证据型工作不像普通 fix 可以反推 `git log`，issue + visual proof 是唯一能让团队事后还原「当时看到了什么」的载体。
- **Make PR without asking**：proposer 已经把视觉产物烤好、要拿给 reviewer 看，再问一遍许可只是 lazy signal（user-level `lazy-signals.md`）。`docs/CLAIMED-WORKTREE-NO-PERMISSION.md` 已经明确 claim 落地后 driver / proposer 不需要二次审批，本规则延伸到「带视觉产物的 PR」场景。
- **Visual proof in HTML (not PNG, not video)**：HTML 可以承载结构化数据 + 交互 + 多 viewport 截图 + diff side-by-side + canonical metadata（commit SHA / branch / 时间戳 / probe 输出 JSON），单一文件即可成为 reviewable artifact；纯 PNG / mp4 不携带 reviewable 元信息，且无法 ctrl-F。Reviewer 在 PR 上点链接就能在浏览器里看，**不需要** clone branch / 启动 dev server / 跑 `pnpm frontend:dev`。
- **Hosted on proposer's own storage**：(1) repo 内 HTML 会被 `pnpm typecheck` 扫 / `/review` 报噪 / `compile` 误覆盖 / `docs/POP-OPEN-HTML.md` 三条铁律的「NOT in project」直接冲突；(2) 构建机 `/tmp` 在 PR cleanup 后立刻消失，reviewer 后开第二天就 404；(3) `localhost` 只在 proposer 本机能看；(4) 共享团队 storage 让 proposer 失去对证据的控制权（哪天被覆盖 / 被回收，proposer 无从恢复）。让 proposer 用自己的 storage 是把证据**所有权**与 PR 作者**强绑定**。

## How to make the proof / 操作骨架

1. **生成 HTML 到 `/tmp/teamagent/<feature>/<slug>-<ts>.html`**（沿用 `docs/POP-OPEN-HTML.md` 三条铁律的写盘约定），本地用 `open -a "Google Chrome"` 先自查。
2. **上传到 proposer 自己的 storage**——按 proposer 习惯：
   ```bash
   # 例：GitHub Pages（proposer 个人仓库）
   cp /tmp/teamagent/<feature>/<slug>-<ts>.html ~/projects/<username>.github.io/teamagent/<slug>-<ts>.html
   (cd ~/projects/<username>.github.io && git add -A && git commit -m "proof: PR #N <slug>" && git push)
   # 公网地址：https://<username>.github.io/teamagent/<slug>-<ts>.html

   # 例：S3 public bucket
   aws s3 cp /tmp/teamagent/<feature>/<slug>-<ts>.html s3://<my-public-bucket>/teamagent/<slug>-<ts>.html --acl public-read

   # 例：Cloudflare R2 + 自定义域
   rclone copy /tmp/teamagent/<feature>/<slug>-<ts>.html r2:<bucket>/teamagent/
   ```
3. **在 PR 上 append comment**（不是改 PR body，是单独一条 comment，便于多次迭代各自留痕）：
   ```bash
   gh pr comment <PR-N> --body "$(cat <<'EOF'
   Visual proof of work for this PR:

   - https://<proposer-storage>/teamagent/<slug>-<ts>.html

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
