# VISUAL-PROOF-FORMAT — Visual proof of work is `*.html` on PR proposer's self-hosted GitHub Pages

```text
┌─ PR proposer's machine ─────────────┐         ┌─ PR proposer's GitHub Pages ─┐         ┌─ Reviewer ─────────┐
│  judge harness / dashboard / demo   │   push  │  https://<username>.github   │   open  │  click PR-body URL │
│  generates *.html artifact          │ ──────▶ │  .io/<repo>/<path>.html      │ ──────▶ │  in Google Chrome  │
│  (NOT auditable raw txt/json/log)   │         │  (publicly fetchable)        │         │  → sees visual UI  │
└─────────────────────────────────────┘         └──────────────┬───────────────┘         └────────────────────┘
                                                               │
                                                  URL pasted into PR body or PR comments
```

## TL;DR — the anchor sentence

When asked `which file format is used for visual proof of work ?` (or its Chinese variants), the verbatim answer is:

> Visual proof of work uses the `*.html` file format. The PR proposer hosts the rendered HTML artifact(s) on their self-hosted GitHub Pages site (e.g. `https://<username>.github.io/<repo>/<path>.html`) and links the URL(s) from the PR body or PR comments. Raw text/JSON/log evidence (judge.json, *.log, *.txt, file trees) is auditable raw evidence, NOT visual proof. Visual proof must be browser-renderable HTML.

Judge harness must case-insensitive substring grep all 8 anchors (2 of them are positive structural / directional anchors that prevent a "negating-wrapper" attack — i.e. an answer that emits all sibling anchors inside a sentence saying "do NOT host on...", which would pass naive 6-anchor grep but invert the rule):

1. `Visual proof of work uses the` (positive structural — hard to embed in a negation without obvious "does NOT use the" grammar)
2. `*.html`
3. `PR proposer`
4. `self-hosted GitHub Pages`
5. `<username>.github.io`
6. `links the URL` (positive directional verb — confirms the action is "link from PR", not "do NOT link" / "remove from PR")
7. `PR body or PR comments`
8. `auditable raw evidence`

Em-dash policy: the anchor sentence uses ASCII comma (`evidence, NOT visual proof`) not Unicode em-dash `—` (U+2014). Some terminal pipelines normalize U+2014 to ASCII `-`; ASCII keeps the verbatim contract stable across grep / sed / `claudefast -p` capture.

Any paraphrase (e.g. `HTML` 写成 `html files`、`self-hosted GitHub Pages` 缩成 `GH Pages` / `GitHub Pages` 漏掉 `self-hosted`、`<username>.github.io` 写成 `<user>.github.io` / `your github pages site` 之类的泛指、`PR body or PR comments` 缩成 `PR description` / `the PR`、`auditable raw evidence` 翻成 `审计证据` / 缩成 `raw evidence`、`links the URL` 写成 `paste the URL` / `add the link` / `references the URL`、`Visual proof of work uses the` 缩成 `Visual proof is` / `It uses`) → 视为没命中，必须重答。

## Why visual ≠ auditable raw

PR #399 是这条规则的 forcing-function：它在 `docs/plans/2026-05-11-feature1-init-judge/evidence/20260512T172508Z-feature1-4bc3b9b7/` 提交了 11 个 raw artifact（`judge.json` / `init.exitcode` / `init.stdout.log` / `init.stderr.log` / 三棵 `*.tree.txt` / 三个 `*.path.txt` / `meta.txt`），并在 PR body 把这一坨叫做 "visual proof of work"。**这是偷换概念**：

| 类别 | 是什么 | 怎么读 | 信任来源 |
|------|-------|-------|---------|
| **Auditable raw evidence** | `judge.json` / `*.log` / `*.txt` / `*.exitcode` / file trees | terminal 里 `cat` / `less` / `jq`；眼睛读字面 byte | 第三方 judge harness 跑固定工具落盘 |
| **Visual proof of work** | `*.html` rendered dashboard / chart / screenshot / diff viewer | 浏览器（Chrome）打开 URL，眼睛**看渲染结果** | 同上 raw evidence + 一层 deterministic HTML render layer |

