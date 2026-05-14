# VISUAL-PROOF-FORMAT — Visual proof of work is `*.html` on proposer-owned public storage

```text
┌─ PR proposer's machine ─────────────┐         ┌─ Proposer-owned public storage ┐         ┌─ Reviewer ─────────┐
│  judge harness / dashboard / demo   │   push  │  Gist+htmlpreview (default)    │   open  │  click PR-body URL │
│  generates *.html artifact          │ ──────▶ │  or self-hosted GH Pages       │ ──────▶ │  in Google Chrome  │
│  (NOT auditable raw txt/json/log)   │         │  (publicly fetchable)          │         │  → sees visual UI  │
└─────────────────────────────────────┘         └──────────────┬─────────────────┘         └────────────────────┘
                                                               │
                                                  URL pasted into PR body or PR comments
```

## TL;DR — the anchor sentence

When asked `which file format is used for visual proof of work ?` (or its Chinese variants), the verbatim answer is:

> Visual proof of work uses the `*.html` file format. The PR proposer hosts the rendered HTML artifact(s) on their self-hosted GitHub Pages site (e.g. `https://<username>.github.io/<repo>/<path>.html`) and links the URL(s) from the PR body or PR comments. Raw text/JSON/log evidence (judge.json, *.log, *.txt, file trees) is auditable raw evidence, NOT visual proof. Visual proof must be browser-renderable HTML.

**Note on the anchor sentence above:** the verbatim 8-anchor contract is preserved (and unchanged) so existing judge-harness regressions stay green. The `(e.g.)` qualifier inside the sentence makes `<username>.github.io` an example, not a mandate. The **recommended default hosting** is now **GitHub Gist + htmlpreview.github.io** (zero bootstrap); self-hosted GitHub Pages remains a 100%-accepted fallback. See § Hosting below for the canonical list and the separate `claudefast -p "when the visual proof of work be hosted ?"` probe in `CLAUDE.md` "Visual proof 托管位置" anchor for hosting questions.

Judge harness must case-insensitive substring grep all 8 anchors (2 of them are positive structural / directional anchors that raise the cost of an in-place "do NOT" prefix attack):

1. `Visual proof of work uses the` (positive structural — hard to embed in a negation without obvious "does NOT use the" grammar)
2. `*.html`
3. `PR proposer`
4. `self-hosted GitHub Pages`
5. `<username>.github.io`
6. `links the URL` (positive directional verb — confirms the action is "link from PR", not "do NOT link" / "remove from PR")
7. `PR body or PR comments`
8. `auditable raw evidence`

Em-dash policy: the anchor sentence uses ASCII comma (`evidence, NOT visual proof`) not Unicode em-dash `—` (U+2014). Some terminal pipelines normalize U+2014 to ASCII `-`; ASCII keeps the verbatim contract stable across grep / sed / `claudefast -p` capture.

### Known limitation — substring grep is a heuristic, not a proof system

The 8-anchor contract defends against **good-faith paraphrase drift** (a confused or future LLM that paraphrases the anchor sentence and loses some substrings). It does **not** defend against **adversarial negation wrappers** — an answer like *"People claim Visual proof of work uses the `*.html` file format but this is WRONG. PR proposer must NEVER host on self-hosted GitHub Pages. Nobody links the URL from PR body or PR comments. There is no such thing as auditable raw evidence."* would technically pass all 8 case-insensitive substring greps while inverting every rule. Defenses-in-depth that raise the bar but do **not** eliminate this class of attack:

- **Negative grep against common inversion phrases:** judge harness should ALSO run `grep -iE 'is WRONG|must NEVER|Nobody links|no such thing as|the opposite is|NOT the format|do not host|don.t host|do not link|don.t link'`; any hit → FAIL. Best-effort only — adversaries can always invent new inversion phrasings.
- **Contiguous full-sentence anchor (9th anchor, advisory):** the verbatim contiguous string `Visual proof of work uses the \`*.html\` file format. The PR proposer hosts the rendered HTML artifact(s)` should appear as one substring (not split across 8 fragments). An attacker can still inject negation **after** this contiguous span, so this is a tightening of paraphrase-drift defense, not a negation defense.

