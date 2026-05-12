# Draft fixedflow issue body for Feature #2 v2

```
                ┌─────────────┐
                │   YOU       │
                │ (maintainer)│
                └──────┬──────┘
                       │
       ┌───────────────┴───────────────┐
       │ 1. gh issue create  (paste §1)│
       │ 2. gh issue edit --add-label  │
       │    grilling  (PRE-GRILL-CLAIM)│
       │ 3. paste §3 takeover comment  │
       │ 4. /grill-via-web <N>         │
       │ 5. swap grilling → grill-ready│
       │ 6. /fixed-flow-driver <N>     │
       └───────────────────────────────┘
```

**DO NOT auto-create** — this file is a paste-template only. Creating a
GitHub issue is a shared-state action; the maintainer must confirm scope
and timing.

Per `docs/PR-ISSUE-COMMENT-LANGUAGES.md`: title prefix English
`[fixedflow]`, ≤50-word user-facing body MAY be Chinese.

---

## §1 — Issue title + body (paste into `gh issue create`)

**Title**:

```
[fixedflow] Feature #2 v2 — 2 通道 realtime cc-status SSE → boss 看板
```

**Body** (verbatim, ≤50 字 中文 body 已统计):

```markdown
### 想要什么 / 看见了什么 (≤50 字)

Feature #2 v2：SessionStart + UserPromptSubmit 两个 hook fire-and-forget 推 cc-status snapshot 到 receiver，新增 SSE wrapper，boss 看板 ≤1s p50 看到每个 teammate 在干啥。详见 docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md v2。

### 流程确认

- [x] 我已阅读 docs/FIXEDFLOW.md，理解需要 24 小时内补 grill 评论 + grill-ready label
- [x] 我承诺 body ≤50 字，详细内容写在 grill 评论里
```

---

## §2 — `gh` command snippets (do not run unattended)

```bash
# 0. Confirm you intend to file this issue right now
echo "About to create Feature #2 v2 fixedflow issue — Ctrl-C to abort"
read -p "Press enter to continue: " _

# 1. File the issue (English title prefix per PR-ISSUE-COMMENT-LANGUAGES)
NEW_NUM=$(gh issue create \
  --title "[fixedflow] Feature #2 v2 — 2 通道 realtime cc-status SSE → boss 看板" \
  --body-file <(sed -n '/^### 想要什么/,/详细内容写在 grill 评论里$/p' \
    docs/plans/2026-05-11-feature-2-secondlevel-realtime/draft-feature-2-v2-issue.md) \
  | grep -oE '[0-9]+$')
echo "Created issue #$NEW_NUM"

# 2. PRE-GRILL-CLAIM: atomic claim-comment + grilling label
#    Required verbatim Chinese declaration per docs/PRE-GRILL-CLAIM.md
gh issue comment "$NEW_NUM" --body "我来负责 grill-via-web 这个 issue
session: <填入你的 host + ISO timestamp>"
gh issue edit "$NEW_NUM" --add-label grilling

# 3. /grill-via-web in Claude Code (skill — interactive, in chat):
#    /grill-via-web $NEW_NUM
#    → pops ChatGPT URL; paste the resulting grill answer back as a comment
#    → manually swap labels:
gh issue edit "$NEW_NUM" --remove-label grilling --add-label grill-ready

# 4. (optional, recommended for plan-doc grills)
#    /grill-with-docs $NEW_NUM  → saves Q&A to ADR-0014 / per-issue sibling

# 5. PRE-IMPLEMENT-CLAIM: when ready to start coding
gh issue comment "$NEW_NUM" --body "我的机器上开始干了
host: <hostname>  session: <claude-code session-id>  ISO: $(date -u +%FT%TZ)"
gh issue edit "$NEW_NUM" --add-label grill-working

# 6. In Claude Code, manually invoke (no watcher / no auto-dispatch):
#    /fixed-flow-driver $NEW_NUM
```

---

## §3 — Suggested takeover-comment text (Chinese verbatim — per PRE-GRILL-CLAIM.md)

For PRE-GRILL-CLAIM (step 2 above):

```
我来负责 grill-via-web 这个 issue
host: <YOUR-HOSTNAME>
ISO: <UTC ISO timestamp>
入口: docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md v2
```

For PRE-IMPLEMENT-CLAIM (step 5 above):

```
我的机器上开始干了
host: <YOUR-HOSTNAME>
session: <claude-code session-id>
ISO: <UTC ISO timestamp>
worktree: .claude/worktrees/feature-2-v2-impl/
```

---

## §4 — What the grill should focus on (paste into ChatGPT/Claude.ai)

After `/grill-via-web $NEW_NUM` pops the URL, paste this as the grill
question seed (so the grill drives Q2-Q7 to resolution):

```
请按 docs/grill-me 标准 grill 这个 fixedflow issue。重点：

Q2 (transport)：plan v2 推荐 HTTP POST + SSE，receiver 端 1s 轮询
readLatestAllUsers。挑战：在 30 user × 3 session × 200 snapshot 负载下
扫盘 p99 是否 ≤100ms？回退方案 in-memory hot cache 触发条件？

Q3 (receiver)：plan v2 推荐 self-host VPS 跑 bin-prod-server.ts。挑战：
Cloudflare Worker SSE 30s 限制确实排除了吗？SaaS 路线（Supabase realtime
/ Pusher）的 vendor lock-in vs run-cost trade-off？

Q5 (dashboard host)：plan v2 推荐 teamagent realtime serve --dashboard。
挑战：static handler 加在 bin-prod-server 上会不会污染 receiver 的纯
ingest 职责？VSCode panel 路线是否更贴 maintainer 工作流？

Q6 (offline buffer)：plan v2 推荐丢弃 + M5 git-sync 兜底。挑战：M5
hour-cadence vs realtime miss window 在 pitch deck 上能讲清楚吗？hook
本地写一次 appendCcStatusSnapshot 是否能补这个 gap？

Q7 (privacy)：plan v2 强制双闸（secret-scanner + scope-classifier）。
挑战：UserPromptSubmit payload 里 prompt_excerpt ≤200 字符截断是否够？
context_tokens / model / cwd 这类元数据要不要也过 scope-classifier？

设计文档：docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md v2
研究沉淀：docs/plans/2026-05-11-feature-2-secondlevel-realtime/research.md §11
业务锚点：docs/BUSINESS-FEATURES.md § Feature #2
```

---

## §5 — Why this isn't auto-created

- Creating a GitHub issue is an "action visible to others" — per the
  global `Executing actions with care` rule, that warrants explicit user
  confirmation even when `/goal` is active.
- `docs/PRE-GRILL-CLAIM.md` requires the `grilling` label + verbatim
  takeover comment **before** any grill skill runs; auto-creating the
  issue without the maintainer staging the claim leaves a race window
  where another agent could grab it.
- `/grill-via-web` produces a ChatGPT/Claude.ai URL that **the human**
  must complete in a browser tab; it's not a fully-headless skill.
- `docs/FIXEDFLOW.md` explicitly forbids watchers / auto-dispatchers —
  the maintainer manually invokes `/fixed-flow-driver` only after grill
  + label state is clean.

When you're ready, run the §2 sequence step-by-step. The plan v2 +
research §11 are already committed on this worktree; the only
outstanding action is the GitHub side of the FIXEDFLOW handshake.