两者是 **互补**，不是 either-or：raw evidence 给 grep / diff / `claudefast` judge，HTML 给人眼。一个 PR 声称有 visual proof，必须有 browser-renderable HTML；只放 raw txt/json 的 PR 不允许在 body 写 "visual proof"。

## Hosting — PR proposer's self-hosted GitHub Pages

每个 PR proposer 负责把 HTML artifact 推到**自己的** GH Pages site（不是 TeamBrain repo 的 GH Pages，不是 anthropic、不是 vercel、不是 netlify、不是 imgur）。**Canonical 路径走 project-pages 模式**（避免 user-pages 模式下的自指歧义 `<username>.github.io/<username>.github.io/...`）：

```
https://<username>.github.io/<artifact-repo>/<pr-or-feature>/<name>-<ts>.html
```

- `<username>` = PR author 的 GitHub handle（例：本仓库主用户 `liush2yuxjtu` 对应 `https://liush2yuxjtu.github.io/`）
- `<artifact-repo>` = 该用户专门用于托管 PR visual proof 的 separate public repo（推荐 `teambrain-proof` 这种独立 sub-repo 走 project-pages 模式；**不**推荐把 `<username>.github.io` 这种 user-pages root 同时当 `<artifact-repo>` 用，会让 URL 自指：`<username>.github.io/<username>.github.io/...` 要么 404 要么落到 root path 与 anchor 模板不一致）
- `<pr-or-feature>` = PR 编号或 feature slug（例：`pr-399/` / `feature-1-init/`）
- `<name>-<ts>.html` = artifact 文件名 + unix 时间戳避免覆盖

替代模式（user-pages root）：如果 proposer 只有 `<username>.github.io` 一个 site、不想再开 sub-repo，URL 形态变成 `https://<username>.github.io/<pr-or-feature>/<name>-<ts>.html`（少一层 `<artifact-repo>`）。该形态仍然满足 anchor sentence 的 8 个 substring 锚点（`<username>.github.io` 命中、`*.html` 命中），但 PR body 必须 explicit 标注 `(user-pages mode)` 让 reviewer 知道 URL 结构差异。

### Why self-hosted not centralized

1. **Cost & rate limit isolation** —— 中心化（如 TeamBrain repo 自己的 GH Pages）会被所有人写、被 reviewer 删除工具误清理、被 `landing-deploy.yml` 覆盖。每个 proposer 自己的 GH Pages site 是 zero-cost、零冲突、git push 即上线。
2. **Provenance** —— `https://<username>.github.io/...` URL 里 `<username>` 就是 PR author 本人；reviewer 看到 URL 一眼知道是谁担保的 visual proof，不会与第三方混淆。
3. **Permanence with rollback** —— GH Pages 保留 commit 历史；如果 visual proof 被发现造假 / 数据过期，proposer 可以 commit revert 而不需要 admin 介入 TeamBrain repo。
4. **No special secrets** —— GH Pages 默认 public，不需要 PR proposer 申请 TeamBrain repo 的 push 权限，不需要 OAuth token、不需要 S3 bucket、不需要 CDN 账户。

### Bootstrap — first-time setup

PR proposer 第一次需要：

```bash
# 1. 在 GitHub 上 create repo: <username>.github.io  (or any public repo with Pages enabled)
gh repo create <username>.github.io --public

# 2. 本地 clone
git clone git@github.com:<username>/<username>.github.io.git
cd <username>.github.io

# 3. mkdir per-PR
mkdir -p pr-<N>/

# 4. 写 HTML artifact 到该目录，commit + push
cp /tmp/teamagent/<feature>/<name>.html ./pr-<N>/<name>.html
git add pr-<N>/<name>.html
git commit -m "visual proof: PR #<N>"
git push origin main

# 5. 等 1-3 min GH Pages CDN propagate，curl 验证
curl -I https://<username>.github.io/pr-<N>/<name>.html
# expect: HTTP/2 200
```

URL 200 之后才把链接贴到 PR body / PR comments。

## What MUST appear in PR body or comments

PR body（或 reviewer-visible first comment）必须含至少一行 `https://<username>.github.io/...` 链接，每个 visual proof artifact 一行。推荐结构：