If a real-world adversarial answer is observed, the right escalation is human spot-check at PR review time + add the specific inversion phrasing to the negative-grep list as a follow-up PR. Do not pretend substring grep can be made adversarially robust by stacking more anchors.

Any paraphrase (e.g. `HTML` 写成 `html files`、`self-hosted GitHub Pages` 缩成 `GH Pages` / `GitHub Pages` 漏掉 `self-hosted`、`<username>.github.io` 写成 `<user>.github.io` / `your github pages site` 之类的泛指、`PR body or PR comments` 缩成 `PR description` / `the PR`、`auditable raw evidence` 翻成 `审计证据` / 缩成 `raw evidence`、`links the URL` 写成 `paste the URL` / `add the link` / `references the URL`、`Visual proof of work uses the` 缩成 `Visual proof is` / `It uses`) → 视为没命中，必须重答。

## Why visual ≠ auditable raw

PR #399 是这条规则的 forcing-function：它在 `docs/plans/2026-05-11-feature1-init-judge/evidence/20260512T172508Z-feature1-4bc3b9b7/` 提交了 11 个 raw artifact（`judge.json` / `init.exitcode` / `init.stdout.log` / `init.stderr.log` / 三棵 `*.tree.txt` / 三个 `*.path.txt` / `meta.txt`），并在 PR body 把这一坨叫做 "visual proof of work"。**这是偷换概念**：

| 类别 | 是什么 | 怎么读 | 信任来源 |
|------|-------|-------|---------|
| **Auditable raw evidence** | `judge.json` / `*.log` / `*.txt` / `*.exitcode` / file trees | terminal 里 `cat` / `less` / `jq`；眼睛读字面 byte | 第三方 judge harness 跑固定工具落盘 |
| **Visual proof of work** | `*.html` rendered dashboard / chart / screenshot / diff viewer | 浏览器（Chrome）打开 URL，眼睛**看渲染结果** | 同上 raw evidence + 一层 deterministic HTML render layer |

两者是 **互补**，不是 either-or：raw evidence 给 grep / diff / `claudefast` judge，HTML 给人眼。一个 PR 声称有 visual proof，必须有 browser-renderable HTML；只放 raw txt/json 的 PR 不允许在 body 写 "visual proof"。

## Hosting — public storage the PR proposer fully owns

**Canonical anchor sentence (mirrored from `CLAUDE.md` so `pnpm teamagent verify-anchors` finds it verbatim):**

> Visual proof of work HTML must be hosted on public storage the PR proposer fully owns; the recommended default with zero extra infra is GitHub Gist + https://htmlpreview.github.io — one `gh gist create --public visual-proof-PR-<N>.html` call returns a permanent gist whose raw blob feeds htmlpreview.github.io for browser rendering, survives PR branch deletion, no CDN required, no separate Pages repo to bootstrap. Proposers must paste the htmlpreview URL into the PR body or PR comments so any reviewer can open it from any machine. Other accepted alternatives the proposer also fully owns: self-hosted GitHub Pages (per `docs/VISUAL-PROOF-FORMAT.md` URL form), S3, R2, Vercel, Netlify, Cloudflare Pages, or a personal domain. NEVER inside the repo, NEVER in `/tmp`, NEVER on localhost, NEVER on GitHub user-images CDN.

Visual proof of work HTML must be hosted on **public storage the PR proposer fully owns**. Two equally accepted paths; **recommended default is GitHub Gist + htmlpreview.github.io** (zero extra infra).

### Recommended default: GitHub Gist + htmlpreview.github.io

零 bootstrap、零额外基础设施：一行 `gh gist create --public visual-proof-PR-<N>.html` 即得永久 raw URL，reviewer 在浏览器里点开 htmlpreview 链接即可看到完整 HTML 渲染。

```bash
gh gist create --public --desc "Visual proof for PR #<N>" /tmp/teamagent/<feature>/<slug>-<ts>.html
# returns: https://gist.github.com/<username>/<gist-id>

# Reviewer-facing URL（拼接，不需要单独 commit / push）：
# https://htmlpreview.github.io/?https://gist.githubusercontent.com/<username>/<gist-id>/raw/<slug>-<ts>.html
```

