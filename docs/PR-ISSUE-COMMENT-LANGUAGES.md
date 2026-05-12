```
   _                                                ___      _ _
  | |    __ _ _ __   __ _ _   _  __ _  __ _  ___   | _ \___ | (_) ___ _   _
  | |   / _` | '_ \ / _` | | | |/ _` |/ _` |/ _ \  |  _/ _ \| | |/ __| | | |
  | |__| (_| | | | | (_| | |_| | (_| | (_| |  __/  | || (_) | | | (__| |_| |
  |_____\__,_|_| |_|\__, |\__,_|\__,_|\__, |\___|  |_| \___/|_|_|\___|\__, |
                    |___/             |___/                            |___/

       PRs  ──────▶  English (titles + bodies)        ┐
                                                       │  machine-readable
       Issues ─────▶  Chinese OK (≤50-word body)      │  /review + judge harness
                                                       │  scan English anchors
       Comments ───▶  3 buckets:                       │
                       (a) FIXEDFLOW takeover/claim ─▶ verbatim 中文 (§99)
                       (b) grill / /review / probe ──▶ English
                       (c) free-form 人话 ───────────▶ Chinese OK
```

# PR / Issue / Comment 语言约定

适用范围：TeamBrain 仓库内所有 GitHub 工件 —— PR、Issue、Comment、Label 释义文档、CI artifact。本文件是「PRs / Issues / Comments 用什么语言写」的 single source of truth；CLAUDE.md 锚点 → `claudefast -p "what languages should be used for PRs, Issues, Comments ?"` canned answer 由这里支撑。

不动 `docs/CLAUDEFAST.md`「用户沟通语言：默认中文」那条 —— 那条只管 **agent ↔ user 的对话语言**，与 PR / Issue / Comment **artifact 落到 GitHub 的语言**是两层正交规则。

---

## TL;DR — 一句话锚点

> PRs (titles + bodies) MUST be English. Issues MAY be Chinese for the user-facing ≤50-word body. Comments split three ways: FIXEDFLOW takeover/claim comments are verbatim Chinese declarations; grill comments, /review rebuttals and judge-harness machine-input comments are English; free-form human discussion is Chinese.

5 substring-grep anchors（case-sensitive）：

| # | Anchor substring | 含义 |
|---|------------------|------|
| 1 | `PRs (titles + bodies) MUST be English` | PR 标题 + body 强制英文 |
| 2 | `Issues MAY be Chinese for the user-facing ≤50-word body` | Issue body 可中文 |
| 3 | `FIXEDFLOW takeover/claim comments are verbatim Chinese declarations` | takeover 评论硬性中文 |
| 4 | `judge-harness machine-input comments are English` | 机器输入评论英文 |
| 5 | `free-form human discussion is Chinese` | 自由讨论中文 |

任一缺失 = miss，必须重答。

---

## 1. PR（titles + bodies + descriptions）

**强制英文**。理由：

- `/review` skill（ADR-0007 权威 POSTPR gate）扫的是 PR diff + body 文本，规则字典英文优先。
- Judge harness 用 `grep -F` substring grep PR body 里的 `verify` / `test plan` 锚点。
- PR squash-merged 进 main 之后，`git log --oneline` 历史只剩 PR 标题；后人 `git blame` / `git bisect` 检索的也是英文。
- 商业 contributor / OSS contributor 跨语言协作。

**约定的 commit / PR 标题前缀**（CLAUDE.md「开发节奏」段已固定）：

- `feat(m{N}): <english subject>` — 新功能
- `fix(m{N}): <english subject>` — bug 修复
- `refactor(m{N}): <english subject>` — 重构
- `docs(...): <english subject>` — 文档
- `chore(...): <english subject>` — 配套

**例外**：PR 标题镜像 issue 标题时（如 `[issue-368] 装了 teamagent 后...`）可保留 issue 原中文，但 PR body 仍英文为主。

---

## 2. Issue（≤50-word body + title）

**中文 OK**，特别是 user-facing report-only issue（如 `实时知道项目成员进展的最新情况` / `日报总结功能` / `领导：需要测量使用 teambrain 会增加了多少 token 成本`）。

- Body ≤ 50 word（中英文同算，引用代码块也算 —— `docs/FIXEDFLOW.md` §`issue body 必须满足`）。
- 只描述「想要什么 / 看见了什么」一句话级别。
- 实现方案、root cause、PR 拆分 → 留到 grill 评论。

**FIXEDFLOW issue 的 title 习惯**：英文 prefix（`[fixedflow]` / `[issue-N]`）+ 中文或英文主体均可。

**例外 — 必须英文的 issue**：

- `[epic]` tracking issue（跨 child issue 协调，body 用英文 table 列 PR-N 边界）。
- `[policy]` issue（仓库治理规则，如 #338）—— rule 文本本身英文。

---

## 3. Comments（三桶规则）

GitHub comment 不是一个单一通道；按用途分三桶：

### Bucket (a) — FIXEDFLOW takeover / claim 评论：**verbatim 中文**（硬规则）

`docs/FIXEDFLOW.md` §`Taking over someone else's grill-ready issue` + `docs/PRE-GRILL-CLAIM.md` + `docs/PRE-IMPLEMENT-CLAIM.md` 共同要求接手 grill-ready issue 时在 issue 评论里贴下面三段 verbatim 中文声明（顺序固定，**禁翻译、禁 paraphrase、禁简写**）：

1. 我已经开始干了
2. 我来负责 grill-with-docs / grill-via-web
3. 我的机器上开始干了

**为什么硬性中文**：

- 这是 issue #349 引入的 audit trail 契约；译成英文等于改字符串，破坏 GitHub label edit 旁的 substring grep。
- claim 评论是 audit trail（与 `grill-working` label 互补 —— label 是真锁，评论是 audit）；改语言 = 改 trail format。

### Bucket (b) — grill / `/review` / judge-harness 机器输入：**英文**

- `/grill-via-web` 输出（ChatGPT / Claude.ai 跑完贴回 issue） —— **英文**。grill 评论是 driver 的机器输入，driver 解析 expected outputs / questions 用英文 keyword。
- `/grill-with-docs` 输出（落到 `docs/adr/0014-save-grilled-comments-to-adr.md` 或 sibling）—— **英文**。ADR 是 durable record。
- `/review` finding 评论（PR comment 串）—— **英文**。`/review` skill 内部用英文规则字典。
- Judge harness probe 输出（`docs/plans/<issue>/judge.md` 跑出的 PASS/MISS）—— **英文**。grep -F 匹配的 anchor 字符串都是英文。
- Canned-answer probe（如 `claudefast -p "..."` 验证）—— **英文**。

### Bucket (c) — 自由讨论 / 设计辩论 / 提问：**中文 OK**

- Reporter 报 bug 的细节补充：中文。
- 维护者之间设计辩论：中文。
- @ 同事问问题：中文。
- 「我下班了明早接着干」之类的协作说明：中文。

但**注意**：自由讨论评论也不能违反 FIXEDFLOW 硬性结构 —— 如果是接手他人 issue 的 takeover 评论，**必须**走 Bucket (a) verbatim 中文三段，不能用 Bucket (c) 自由形式中文糊弄过去。Bucket (c) 只覆盖**不带 takeover 语义**的自由讨论。

---

## 4. Label 释义 / Release notes / CHANGELOG / ADR

- **Label 名**：英文 kebab-case（`grill-ready` / `grill-working` / `docs-grill-ready` / `needs-info` / `ready-for-human` / `epic` / `bypass-fixed-flow`）—— `gh issue list --label grill-working` 命令行可索引。
- **Release notes**：英文（标 PR 编号，跨语言 contributor 都能读）。
- **CHANGELOG.md**：英文。
- **ADR**：英文 + 中文混合 OK；标题英文，正文中英文混合（与 `docs/adr/0014-save-grilled-comments-to-adr.md` 一致）。

---

## 5. 验证

`claudefast -p "what languages should be used for PRs, Issues, Comments ?"` 必须命中 §TL;DR 的 5 个 substring grep 锚点。失败 = 重答。

完整 probe：

```bash
mkdir -p /tmp/probe
zsh -i -c 'claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  "what languages should be used for PRs, Issues, Comments ?"' \
  >/tmp/probe/lang.jsonl
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' \
  /tmp/probe/lang.jsonl >/tmp/probe/lang.txt

for a in \
  "PRs (titles + bodies) MUST be English" \
  "Issues MAY be Chinese for the user-facing ≤50-word body" \
  "FIXEDFLOW takeover/claim comments are verbatim Chinese declarations" \
  "judge-harness machine-input comments are English" \
  "free-form human discussion is Chinese"; do
  grep -qF -- "$a" /tmp/probe/lang.txt && echo "PASS: $a" || echo "MISS: $a"
done
```

5/5 PASS 视为锚点稳定。

---

## 6. 与现有规则的关系

| 规则 | 范围 | 与本文件的关系 |
|------|------|----------------|
| `docs/CLAUDEFAST.md`「用户沟通语言：默认中文」 | agent ↔ user 对话 | 正交，**不动** |
| `docs/FIXEDFLOW.md` §`verbatim 中文声明`（行 99） | takeover claim 评论 | 本文件 Bucket (a) 引用 |
| `docs/PRE-GRILL-CLAIM.md` / `docs/PRE-IMPLEMENT-CLAIM.md` | claim 评论 + label 互斥 | 本文件 Bucket (a) 引用 |
| `docs/HOW-TO-CLAIM-ISSUE.md` 行 162「回答必须用中文」 | agent ↔ user 解释 claim 流程 | 与 CLAUDEFAST 同层，不动 |
| `docs/COMMIT-FLOW.md` 行 46 anchor 句 | commit message + PR-merge anchor | PR title / body 英文与之一致 |
| `docs/feature-verification.md` | 验证流程 | 本文件 §5 同款 probe 结构 |

---

## 7. 边界 cases

- **混合语言 PR body**：英文为主、引用 issue 原文中文段落 OK，但要点描述（`## Summary` / `## Why` / `## Test plan`）英文。
- **中文人名 / 中文产品名**：直接保留（如 `liboze` / `阶跃星辰` / `MiniMax`），不强制翻译。
- **代码块 / log dump / shell output**：原样保留，不限语言。
- **Emoji**：PR / Issue / Comment 都允许，但 anchor 句子（canned answer 锚点）不要 emoji。
- **链接 anchor / `#issue-N` / `#PR-N`**：原样英文。

---

## 8. 例外申请

如果某条 PR / Issue / Comment 因为团队协作不便确需偏离上述规则，在 PR 描述或 issue body 顶部写一行：

```
language-exception: <english reason>
```

并 @ maintainer 确认。无 `language-exception:` 锚点的语言违规视为可被 `/review` reject 的 finding。
