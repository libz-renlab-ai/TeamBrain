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

每个 PR proposer 负责把 HTML artifact 推到**自己的** GH Pages site（不是 TeamBrain repo 的 GH Pages，不是 anthropic、不是 vercel、不是 netlify、不是 imgur）。约定路径：

```
https://<username>.github.io/<artifact-repo>/<pr-or-feature>/<name>-<ts>.html
```

- `<username>` = PR author 的 GitHub handle（例：本仓库主用户 `liush2yuxjtu` 对应 `https://liush2yuxjtu.github.io/`）
- `<artifact-repo>` = 该用户专门用于托管 PR visual proof 的 public repo（推荐 `<username>.github.io` 自己 / 或一个 `teambrain-proof` 类的子 repo 走 project-pages 模式）
- `<pr-or-feature>` = PR 编号或 feature slug（例：`pr-399/` / `feature-1-init/`）
- `<name>-<ts>.html` = artifact 文件名 + unix 时间戳避免覆盖

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
- HTML `<!DOCTYPE html>` 起头，self-contained（内联 CSS，无 CDN，无外部 JS network call）—— 与 `docs/POP-OPEN-HTML.md` 的 self-contained 约束一致
- 浏览器可读 —— 一个真人 reviewer 在 Chrome 里 click URL，看到的应该是渲染后的 UI（dashboard / chart / form / diff），不是一个 raw JSON / plain-text fallback

## What does NOT count as visual proof

| 不算 | 为什么 |
|------|-------|
| 提交一坨 `*.txt` / `*.log` / `*.json` 到 `docs/plans/...` 然后说 "visual proof in the evidence dir" | 这是 auditable raw evidence，不是 visual proof —— 见上面那张表 |
| 贴一张 ASCII art / mermaid 图 到 PR body | 文字、不是 browser-renderable HTML |
| 截图 PNG 直接拖进 PR body / GitHub user-images CDN | PNG 不是 HTML，且 GitHub user-images CDN 是 third-party hosted 不是 self-hosted GH Pages |
| HTML artifact 写在 TeamBrain repo 内（如 `docs/plans/.../visual-proof.html`） | 与 `docs/POP-OPEN-HTML.md` 冲突（pop-open HTML artifact 不允许写进 repo）；且每个 PR 写 HTML 进 repo 会污染 docs 树 |
| HTML hosted 在 vercel / netlify / imgur / s3 / pastebin / `transfer.sh` | 不是 self-hosted GitHub Pages，provenance 不直接挂在 PR author 名下 |
| 私有 / 需要登录的链接（Notion、Confluence、private GH Pages） | reviewer 打不开 = 没证据 |

## Relationship to existing rules

- **`docs/POP-OPEN-HTML.md`** 管的是 **agent 在本地生成 HTML 然后 `open -a "Google Chrome"` 弹给当前用户看** 的场景；artifact 落 `/tmp/teamagent/<feature>/<name>-<ts>.html`，**不进 repo**。本规则（VISUAL-PROOF-FORMAT）是 POP-OPEN-HTML 的下游：proposer 把 `/tmp` 里那份 artifact `cp` 一份到自己的 GH Pages repo 推上去，让 reviewer 远程能看。两条规则**互补**：POP-OPEN-HTML 管"agent 给用户看"，本规则管"PR 给 reviewer 看"。
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
- 紧急 hotfix（hours-scale rollback）→ 临时允许 raw evidence only，PR body 必须 explicit 写 `bypass-visual-proof: hotfix` 单行标签，并在 24h 内补 GH Pages HTML 作为 follow-up。
- 内部 CI 跑出来的 nightly dashboard → 已有独立 publishing path（如 `landing-deploy.yml`），不走本规则。