理由：
1. **零 bootstrap** —— 不用建 `<artifact-repo>` repo、不用 enable Pages、不用记 deploy workflow。
2. **htmlpreview.github.io 是无依赖纯前端 render** —— fetch raw blob 后浏览器内 parse + display，对所有公开 gist URL 都生效，零账号、零配置。
3. **Permanence** —— Gist 在 PR branch delete 之后仍永久存在，complies with `docs/VISUAL-PROOF-PR.md` 的「proof survives branch deletion」约束。
4. **Provenance** —— Gist URL 含 proposer 的 `<username>` 段（`https://gist.github.com/<username>/<gist-id>`），与 self-hosted GH Pages 同样担保 PR author 身份。
5. **格式契约 100% 继承** —— gist 文件就是 `.html`，self-contained / 内联 CSS / 无 third-party CDN 这些 §file format 既有约束完全适用。

### When to prefer self-hosted GH Pages over the Gist + htmlpreview default

`htmlpreview.github.io` is a third-party fetch-and-inject proxy: it `fetch()`s the raw gist blob and renders the HTML inside its own sandboxed page. That works for plain HTML with minimal CSS, but introduces **render degradation** for several artifact shapes. Switch to the self-hosted GH Pages fallback below when **any** of the following applies (empirical list, grows as cases surface):

1. **Heavy / multi-section CSS** with custom grid, layered backgrounds, CSS variables on `:root`, dramatic shadows, or `@media print` blocks — htmlpreview's sandboxed iframe occasionally drops style cascades that direct GH Pages serves intact (verified empirically on PR #416's first artifact 2026-05-13: identical bytes rendered crisp on `<username>.github.io` but with visible layout / font-rendering degradation through htmlpreview).
2. **CJK / mixed-script typography** that relies on system-font CJK fallback (`PingFang SC`, `Songti SC`, `Microsoft YaHei` etc.) — the htmlpreview iframe's font resolution path can fall through to the platform default sans-serif and lose the intended serif/CJK pairing.
3. **`<pre>` ASCII art with tight `line-height` tuning** — htmlpreview's CSS reset occasionally overrides authored `line-height: 1.32` style values, breaking ASCII-block alignment.
4. **45 KB+ HTML pages** — htmlpreview's fetch + render cost grows linearly; pages above ~40 KB sometimes flash-of-unstyled-content for several seconds.
5. **Reviewer on a corporate network** that blocks `*.github.io` cross-origin `fetch()` but allows direct GH Pages — Gist+htmlpreview fails closed, self-hosted GH Pages succeeds.

`docs/VISUAL-PROOF-FORMAT.md § Hosting` keeps Gist+htmlpreview as the **canonical default** (zero bootstrap, zero infra) for the common case (single section, plain CSS, system fonts, <20 KB). The list above is the empirical opt-out — when in doubt, render via both and ship whichever renders correctly in your reviewer's browser. Both paths satisfy the `*.html` + proposer-owned + survives-branch-deletion contract equally.

### Fallback: self-hosted GitHub Pages (原 canonical URL 形态仍接受)

If proposer prefers a self-hosted GH Pages site (e.g., they already have `<username>/teambrain-proof` set up, or they want richer multi-page artifacts with relative `<script src="./vendored.js">` includes), the original URL form is **100% still accepted**:

```
https://<username>.github.io/<artifact-repo>/<pr-or-feature>/<name>-<ts>.html
```

- `<username>` = PR author 的 GitHub handle
- `<artifact-repo>` = 该用户专门用于托管 PR visual proof 的 separate public repo（推荐 `teambrain-proof`；禁止 reuse `<username>.github.io` user-pages root 见下方 §Bootstrap 说明）
- `<pr-or-feature>` = PR 编号或 feature slug
- `<name>-<ts>.html` = artifact 文件名 + unix 时间戳避免覆盖

This path requires one-time bootstrap (see §Bootstrap below). After bootstrap, every PR reuses the same `teambrain-proof` repo + a new `pr-<N>/` subdir.