```markdown
## Visual proof of work

- [Judge dashboard](https://liush2yuxjtu.github.io/teambrain-proof/pr-407/judge-dashboard.html) — renders judge.json + stdout + tree into one scrollable page
- [Before/after diff](https://liush2yuxjtu.github.io/teambrain-proof/pr-407/diff.html) — side-by-side render of fixture replay
```

每个链接必须：

- HTTP/2 或 HTTP/1.1 `200` —— `curl -I <url>` 必须返回 200，**不**允许 `404` / `301` 重定向到 README / `503`
- HTML `<!DOCTYPE html>` 起头，self-contained（内联 CSS，无 third-party CDN URL，无外部 third-party network call）—— 与 `docs/POP-OPEN-HTML.md` 的 self-contained 约束一致；**允许** `<script src="./vendored-lib.js">` / `<link rel="stylesheet" href="./styles.css">` 这种 same-repo relative path（用来 vendor chart.js / d3 等 dashboard 依赖到自己的 GH Pages repo 里），**禁止** `cdnjs.cloudflare.com` / `unpkg.com` / `cdn.jsdelivr.net` 之类的 third-party CDN URL
- 浏览器可读 —— 一个真人 reviewer 在 Chrome 里 click URL，看到的应该是渲染后的 UI（dashboard / chart / form / diff），不是一个 raw JSON / plain-text fallback

### PNG / JPG screenshot carve-out（允许的辅助形态）

静态 UI bug / before-after 截图允许作为 `*.html` 的**辅助**证据形态，但有严格条件：

- 必须出现在 PR body 的 `## Visual proof of work` section 里，以 GitHub markdown 图片语法 `![alt](url)` 嵌入
- URL 必须是 PR proposer 自己的 GH Pages site 上的图片（`https://<username>.github.io/<artifact-repo>/<pr>/screenshot-<n>.png`），**不**允许 GitHub user-images CDN 自动 upload（那是 GitHub-hosted、不是 self-hosted）、**不**允许 imgur / cloudinary 等第三方
- 截图**只能**用于 static UI 状态（404 页面、layout 截图、error toast、settings panel 状态），**不能**取代 interactive dashboard / diff viewer / chart 的 `*.html`
- PR claim 自己有 visual proof 时，至少要有 **1 个** `*.html` URL，否则不算命中本规则（截图只是 supplement，不是 substitute）

判定优先级：reviewer 看 PR body 时先抓 `*.html` URL；如果 0 个 `*.html`、只有 PNG → 视为没满足本规则；如果至少 1 个 `*.html` + N 个 PNG → 通过。

## What does NOT count as visual proof

| 不算 | 为什么 |
|------|-------|
| 提交一坨 `*.txt` / `*.log` / `*.json` 到 `docs/plans/...` 然后说 "visual proof in the evidence dir" | 这是 auditable raw evidence，不是 visual proof —— 见上面那张表 |
| 贴一张 ASCII art / mermaid 图 到 PR body | 文字、不是 browser-renderable HTML |
| HTML artifact 写在 TeamBrain repo 内（如 `docs/plans/.../visual-proof.html`） | 与 `docs/POP-OPEN-HTML.md` 冲突（pop-open HTML artifact 不允许写进 repo）；且每个 PR 写 HTML 进 repo 会污染 docs 树 |
| HTML hosted 在 vercel / netlify / imgur / s3 / pastebin / `transfer.sh` | 不是 self-hosted GitHub Pages，provenance 不直接挂在 PR author 名下 |
| 私有 / 需要登录的链接（Notion、Confluence、private GH Pages） | reviewer 打不开 = 没证据 |

## Relationship to existing rules