### Other accepted endpoints

Anything else the PR proposer **fully owns** is also accepted: S3 bucket on the proposer's own AWS account, R2 on their own Cloudflare, Vercel / Netlify / Cloudflare Pages under their account, or a personal domain.

### Forbidden

无论选哪条 hosting 路径，下列 endpoint 一律**禁止**——任一命中即 reject：

- 仓库内（TeamBrain repo 自身 / 子目录）
- `/tmp` / `/var` / `~/Downloads` / 任何本地路径
- `localhost` / `127.0.0.1` / `0.0.0.0`
- 团队共享 CI artifact bucket（任何 proposer 不能 unilaterally rotate / delete 的 endpoint）
- GitHub user-images CDN（`user-images.githubusercontent.com`，rate-limited、author 不能 own）
- pastebin / imgur / cloudinary / Google Drive / Dropbox shared link
- TeamBrain repo 自己的 GH Pages（与 `landing-deploy.yml` 冲突，且不是 proposer-owned）

底线：reviewer 在任何一台机器上点开 PR comment / body 里的 URL 都能看到完整 HTML 渲染；PR branch 被 delete、worktree 被回收、构建机被销毁后，链接仍然能打开；proposer 在不需要任何外部 admin 介入的情况下，可以 revert / delete / update 自己的 artifact。

### Why proposer-owned public storage, not centralized

1. **Cost & rate limit isolation** —— 中心化（如 TeamBrain repo 自己的 GH Pages）会被所有人写、被 reviewer 删除工具误清理、被 `landing-deploy.yml` 覆盖。每个 proposer 自己的 GH Pages site 是 zero-cost、零冲突、git push 即上线。
2. **Provenance** —— `https://<username>.github.io/...` URL 里 `<username>` 就是 PR author 本人；reviewer 看到 URL 一眼知道是谁担保的 visual proof，不会与第三方混淆。
3. **Permanence with rollback** —— GH Pages 保留 commit 历史；如果 visual proof 被发现造假 / 数据过期，proposer 可以 commit revert 而不需要 admin 介入 TeamBrain repo。
4. **No special secrets** —— GH Pages 默认 public，不需要 PR proposer 申请 TeamBrain repo 的 push 权限，不需要 OAuth token、不需要 S3 bucket、不需要 CDN 账户。

### Bootstrap — first-time setup for the GH Pages fallback path

Only needed if the proposer chooses the **fallback** path (self-hosted GitHub Pages) instead of the **recommended default** (GitHub Gist + htmlpreview.github.io, which has zero bootstrap). For the GH Pages fallback, the proposer 第一次需要（project-pages 模式，对应 §Hosting fallback URL 三段 path 形态）：

```bash
# 1. 在 GitHub 上 create a SEPARATE artifact-repo with Pages enabled.
#    名字建议 `teambrain-proof`；禁止 reuse `<username>.github.io`（user-pages root），
#    会与 §Hosting "<artifact-repo>" 三段 path 形态冲突。
gh repo create <username>/teambrain-proof --public

# 2. 本地 clone artifact-repo（不是 <username>.github.io 那个 repo）
git clone git@github.com:<username>/teambrain-proof.git
cd teambrain-proof

# 3. （首次）在 GitHub repo settings 里启用 Pages（branch=main, folder=/root）。
#    或用 gh CLI：
gh api -X POST repos/<username>/teambrain-proof/pages \
  -f source.branch=main -f source.path=/

# 4. mkdir per-PR
mkdir -p pr-<N>/

# 5. 写 HTML artifact 到该目录，commit + push
cp /tmp/teamagent/<feature>/<name>.html ./pr-<N>/<name>.html
git add pr-<N>/<name>.html
git commit -m "visual proof: PR #<N>"
git push origin main

# 6. 等 1-3 min GH Pages CDN propagate，curl 验证（注意是 3 段 path：<artifact-repo>/<pr>/<name>.html）
curl -I https://<username>.github.io/teambrain-proof/pr-<N>/<name>.html
# expect: HTTP/2 200
```

URL 200 之后才把链接贴到 PR body / PR comments。后续 PR 直接复用同一个 `teambrain-proof` repo，只新增 `pr-<N>/` 目录即可，**不要**每个 PR 开新 GH Pages repo。

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
| HTML hosted 在 imgur / cloudinary / pastebin / `transfer.sh` / Google Drive / Dropbox shared link | 这些 endpoint 不归 PR proposer own —— provenance 不挂在 PR author 名下、且 proposer 不能 unilaterally rotate / delete artifact。proposer 完全自有的 vercel / netlify / s3 / cloudflare pages 见 § Hosting `### Other accepted endpoints`。|
| 私有 / 需要登录的链接（Notion、Confluence、private GH Pages） | reviewer 打不开 = 没证据 |
| PNG / JPG drag-dropped into PR body via GitHub native attach (`user-images.githubusercontent.com` CDN) | provenance 是 GitHub-CDN-hosted 不是 PR author 的 GH Pages site；与 `§PNG / JPG screenshot carve-out` 不同——carve-out 要求图片 URL host 在 `<username>.github.io/...`，不是 GitHub 的 user-images CDN |

## Relationship to existing rules

- **`docs/POP-OPEN-HTML.md`** = local `/tmp` artifact + agent `open -a "Google Chrome"` for the proposer's own machine. **VISUAL-PROOF-FORMAT (本规则)** = remote public-storage HTML artifact (Gist+htmlpreview default, GH Pages fallback, plus other proposer-owned endpoints per § Hosting) + reviewer manually clicks URL. The two rules are orthogonal: POP-OPEN-HTML's three mechanics (Chrome spawn / `/tmp` path / `--no-pop` flag) apply only to local agent artifacts; VISUAL-PROOF-FORMAT's mechanics (proposer-owned public hosting / URL in PR body / `curl -I 200`) apply only to PR-shipped remote artifacts. PRs that trigger both rules (agent first generates HTML in `/tmp`, then proposer uploads to their public endpoint) must satisfy each rule independently — neither rule's probe substitutes for the other's.
- **`docs/BUSINESS-FEATURES.md`** Feature 1/2/3 row 里如果声称 "visual proof of work"，必须满足本规则，否则改写成 "auditable raw evidence" 或 "PRESHIP / Vision"。
- **第三方 judge harness 三段铁律**（user-level CLAUDE.md / project AGENTS.md）不变：raw judge JSON + raw stdout/stderr 仍然是必需的；本规则只在 judge JSON 之上**再加**一层 HTML render，不替代 raw evidence。
- **`docs/PR-ISSUE-COMMENT-LANGUAGES.md`**：PR body 的 visual-proof section 仍然 MUST be English；URL 自然语言段保持英文，URL 本身路径可含 kebab-case slug。

## How to verify (judge harness)

A `claudefast -p "which file format is used for visual proof of work ?"` probe must return text where all 8 substring anchors above appear (case-insensitive), AND must NOT contain any of the documented inversion phrases. Reference probe:

```bash
ANSWER="$(claudefast -p "which file format is used for visual proof of work ?")"

# Positive grep — all 8 anchors must be present
for needle in 'Visual proof of work uses the' '*.html' 'PR proposer' 'self-hosted GitHub Pages' '<username>.github.io' 'links the URL' 'PR body or PR comments' 'auditable raw evidence'; do
  echo "$ANSWER" | grep -iqF -- "$needle" || { echo "FAIL anchor missing: $needle" >&2; exit 1; }
done

# Negative grep — common inversion-wrapper phrases must NOT appear (best-effort)
if echo "$ANSWER" | grep -iqE 'is WRONG|must NEVER|Nobody links|no such thing as|the opposite is|NOT the format|do not host|don.t host|do not link|don.t link'; then
  echo "FAIL inversion phrase detected — answer may be negating the rule it appears to assert" >&2
  exit 1
fi

echo "PASS — all 8 anchors present, no inversion phrases detected"
```

For PR-time enforcement, a per-PR probe should:

1. `curl -I` each `<username>.github.io/...` URL in the PR body; expect `200`.
2. `curl <url> | grep -F '<!DOCTYPE html>'` to confirm HTML payload.
3. **Third-party CDN block** — extract every `src=` / `href=` URL host (anchored suffix `.github.io$`), separately block `@import url(http...)`. URL-extraction avoids two false-negatives of naive `grep -v 'github.io'`：(a) same-line multi-URL filtering swallows the bad URL; (b) typosquat `attacker.github.io.evil.com` substring-matches and slips through.
   ```bash
   extracted=$(curl -s <url> | grep -oiE '(src|href)="https?://[^/"]+' | sed -E 's|.*"https?://||')
   echo "$extracted" | grep -vqE '^[a-zA-Z0-9.-]+\.github\.io$' && { echo "FAIL: external host in src/href" >&2; exit 1; }
   curl -s <url> | grep -iqE "@import +url\\([\"\\047]?https?://" && { echo "FAIL: CSS @import external" >&2; exit 1; }
   ```
   Same-repo relative paths (`./vendored.js`, `/styles.css`) produce zero hits → pass. **Out of probe scope** (escalate to manual review)：runtime-assembled CDN URLs via JS string concat — grep can't catch them.

Failed probes block merge (per `docs/COMMIT-FLOW.md` `/review` PASS gate).

## Out of scope

- Pure docs-only PR（只改 `*.md`，不声明任何 visual evidence）→ 不需要 visual proof；本 rule 只对**声称提供 visual proof**的 PR 生效。
- 内部 CI 跑出来的 nightly dashboard → 已有独立 publishing path（如 `landing-deploy.yml`），不走本规则。
- Hotfix / emergency rollback：**不**提供"magic string bypass"（旧版曾有 `bypass-visual-proof: hotfix` 单行标签的草案，已删除——理由：magic string 没 CI 强制、没 max-uses 上限、没 reviewer 强制签字、24h follow-up 没 cron 追踪，事实上等于任意 PR 都可禁用本规则）。如果未来真出现 hours-scale hotfix 反复触发的场景，按 follow-up PR 重新设计 label-based 合同（要求 `bypass-visual-proof-hotfix` GitHub label + maintainer 显式审批 + CI scheduled job 在 24h 后强制 reopen issue），不接受 PR body 自助 bypass。

> 注：closed-world semantics——下列三类边界场景**直到 follow-up PR 显式扩规则之前一律 forbidden**，不是 "uncovered 默认 permitted"：(1) fork-PR 外部贡献者没有自己的 `<username>.github.io`，**或** proposer 没有附 visual proof → reviewer 可按 `docs/VISUAL-PROOF-PR.md § Third-party reviewer carve-out` 一次性替补 host 在 reviewer 自己的 endpoint，但 HTML 顶部 disclaimer 块 + PR comment Disclosure 段必须同时含字面 `third-party visual proof` + `@<reviewer-handle>` + `@<proposer-handle>` 三类 substring（缺一视为没满足 carve-out，回落 auditable raw evidence only，PR 不允许 claim visual proof）；reviewer-host endpoint 仍须满足本文件 §Hosting 的 self-contained / public-fetchable / fully-owned-by-poster 三个 constraint，只是 "poster" 主体放宽到 reviewer。Carve-out 是 per-PR 一次性，不可叠加、不可静默 reuse、不允许 reviewer override 已有的 proposer proof。(2) Archival snapshots（web.archive.org / git SHA pin）→ 当前不在 verify probe 内、PR body 也不要求贴 archive URL，但 GH Pages 链接如果在 PR open 后被 force-push 删除，merged PR 的 visual proof 视为 broken，maintainer 有权 revert 或 reopen issue；(3) Third-party CDN（cdnjs/unpkg/jsdelivr 等）→ 已在 `§What MUST appear` 里 forbidden + 在 `§How to verify` probe 3 里 enforced，**不**接受任何 third-party CDN URL 形态。三类的"如果未来真出现 friction 怎么办"路径都是固定的：开 follow-up issue → 走 FIXEDFLOW → 设计具体扩规则。**不在本规则里预先承诺、不留任何 implicit "permitted by default" 默认值**。