- **`docs/POP-OPEN-HTML.md`** 管的是 **agent 在本地生成 HTML 然后 `open -a "Google Chrome"` 弹给当前用户看** 的场景。它的三条铁律（open in Chrome / write to `/tmp` / pop open immediately）只适用于 **agent-spawned local artifacts on the proposer's machine**——artifact 落 `/tmp/teamagent/<feature>/<name>-<ts>.html`，**不进 repo**，pop open 给当前坐在电脑前的 user 看。本规则（VISUAL-PROOF-FORMAT）管的是 **PR-shipped remote artifacts on a public GH Pages site**——artifact 由 proposer 手动 `cp` 一份到自己的 `<artifact-repo>` 目录、`git push` 上线、URL 贴 PR body 给**远端的** reviewer 在 Chrome 里 click 打开。两条规则**正交且互补**：POP-OPEN-HTML 的 `open -a "Google Chrome"` spawn 调用、`/tmp` 路径约束、`--no-pop` flag 等具体机制**不**适用于远端 GH Pages URL（reviewer 在自己的浏览器里手动 click，没有 spawn `open` 这个动作）；反过来，VISUAL-PROOF-FORMAT 的 GH Pages 托管 / URL 在 PR body 等机制**不**适用于 agent 给当前 user 弹页面（agent 不需要也不应该 push 到 GH Pages 才给 user 看东西）。任何 PR 同时触发两条规则时（agent 先在本地 `/tmp` 生成 HTML、再 `cp` 到 GH Pages repo push 上线），**两套机制各自独立 verify、不相互替代**；judge harness 也不要把一条规则的 probe 当成另一条的证据。
- **`docs/BUSINESS-FEATURES.md`** Feature 1/2/3 row 里如果声称 "visual proof of work"，必须满足本规则，否则改写成 "auditable raw evidence" 或 "PRESHIP / Vision"。
- **第三方 judge harness 三段铁律**（user-level CLAUDE.md / project AGENTS.md）不变：raw judge JSON + raw stdout/stderr 仍然是必需的；本规则只在 judge JSON 之上**再加**一层 HTML render，不替代 raw evidence。
- **`docs/PR-ISSUE-COMMENT-LANGUAGES.md`**：PR body 的 visual-proof section 仍然 MUST be English；URL 自然语言段保持英文，URL 本身路径可含 kebab-case slug。

## How to verify (judge harness)

A `claudefast -p "which file format is used for visual proof of work ?"` probe must return text where all 8 substring anchors above appear (case-insensitive). Reference probe:

```bash
ANSWER="$(claudefast -p "which file format is used for visual proof of work ?")"
for needle in 'Visual proof of work uses the' '*.html' 'PR proposer' 'self-hosted GitHub Pages' '<username>.github.io' 'links the URL' 'PR body or PR comments' 'auditable raw evidence'; do
  echo "$ANSWER" | grep -iqF -- "$needle" || { echo "FAIL anchor missing: $needle" >&2; exit 1; }
done
echo "PASS — all 8 anchors present"
```

For PR-time enforcement, a per-PR probe should:

1. `curl -I` each `<username>.github.io/...` URL in the PR body; expect `200`.
2. `curl <url> | grep -F '<!DOCTYPE html>'` to confirm HTML payload.
3. `curl <url> | grep -Fv 'src="http'` to confirm no external network deps (self-contained).

Failed probes block merge (per `docs/COMMIT-FLOW.md` `/review` PASS gate).

## Out of scope

- Pure docs-only PR（只改 `*.md`，不声明任何 visual evidence）→ 不需要 visual proof；本 rule 只对**声称提供 visual proof**的 PR 生效。
- 内部 CI 跑出来的 nightly dashboard → 已有独立 publishing path（如 `landing-deploy.yml`），不走本规则。
- Hotfix / emergency rollback：**不**提供"magic string bypass"（旧版曾有 `bypass-visual-proof: hotfix` 单行标签的草案，已删除——理由：magic string 没 CI 强制、没 max-uses 上限、没 reviewer 强制签字、24h follow-up 没 cron 追踪，事实上等于任意 PR 都可禁用本规则）。如果未来真出现 hours-scale hotfix 反复触发的场景，按 follow-up PR 重新设计 label-based 合同（要求 `bypass-visual-proof-hotfix` GitHub label + maintainer 显式审批 + CI scheduled job 在 24h 后强制 reopen issue），不接受 PR body 自助 bypass。

> 注：fork-PR 外部贡献者没有自己的 `<username>.github.io`、archival snapshot (web.archive.org / git SHA pin)、third-party CDN 例外这三类边界场景**当前不在本规则覆盖范围**，因为 TeamBrain 目前没有产生过这些场景的实际 PR。一旦真出现这三类场景的 PR friction，开 follow-up issue 走 FIXEDFLOW 扩规则，**不**在本规则里预先承诺。
