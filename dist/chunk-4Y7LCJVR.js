import {
  DEFAULT_FIRE_THRESHOLD,
  computeEnforcement,
  external_exports,
  normalizeChannel,
  sanitizeUserFacingText
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../core/src/index.ts
init_esm_shims();

// ../core/src/scorer.ts
init_esm_shims();
function scoreEntry(entry, maxHitCount, now) {
  const confidenceScore = entry.confidence * 0.4;
  const hitNormalized = maxHitCount > 0 ? Math.min(1, entry.hit_count / maxHitCount) : 0;
  const hitScore = hitNormalized * 0.3;
  const nowMs = Date.parse(now);
  const hitMs = entry.last_hit_at ? Date.parse(entry.last_hit_at) : 0;
  let daysSinceHit;
  if (!Number.isFinite(nowMs)) {
    daysSinceHit = 90;
  } else {
    daysSinceHit = hitMs > 0 ? (nowMs - hitMs) / (1e3 * 60 * 60 * 24) : 90;
  }
  const recency = Math.max(0, 1 - daysSinceHit / 90);
  const recencyScore = recency * 0.2;
  const enforcementScore = ENFORCEMENT_WEIGHT[entry.enforcement] * 0.1;
  return confidenceScore + hitScore + recencyScore + enforcementScore;
}
var ENFORCEMENT_WEIGHT = {
  block: 1,
  warn: 0.7,
  suggest: 0.4,
  passive: 0.1
};

// ../core/src/static-user-skills/index.ts
init_esm_shims();

// ../core/src/static-user-skills/types.ts
init_esm_shims();
var STATIC_USER_SKILLS = [
  "duck",
  "grill-me",
  "grill-via-web",
  "fixed-flow-driver",
  "claim-to-merge"
];
var STATIC_USER_SKILL_TARGETS = ["claude", "codex"];

// ../core/src/static-user-skills/content.ts
init_esm_shims();
var STATIC_USER_SKILL_CONTENT = {
  "duck": "---\nname: duck\ndescription: By-hand trigger only. When the user types /duck, explain the current topic / latest answer to a cute CEO non-coder duck. Do not auto-trigger.\n---\n\nExplain to a cute ceo non coder duck please.\n",
  "grill-me": "---\nname: grill-me\ndescription: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions \"grill me\".\n---\n\n## 0. Pre-grill claim (cross-host mutex, GitHub-issue context only)\n\nPer `docs/PRE-GRILL-CLAIM.md`: if this grill is bound to a **TeamBrain GitHub issue** (the user named an issue number / pasted an issue URL / the conversation context is clearly about an open repo issue), **before** asking the first grill question:\n\n> **make a comment claiming we have started grilling this issue and add tag \"grilling\"**\n\nConcretely (same order as `/grill-via-web` \xA70):\n\n1. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grilling$' && exit` \u2014 defer if already locked.\n2. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grill-ready$' && exit` \u2014 already grilled, route to `/fixed-flow-driver`.\n3. `gh issue comment <N> --body \"\u{1F373} grill picked up at <ISO timestamp> on <hostname> via /grill-me. Following docs/PRE-GRILL-CLAIM.md.\"`\n4. `gh issue edit <N> --add-label grilling`\n\nOnly after the label is on the issue: start asking grill questions.\n\n**Skip \xA70 entirely** when grilling a non-issue artifact (local plan file, design doc, abstract idea). The `grilling` lock is only for GitHub-issue grills.\n\nWhen the grill converges, the user (or the agent driving this skill) is responsible for posting the grill transcript back to the issue and running `gh issue edit <N> --remove-label grilling --add-label grill-ready`.\n\n## Grill loop\n\nInterview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.\n\nAsk the questions one at a time.\n\nIf a question can be answered by exploring the codebase, explore the codebase instead.\n",
  "grill-via-web": '---\nname: grill-via-web\ndescription: Pop a clickable ChatGPT and Claude.ai URL that prefills a grill-me prompt referencing a public GitHub issue, so a human can finish the grill in a browser tab. Use when the user wants to grill an issue in a web LLM (no API, no local Claude needed). Trigger phrases include "grill via web", "grill issue N in chatgpt", "/grill-via-web", "give me a chatgpt url to grill <issue>", or "pop a grill URL for issue N".\n---\n\n```\n       __                       \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n  ___ ( o)>    issue URL \u2500\u2500\u2500\u2500\u2500\u2500\u25B6\u2502   /grill-via-web         \u2502\n  \\  =._)                       \u2502                          \u2502\n   `---\'   URL-encode prompt \u2500\u2500\u25B6\u2502   pop two Chrome URLs    \u2502\n    \u5477\u5477~                       \u2502   ChatGPT + Claude.ai    \u2502\n                                \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n                                              \u2502\n              human clicks Chrome \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n              LLM fetches mattpocock/skills/grill-me\n              LLM grills 1 question per turn\n              human answers, repeat until convergence\n```\n\n## 0. Pre-grill claim (cross-host mutex, mandatory)\n\nPer `docs/PRE-GRILL-CLAIM.md`, **before** generating any Chrome URL the agent must:\n\n> **make a comment claiming we have started grilling this issue and add tag "grilling"**\n\nConcretely (in the same order):\n\n1. `gh issue view <N> --json labels -q \'.labels[].name\' | grep -q \'^grilling$\' && exit`\n   \u2014 if `grilling` already present, another agent is on it; post `\u{1F6A6} deferred: grill already in progress (grilling tag is set)` and stop. **Do NOT** force-remove.\n2. `gh issue view <N> --json labels -q \'.labels[].name\' | grep -q \'^grill-ready$\' && exit`\n   \u2014 if the issue is already grilled, do not re-grill; route the user to `/fixed-flow-driver` instead.\n3. `gh issue comment <N> --body "\u{1F373} grill picked up at <ISO timestamp> on <hostname> via /grill-via-web. Following docs/PRE-GRILL-CLAIM.md."`\n4. `gh issue edit <N> --add-label grilling`\n\nOnly after both the comment AND the label succeed: proceed to \xA71 URL generation.\n\nIf `gh issue edit` fails because the label `grilling` does not exist on the repo, post `\u26D4 grilling label missing on repo; ask a maintainer to create it via gh api repos/<owner>/<repo>/labels --method POST -f name=grilling` and stop. Do NOT auto-create the label.\n\nWhen the human pastes the grill output back into the issue (later, after the browser-side grilling finishes), the same human is responsible for `gh issue edit <N> --remove-label grilling --add-label grill-ready` to swap the lock to the next-phase label.\n\n## What it does\n\nTakes a public GitHub issue URL (default scope: `libz-renlab-ai/TeamBrain`),\nURL-encodes a fixed prompt template, and outputs **two clickable URLs**:\n\n```\nfollow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : <ISSUE_URL>\n```\n\ninto:\n\n- `https://chatgpt.com/?q=<encoded>`\n- `https://claude.ai/new?q=<encoded>`\n\nOnly `<ISSUE_URL>` varies. The grill-me playbook URL is **pinned** to\nmattpocock\'s public skills repo so any anonymous LLM fetcher can read it.\n\n## Why URLs (not API / not local Claude)\n\nHuman-in-the-loop, by design. The skill does not run the grill \u2014 it only\n**pops a Chrome URL**. Human:\n\n1. Clicks the URL \u2192 ChatGPT/Claude tab opens with prompt prefilled.\n2. Hits send \u2192 LLM fetches the grill-me skill + the issue.\n3. LLM asks one question \u2192 human answers \u2192 next question.\n4. Done. Move to next issue. New URL. Repeat.\n\nNo auth, no API key, no rate limit, no agent loop. Cheap and throttle-free.\n\n## Template (do NOT change this string in code)\n\n```\nfollow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : <ISSUE_URL>\n```\n\nNote the **two spaces** before `and` \u2014 preserved from upstream usage so\nURLs round-trip with anything that compares strings byte-for-byte.\n\n## Generator (bash one-liner)\n\n```bash\nISSUE_URL="$1"\nPROMPT="follow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : ${ISSUE_URL}"\nENC=$(printf \'%s\' "$PROMPT" | jq -sRr @uri | sed \'s/%20/+/g\')\necho "ChatGPT:  https://chatgpt.com/?q=${ENC}"\necho "Claude:   https://claude.ai/new?q=${ENC}"\n```\n\nIf `jq` is not available, swap to python:\n\n```bash\nENC=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote_plus(sys.argv[1]))" "$PROMPT")\n```\n\n## When to invoke\n\nUser types or says any of:\n\n- `/grill-via-web`\n- `grill via web`\n- `grill me on issue N`\n- `grill issue N in chatgpt`\n- `give me a chatgpt url to grill issue N`\n- `pop a grill URL for issue N`\n\n## Output format\n\n1. Two clickable markdown links (ChatGPT first, Claude second).\n2. Three-line ASCII flow showing the human-in-loop step.\n3. Done. No extra commentary.\n\n## Caveats\n\n1. **Public issues only.** Anonymous web LLMs cannot read private repos.\n   For private TeamBrain issues, fall back to inline-paste flow.\n2. **ChatGPT does not auto-submit.** It pre-fills the input box; the\n   human clicks send.\n3. **Claude.ai `?q=` may be deprecated post-2025-10.** If the input\n   field stays empty, switch to ChatGPT or paste manually. See\n   [Claude Help Center](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link).\n4. **URL length budget < 2000 chars.** This skill does not embed the\n   issue body \u2014 the LLM fetches it from GitHub via the URL reference.\n   If the issue is private or the URL is gigantic, this skill won\'t work.\n\n## Example\n\n```\nInput:  https://github.com/libz-renlab-ai/TeamBrain/issues/276\n\nOutput:\n  ChatGPT:  https://chatgpt.com/?q=follow+instructions+in+https%3A%2F%2Fgithub.com%2Fmattpocock%2Fskills%2Fblob%2Fmain%2Fskills%2Fproductivity%2Fgrill-me%2FSKILL.md++and+grill+me+for+this+%3A+https%3A%2F%2Fgithub.com%2Flibz-renlab-ai%2FTeamBrain%2Fissues%2F276\n  Claude:   https://claude.ai/new?q=follow+instructions+in+https%3A%2F%2Fgithub.com%2Fmattpocock%2Fskills%2Fblob%2Fmain%2Fskills%2Fproductivity%2Fgrill-me%2FSKILL.md++and+grill+me+for+this+%3A+https%3A%2F%2Fgithub.com%2Flibz-renlab-ai%2FTeamBrain%2Fissues%2F276\n```\n',
  "fixed-flow-driver": '---\nname: fixed-flow-driver\ndescription: TeamBrain FIXEDFLOW step-3-to-5 driver. Reads a grill-ready issue, creates a worktree, implements per the grill comment, loops /review until PASS, opens a normal PR, squash-merges, cleans up. Invoked manually by a maintainer in a Claude Code session \u2014 there is no watcher, no background dispatcher, no automatic trigger. Do NOT invoke unless an issue has been verified to have a valid grill comment + grill-ready label.\n---\n\n<what-to-do>\n\nYou are the FIXEDFLOW driver. Your input is a single issue number `<N>`. Run steps 3-5 of `docs/FIXEDFLOW.md` end-to-end without human intervention. The reporter has already done steps 1-2 (\u226450-word body + grill comment + grill-ready label). Do **NOT** open a follow-up issue if /review fails \u2014 fix in the same PR branch per `docs/PR-PLAN.md`.\n\n</what-to-do>\n\n<procedure>\n\n## 0. Sanity gates (bail loudly, never silently)\n\n- Verify `${REPO_ROOT}/docs/FIXEDFLOW.md` exists; if not, abort with comment `\u26D4 FIXEDFLOW spec missing on this branch`.\n- Verify `gh auth status` works; if not, abort.\n- **Dispatch policy** \u2014 the only type of dispatch that is allowed is on **grilled-issues**: verify issue `#${N}` is open, has `grill-ready` label, and a valid grill comment. Anything else is refused.\n- **Cross-host mutex \u2014 `grill-working` label check (see `docs/PRE-IMPLEMENT-CLAIM.md`)**: run `gh issue view ${N} --json labels -q \'.labels[].name\'`; if the output contains `grill-working`, another driver on another host has already claimed this issue. Post `\u{1F6A6} issue-${N}: already claimed by another driver (grill-working tag is set), deferring per docs/PRE-IMPLEMENT-CLAIM.md` and exit cleanly. **Do NOT** force-remove the label; **do NOT** proceed to \xA71. Stale `grill-working` (\u2265 24h without progress) must be evicted by a human, never by automation.\n- Verify the issue\'s latest comment is by the issue author AND (comment age \u2265 60 s OR ends with `--- end grill ---`); if neither, post `\u{1F6D1} needs-grill-comment: please re-paste your grill output and ensure age \u2265 60s or end with --- end grill ---`, remove `grill-ready` label, exit cleanly.\n- `needs-human` label is **informational only**; do NOT use it as an escape hatch (the loop never ends \u2014 see \xA74).\n\n## 1. Pre-implement claim \u2014 comment + grill-working tag (cross-host mutex)\n\nPer `docs/PRE-IMPLEMENT-CLAIM.md`, the first action before any code change is:\n\n> **make a comment claiming we have started working on this issue and add tag "grill-working"**\n\nBoth actions must land on GitHub **before** any worktree / branch / file edit. Order matters:\n\n1. **Post claim comment first** (audit trail) \u2014 `gh issue comment ${N} --body "..."` with body:\n\n   ```\n   \u{1F44B} driver picked up at <ISO timestamp> on <hostname>.\n   Branch: feat/issue-<N>\n   Worktree: .codex/worktrees/issue-<N>\n   Session: <SESSION_ID>\n   Following docs/FIXEDFLOW.md and docs/PRE-IMPLEMENT-CLAIM.md.\n   ```\n\n   If this step fails (network), continue \u2014 the comment is audit, not the gate. Do **not** retry beyond 3 attempts.\n\n2. **Atomically swap labels** (the real mutex) \u2014 `gh issue edit ${N} --add-label grill-working --remove-label grill-ready`. If this step fails, **abort the driver**: no worktree, no branch, no commits. Without the label, two drivers can race; without `grill-ready` removed, refusal-layer signals get confused. Both must succeed atomically.\n\n3. Only after both succeed: proceed to \xA72 worktree creation.\n\nIf `gh issue edit` fails because the label `grill-working` does not exist on the repo, post `\u26D4 grill-working label missing on repo; ask a maintainer to create it via gh api repos/<owner>/<repo>/labels --method POST -f name=grill-working` and exit cleanly. Driver does NOT auto-create the label (label creation is a repo-config change that needs a human in the loop).\n\n## 2. Worktree + branch \u2014 let the first go\n\nIf many workers hit one same worktree, **let the first go**. Concretely:\n\n- Read `.codex/worktrees/issue-${N}/.lock` (sentinel containing first driver\'s session-id + timestamp):\n  - If exists and contains a **different** session-id \u2192 another driver is already on this worktree. Post `\u{1F6A6} issue-${N}: already claimed by session <other-id>, deferring per FIXEDFLOW "let the first go"` and exit cleanly. **Do NOT** force-remove, do NOT race.\n  - If exists with **your own** session-id \u2192 you are resuming; proceed.\n  - If missing \u2192 you are first; proceed.\n- `git fetch origin`\n- `git worktree add .codex/worktrees/issue-${N} -b feat/issue-${N} origin/main`\n- Write `.codex/worktrees/issue-${N}/.lock` containing `${SESSION_ID}\\t<iso-timestamp>`.\n- All subsequent file operations happen inside `.codex/worktrees/issue-${N}`.\n\nThe lock is removed only by \xA77 cleanup after a successful merge. A stale lock from a crashed driver must be cleared by a human (manual `rm -f .lock`) \u2014 never auto-evict.\n\n## 3. Implementation\n\n- Read the grill comment as your plan. Treat it as the equivalent of a `docs/HOWTO-PLAN-PR.md` 4-section plan even if it isn\'t literally formatted that way.\n- Use `claudefast -p` for non-interactive heavy edits where appropriate (per `docs/CLAUDEFAST.md`); use direct file edits for small changes.\n- Atomic commits per single concept. Commit messages: `feat(issue-${N}): <single concept>`.\n- If implementation requires research, write `docs/plans/<YYYY-MM-DD>-issue-${N}/research.md` per AGENTS.md Boris workflow; this is the equivalent of "annotate" in research \u2192 plan \u2192 annotate \u2192 implement.\n\n## 4. /review loop \u2014 never ends (only PASS terminates)\n\nThe `/review` loop **never ends**. It runs forever \u2014 finding \u2192 fix-plan \u2192\ncommit \u2192 re-`/review` \u2014 until `/review` PASSes. There is **no** max-iter\ncutoff, **no** token-budget kill, and **no** `needs-human` escape hatch\ninside the driver itself. The only way out of the loop is a clean PASS.\n\nFor each `/review` invocation:\n\n1. Increment iter counter; persist to `.fixedflow/iter-${N}.json`:\n   ```json\n   {"issue": <N>, "iter": <K>, "started_at": "<iso>", "last_iter_at": "<iso>", "tokens_cumulative": <int>}\n   ```\n2. If `/review` PASSes (no P1/P2 findings or per-rule policy met), break the loop and proceed to step 5. **PASS is the only termination.**\n3. If `/review` returns findings:\n   - Write or update `docs/plans/<YYYY-MM-DD>-pr-<PR_NUMBER>-fix-plan.md` per `docs/PR-PLAN.md` (3 sections: task / expected outputs / judge harness). PR may not exist yet; if so, name the file `docs/plans/<YYYY-MM-DD>-issue-${N}-iter-<K>-fix-plan.md` and rename it after the PR opens in step 5.\n   - Fix in the same branch per project rule (NO follow-up issues).\n   - Atomic commit per fix concept.\n   - **Spawn Verification subagent** (per `docs/AGENTIC-CODING-POLICY.md` \xA73): use the Claude Code Agent tool to dispatch a read-only subagent that reads `git diff HEAD~1`, the latest commit message, and the grill comment; it outputs `pass | fail | uncertain` + a repro command + counter-example inputs; append the result to the \xA7judge harness section of the current fix-plan.md **before** re-entering the loop. The Verification subagent MUST NOT modify the repo, MUST NOT read `/review` skill output (avoid overfitting to the answer), and MUST NOT live in `packages/core/` or `packages/cli/` (FCIS + scope-binding per ADR-0004 / ADR-0008). It does not replace `/review` skill \u2014 `/review` PASS is the only authoritative termination gate (ADR-0007).\n4. PushNotification at iter \u2208 {10, 25, 50, 100, 250, 500, 1000, ...} with subject `FIXEDFLOW issue #${N} iter ${K}, tokens=<>`.\n5. Every 10 iters, post comment to issue `#${N}` with token-burn summary \u2014 informational only, does **not** halt the loop.\n6. `needs-human` label: **informational only**. Read it for reporting, but do NOT exit on it. The loop never ends until PASS.\n\n**Termination conditions: PASS only.** No timeout. No bailout. No human\noverride inside the driver. The /review loop never ends until /review PASS.\nIf a maintainer truly wants to stop, they kill the process or close the PR\nexternally \u2014 there is no clean exit signal for this loop.\n\n## 5. Open PR\n\nAfter /review PASSes:\n\n- `git push origin feat/issue-${N}`\n- `gh pr create` with:\n  - title: `[issue-${N}] <title from issue>`\n  - **NOT --draft** (project rule)\n  - body: 4-section per `docs/HOWTO-PLAN-PR.md`:\n    - plan (extracted from grill comment)\n    - expected outputs (deliverables list)\n    - how-to-verify (link to or inline `docs/plans/<YYYY-MM-DD>-issue-${N}/judge.md` if you wrote one)\n    - claudefast probes (any verification probes you ran)\n- Capture PR number; rename any iter-fix-plan files to `docs/plans/<YYYY-MM-DD>-pr-<PR_NUMBER>-fix-plan.md`.\n- Optional: `gh pr comment <PR_NUMBER> --body "<auto-PR header>"`.\n\n## 6. Squash-merge \u2014 keep trying until it failed\n\nRun `gh pr merge <PR_NUMBER> --squash --auto` (NEVER `--merge`, NEVER `--rebase`\nas the merge command \u2014 project rule for the merge invocation itself; we DO\nuse `git rebase origin/main` as a conflict-resolution tactic before retrying).\n\nIf the squash-merge fails (typically a conflict against main), the driver does\n**NOT** add `needs-human` and bail. It enters an exhaustive retry loop and\n**keeps trying until it failed** physically:\n\n1. `git fetch origin && git rebase origin/main` inside the worktree.\n2. `git push --force-with-lease origin feat/issue-${N}`.\n3. `gh pr merge <PR_NUMBER> --squash --auto`.\n4. If it succeeds \u2192 break and proceed to \xA77 cleanup.\n5. If it fails \u2014 even after rebase \u2014 go back to step 1. **Keep trying until\n   it failed.** Squash-merge fail then rebase fail does NOT terminate the\n   driver; only physical failure does.\n6. PushNotification every 5 retries with subject `FIXEDFLOW issue #${N} merge retry ${R}`.\n\nThe only physical-failure terminations:\n\n- PR closed by upstream (404 on retry).\n- Branch deleted by upstream (push fails with `does not exist`).\n- Repo permission revoked (auth error).\n- Maintainer kills the driver process / cancels the worktree externally.\n\nOtherwise: **keep trying until it failed**. The driver does not give up after\nthe second failure. The `needs-human` label is no longer added by the driver\non merge failure (it was an old escape hatch; now removed).\n\n## 7. Cleanup + report\n\nAfter successful merge:\n\n- **Release the cross-host mutex** \u2014 `gh issue edit ${N} --remove-label grill-working` (per `docs/PRE-IMPLEMENT-CLAIM.md`). This **must** happen before `gh issue close`; otherwise the label remains permanently attached to a closed issue. If this fails (network), retry 3\xD7; on persistent failure, log to `docs/plans/<YYYY-MM-DD>-issue-${N}/report.md` as a deviation and ask a maintainer to remove the label manually.\n- `git worktree remove .codex/worktrees/issue-${N}`\n- `git branch -D feat/issue-${N}` (local cleanup; remote is auto-deleted by GitHub on squash-merge if branch protection set)\n- `gh issue close ${N} --comment "\u2705 FIXEDFLOW: merged via PR #<PR_NUMBER>"`\n- Write `docs/plans/<YYYY-MM-DD>-issue-${N}/report.md` per AGENTS.md Boris workflow:\n  - actual chain executed\n  - iteration count from `.fixedflow/iter-${N}.json`\n  - cumulative token spend\n  - any deviations from the grill plan\n  - links to PR + commits\n- Commit `report.md` directly to main (or a follow-up "docs(issue-${N}): report" PR if main is protected)\n\n## 8. Stop\n\nExit cleanly. The maintainer can pick up the next grill-ready issue when ready by re-invoking this skill manually.\n\n</procedure>\n\n<reused-rules>\n\n- `docs/FIXEDFLOW.md` \u2014 canonical 5-step spec\n- `docs/HOWTO-PLAN-PR.md` \u2014 4-section PR body\n- `docs/PR-PLAN.md` \u2014 same-PR fix loop, no follow-up issues\n- `docs/POSTPR.md` \u2014 /review-loop-until-PASS shape\n- `docs/feature-verification.md` \u2014 feature-verification gate if the implementation introduces a new feature\n- `docs/PRE-IMPLEMENT-CLAIM.md` \u2014 cross-host mutex contract: claim comment + `grill-working` tag must land before any code change\n- `docs/AGENTIC-CODING-POLICY.md` \xA73 \u2014 Verification subagent definition + scope (issue #273)\n- `docs/CONTEXT.md` `### Subagents in the verification stack` \u2014 three-subagent triage table\n- AGENTS.md rule 11 \u2014 Boris research \u2192 plan \u2192 annotate \u2192 implement \u2192 report\n- AGENTS.md `.codex/worktrees/` rule\n- TeamBrain CLAUDE.md non-draft-PR rule\n- User-level memory rule: squash-only merge\n\n</reused-rules>\n\n<do-not>\n\n- Do NOT open follow-up issues when /review fails \u2014 same PR fix only.\n- Do NOT use `--draft` flag on `gh pr create`.\n- Do NOT use `--merge` or `--rebase` flag on `gh pr merge` \u2014 squash only.\n- Do NOT silently catch errors; either bail with a `needs-human` label + comment, or fix.\n- Do NOT add a FIXEDFLOW canned-answer block to CLAUDE.md or AGENTS.md (POSTPR.md L115 / ADR-0007 forbids).\n- Do NOT skip the per-iter PR-PLAN write \u2014 it\'s mandated, not optional.\n\n</do-not>\n',
  "claim-to-merge": '---\nname: claim-to-merge\ndescription: TeamBrain claim-an-issue \u2192 merged-code routing\u3002\u7ED9\u300C\u6211\u8981 claim \u4E00\u4E2A issue / \u60F3\u628A issue \u63A8\u5230\u5408\u5E76 / \u600E\u4E48\u8D70 FIXEDFLOW\u300D\u8FD9\u7C7B prompt \u4E00\u4E2A\u7EDF\u4E00\u5165\u53E3\u8868\uFF0C\u94FE\u56DE docs/FIXEDFLOW.md \u7B49 canonical doc\u3002Use when user says "claim issue", "\u8D70 FIXEDFLOW", "how do I get my issue merged", "issue \u600E\u4E48\u81EA\u52A8\u53D8\u6210 PR", "claim an issue".\n---\n\n```\n   _____  _____  __ ____  ____  ____  ____  __     ____  _    _\n  |  ___||_   _||  \\  __||  __||  _ \\|  __||  |   |  _ \\| |  | |\n  | |__   | |  |    /  ||  __||    /| |__ |  |__ | |_| | |/\\| |\n  |____|  |_|  |_|\\____||____||_|\\_\\|____||_____||____/|__/\\__|\n\n  Claim an issue \u2192 merged code \u7684\u7EDF\u4E00\u5165\u53E3\u8868\uFF08routing only\uFF0C\u4E0D\u590D\u5236 doc\uFF09\n\n  step 1-2 (manual)            step 3-5 (auto)\n  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500           \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  \u226450 \u5B57 issue + grill   \u2500\u2500\u2192   worktree \u2192 impl \u2192 /review fix-loop \u221E \u2192 \u666E\u901A PR \u2192 squash-merge\n  \u8BC4\u8BBA + grill-ready label\n```\n\n# claim-to-merge \u2014 TeamBrain issue \u2192 merged code routing\n\n\u672C skill \u53EA\u505A routing\u3002\u6240\u6709\u7EC6\u8282\u67E5 canonical doc\uFF0C\u4E0D\u5728\u6B64\u91CD\u590D\u3002\n\n## 5-step \u4E3B\u94FE\uFF08\u4E00\u53E5\u8BDD\uFF09\n\n| \u6B65\u9AA4 | \u8C01\u505A | \u505A\u4EC0\u4E48 | \u8BE6\u60C5 |\n|------|------|--------|------|\n| 1 | \u4F60 | \u7528 fixed-flow template \u63D0\u4EA4 \u226450 \u5B57 issue | [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) \xA7\u300Cissue body \u5FC5\u987B\u6EE1\u8DB3\u300D |\n| 2 | \u4F60 | \u8DD1 `/grill-me` \u6216 `/grill-with-docs`\uFF0C\u6574\u6BB5\u8D34\u8BC4\u8BBA\uFF08\u672B\u5C3E `--- end grill ---`\uFF09\uFF0C\u52A0 `grill-ready` label | [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) \xA7\u300Cgrill \u8BC4\u8BBA\u5FC5\u987B\u6EE1\u8DB3\u300D |\n| 3 | driver | `.codex/worktrees/issue-<N>/` \u8D77 `feat/issue-<N>`\uFF0C\u6309 grill \u8BC4\u8BBA\u5B9E\u73B0 | [fixed-flow-driver SKILL](../fixed-flow-driver/SKILL.md) |\n| 4 | driver | `/review` \u65E0\u9650 fix-loop \u81F3 PASS\uFF1B\u6BCF\u8F6E finding \u8D70 PR-PLAN \u5199\u65B0 fix-plan \u6587\u4EF6 | [docs/PR-PLAN.md](../../../docs/PR-PLAN.md) |\n| 5 | driver | \u666E\u901A PR\uFF08**\u7981 `--draft`**\uFF09\u2192 `gh pr merge <N> --squash`\uFF08**\u4EC5 squash**\uFF09\u2192 \u6E05\u7406 worktree \u2192 ff pull main | [docs/POSTPR.md](../../../docs/POSTPR.md) |\n\n## 2-outcome contract\uFF08claim \u4E00\u4E2A issue \u53EA\u6709\u4E24\u79CD\u7ED3\u5C40\uFF09\n\n1. **Pause and stop** \u2014 \u7F3A `grill-ready` label / \u65E0\u6709\u6548 grill \u8BC4\u8BBA\uFF1Adriver \u4E0D\u5F00 worktree\u3001\u4E0D\u52A8\u4EE3\u7801\u3001\u4E0D\u5F00 PR\uFF1B\u56DE\u8BC4 `needs-grill-comment` \u540E idle\u3002\n2. **Do everything** \u2014 \u6761\u4EF6\u9F50\u5907\uFF1Adriver \u5168\u81EA\u52A8\u8DD1 step 3-5\uFF0C\u4ECE issue \u7F16\u53F7\u5230 squash-merged\uFF0C\u671F\u95F4\u65E0\u4EBA\u4ECB\u5165\u3002\n\n## \u5165\u53E3\u8868\uFF08routing only\uFF09\n\n| canonical doc | \u89D2\u8272 |\n|---------------|------|\n| [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) | \u552F\u4E00 issue\u2192PR\u2192merge \u5DE5\u4F5C\u6D41\uFF1B5 \u6B65\u94C1\u5F8B\u3001issue/grill \u5FC5\u6EE1\u8DB3\u3001refusal layer\u3001bypass \u9003\u751F |\n| [docs/HOWTO-PLAN-PR.md](../../../docs/HOWTO-PLAN-PR.md) | PR \u63CF\u8FF0 4 \u6BB5\uFF08plan / expected outputs / how-to-verify / claudefast probes\uFF09 |\n| [fixed-flow-driver SKILL](../fixed-flow-driver/SKILL.md) | step 3-5 driver \u5B9E\u73B0\u7EC6\u5219\uFF1Bsanity gates\u3001worktree\u3001impl\u3001/review loop\u3001PR\u3001merge |\n| [docs/PR-PLAN.md](../../../docs/PR-PLAN.md) | `/review` \u51FA finding \u65F6\u7684 fix protocol\uFF1A\u7981\u5F00 follow-up issue\uFF0C\u5199 fix-plan\uFF0CTEAMWORK \u4FEE\uFF0C\u540C PR branch |\n| [docs/POSTPR.md](../../../docs/POSTPR.md) | `/review` PASS \u540E\u7684\u6536\u5C3E\uFF1Asquash-only merge \u2192 ExitWorktree \u2192 ff pull |\n| [docs/TEAMWORK.md](../../../docs/TEAMWORK.md) | N+1+(2N) \u5E76\u884C worker \u6A21\u5F0F\uFF08main + lead + 2N teammate\uFF09 |\n| [docs/feature-verification.md](../../../docs/feature-verification.md) | \u9A8C\u8BC1\u95E8 V1 RUN / V2 DUMP / V3 READ \u4E09\u6BB5\uFF1Bjudge harness \u5F62\u5F0F |\n| [docs/FASTPROBE.md](../../../docs/FASTPROBE.md) | `claudefast -p` \u5E76\u884C probe \u22648 \u8DEF\uFF1Bstream-json \u5BA1\u8BA1 |\n| [docs/CLAUDEFAST.md](../../../docs/CLAUDEFAST.md) | claudefast wrapper \u7528\u6CD5\u3001permission/profile\u3001hook test \u6A21\u677F |\n\n## canned probe\uFF08\u81EA\u9A8C\u672C\u4ED3\u5E93 FIXEDFLOW \u77E5\u8BC6\u662F\u5426\u5728\u7EBF\uFF09\n\n```bash\nclaudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, what\'s manual vs auto"\n```\n\n\u8F93\u51FA\u5FC5\u987B\u547D\u4E2D\u672C skill 5-step \u4E3B\u94FE\u4E0E manual/auto \u5207\u5206\u3002\n\n## \u6CE8\u610F\u4E8B\u9879\n\n- \u4E25\u7981\u5411 `CLAUDE.md` / `AGENTS.md` \u5199 FIXEDFLOW canned-answer block\uFF08[ADR-0007](../../../docs/adr/0007-local-review-skill-as-review-gate.md) / FIXEDFLOW.md L125\uFF09\n- \u4EC5 squash-merge\uFF08\u7981 `--merge` / `--rebase`\uFF09\n- /review \u51FA finding \u4E0D\u5F00 follow-up issue\n- driver \u4E0D\u5E94\u88AB\u8FD9\u4E2A skill \u8C03\u7528\uFF1B\u9A71\u52A8\u578B skill \u662F [fixed-flow-driver](../fixed-flow-driver/SKILL.md)\n'
};

// ../core/src/static-user-skills/plan.ts
init_esm_shims();
function planStaticUserSkillInstall(opts) {
  const allowedTargets = new Set(
    opts.targets ?? STATIC_USER_SKILL_TARGETS
  );
  const allowedSkills = new Set(opts.skills ?? STATIC_USER_SKILLS);
  const entries = [];
  for (const skill of STATIC_USER_SKILLS) {
    for (const target of STATIC_USER_SKILL_TARGETS) {
      const destPath = computeDestPath(opts.joinPath, opts.homeDir, target, skill);
      const skillEnabled = allowedSkills.has(skill);
      const targetEnabled = allowedTargets.has(target);
      let action;
      if (!skillEnabled || !targetEnabled) {
        action = "skip-disabled";
      } else if (opts.fileExists(destPath)) {
        action = "skip-exists";
      } else {
        action = "create";
      }
      entries.push({
        skill,
        target,
        destPath,
        action,
        content: STATIC_USER_SKILL_CONTENT[skill]
      });
    }
  }
  return entries;
}
function computeDestPath(joinPath, homeDir, target, skill) {
  const baseDir = target === "claude" ? ".claude" : ".codex";
  return joinPath(homeDir, baseDir, "skills", skill, "SKILL.md");
}

// ../core/src/duck-mode/index.ts
init_esm_shims();

// ../core/src/duck-mode/translations.ts
init_esm_shims();
var TRANSLATIONS = [
  {
    term: "Skills",
    aliases: ["skills", "skill", "Skill"],
    duck: "\u9E2D\u9E2D\u8BF4: Skills \u5C31\u662F\u9E2D\u9E2D\u51C6\u5907\u597D\u7684\u5C0F\u672C\u4E8B\uFF0C\u6BCF\u4E2A .md \u6587\u4EF6\u5C31\u662F\u4E00\u62DB\u5477~ \u88C5\u4E0A Skills\uFF0C\u9E2D\u9E2D\u53EF\u4EE5\u591A\u4F1A\u4E00\u62DB\u4E8B\u3002"
  },
  {
    term: "hooks",
    aliases: ["hook", "Hook", "Hooks"],
    duck: "\u5477\u5477~ Hook \u662F Claude \u505A\u4E8B\u524D/\u540E\u7684\u5C0F\u94A9\u5B50\uFF0C\u9E2D\u9E2D\u53EF\u4EE5\u6084\u6084\u5728\u4E2D\u95F4\u52A0\u4E00\u9053\u5173\u5361 (>\u03C9<)"
  },
  {
    term: "PreToolUse",
    aliases: ["pre-tool-use", "pretooluse"],
    duck: "\u9E2D\u9E2D\u8BF4: PreToolUse \u662F Claude \u5DE5\u5177\u8C03\u7528\u524D\u7684\u94A9\u5B50\uFF0C\u9E2D\u9E2D\u53EF\u4EE5\u5728\u52A8\u624B\u524D\u63D0\u4E00\u53E5\u5477~"
  },
  {
    term: "Stop hook",
    aliases: ["stop-hook", "Stop Hook"],
    duck: "\u5477\u5477~ Stop hook \u662F\u6BCF\u8F6E\u56DE\u7B54\u7ED3\u675F\u89E6\u53D1\uFF0C\u9E2D\u9E2D\u501F\u6B64\u5077\u5077\u505A\u603B\u7ED3\u3001\u8BB0\u7B14\u8BB0 (>\u03C9<)"
  },
  {
    term: "embedding",
    aliases: ["embeddings", "\u5411\u91CF\u6A21\u578B", "\u5411\u91CF\u5316"],
    duck: "\u9E2D\u9E2D\u8BF4: embedding \u662F\u628A\u6587\u5B57\u634F\u6210\u4E00\u4E32\u6570\u5B57\uFF0C\u9E2D\u9E2D\u5C31\u80FD\u7B97\u4E24\u6BB5\u8BDD\u6709\u591A\u50CF\u5477~"
  },
  {
    term: "vector",
    aliases: ["vectors", "\u5411\u91CF"],
    duck: "\u5477\u5477~ vector \u662F embedding \u51FA\u6765\u7684\u4E00\u4E32\u6570\u5B57\uFF0C\u9E2D\u9E2D\u7528\u5B83\u5728\u5927\u5806\u8BDD\u91CC\u627E\u6700\u50CF\u7684\u90A3\u6761 (>\u03C9<)"
  },
  {
    term: "matcher",
    aliases: ["matching", "match"],
    duck: "\u9E2D\u9E2D\u8BF4: matcher \u662F\u9E2D\u9E2D\u7684\u5C0F\u96F7\u8FBE\uFF0C\u626B\u8FC7\u4E00\u53E5\u8BDD\u770B\u6709\u6CA1\u6709\u5339\u914D\u7684\u89C4\u5219\u5477~"
  },
  {
    term: "RAG",
    aliases: ["rag"],
    duck: "\u5477\u5477~ RAG \u5C31\u662F\u5148\u53BB\u9E2D\u9E2D\u7684\u8D44\u6599\u5E93\u635E\u51E0\u6761\u76F8\u5173\u7B14\u8BB0\uFF0C\u518D\u8BA9 Claude \u770B\u5B8C\u7B14\u8BB0\u7B54\u9898 (>\u03C9<)"
  },
  {
    term: "quantization",
    aliases: ["quantized", "\u91CF\u5316"],
    duck: "\u9E2D\u9E2D\u8BF4: quantization \u662F\u628A\u6A21\u578B\u7F29\u6C34\u8BA9\u5B83\u8DD1\u66F4\u5FEB\u3001\u5360\u66F4\u5C11\u5185\u5B58\u5477~ \u50CF\u9E2D\u9E2D\u628A\u80D6\u7FBD\u6BDB\u538B\u6241\u3002"
  },
  {
    term: "canonical",
    aliases: ["canonical+", "Canonical"],
    duck: "\u5477\u5477~ canonical \u8868\u793A\u8FD9\u6761\u89C4\u5219\u975E\u5E38\u7A33\uFF0C\u5DF2\u7ECF\u5347\u7EA7\u6210\u9E2D\u9E2D\u7684\u5B98\u65B9\u6559\u79D1\u4E66\u7B49\u7EA7 (>\u03C9<)"
  },
  {
    term: "token \u9884\u7B97",
    aliases: ["token budget", "token-budget"],
    duck: "\u9E2D\u9E2D\u8BF4: token \u9884\u7B97\u662F Claude \u4E00\u6B21\u80FD\u88C5\u591A\u5C11\u8BDD\u7684\u4E0A\u9650\uFF0C\u9E2D\u9E2D\u5F97\u6311\u6700\u91CD\u8981\u7684\u585E\u8FDB\u53BB\u5477~"
  },
  {
    term: "MCP",
    aliases: ["mcp", "Model Context Protocol"],
    duck: "\u5477\u5477~ MCP \u662F\u8BA9 Claude \u63A5\u5916\u90E8\u5C0F\u5DE5\u5177\u7684\u6807\u51C6\u63A5\u53E3\uFF0C\u9E2D\u9E2D\u501F\u6B64\u88C5\u4E0A\u5404\u79CD\u63D2\u4EF6 (>\u03C9<)"
  },
  {
    term: "reload",
    aliases: ["reloading"],
    duck: "\u9E2D\u9E2D\u8BF4: reload \u5C31\u662F\u91CD\u65B0\u52A0\u8F7D\uFF0C\u9E2D\u9E2D\u628A\u521A\u6539\u7684\u8BBE\u5B9A\u518D\u5403\u4E00\u904D\u5477~"
  },
  {
    term: "statusLine",
    aliases: ["statusline", "status line"],
    duck: "\u5477\u5477~ statusLine \u662F\u7EC8\u7AEF\u6700\u5E95\u4E0B\u90A3\u6761\u63D0\u793A\u6761\uFF0C\u9E2D\u9E2D\u628A\u5B83\u7528\u6765\u663E\u793A\u72B6\u6001 (>\u03C9<)"
  },
  {
    term: "settings.local.json",
    duck: "\u9E2D\u9E2D\u8BF4: settings.local.json \u662F Claude Code \u7684\u9879\u76EE\u4E13\u5C5E\u914D\u7F6E\u5477~ \u91CC\u9762\u5199\u4E86\u54EA\u4E9B hook \u548C\u5DE5\u5177\u5F00\u4E86\u3002"
  },
  {
    term: "tier",
    aliases: ["tiers", "experimental", "probation"],
    duck: "\u9E2D\u9E2D\u8BF4: tier \u5C31\u662F\u89C4\u5219\u7684\u4FEE\u70BC\u7B49\u7EA7\u5477~ \u65B0\u89C4\u5219\u7B97 experimental\uFF0C\u53EF\u4FE1\u4E86\u5347 probation\uFF0C\u518D\u7A33\u5C31\u5230 canonical \u6559\u79D1\u4E66\u7EA7 (>\u03C9<)"
  },
  {
    term: "confidence",
    aliases: ["conf"],
    duck: "\u9E2D\u9E2D\u8BF4: confidence \u662F\u8FD9\u6761\u89C4\u5219\u7684\u53EF\u4FE1\u5EA6\u5206\u6570\uFF0C\u8D8A\u9AD8\u9E2D\u9E2D\u8D8A\u6562\u6309\u5B83\u6765\u529E\u4E8B\u5477~"
  },
  {
    term: "demerit",
    aliases: ["demerits"],
    duck: "\u5477\u5477~ demerit \u662F\u89C4\u5219\u72AF\u9519\u7684\u6263\u5206\u8BB0\u5F55\uFF0C\u9E2D\u9E2D\u7528\u5B83\u6765\u8BC6\u522B\u5931\u6548\u7684\u65E7\u89C4\u5219 (>\u03C9<)"
  },
  {
    term: "\u5F52\u56E0\u6E32\u67D3",
    aliases: ["attribution", "AttributionBus"],
    duck: "\u9E2D\u9E2D\u8BF4: \u5F52\u56E0\u6E32\u67D3\u5C31\u662F\u628A'\u7CFB\u7EDF\u5E2E\u4F60\u505A\u4E86\u4EC0\u4E48'\u62FC\u6210\u4E00\u6BB5\u4EBA\u8BDD\u7ED9\u4F60\u770B\u5477~"
  },
  {
    term: "\u77E5\u8BC6\u79CD\u5B50",
    aliases: ["seed", "seeds"],
    duck: "\u5477\u5477~ \u77E5\u8BC6\u79CD\u5B50\u662F\u9884\u5148\u6253\u5305\u7ED9\u9E2D\u9E2D\u7684\u4E00\u888B\u901A\u7528\u89C4\u5219\uFF0C\u9E2D\u9E2D\u88C5\u5B8C\u5C31\u80FD\u8DD1 (>\u03C9<)"
  },
  {
    term: "\u5143\u539F\u5219",
    aliases: ["meta-principle", "meta principles"],
    duck: "\u9E2D\u9E2D\u8BF4: \u5143\u539F\u5219\u662F\u6700\u9876\u5C42\u7684\u51E0\u6761\u94C1\u5F8B\uFF0C\u6BD4\u5982'\u4E0D\u8981\u8BA9\u4EE3\u7801\u81EA\u5DF1\u8BC4\u4EF7\u81EA\u5DF1'\u5477~"
  },
  {
    term: "knowledge.db",
    duck: "\u5477\u5477~ knowledge.db \u662F\u9E2D\u9E2D\u5B58\u6240\u6709\u89C4\u5219\u7684\u5C0F\u672C\u672C\uFF08SQLite \u6587\u4EF6\uFF09(>\u03C9<)"
  },
  {
    term: "Codex",
    aliases: ["codex", ".codex/skills"],
    duck: "\u9E2D\u9E2D\u8BF4: Codex \u662F\u53E6\u4E00\u4E2A AI \u7F16\u7A0B\u52A9\u624B\uFF0C\u9E2D\u9E2D\u4E5F\u7ED9\u5B83\u51C6\u5907\u4E00\u4EFD Skills \u8BA9\u5B83\u8BFB\u5477~"
  },
  {
    term: "plugins",
    aliases: ["plugin", "Plugin"],
    duck: "\u5477\u5477~ plugins \u662F\u7ED9 Claude Code \u88C5\u7684\u5C0F\u6269\u5C55\u5305\uFF0C\u9E2D\u9E2D\u501F\u6B64\u8BA9 Claude \u591A\u4F1A\u51E0\u62DB\u5477~ (>\u03C9<)"
  },
  {
    term: "verbose",
    aliases: ["Verbose"],
    duck: "\u9E2D\u9E2D\u8BF4: verbose \u6A21\u5F0F = \u9E2D\u9E2D\u8BDD\u6BD4\u8F83\u591A\uFF0C\u4F1A\u628A\u8FC7\u7A0B\u8BF4\u66F4\u7EC6\u5477~"
  }
];

// ../core/src/duck-mode/is-enabled.ts
init_esm_shims();
function isDuckModeEnabled(opts = {}) {
  if (opts.cliFlag === true) return true;
  if (opts.cliFlag === false) return false;
  const env = opts.env ?? process.env;
  return env.TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK === "1";
}

// ../core/src/duck-mode/duckify.ts
init_esm_shims();
function duckify(line, opts = {}) {
  if (!isDuckModeEnabled(opts)) return [line];
  const matched = findJargon(line);
  if (matched.length === 0) return [line];
  const indent = opts.indent ?? "   ";
  return [line, ...matched.map((t) => `${indent}${t.duck}`)];
}
function duckifyText(text, opts = {}) {
  if (!isDuckModeEnabled(opts)) return text;
  return text.split("\n").flatMap((line) => duckify(line, opts)).join("\n");
}
function writeDuckified(write, text, opts = {}) {
  write(duckifyText(text, opts));
}
function findJargon(line) {
  const lower = line.toLowerCase();
  const seen = /* @__PURE__ */ new Set();
  const matched = [];
  for (const t of TRANSLATIONS) {
    if (seen.has(t.term)) continue;
    const candidates = [t.term, ...t.aliases ?? []];
    if (candidates.some((c) => lower.includes(c.toLowerCase()))) {
      matched.push(t);
      seen.add(t.term);
    }
  }
  return matched;
}

// ../core/src/compiler/markdown.ts
init_esm_shims();
var BLOCK_START = "<!-- TEAMAGENT:START - \u81EA\u52A8\u7BA1\u7406\uFF0C\u8BF7\u52FF\u624B\u52A8\u7F16\u8F91 -->";
var BLOCK_END = "<!-- TEAMAGENT:END -->";
var DEFAULT_MAX_LINES = 50;
var DEFAULT_CONTENT_BUDGET = DEFAULT_MAX_LINES - 5;
function charNgrams(text, n = 3) {
  const s = text.replace(/\s+/g, " ").trim().toLowerCase();
  const out = /* @__PURE__ */ new Set();
  if (s.length < n) {
    if (s.length > 0) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function sanitizeBlockMarkers(text) {
  return text.replace(/TEAMAGENT:(START|END)/g, "TEAMAGENT\u200B:$1");
}
function formatEntry(entry) {
  const conf = entry.confidence.toFixed(2);
  const hits = entry.hit_count > 0 ? `, ${entry.hit_count}\u6B21\u547D\u4E2D` : "";
  const sourceTag = entry.source === "team-shared" ? " [\u56E2\u961F]" : entry.source === "preset" ? " [\u9884\u7F6E]" : "";
  const correct = sanitizeBlockMarkers(entry.correct_pattern);
  const wrong = sanitizeBlockMarkers(entry.wrong_pattern ?? "");
  const reason = sanitizeBlockMarkers(entry.reasoning);
  if (entry.type === "avoidance" && wrong) {
    return `- \u4F7F\u7528 ${correct} \u800C\u975E ${wrong}\u2014\u2014${reason} [${conf}${hits}]${sourceTag}`;
  }
  return `- ${correct}\u2014\u2014${reason} [${conf}${hits}]${sourceTag}`;
}
function compileMarkdownBlock(entries, now, options = {}) {
  const limit = Math.max(1, options.limit ?? DEFAULT_CONTENT_BUDGET);
  const active = entries.filter((e) => e.status === "active");
  if (options.presetOnly) {
    const presets = active.filter((e) => e.source === "preset");
    if (presets.length === 0) {
      return [BLOCK_START, "## TeamAgent \u5143\u539F\u5219", "\uFF08\u65E0\u5143\u539F\u5219\uFF09", BLOCK_END].join("\n");
    }
    const lines2 = presets.map((e) => formatEntry(e));
    return [BLOCK_START, "## TeamAgent \u5143\u539F\u5219", ...lines2, BLOCK_END].join("\n");
  }
  const tierFiltered = options.tierFilter ? active.filter((e) => options.tierFilter.includes(e.current_tier)) : active;
  if (tierFiltered.length === 0) {
    return [BLOCK_START, "## TeamAgent \u7ECF\u9A8C", "\u6682\u65E0\u7ECF\u9A8C\uFF0C\u4F7F\u7528\u8FC7\u7A0B\u4E2D\u4F1A\u81EA\u52A8\u79EF\u7D2F\u3002", BLOCK_END].join("\n");
  }
  const maxHitCount = Math.max(1, ...tierFiltered.map((e) => e.hit_count));
  const sorted = tierFiltered.map((e) => ({ entry: e, score: scoreEntry(e, maxHitCount, now) })).sort((a, b) => b.score - a.score);
  const countFn = options.countTokens ?? ((s) => Math.ceil(s.length / 3.5));
  let usedTokens = 0;
  const lines = [];
  let truncatedCount = 0;
  let droppedByDiversity = 0;
  const threshold = options.diversityThreshold;
  const selectedNgrams = [];
  const entryFingerprint = (e) => [e.correct_pattern, e.wrong_pattern, e.reasoning].filter(Boolean).join(" ");
  for (const { entry } of sorted) {
    if (threshold !== void 0) {
      const fp = charNgrams(entryFingerprint(entry));
      let maxSim = 0;
      for (const prev of selectedNgrams) {
        const sim = jaccard(fp, prev);
        if (sim > maxSim) maxSim = sim;
        if (maxSim >= threshold) break;
      }
      if (maxSim >= threshold) {
        droppedByDiversity++;
        continue;
      }
      selectedNgrams.push(fp);
    }
    if (options.tokenBudget !== void 0) {
      const line = formatEntry(entry);
      const lineTokens = countFn(line);
      if (usedTokens + lineTokens > options.tokenBudget) {
        truncatedCount++;
        continue;
      }
      usedTokens += lineTokens;
      lines.push(line);
    } else {
      if (lines.length >= limit) break;
      lines.push(formatEntry(entry));
    }
  }
  const total = active.length;
  const shown = lines.length;
  let header;
  if (options.tokenBudget !== void 0) {
    if (truncatedCount > 0) {
      header = `## TeamAgent \u7ECF\u9A8C\uFF08${total}\u6761\u6D3B\u8DC3\u77E5\u8BC6\uFF0C\u4E3A\u4F60\u7F16\u8BD1\u4E86 ${shown} \u6761\uFF08token \u9884\u7B97 ${options.tokenBudget}\uFF09)`;
    } else {
      header = `## TeamAgent \u7ECF\u9A8C\uFF08${total}\u6761\u6D3B\u8DC3\u77E5\u8BC6\uFF09`;
    }
  } else {
    header = total > shown ? `## TeamAgent \u7ECF\u9A8C\uFF08${total}\u6761\u6D3B\u8DC3\u77E5\u8BC6\uFF0C\u4E3A\u4F60\u7F16\u8BD1\u4E86Top ${shown}\uFF09` : `## TeamAgent \u7ECF\u9A8C\uFF08${total}\u6761\u6D3B\u8DC3\u77E5\u8BC6\uFF09`;
  }
  const parts = [BLOCK_START, header, ...lines];
  if (truncatedCount > 0 && options.tokenBudget !== void 0) {
    parts.push(`> \u8FD8\u6709 ${truncatedCount} \u6761 canonical+ \u89C4\u5219\u56E0 token \u9884\u7B97\u672A\u663E\u793A\uFF08teamagent compile --dry-run \u67E5\u770B\uFF09`);
  }
  if (droppedByDiversity > 0) {
    parts.push(`> \u53E6\u6709 ${droppedByDiversity} \u6761\u56E0\u4E0E\u5DF2\u9009\u6761\u76EE\u8FD1\u4E49\uFF08Jaccard \u2265 ${threshold}\uFF09\u88AB\u591A\u6837\u6027\u8FC7\u6EE4`);
  }
  parts.push(BLOCK_END);
  return parts.join("\n");
}
function injectBlockIntoDoc(existing, block) {
  const startTagRegex = /<!--\s*TEAMAGENT:START[^>]*-->/;
  const endTagRegex = /<!--\s*TEAMAGENT:END[^>]*-->/;
  const startMatch = existing.match(startTagRegex);
  const endMatch = existing.match(endTagRegex);
  if (startMatch && endMatch && startMatch.index !== void 0 && endMatch.index !== void 0 && endMatch.index > startMatch.index) {
    const before = existing.slice(0, startMatch.index);
    const after = existing.slice(endMatch.index + endMatch[0].length);
    return before + block + after;
  }
  if (existing === "") {
    return block + "\n";
  }
  const trimmed = existing.replace(/\n+$/, "");
  return trimmed + "\n\n" + block + "\n";
}
function stripLegacyTeamagentBlock(existing) {
  const startTagRegex = /<!--\s*TEAMAGENT:START[^>]*-->/;
  const endTagRegex = /<!--\s*TEAMAGENT:END[^>]*-->/;
  let out = existing;
  for (let i = 0; i < 8; i++) {
    const startMatch = out.match(startTagRegex);
    const endMatch = out.match(endTagRegex);
    if (!startMatch || !endMatch || startMatch.index === void 0 || endMatch.index === void 0 || endMatch.index <= startMatch.index) {
      break;
    }
    let before = out.slice(0, startMatch.index);
    let after = out.slice(endMatch.index + endMatch[0].length);
    before = before.replace(/\n{2,}$/, "\n");
    after = after.replace(/^\n{2,}/, "\n");
    out = before + after;
  }
  if (out.trim() === "") return "";
  return out;
}

// ../core/src/compiler/nested-rules.ts
init_esm_shims();
var NESTED_TIERS = [
  "enforced",
  "canonical",
  "stable",
  "probation",
  "experimental",
  "dormant"
];
function formatRuleAsMarkdown(entry) {
  const lines = [];
  lines.push(`# ${entry.id}`);
  lines.push("");
  lines.push("## \u5143\u4FE1\u606F");
  lines.push("");
  lines.push(`- Tier: ${entry.current_tier}`);
  lines.push(`- Confidence: ${entry.confidence.toFixed(2)}`);
  lines.push(`- Source: ${entry.source}`);
  lines.push(`- Hits: ${entry.hit_count}`);
  if (entry.last_hit_at) lines.push(`- Last hit: ${entry.last_hit_at}`);
  if (entry.created_at) lines.push(`- Created: ${entry.created_at}`);
  lines.push("");
  if (entry.trigger) {
    lines.push("## \u89E6\u53D1\u573A\u666F");
    lines.push("");
    lines.push(sanitizeBlockMarkers2(entry.trigger));
    lines.push("");
  }
  lines.push("## \u6B63\u786E\u505A\u6CD5");
  lines.push("");
  lines.push(sanitizeBlockMarkers2(entry.correct_pattern));
  lines.push("");
  if (entry.type === "avoidance" && entry.wrong_pattern) {
    lines.push("## \u274C \u9519\u8BEF\u505A\u6CD5");
    lines.push("");
    lines.push(sanitizeBlockMarkers2(entry.wrong_pattern));
    lines.push("");
  }
  lines.push("## \u539F\u56E0");
  lines.push("");
  lines.push(sanitizeBlockMarkers2(entry.reasoning));
  lines.push("");
  return lines.join("\n");
}
function formatTierIndex(tier, entries, now, filenameById) {
  const active = entries.filter((e) => e.status === "active" && e.current_tier === tier);
  const maxHit = Math.max(1, ...active.map((e) => e.hit_count));
  const sorted = [...active].sort(
    (a, b) => scoreEntry(b, maxHit, now) - scoreEntry(a, maxHit, now)
  );
  const lines = [];
  lines.push(`# ${tier} (${active.length} rules)`);
  lines.push("");
  lines.push(`Last compiled: ${now}`);
  lines.push("");
  if (active.length === 0) {
    lines.push("\uFF08\u6682\u65E0\uFF09");
    lines.push("");
    return lines.join("\n");
  }
  for (const e of sorted) {
    const tldr = oneLineTldr(e);
    const safe = filenameById?.get(e.id) ?? encodeRuleIdForPath(e.id);
    lines.push(
      `- [${e.id}](./${safe}.md) \u2014 ${tldr} [${e.confidence.toFixed(2)}, ${e.hit_count}hit]`
    );
  }
  lines.push("");
  return lines.join("\n");
}
function formatRootIndex(entries, now) {
  const active = entries.filter((e) => e.status === "active");
  const byTier = /* @__PURE__ */ new Map();
  for (const t of NESTED_TIERS) byTier.set(t, 0);
  for (const e of active) {
    if (e.current_tier) {
      byTier.set(e.current_tier, (byTier.get(e.current_tier) ?? 0) + 1);
    }
  }
  const lines = [];
  lines.push("# TeamAgent Rules");
  lines.push("");
  lines.push(`Last compiled: ${now}`);
  lines.push(`Total active: ${active.length}`);
  lines.push("");
  lines.push("## By tier");
  lines.push("");
  for (const t of NESTED_TIERS) {
    const n = byTier.get(t) ?? 0;
    const noun = n === 1 ? "rule" : "rules";
    lines.push(`- [${t}](./${t}/INDEX.md) \u2014 ${n} ${noun}`);
  }
  lines.push("");
  lines.push("> \u7531 `teamagent compile` \u81EA\u52A8\u7EF4\u62A4\uFF0C\u8BF7\u52FF\u624B\u52A8\u7F16\u8F91\u8BE5\u76EE\u5F55\u5185\u6587\u4EF6\u3002");
  lines.push("");
  return lines.join("\n");
}
function compileNestedRuleArtifacts(entries, now, options = {}) {
  let active = entries.filter((e) => e.status === "active");
  if (options.presetOnly) {
    active = active.filter((e) => e.source === "preset");
  }
  const byId = /* @__PURE__ */ new Map();
  for (const e of active) if (!byId.has(e.id)) byId.set(e.id, e);
  const deduped = [...byId.values()];
  const filenameById = /* @__PURE__ */ new Map();
  const usedFilenames = /* @__PURE__ */ new Set();
  for (const e of deduped) {
    const tier = e.current_tier;
    if (!tier) continue;
    const baseSafe = encodeRuleIdForPath(e.id);
    let safe = baseSafe;
    let key = `${tier}/${safe}`;
    if (usedFilenames.has(key)) {
      const disc = stableHashSuffix(e.id);
      safe = `${baseSafe}-${disc}`;
      key = `${tier}/${safe}`;
      let n = 2;
      while (usedFilenames.has(key)) {
        safe = `${baseSafe}-${disc}-${n}`;
        key = `${tier}/${safe}`;
        n++;
      }
    }
    usedFilenames.add(key);
    filenameById.set(e.id, safe);
  }
  const artifacts = [];
  artifacts.push({
    kind: "root-index",
    relativePath: "INDEX.md",
    contents: formatRootIndex(deduped, now)
  });
  for (const tier of NESTED_TIERS) {
    artifacts.push({
      kind: "tier-index",
      relativePath: `${tier}/INDEX.md`,
      contents: formatTierIndex(tier, deduped, now, filenameById),
      tier
    });
  }
  for (const e of deduped) {
    const tier = e.current_tier;
    if (!tier) continue;
    const safe = filenameById.get(e.id);
    if (!safe) continue;
    artifacts.push({
      kind: "rule",
      relativePath: `${tier}/${safe}.md`,
      contents: formatRuleAsMarkdown(e),
      ruleId: e.id,
      tier
    });
  }
  return artifacts;
}
function encodeRuleIdForPath(id) {
  const noTraversal = id.replace(/\.{2,}/g, "_");
  const safe = noTraversal.replace(/[^A-Za-z0-9._-]/g, "_");
  if (safe === "" || safe === ".") return "_";
  return safe;
}
function stableHashSuffix(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 6);
}
function oneLineTldr(entry) {
  const raw = (entry.reasoning ?? "").split("\n")[0]?.trim() ?? "";
  const sanitized = sanitizeBlockMarkers2(raw);
  return sanitized.length > 80 ? sanitized.slice(0, 79) + "\u2026" : sanitized;
}
function sanitizeBlockMarkers2(text) {
  return text.replace(/TEAMAGENT:(START|END)/g, "TEAMAGENT\u200B:$1");
}

// ../core/src/compiler/cursor.ts
init_esm_shims();
function compileCursorRules(entries) {
  const active = entries.filter((e) => e.status === "active");
  if (active.length === 0) return "";
  const paragraphs = active.map(formatCursorEntry);
  return paragraphs.join("\n\n") + "\n";
}
function formatCursorEntry(entry) {
  const header = `# ${entry.trigger || entry.id}`;
  const lines = [header, ""];
  if (entry.type === "avoidance" && entry.wrong_pattern) {
    lines.push(`Avoid: ${entry.wrong_pattern}`);
    lines.push(`Prefer: ${entry.correct_pattern}`);
  } else {
    lines.push(entry.correct_pattern);
  }
  lines.push(`Reason: ${entry.reasoning}`);
  return lines.join("\n");
}

// ../core/src/matcher/legacy/keyword-matcher.ts
init_esm_shims();
var ENFORCEMENT_RANK = {
  block: 3,
  warn: 2,
  suggest: 1,
  passive: 0
};
function matchRules(ctx, rules) {
  const inputText = extractInputText(ctx);
  const inputTextLower = inputText.toLowerCase();
  const filePath = stringField(ctx.input, "file_path");
  const matches = [];
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!rule.wrong_pattern) continue;
    if (normalizeChannel(rule.channel) !== "tool-action") continue;
    if (!checkScope(rule, filePath)) continue;
    const patterns = splitPatterns(rule.wrong_pattern);
    const matched = patterns.some((p) => patternMatches(inputText, inputTextLower, p));
    if (matched) matches.push(rule);
  }
  matches.sort(
    (a, b) => (ENFORCEMENT_RANK[b.enforcement] ?? 0) - (ENFORCEMENT_RANK[a.enforcement] ?? 0)
  );
  return matches;
}
function extractInputText(ctx) {
  const parts = [];
  for (const key of [
    "command",
    "content",
    "file_path",
    "url",
    "old_string",
    "new_string",
    "pattern",
    "query",
    "prompt"
  ]) {
    const v = ctx.input[key];
    if (typeof v !== "string") continue;
    if (key === "command" && isMetaCommand(v)) {
      parts.push(stripQuotedArgs(v));
    } else {
      parts.push(v);
    }
  }
  return parts.join("\n");
}
var META_COMMAND_PREFIXES = [
  "gh issue create",
  "gh issue comment",
  "gh issue edit",
  "gh pr create",
  "gh pr comment",
  "gh pr edit",
  "gh pr review",
  "gh release create",
  "gh release edit",
  "gh repo edit",
  "git commit -m",
  "git commit --message",
  "git tag -m",
  "git tag --message",
  "git notes add -m"
];
function isMetaCommand(command) {
  const trimmed = command.trimStart();
  return META_COMMAND_PREFIXES.some((p) => trimmed.startsWith(p));
}
function stripQuotedArgs(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}
function stringField(input, key) {
  const v = input[key];
  return typeof v === "string" ? v : void 0;
}
var MIN_TOKEN_LENGTH = 3;
function splitPatterns(raw) {
  const tokens = raw.split("|").map((s) => s.trim()).filter((s) => s.length >= MIN_TOKEN_LENGTH);
  return tokens.length > 0 ? tokens : [raw.trim()];
}
function patternMatches(inputText, inputTextLower, pattern) {
  const token = pattern.trim();
  if (!token) return false;
  if (/^[a-z0-9_-]+$/i.test(token)) {
    return plainTokenMatches(inputTextLower, token.toLowerCase());
  }
  return containsNonExtending(inputTextLower, token.toLowerCase());
}
function containsNonExtending(textLower, patternLower) {
  const lastChar = patternLower[patternLower.length - 1] ?? "";
  if (!isLetterOrDigit(lastChar)) {
    return textLower.includes(patternLower);
  }
  let offset = textLower.indexOf(patternLower);
  while (offset !== -1) {
    const afterIdx = offset + patternLower.length;
    const afterChar = afterIdx < textLower.length ? textLower[afterIdx] : "";
    if (!isLetterOrDigit(afterChar)) return true;
    offset = textLower.indexOf(patternLower, offset + 1);
  }
  return false;
}
function isLetterOrDigit(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 97 && code <= 122 || // a-z
  code >= 65 && code <= 90 || // A-Z
  code >= 48 && code <= 57;
}
function plainTokenMatches(inputTextLower, tokenLower) {
  let idx = inputTextLower.indexOf(tokenLower);
  while (idx !== -1) {
    const before = idx === 0 ? "" : inputTextLower[idx - 1];
    const afterIdx = idx + tokenLower.length;
    const after = afterIdx >= inputTextLower.length ? "" : inputTextLower[afterIdx];
    if (!isPlainTokenChar(before) && !isPlainTokenChar(after)) return true;
    idx = inputTextLower.indexOf(tokenLower, idx + 1);
  }
  return false;
}
function isPlainTokenChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 97 && code <= 122 || code >= 48 && code <= 57 || ch === "_" || ch === "-";
}
function checkScope(rule, filePath) {
  if (!filePath) return true;
  const fileTypes = rule.scope.file_types;
  if (fileTypes && fileTypes.length > 0) {
    const ok = fileTypes.some((ft) => matchesGlob(ft, filePath));
    if (!ok) return false;
  }
  const paths = rule.scope.paths;
  if (paths && paths.length > 0) {
    const ok = paths.some((p) => matchesGlob(p, filePath));
    if (!ok) return false;
  }
  return true;
}
function matchesGlob(pattern, target) {
  const SPECIAL_RE = /[.+?^${}()|[\]\\]/g;
  const escaped = pattern.replace(SPECIAL_RE, "\\$&").replace(/\*\*/g, "{{DSTAR}}").replace(/\*/g, "[^/]*").replace(/{{DSTAR}}/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  if (re.test(target)) return true;
  if (!pattern.includes("/")) {
    const slash = target.lastIndexOf("/");
    const basename2 = slash >= 0 ? target.slice(slash + 1) : target;
    return re.test(basename2);
  }
  return false;
}

// ../core/src/matcher/match.ts
init_esm_shims();

// ../core/src/matcher/legacy/ast-context.ts
init_esm_shims();
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var initialized = false;
var parsers = /* @__PURE__ */ new Map();
var WASM_MAP = {
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  javascript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  python: "tree-sitter-python/tree-sitter-python.wasm"
};
async function initAstMatcher() {
  if (initialized) return;
  let wts;
  try {
    wts = await import("web-tree-sitter");
  } catch {
    initialized = true;
    return;
  }
  await wts.Parser.init({
    locateFile: (name) => require2.resolve(`web-tree-sitter/${name}`)
  });
  for (const [lang, wasmRelPath] of Object.entries(WASM_MAP)) {
    if (parsers.has(lang)) continue;
    try {
      const fullPath = require2.resolve(wasmRelPath);
      const language = await wts.Language.load(fullPath);
      const parser = new wts.Parser();
      parser.setLanguage(language);
      parsers.set(lang, parser);
    } catch {
    }
  }
  initialized = true;
}
function isInsideCommentOrString(code, offset, lang) {
  const parser = parsers.get(lang);
  if (!parser) return false;
  const tree = parser.parse(code);
  if (!tree) return false;
  const node = tree.rootNode.descendantForIndex(offset);
  let cur = node;
  while (cur) {
    const t = cur.type;
    if (t === "comment" || t === "line_comment" || t === "block_comment") {
      tree.delete();
      return true;
    }
    if (t === "string" || t === "string_literal" || t === "string_fragment" || t === "template_string") {
      if (hasAncestor(cur, /* @__PURE__ */ new Set(["import_statement", "export_statement"]))) {
        tree.delete();
        return false;
      }
      tree.delete();
      return true;
    }
    cur = cur.parent;
  }
  tree.delete();
  return false;
}
function hasAncestor(node, types) {
  let cur = node;
  while (cur) {
    if (types.has(cur.type)) return true;
    cur = cur.parent;
  }
  return false;
}

// ../core/src/matcher/match.ts
var DOC_EXTENSIONS = /* @__PURE__ */ new Set(["md", "rst", "txt", "mdx"]);
var EXT_TO_LANG = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python"
};
function fileExt(filePath) {
  if (!filePath) return void 0;
  return filePath.split(".").pop()?.toLowerCase();
}
async function matchRules2(ctx, rules, _deps) {
  const ext = fileExt(ctx.file_path);
  if (ext && DOC_EXTENSIONS.has(ext)) {
    return { matched: [] };
  }
  const toolCtx = {
    toolName: "Write",
    input: { ...ctx }
  };
  const candidates = matchRules(toolCtx, rules);
  if (candidates.length === 0) return { matched: [] };
  const content = typeof ctx.content === "string" ? ctx.content : void 0;
  const lang = ext ? EXT_TO_LANG[ext] : void 0;
  if (!content || !lang) {
    return { matched: candidates };
  }
  await initAstMatcher();
  const filtered = [];
  for (const rule of candidates) {
    if (!rule.wrong_pattern) {
      filtered.push(rule);
      continue;
    }
    const patterns = rule.wrong_pattern.split("|").map((p) => p.trim()).filter((p) => p.length >= 3);
    let hasRealHit = false;
    for (const pattern of patterns) {
      let offset = content.toLowerCase().indexOf(pattern.toLowerCase());
      while (offset !== -1) {
        if (!isInsideCommentOrString(content, offset, lang)) {
          hasRealHit = true;
          break;
        }
        offset = content.toLowerCase().indexOf(pattern.toLowerCase(), offset + 1);
      }
      if (hasRealHit) break;
    }
    if (hasRealHit) filtered.push(rule);
  }
  return { matched: filtered };
}

// ../core/src/matcher/soft-and-scorer.ts
init_esm_shims();
var DEFAULT_SOFTAND = {
  w1: 0.4,
  w2: 0.4,
  w3: 0.3,
  w4: 0.5,
  tauFloor: 0.5
};
function scoreSoftAnd(args) {
  const w = args.weights ?? DEFAULT_SOFTAND;
  const minSim = Math.min(args.triggerSim, args.patternSim);
  const floor = Math.max(0, w.tauFloor - minSim);
  const hnMax = args.hardNegativeSims.length > 0 ? Math.max(...args.hardNegativeSims) : 0;
  return w.w1 * args.triggerSim + w.w2 * args.patternSim - w.w3 * floor - w.w4 * hnMax;
}

// ../core/src/matcher/semantic-matcher.ts
init_esm_shims();
function cosine(a, b) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
async function semanticMatch(args) {
  const embedResult = await args.embedder.embed([
    args.contextText || " ",
    args.actionText || " "
  ]);
  const ctxVec = embedResult[0] ?? [];
  const actVec = embedResult[1] ?? [];
  const candidates = await args.retriever.retrieve({
    contextText: args.contextText,
    actionText: args.actionText,
    contextVec: new Float32Array(ctxVec),
    actionVec: new Float32Array(actVec),
    scope: args.scope,
    topK: args.topK
  });
  const debug = globalThis.process?.env?.TEAMAGENT_HOOK_DEBUG === "1";
  const scored = candidates.map((c) => {
    const raw = c.rule.hard_negatives;
    const hardNegVecs = Array.isArray(raw) ? raw.filter(Array.isArray) : typeof raw === "string" && raw ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    })() : [];
    const hnSims = hardNegVecs.map((hn) => cosine(ctxVec, hn));
    const score = scoreSoftAnd({
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegativeSims: hnSims
    });
    const hardNegSim = hnSims.length > 0 ? Math.max(...hnSims) : 0;
    return {
      rule: c.rule,
      score,
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegSim
    };
  });
  if (debug) {
    const proc = globalThis.process;
    proc?.stderr?.write?.(
      `[teamagent-matcher] scope=${args.scope.level} scored ${scored.length} candidates
`
    );
    for (const m of scored.slice(0, 5)) {
      const ft = m.rule.fire_threshold ?? DEFAULT_FIRE_THRESHOLD;
      const passed = m.score > ft;
      proc?.stderr?.write?.(
        `[teamagent-matcher]   ${m.rule.id} t=${m.triggerSim.toFixed(3)} p=${m.patternSim.toFixed(3)} hn=${m.hardNegSim.toFixed(3)} score=${m.score.toFixed(3)} >${ft.toFixed(2)}? ${passed ? "PASS" : "drop"}
`
      );
    }
  }
  return scored.filter((m) => m.score > (m.rule.fire_threshold ?? DEFAULT_FIRE_THRESHOLD)).sort((a, b) => b.score - a.score);
}

// ../core/src/ranking/confidence-rank.ts
init_esm_shims();
var TIER_FACTOR = {
  canonical: 1,
  enforced: 1,
  full: 1,
  stable: 0.9,
  probation: 0.7,
  experimental: 0.5
};
function confidenceWeight(rule) {
  if (rule.status === "archived") return 0;
  const tier = TIER_FACTOR[rule.current_tier] ?? 0.6;
  return rule.confidence * tier;
}
function rerankByConfidence(matches) {
  return matches.map((m) => ({ ...m, score: m.score * confidenceWeight(m.rule) })).sort((a, b) => b.score - a.score);
}

// ../core/src/matcher/hard-negative-accumulator.ts
init_esm_shims();
var MAX_HARD_NEG = 20;
var WINDOW_MS = 24 * 3600 * 1e3;
var TRIGGER_KINDS = /* @__PURE__ */ new Set([
  "ai.override.ignored",
  "ai.override.blocked_circumvented",
  "user.supportive_negation",
  "git.revert.related"
]);
async function accumulateHardNegative(args) {
  if (!TRIGGER_KINDS.has(args.event.kind)) return;
  if (args.now.getTime() - Date.parse(args.event.timestamp) > WINDOW_MS) return;
  const rule = args.store.getById(args.event.knowledge_id);
  if (!rule) return;
  const contextText = String(args.event.payload?.contextText ?? "");
  const [ctxVec] = await args.embedder.embed([contextText || " "]);
  if (!ctxVec) return;
  const existing = (() => {
    try {
      if (Array.isArray(rule.hard_negatives)) return rule.hard_negatives;
      return rule.hard_negatives ? JSON.parse(String(rule.hard_negatives)) : [];
    } catch {
      return [];
    }
  })();
  existing.push(ctxVec);
  while (existing.length > MAX_HARD_NEG) existing.shift();
  args.store.update(args.event.knowledge_id, {
    hard_negatives: JSON.stringify(existing)
  });
}

// ../core/src/correction-detector/rule-based.ts
init_esm_shims();
var DENIAL_PATTERNS = [
  // 中文：高置信
  { re: /不对/, weight: 0.95 },
  { re: /错了/, weight: 0.95 },
  { re: /不行|有问题/, weight: 0.9 },
  { re: /不要/, weight: 0.95 },
  { re: /不用/, weight: 0.9 },
  { re: /别这样|别那样|别用|别这么/, weight: 0.95 },
  { re: /先别|先不要|不要直接|别直接/, weight: 0.9 },
  { re: /重来|重新/, weight: 0.9 },
  { re: /换[一个种]|换成|改用|改成/, weight: 0.9 },
  { re: /思路不对|方向不对/, weight: 0.95 },
  { re: /不该|不应该/, weight: 0.9 },
  { re: /不是(这个|这样|这么|要|让你)|而不是/, weight: 0.85 },
  { re: /应该先|先.+再/, weight: 0.8 },
  // 中文：修复/纠正动词（Wave 3 patch）
  { re: /修复[！!]|^修复\b/, weight: 0.9 },
  // 英文：整词
  // "not" alone is too broad — fires on "not tech lead", "not sure", parenthetical phrases.
  // Only match bare "not" at sentence start (after . ! ?) or in explicit negation constructs.
  { re: /\b(no|wrong|don't|shouldn't|never)\b/i, weight: 0.9 },
  { re: /(^|[.!?]\s+)not\b/i, weight: 0.9 },
  { re: /\binstead\b/i, weight: 0.9 },
  { re: /\bthat'?s wrong\b/i, weight: 0.95 },
  { re: /\bnot what I (asked|wanted|meant)\b/i, weight: 0.9 },
  { re: /\b(use|try|pick|choose)\s+[@A-Za-z0-9][\w@./-]*\s+(instead of|not)\s+[@A-Za-z0-9][\w@./-]*/i, weight: 0.9 },
  // 英文：fix/restart/reboot 作为明确纠正动词（Wave 3 patch）
  { re: /\bfix\b/i, weight: 0.85 },
  { re: /\brestart\b/i, weight: 0.85 },
  // 英文：ONLY 约束型纠正 — "ONLY do X" / "ONLY assign" 等（Wave 3 patch）
  // 只有当 ONLY 出现在句首或前置强调词后，才认为是行为纠正指令
  { re: /\bONLY\s+(do|assign|spawn|use|work|run|create|write|call)\b/i, weight: 0.85 },
  { re: /\bNEVER\s+(do|work|assign|create|modify|edit|write|run|push|commit|use)\b/i, weight: 0.9 },
  // 英文：语言纠正 — 必须有明确否定前缀才算纠正（Wave 3 patch, tightened）
  // "no, answer in chinese" / "don't answer in english" — but NOT bare "please answer in chinese"
  { re: /\b(no|don't|not)\b.{0,30}\banswer\s+(in|using)\s+(chinese|english|中文|英文)\b/i, weight: 0.85 },
  { re: /\bdon'?t\s+use\s+(chinese|english|中文|英文)\b/i, weight: 0.8 },
  // 英文：澄清性重定向 "i mean" / "right should be" （Wave 3 patch）
  // Only fire when "i mean" is followed by actual content (not just "i mean..." trailing)
  { re: /\bi mean[,，]?\s+\S/i, weight: 0.8 },
  { re: /\bright should be\b/i, weight: 0.85 }
];
function hasMultipleFailures(turn) {
  const failed = turn.toolCalls.filter((tc) => tc.succeeded === false);
  return failed.length >= 1;
}
function isSystemInjectedMessage(text) {
  if (!text) return false;
  if (/Base directory for this skill:/i.test(text)) return true;
  if (/<system-reminder>/i.test(text)) return true;
  if (/<local-command-caveat>/i.test(text)) return true;
  if (/<command-(name|message|args)>/i.test(text)) return true;
  if (/<bash-stdout>/i.test(text)) return true;
  if (/<bash-input>/i.test(text)) return true;
  if (/<teammate-message\b/i.test(text)) return true;
  if (/^Stop hook feedback:/i.test(text.trim())) return true;
  return false;
}
function isPoliteQuery(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length > 80) return false;
  if (!/[?？]\s*$/.test(trimmed)) return false;
  if (!/^(能|可以)/.test(trimmed)) return false;
  return true;
}
var INTERRUPT_PATTERN = /^\[Request interrupted by user(\s+for\s+tool\s+use)?\]$/i;
function isInterruptMessage(text) {
  if (!text) return false;
  return INTERRUPT_PATTERN.test(text.trim());
}
var ruleBasedCorrectionDetector = {
  detect(session) {
    const out = [];
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i];
      const prevTurn = i > 0 ? session.turns[i - 1] : void 0;
      if (isSystemInjectedMessage(turn.userMessage)) continue;
      if (isInterruptMessage(turn.userMessage)) {
        out.push(buildMoment(turn, prevTurn, "explicit_denial", 0.9));
        continue;
      }
      const denial = !isPoliteQuery(turn.userMessage) ? matchDenial(turn.userMessage) : null;
      if (denial && prevTurn) {
        out.push(buildMoment(turn, prevTurn, "explicit_denial", denial.weight));
      }
      if (prevTurn && hasMultipleFailures(prevTurn)) {
        const already = out.find((m) => m.turnIndex === i);
        if (!already) {
          const userSpoke = turn.userMessage.trim().length > 0;
          const weight = userSpoke ? 0.85 : 0.7;
          out.push(buildMoment(turn, prevTurn, "multi_failure", weight));
        }
      }
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const override = detectOverride(prevTurn.assistantText, turn.userMessage);
        if (override) {
          out.push(buildMoment(turn, prevTurn, "suggestion_override", 0.8));
        }
      }
      const codeEdit = detectCodeEdit(turn);
      if (codeEdit && !out.find((m) => m.turnIndex === i)) {
        out.push(buildMoment(turn, prevTurn, "code_edit", 0.8));
      }
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const redirect = detectImplicitRedirect(prevTurn.assistantText, turn.userMessage);
        if (redirect) {
          out.push(buildMoment(turn, prevTurn, "suggestion_override", 0.75));
        }
      }
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const hasError = detectErrorInMessage(turn.userMessage);
        const prevHadToolUse = prevTurn.toolCalls.length > 0;
        const hasHowToFix = /\bhow\s+to\s+fix\b|\bstill\s+(got\s+)?error\b/i.test(turn.userMessage);
        if (hasError && (prevHadToolUse || hasHowToFix)) {
          out.push(buildMoment(turn, prevTurn, "multi_failure", 0.8));
        }
      }
    }
    const lastTurn = session.turns[session.turns.length - 1];
    if (lastTurn && hasMultipleFailures(lastTurn)) {
      const alreadyCovered = out.find((m) => m.turnIndex === lastTurn.turnIndex);
      if (!alreadyCovered) {
        const prevTurn = session.turns.length >= 2 ? session.turns[session.turns.length - 2] : void 0;
        out.push(buildMoment(lastTurn, prevTurn, "multi_failure", 0.7));
      }
    }
    out.sort((a, b) => a.turnIndex - b.turnIndex);
    return out;
  }
};
function matchDenial(text) {
  if (!text.trim()) return null;
  let maxWeight = 0;
  for (const p of DENIAL_PATTERNS) {
    if (p.re.test(text)) {
      if (p.weight > maxWeight) maxWeight = p.weight;
    }
  }
  return maxWeight > 0 ? { weight: maxWeight } : null;
}
function detectOverride(assistantText, userText) {
  if (!userText.trim()) return false;
  const toolName = "[@A-Za-z0-9][\\w@./-]{1,}";
  const userSpecifies = new RegExp(`(\u7528|\u6539\u7528|\u4E0A)\\s*${toolName}`).test(userText) || new RegExp(`${toolName}\\s*(\u66F4\u597D|\u8F7B\u91CF|\u7B80\u5355)`, "i").test(userText) || new RegExp(`instead of\\s+${toolName}`, "i").test(userText);
  if (!userSpecifies) return false;
  const userToolMatch = userText.match(/[@A-Za-z0-9][A-Za-z0-9@./-]{2,}/g);
  if (!userToolMatch) return false;
  const assistantSuggested = /推荐|建议|我用|我来用|install|add\s+[A-Za-z]|[A-Za-z][\w-]{2,}\s*是/i.test(
    assistantText
  );
  if (!assistantSuggested) return false;
  const assistantLower = assistantText.toLowerCase();
  const STOP = /* @__PURE__ */ new Set([
    "the",
    "and",
    "for",
    "but",
    "more",
    "less",
    "less"
  ]);
  for (const tool of userToolMatch) {
    if (tool.length < 3) continue;
    if (STOP.has(tool.toLowerCase())) continue;
    if (!assistantLower.includes(tool.toLowerCase())) return true;
  }
  return false;
}
function detectImplicitRedirect(assistantText, userText) {
  if (!userText.trim()) return false;
  const toolName = "[@A-Za-z0-9][\\w@./-]{1,}";
  const actuallyRedirect = /\bactually\s+(just\s+)?(use|we use|try)\s+/i.test(userText) || /\bwe\s+(actually\s+)?use\s+[A-Za-z][\w@./-]{1,}/i.test(userText) || new RegExp(`\\btry\\s+using?\\s+${toolName}\\s+instead\\b`, "i").test(userText);
  if (!actuallyRedirect) return false;
  const assistantProposed = /\b(use|using|I'?ll use|install|I recommend|set up|implement|configure)\s+[A-Za-z]/i.test(
    assistantText
  ) || /推荐|建议|我用|我来用|使用/.test(assistantText);
  return assistantProposed;
}
var ERROR_PATTERNS = [
  /\bError\s*:/i,
  /\bException\s*:/i,
  /\bE[A-Z]{3,}\b/,
  // ENOENT, EACCES, EPERM, EBUSY, etc.
  /at\s+\S+\s*\(\S+:\d+:\d+\)/,
  // JS stack trace frame
  /Traceback \(most recent call last\)/,
  /SyntaxError|TypeError|ReferenceError|RangeError/,
  /FAILED|✗|✕/,
  // test failures
  /exit code [1-9]|exit status [1-9]/i,
  /报错|错误|异常|失败/
  // Chinese error keywords
];
function detectErrorInMessage(text) {
  if (!text.trim()) return false;
  for (const re of ERROR_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}
function detectCodeEdit(turn) {
  if (/我改了|我重写了|你看我改/i.test(turn.userMessage)) return true;
  for (const tc of turn.toolCalls) {
    if (tc.name !== "Edit") continue;
    const inp = tc.input;
    const oldStr = typeof inp.old_string === "string" ? inp.old_string : "";
    const newStr = typeof inp.new_string === "string" ? inp.new_string : "";
    if (newStr.length > oldStr.length * 2 && newStr.length > 200) return true;
  }
  return false;
}
function buildMoment(turn, prevTurn, signal, weight) {
  return {
    signal,
    weight,
    turnIndex: turn.turnIndex,
    correctionText: turn.userMessage,
    previousAssistantText: prevTurn?.assistantText ?? "",
    previousToolCalls: (prevTurn?.toolCalls ?? []).map(summarizeToolCall),
    timestamp: turn.timestamp
  };
}
function summarizeToolCall(tc) {
  const keys = Object.keys(tc.input).slice(0, 3);
  const head = `${tc.name}(${keys.join(",")})`;
  const inputPreview = summarizeToolInput(tc.input);
  if (tc.succeeded === false) {
    const err = typeof tc.result === "string" ? tc.result.trim().slice(0, 200) : "";
    const body = [inputPreview, err].filter(Boolean).join(" | ");
    return body ? `${head} \u2717 ${body}` : `${head} \u2717 FAILED`;
  }
  return inputPreview ? `${head}: ${inputPreview}` : head;
}
function summarizeToolInput(input) {
  const parts = [];
  for (const key of [
    "command",
    "file_path",
    "url",
    "content",
    "old_string",
    "new_string",
    "pattern",
    "query"
  ]) {
    const v = input[key];
    if (typeof v !== "string" || !v.trim()) continue;
    parts.push(`${key}=${truncateOneLine(v, 180)}`);
    if (parts.join(" | ").length > 360) break;
  }
  return parts.join(" | ");
}
function truncateOneLine(s, max) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "\u2026";
}

// ../core/src/success-detector/rule-based.ts
init_esm_shims();
var PRAISE_PATTERNS = [
  /完美|就是这样|就这样|很好|赞|不错|太棒|搞定|👍|挺好/,
  /\b(perfect|great|nice|excellent|exactly|works?|lgtm|awesome)\b/i
];
var DENIAL_PATTERNS2 = [
  /不对|错了|不行|有问题|不要|不用|别这样|别那样|别用|别这么|先别|先不要|不要直接|别直接|思路不对|方向不对|换[一个种]|换成|改用|改成|重来|重新|不该|不应该|不是(这个|这样|这么|要|让你)|而不是|应该先|先.+再/,
  /\b(no|wrong|don't|shouldn't|not|never|instead|that'?s wrong|not what I (asked|wanted|meant))\b/i,
  /\b(use|try|pick|choose)\s+[@A-Za-z0-9][\w@./-]*\s+(instead of|not)\s+[@A-Za-z0-9][\w@./-]*/i
];
var PRODUCTIVE_TOOLS = /* @__PURE__ */ new Set([
  "Write",
  "Edit",
  "NotebookEdit",
  "Bash",
  "WebFetch"
]);
function isDenial(text) {
  return DENIAL_PATTERNS2.some((p) => p.test(text));
}
function isPraise(text) {
  return PRAISE_PATTERNS.some((p) => p.test(text));
}
function categorizeToolCall(tc) {
  const input = tc.input;
  const fp = typeof input.file_path === "string" ? input.file_path : "";
  const ext = fp.match(/\.(\w+)$/)?.[1] ?? "-";
  return `${tc.name}:${ext}`;
}
function hasProductiveToolCall(turn) {
  return turn.toolCalls.some((tc) => PRODUCTIVE_TOOLS.has(tc.name));
}
function allToolsSucceeded(turn) {
  return turn.toolCalls.every(
    (tc) => !PRODUCTIVE_TOOLS.has(tc.name) || tc.succeeded !== false
  );
}
var ruleBasedSuccessDetector = {
  detect(session) {
    const out = [];
    const corrections = ruleBasedCorrectionDetector.detect(session);
    const correctedTurns = /* @__PURE__ */ new Set();
    for (const c of corrections) {
      if (c.turnIndex > 0) correctedTurns.add(c.turnIndex - 1);
    }
    for (let i = 1; i < session.turns.length; i++) {
      if (isDenial(session.turns[i].userMessage)) {
        correctedTurns.add(i - 1);
      }
    }
    for (let i = 1; i < session.turns.length; i++) {
      const turn = session.turns[i];
      if (isPraise(turn.userMessage) && !isDenial(turn.userMessage)) {
        const prev = session.turns[i - 1];
        out.push({
          signal: "explicit_praise",
          weight: 0.8,
          turnIndex: i,
          assistantText: prev?.assistantText ?? "",
          toolCalls: (prev?.toolCalls ?? []).map(summarizeToolCall2),
          timestamp: turn.timestamp
        });
      }
    }
    const patternCount = /* @__PURE__ */ new Map();
    for (const turn of session.turns) {
      if (correctedTurns.has(turn.turnIndex)) continue;
      if (!allToolsSucceeded(turn)) continue;
      const seenInTurn = /* @__PURE__ */ new Set();
      for (const tc of turn.toolCalls) {
        if (!PRODUCTIVE_TOOLS.has(tc.name)) continue;
        const cat = categorizeToolCall(tc);
        if (seenInTurn.has(cat)) continue;
        seenInTurn.add(cat);
        if (!patternCount.has(cat)) patternCount.set(cat, []);
        patternCount.get(cat).push(turn.turnIndex);
      }
    }
    const repeatedTurns = /* @__PURE__ */ new Set();
    for (const [cat, turnIndices] of patternCount.entries()) {
      if (turnIndices.length < 3) continue;
      for (const ti of turnIndices) repeatedTurns.add(ti);
      out.push({
        signal: "repeated_pattern",
        weight: 0.6,
        turnIndex: turnIndices[0],
        assistantText: session.turns[turnIndices[0]]?.assistantText ?? "",
        toolCalls: [cat + ` \xD7 ${turnIndices.length}`],
        timestamp: session.turns[turnIndices[0]]?.timestamp ?? ""
      });
    }
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i];
      const next = session.turns[i + 1];
      if (!next) continue;
      if (!hasProductiveToolCall(turn)) continue;
      if (!allToolsSucceeded(turn)) continue;
      if (correctedTurns.has(i)) continue;
      if (repeatedTurns.has(i)) continue;
      if (isDenial(next.userMessage)) continue;
      if (isPraise(next.userMessage)) continue;
      out.push({
        signal: "one_shot_success",
        weight: 0.3,
        turnIndex: i,
        assistantText: turn.assistantText,
        toolCalls: turn.toolCalls.map(summarizeToolCall2),
        timestamp: turn.timestamp
      });
    }
    out.sort((a, b) => a.turnIndex - b.turnIndex);
    return out;
  }
};
function summarizeToolCall2(tc) {
  const keys = Object.keys(tc.input).slice(0, 3);
  return `${tc.name}(${keys.join(",")})`;
}

// ../core/src/session-parser/index.ts
init_esm_shims();
function extractUserText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
function extractToolResults(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b;
    if (block.type !== "tool_result") continue;
    if (typeof block.tool_use_id !== "string") continue;
    const c = String(block.content ?? "");
    out.push({
      id: block.tool_use_id,
      payload: {
        content: c,
        // B-052: added errno to catch Node.js system error objects like {"errno":-13}
        // Note: closing \b omitted because err! ends in a non-word char and would break matching.
        succeeded: !/\b(error|err!|failed|not found|exit code [1-9]|errno)/i.test(c)
      }
    });
  }
  return out;
}
function hasUserText(content) {
  return extractUserText(content).trim().length > 0;
}
function parseSessionFile(raw) {
  const messages = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  const toolResults = /* @__PURE__ */ new Map();
  for (const m of messages) {
    if (!m.message) continue;
    const blocks = m.message.content;
    for (const r of extractToolResults(blocks)) {
      toolResults.set(r.id, r.payload);
    }
  }
  const turns = [];
  let currentTurn = null;
  let sessionId = "unknown";
  const applyToolResultsToTurn = (turn, content) => {
    if (!turn) return;
    const results = extractToolResults(content);
    for (const r of results) {
      const tc = findToolCallById(turns, turn, r.id);
      if (tc) {
        tc.result = r.payload.content;
        tc.succeeded = r.payload.succeeded;
      }
    }
  };
  for (const m of messages) {
    if (m.sessionId) sessionId = m.sessionId;
    if (m.type === "user" && m.message) {
      const content = m.message.content;
      if (hasUserText(content)) {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = {
          turnIndex: turns.length,
          userMessage: extractUserText(content),
          assistantText: "",
          toolCalls: [],
          timestamp: m.timestamp ?? ""
        };
      } else {
        applyToolResultsToTurn(currentTurn, content);
      }
    } else if (m.type === "assistant" && m.message) {
      if (!currentTurn) continue;
      const blocks = m.message.content;
      if (!Array.isArray(blocks)) continue;
      for (const b of blocks) {
        if (b.type === "text") {
          if (currentTurn.assistantText) currentTurn.assistantText += "\n";
          currentTurn.assistantText += b.text;
        } else if (b.type === "tool_use") {
          const tc = {
            id: b.id,
            name: b.name,
            input: b.input
          };
          const tr = toolResults.get(b.id);
          if (tr) {
            tc.result = tr.content;
            tc.succeeded = tr.succeeded;
          }
          currentTurn.toolCalls.push(tc);
        } else if (b.type === "tool_result") {
          const r = { id: b.tool_use_id, payload: toolResults.get(b.tool_use_id) };
          if (r.payload) {
            const tc = findToolCallById(turns, currentTurn, r.id);
            if (tc) {
              tc.result = r.payload.content;
              tc.succeeded = r.payload.succeeded;
            }
          }
        }
      }
    }
  }
  if (currentTurn) turns.push(currentTurn);
  return {
    sessionId,
    turns,
    startTime: turns[0]?.timestamp ?? "",
    endTime: turns[turns.length - 1]?.timestamp ?? ""
  };
}
function findToolCallById(allPriorTurns, current, id) {
  for (const tc of current.toolCalls) if (tc.id === id) return tc;
  for (let i = allPriorTurns.length - 1; i >= 0; i--) {
    const t = allPriorTurns[i];
    for (const tc of t.toolCalls) if (tc.id === id) return tc;
  }
  return void 0;
}

// ../core/src/daily-summary/index.ts
init_esm_shims();

// ../core/src/daily-summary/cwd-decode.ts
init_esm_shims();
function encodeCwdToProjectDir(absPath) {
  return absPath.replace(/\//g, "-");
}
function decodeProjectDirToCwd(dirName) {
  if (!dirName.startsWith("-")) {
    return dirName;
  }
  const segments = dirName.split("-");
  const joined = "/" + segments.slice(1).join("/");
  return joined.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}

// ../core/src/daily-summary/project-key.ts
init_esm_shims();
var WORKTREE_MARKERS = [
  "/.codex/worktrees/",
  "/.claude/worktrees/"
];
function basename(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return trimmed;
  return trimmed.slice(idx + 1) || trimmed;
}
function toProjectKey(absPath) {
  for (const marker of WORKTREE_MARKERS) {
    const idx = absPath.indexOf(marker);
    if (idx >= 0) {
      const canonical = absPath.slice(0, idx);
      return {
        canonicalCwd: canonical,
        displayName: basename(canonical),
        isWorktree: true
      };
    }
  }
  return {
    canonicalCwd: absPath,
    displayName: basename(absPath),
    isWorktree: false
  };
}

// ../core/src/daily-summary/scanner.ts
init_esm_shims();
import * as nodeFs from "fs";
import * as nodePath from "path";
function startOfLocalDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function scanTodayActivity(opts) {
  const fs = opts.fs ?? nodeFs;
  const path = opts.path ?? nodePath;
  const nowDate = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  const windowStartMs = startOfLocalDay(nowDate).getTime();
  const windowEndMs = nowDate.getTime();
  const isoDate = toIsoDate(nowDate);
  if (!fs.existsSync(opts.projectsRoot)) {
    return {
      date: isoDate,
      windowStartMs,
      windowEndMs,
      groups: [],
      skippedCount: 0
    };
  }
  const projectDirs = fs.readdirSync(opts.projectsRoot);
  const groupMap = /* @__PURE__ */ new Map();
  let skipped = 0;
  for (const dir of projectDirs) {
    const projDirPath = path.join(opts.projectsRoot, dir);
    let projStat;
    try {
      projStat = fs.statSync(projDirPath);
    } catch {
      continue;
    }
    if (!projStat.isDirectory()) continue;
    const rawCwd = decodeProjectDirToCwd(dir);
    const projectKey = toProjectKey(rawCwd);
    let entries;
    try {
      entries = fs.readdirSync(projDirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const full = path.join(projDirPath, entry);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < windowStartMs) continue;
      let raw;
      try {
        raw = fs.readFileSync(full, "utf-8");
      } catch {
        skipped += 1;
        continue;
      }
      let parsed;
      try {
        parsed = parseSessionFile(raw);
      } catch {
        skipped += 1;
        continue;
      }
      const sessionId = entry.replace(/\.jsonl$/, "");
      const record = {
        rawCwd,
        jsonlPath: full,
        sessionId,
        mtimeMs: stat.mtimeMs,
        session: parsed
      };
      const slot = groupMap.get(projectKey.canonicalCwd);
      if (slot) {
        slot.records.push(record);
      } else {
        groupMap.set(projectKey.canonicalCwd, {
          project: projectKey,
          records: [record]
        });
      }
    }
  }
  const groups = Array.from(groupMap.values()).map(({ project, records }) => ({
    project,
    sessions: records.slice().sort((a, b) => a.mtimeMs - b.mtimeMs)
  })).sort((a, b) => a.project.canonicalCwd.localeCompare(b.project.canonicalCwd));
  return {
    date: isoDate,
    windowStartMs,
    windowEndMs,
    groups,
    skippedCount: skipped
  };
}

// ../core/src/daily-summary/aggregator.ts
init_esm_shims();
var EXCERPT_LIMIT = 200;
function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "\u2026";
}
function firstLine(s) {
  const nl = s.indexOf("\n");
  return nl < 0 ? s : s.slice(0, nl);
}
function digestProjectGroup(group) {
  let userTurnCount = 0;
  let assistantCharCount = 0;
  let firstUser;
  let lastUser;
  let lastUserTimeMs = 0;
  let firstUserTimeMs = Number.POSITIVE_INFINITY;
  const tools = /* @__PURE__ */ new Set();
  let hadWorktreeSession = false;
  for (const rec of group.sessions) {
    if (rec.rawCwd.includes("/.codex/worktrees/") || rec.rawCwd.includes("/.claude/worktrees/")) {
      hadWorktreeSession = true;
    }
    for (const turn of rec.session.turns) {
      const trimmed = turn.userMessage.trim();
      if (trimmed.length > 0) {
        userTurnCount += 1;
        const turnTimeMs = Date.parse(turn.timestamp);
        const tsMs = Number.isNaN(turnTimeMs) ? rec.mtimeMs : turnTimeMs;
        if (tsMs < firstUserTimeMs) {
          firstUserTimeMs = tsMs;
          firstUser = trimmed;
        }
        if (tsMs >= lastUserTimeMs) {
          lastUserTimeMs = tsMs;
          lastUser = trimmed;
        }
      }
      assistantCharCount += turn.assistantText.length;
      for (const call of turn.toolCalls) {
        tools.add(call.name);
      }
    }
  }
  return {
    displayName: group.project.displayName,
    canonicalCwd: group.project.canonicalCwd,
    sessionCount: group.sessions.length,
    userTurnCount,
    assistantCharCount,
    firstUserExcerpt: firstUser ? truncate(firstLine(firstUser), EXCERPT_LIMIT) : "",
    lastUserExcerpt: lastUser ? truncate(firstLine(lastUser), EXCERPT_LIMIT) : "",
    toolsUsed: Array.from(tools).sort(),
    hadWorktreeSession
  };
}

// ../core/src/daily-summary/prompt-matcher.ts
init_esm_shims();
var DEFAULT_TRIGGERS = [
  "\u603B\u7ED3\u4E00\u4E0B\u4ECA\u5929\u7684\u65E5\u62A5",
  "\u603B\u7ED3\u4ECA\u5929\u7684\u65E5\u62A5",
  "\u4ECA\u65E5\u65E5\u62A5",
  "\u751F\u6210\u65E5\u62A5",
  "daily summary today",
  "today's daily summary"
];
var KEYWORDS = ["\u65E5\u62A5", "daily summary"];
function normalize(prompt) {
  return prompt.trim();
}
function matchesSlash(prompt) {
  const t = normalize(prompt);
  if (t === "/daily") return true;
  if (t.startsWith("/daily ")) return true;
  if (t.startsWith("/daily\n")) return true;
  return false;
}
function matchesWhitelist(prompt, extra) {
  const t = normalize(prompt);
  const all = [...DEFAULT_TRIGGERS, ...extra];
  for (const phrase of all) {
    if (!phrase) continue;
    if (t.includes(phrase)) return { hit: true, phrase };
  }
  return { hit: false, phrase: "" };
}
function containsDailyKeyword(prompt) {
  const t = prompt.toLowerCase();
  for (const kw of KEYWORDS) {
    if (t.includes(kw.toLowerCase())) return true;
  }
  return false;
}
function matchPrompt(prompt, opts) {
  if (opts?.disabled) {
    return { fire: false, reason: "disabled", matchedPhrase: "" };
  }
  if (matchesSlash(prompt)) {
    return { fire: true, reason: "slash", matchedPhrase: "/daily" };
  }
  const wl = matchesWhitelist(prompt, opts?.extraTriggers ?? []);
  if (wl.hit) {
    return { fire: true, reason: "whitelist", matchedPhrase: wl.phrase };
  }
  return { fire: false, reason: "passthrough", matchedPhrase: "" };
}
async function matchPromptWithIntentCheck(prompt, opts) {
  const sync = matchPrompt(prompt, opts);
  if (sync.fire || sync.reason === "disabled") return sync;
  if (!containsDailyKeyword(prompt)) return sync;
  const checker = opts?.intentChecker;
  if (!checker) return sync;
  let ok = false;
  try {
    ok = await checker(prompt);
  } catch {
    ok = false;
  }
  return ok ? { fire: true, reason: "intent-check", matchedPhrase: "" } : { fire: false, reason: "passthrough", matchedPhrase: "" };
}
function parseExtraTriggersEnv(raw) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// ../core/src/daily-summary/rewriter.ts
init_esm_shims();
var META_INSTRUCTION_HEADER = `TeamAgent daily-summary trigger fired. Below is the LLM-free aggregate of the operator's Claude Code activity for today. Please respond with a one-line summary per project, in \u4E2D\u6587, first-person voice (\u4F8B\u5982 "\u4FEE\u4E86\u2026" / "\u8C03\u4E86\u2026"). Do not re-list the raw counts; paraphrase what the operator likely accomplished.`;
var ZERO_ACTIVITY_BODY = 'TeamAgent daily-summary trigger fired, but no Claude Code session activity is recorded for the operator today. Please respond briefly in \u4E2D\u6587 acknowledging "\u4ECA\u65E5\u65E0 Claude \u6D3B\u52A8".';
function formatDigest(d) {
  const lines = [];
  lines.push(`### ${d.displayName}  (${d.canonicalCwd})`);
  lines.push(
    `- sessions: ${d.sessionCount}` + (d.hadWorktreeSession ? " (\u542B worktree)" : "")
  );
  lines.push(`- user turns: ${d.userTurnCount}`);
  lines.push(`- assistant chars: ${d.assistantCharCount}`);
  if (d.toolsUsed.length > 0) {
    lines.push(`- tools: ${d.toolsUsed.join(", ")}`);
  }
  if (d.firstUserExcerpt) {
    lines.push(`- first user turn: ${d.firstUserExcerpt}`);
  }
  if (d.lastUserExcerpt && d.lastUserExcerpt !== d.firstUserExcerpt) {
    lines.push(`- last user turn: ${d.lastUserExcerpt}`);
  }
  return lines.join("\n");
}
function composeAdditionalContext(input) {
  if (input.digests.length === 0) {
    return [
      `# TeamAgent daily summary (${input.date})`,
      "",
      ZERO_ACTIVITY_BODY
    ].join("\n");
  }
  const sections = input.digests.map(formatDigest).join("\n\n");
  return [
    `# TeamAgent daily summary (${input.date})`,
    "",
    META_INSTRUCTION_HEADER,
    "",
    sections
  ].join("\n");
}
function composeArchiveMarkdown(input) {
  const headerLines = [
    `# Daily activity \u2014 ${input.date}`,
    "",
    `_Generated by TeamAgent daily-summary hook (issue #371). LLM-free aggregation of \`~/.claude/projects/\` session logs._`,
    ""
  ];
  if (input.matcherReason) {
    headerLines.push(`_Triggered by: ${input.matcherReason}_`, "");
  }
  if (input.digests.length === 0) {
    headerLines.push("_(no Claude Code activity recorded for today)_");
    headerLines.push("");
    return headerLines.join("\n");
  }
  const sections = input.digests.map(formatDigest).join("\n\n");
  return [...headerLines, sections, ""].join("\n");
}

// ../core/src/extractor/prompt.ts
init_esm_shims();
function buildExtractionPrompt(input) {
  const header = buildHeader(input.kind);
  const contextBlock = buildContextBlock(input);
  const schema = SCHEMA_BLOCK;
  const examples = EXAMPLES_BLOCK;
  const instructions = INSTRUCTIONS_BLOCK;
  return [header, contextBlock, schema, examples, instructions].join("\n\n");
}
function buildHeader(kind) {
  const sourceMap = {
    correction: "\u7528\u6237\u5728 Claude Code \u4F1A\u8BDD\u4E2D\u7EA0\u6B63\u4E86 AI \u7684\u884C\u4E3A",
    success: "\u7528\u6237\u7684\u4E00\u6B21\u6210\u529F\u6A21\u5F0F\uFF08AI \u672A\u88AB\u7EA0\u6B63\u4E14\u6A21\u5F0F\u88AB\u91CD\u590D\u4F7F\u7528\uFF09",
    "rule-text": "\u4E00\u6BB5\u5DF2\u6709\u7684\u89C4\u5219\u6587\u672C",
    insights: "Claude Code /insights \u62A5\u544A",
    "npm-audit": "npm audit \u8F93\u51FA\uFF08\u4F9D\u8D56\u5B89\u5168\u6F0F\u6D1E\uFF09",
    "pr-review": "PR review \u8BC4\u8BBA",
    "git-hotspot": "git log \u70ED\u70B9\u6587\u4EF6\uFF08\u9891\u7E41\u88AB\u4FEE\u6539\u7684\u8DEF\u5F84\uFF09",
    "ci-failure": "CI failure \u65E5\u5FD7\u7247\u6BB5"
  };
  const source = sourceMap[kind];
  return `\u4F60\u662F\u77E5\u8BC6\u63D0\u53D6\u5668\u3002\u4EFB\u52A1\u662F\u628A\u4E0B\u9762\u8FD9\u6BB5\u4E0A\u4E0B\u6587\uFF08${source}\uFF09\u63D0\u70BC\u6210\u4E00\u6761\u7ED3\u6784\u5316\u7684"\u77E5\u8BC6\u6761\u76EE"\uFF0C\u4F9B\u56E2\u961F AI \u672A\u6765\u53C2\u8003\u3002`;
}
function buildContextBlock(input) {
  return [
    "\u3010\u4E0A\u4E0B\u6587\u3011",
    `\u4FE1\u53F7\u6743\u91CD: ${input.weight.toFixed(2)}`,
    "```",
    input.context.trim(),
    "```"
  ].join("\n");
}
var SCHEMA_BLOCK = `\u3010\u8F93\u51FA\u5B57\u6BB5\u3011
- category: "C" | "E" | "S" | "K"
  - C \u4EE3\u7801\u5C42\uFF08\u8BED\u6CD5\u3001\u7C7B\u578B\u3001API \u7528\u6CD5\uFF09
  - E \u5DE5\u7A0B\u5C42\uFF08\u67B6\u6784\u3001\u4F9D\u8D56\u3001\u5DE5\u5177\u94FE\uFF09
  - S \u7B56\u7565\u5C42\uFF08\u4EFB\u52A1\u5206\u89E3\u3001\u5B9E\u73B0\u987A\u5E8F\u3001\u53D6\u820D\uFF09
  - K \u8BA4\u77E5\u5C42\uFF08\u7528\u6237\u504F\u597D\u3001\u5FC3\u667A\u6A21\u578B\u3001\u534F\u4F5C\u65B9\u5F0F\uFF09
- tags: string[]  \u81EA\u7531\u6807\u7B7E\uFF0C2-5 \u4E2A\u77ED\u8BCD\uFF1B\u82F1\u6587\u6216\u4E2D\u6587\u5747\u53EF\uFF08\u5982 "http-client" "architecture"\uFF09
- type: "avoidance" | "practice"
  - avoidance \u907F\u5751\uFF08"\u4E0D\u8981 X"\uFF09\u2014\u2014**\u5FC5\u987B**\u6709\u53EF\u5B57\u9762\u5339\u914D\u7684 wrong_pattern \u5173\u952E\u8BCD
  - practice \u6700\u4F73\u5B9E\u8DF5\uFF08"\u5C31\u8BE5 X"\uFF09\u2014\u2014wrong_pattern **\u5FC5\u987B\u7559\u7A7A**
  \u26A0\uFE0F \u82E5\u6709\u53EF\u5B57\u9762\u5339\u914D\u7684\u53CD\u6A21\u5F0F\uFF0C\u4E00\u5F8B\u9009 avoidance\u3002\u4E25\u7981 practice + wrong_pattern \u7EC4\u5408\uFF0C
      \u5426\u5219 validator L0 \u4F1A\u62D2\u6536 (practice_must_not_have_wrong_pattern /
      avoidance_must_have_wrong_pattern)\u3002
- nature: "objective" | "subjective"
  - objective \u5BA2\u89C2\u53EF\u9A8C\u8BC1\uFF08\u8BED\u6CD5\u9519\u8BEF\u3001API \u884C\u4E3A\uFF09
  - subjective \u4E3B\u89C2\u504F\u597D\uFF08\u67B6\u6784\u9009\u578B\u3001\u98CE\u683C\uFF09
- trigger: string  \u4F55\u65F6\u8FD9\u6761\u77E5\u8BC6\u751F\u6548\u3002\u4E00\u53E5\u8BDD\uFF0C\u63CF\u8FF0\u573A\u666F\uFF0C\u4E0D\u5305\u542B\u5177\u4F53\u505A\u6CD5
- wrong_pattern: string  **\u5173\u952E\u89C4\u5219**\u2014\u2014**\u53EF\u5B57\u9762 substring \u5339\u914D**\u7684\u901A\u7528\u5173\u952E\u8BCD\u3002
  **\u5143\u539F\u5219** (3 \u6761\u5FC5\u987B\u5168\u4E2D)\uFF1A
    (a) \u5B57\u9762\u7A33\u5B9A \u2014\u2014 \u8DE8\u9879\u76EE\u8DE8\u56E2\u961F\uFF0C\u8FD9\u4E32\u5B57\u7B26\u542B\u4E49\u76F8\u540C
    (b) \u53EF substring \u547D\u4E2D \u2014\u2014 \u5728\u4EE3\u7801/\u547D\u4EE4/\u914D\u7F6E\u6587\u672C\u91CC\u4F1A\u539F\u6837\u51FA\u73B0
    (c) \u8131\u79BB\u4E0A\u4E0B\u6587\u4ECD\u6307\u5411\u95EE\u9898 \u2014\u2014 \u770B\u5230\u8FD9\u4E32\u5B57\u7B26\u5C31\u77E5\u9053\u8E29\u5751\uFF0C\u4E0D\u5FC5\u61C2\u5468\u56F4\u542B\u4E49
  **\u5141\u8BB8\u7684 18 \u7C7B**\uFF08A \u4EE3\u7801/\u8BED\u8A00\u3001B \u57FA\u7840\u8BBE\u65BD/\u547D\u4EE4\u3001C \u914D\u7F6E/\u73AF\u5883\u3001D \u6570\u636E/\u67E5\u8BE2\u3001E \u5B89\u5168/\u8D28\u91CF\uFF09\uFF1A
    A1 \u4F9D\u8D56/\u5305/\u6A21\u5757\u540D\uFF1A\`moment\` \`jQuery\` \`@reduxjs/toolkit\` \`lodash\` \`request\`
    A2 API/\u65B9\u6CD5/\u5C5E\u6027\uFF1A \`localStorage.getItem\` \`document.write\` \`eval(\` \`innerHTML =\` \`XMLHttpRequest\`
    A3 \u8BED\u6CD5/\u5173\u952E\u5B57\uFF1A   \`var \` \`== \` \`!= \` \`new Function(\` \`with (\`
    A4 \u7C7B\u578B\u7CFB\u7EDF\u6807\u8BB0\uFF1A  \`as any\` \`: any\` \`@ts-ignore\` \`@ts-nocheck\` \`Record<string, any>\`
    A5 \u6846\u67B6\u53CD\u6A21\u5F0F\uFF1A    \`dangerouslySetInnerHTML\` \`key={index}\` \`v-html\` \`ng-bind-html\`
    B1 Git\uFF1A           \`git push --force\` \`git commit --no-verify\` \`git reset --hard\`
    B2 \u5305\u7BA1\u7406\uFF1A        \`npm install -g\` \`pip install --user\` \`:latest\`
    B3 Shell \u5371\u9669\uFF1A    \`rm -rf /\` \`chmod 777\` \`chmod -R 777\` \`sudo rm\` \`umask 000\` \`eval $\`
    B4 Docker\uFF1A        \`FROM .*:latest\` (\u5B57\u9762 \`:latest\`) \`USER root\` \`privileged: true\` \`--cap-add=ALL\`
    B5 Kubernetes\uFF1A    \`hostNetwork: true\` \`runAsUser: 0\` \`hostPath:\` \`privileged: true\`
    C1 \u914D\u7F6E\u952E\uFF1A        \`allowJs\` \`strict: false\` \`noImplicitAny: false\` \`skipLibCheck: true\`
    C2 \u73AF\u5883\u53D8\u91CF\uFF1A      \`NODE_ENV=development\` \`DEBUG=*\` \`DISABLE_AUTH=\`
    C3 URL/\u7F51\u7EDC\uFF1A      \`http://\` (\u660E\u6587) \`localhost:\` \`0.0.0.0/0\` \u786C\u7F16\u7801 IP
    D1 SQL \u53CD\u6A21\u5F0F\uFF1A    \`SELECT *\` \`DROP TABLE\` \`DELETE FROM \` (\u65E0 WHERE) \`OR 1=1\` \`TRUNCATE \`
    D2 \u6B63\u5219\u98CE\u9669\uFF1A      \`.*.*.*\` (\u8FDE\u7EED\u901A\u914D) \`(.+)+\` (\u56DE\u6EAF\u70B8\u5F39)
    E1 \u51ED\u8BC1/\u5BC6\u94A5\u524D\u7F00\uFF1A \`AKIA\` (AWS) \`ghp_\` (GitHub PAT) \`sk_live_\` (Stripe) \`SG.\` (SendGrid)
    E2 XSS/\u53CD\u5E8F\u5217\u5316\uFF1A  \`innerHTML =\` \`document.write(\` \`eval(\` \`new Function(\` \`javascript:\` \`pickle.loads(\`
    E3 \u6D4B\u8BD5/\u65E5\u5FD7\u6B8B\u7559\uFF1A \`.only(\` \`.skip(\` \`xdescribe(\` \`fdescribe(\` \`console.log(\` (prod) \`print(\` (prod)
  \u591A\u4E2A\u5019\u9009\u7528 \`|\` \u5206\u9694\uFF0C\u6BCF\u6BB5 \u22653 \u5B57\u7B26\uFF0C\u226440 \u5B57\u7B26\u3002
  **\u56DB\u6761\u94C1\u5F8B**\uFF1A
    1. \u6700\u957F\u516C\u5171\u7247\u6BB5 \u2014\u2014 \u5B81\u8981 \`npm install\` \u4E00\u4E2A\u77ED\u8BCD\uFF0C\u4E0D\u8981 \`npm install --save moment^2.29\` \u5B8C\u6574\u884C
    2. pipe \u5206\u591A variant \u2014\u2014 \u540C\u6982\u5FF5\u591A\u5199\u6CD5 \`innerHTML =|innerHTML+=\`
    3. \u907F\u514D\u8FC7\u5EA6\u901A\u7528 token \u2014\u2014 \u7981 \`if\`/\`for\`/\`function\`/\`return\`/\`log(\`\uFF08\u5355\u72EC\uFF09
    4. \u4E0D\u5199\u6B63\u5219 \u2014\u2014 matcher \u53EA\u505A substring\uFF0C\`\\d+\` \u4E0D\u751F\u6548\uFF0C\u7528\u6700\u957F\u5B57\u9762\u524D\u7F00
  **\u7981\u6B62**\uFF1A
    \u274C \u6574\u53E5\u81EA\u7136\u8BED\u8A00\uFF08"demote=0 \u65F6..." "AI \u6CA1\u5148\u67E5..."\uFF09
    \u274C \u9879\u76EE\u4E13\u5C5E\u8DEF\u5F84/\u51FD\u6570\uFF08\`packages/...\`\u3001\`@teamagent/...\`\u3001\`tierFromDemerit\`\uFF09
    \u274C \u62BD\u8C61\u52A8\u4F5C\u63CF\u8FF0\uFF08"\u76F4\u63A5 emit \u65B0 source \u503C"\uFF09
    \u274C \u8D85\u957F\u5B57\u9762\u91CF\uFF08>40 \u5B57\u7B26\u4E00\u822C\u592A\u5177\u4F53\uFF09
    \u274C \u6D4B\u8BD5\u4EE3\u7801\u7247\u6BB5\uFF08\`tierFromDemerit(4, 'stable')\`\uFF09
  \u627E\u4E0D\u5230\u901A\u7528\u5173\u952E\u8BCD\u65F6\uFF0Ctype \u6539 "practice" \u5E76\u7559\u7A7A wrong_pattern\u2014\u2014\u800C\u975E\u786C\u7F16\u5165\u5177\u4F53\u5B57\u9762\u91CF\u3002
- correct_pattern: string  \u6B63\u786E\u505A\u6CD5\u7684\u5173\u952E\u5B57/\u53E5\u5F0F\u6216\u4E00\u53E5\u8BDD\u5EFA\u8BAE
- reasoning: string  \u4E00\u53E5\u8BDD\u89E3\u91CA\u4E3A\u4EC0\u4E48\u3002\u5305\u542B"\u4E3A\u4EC0\u4E48\u9519"\u548C"\u4E3A\u4EC0\u4E48\u5BF9"`;
var EXAMPLES_BLOCK = `\u3010\u793A\u4F8B\u3011
\u793A\u4F8B\u8F93\u5165\uFF1A\u7528\u6237\u8BF4 "\u4E0D\u7528 axios\uFF0C\u7528 fetch\uFF0C\u9879\u76EE\u8981\u96F6\u4F9D\u8D56"\uFF0CAI \u4E4B\u524D\u5EFA\u8BAE axios\u3002
\u793A\u4F8B\u8F93\u51FA\uFF1A
\`\`\`json
{
  "category": "E",
  "tags": ["http-client", "dependency", "tech-choice"],
  "type": "avoidance",
  "nature": "subjective",
  "trigger": "\u9700\u8981\u53D1\u8D77 HTTP \u8BF7\u6C42",
  "wrong_pattern": "axios",
  "correct_pattern": "fetch",
  "reasoning": "\u9879\u76EE\u504F\u597D\u96F6\u4F9D\u8D56\uFF0Cfetch \u5728 Node 18+ \u539F\u751F\u53EF\u7528\uFF0C\u65E0\u9700\u989D\u5916\u5305"
}
\`\`\`

\u793A\u4F8B\u8F93\u5165\uFF1A\u7528\u6237\u8BF4 "\u8FD9\u601D\u8DEF\u4E0D\u5BF9\uFF0C\u5148\u5199\u6D4B\u8BD5\u518D\u5199\u5B9E\u73B0"\uFF0CAI \u76F4\u63A5\u5F00\u59CB\u5199\u5B9E\u73B0\u4EE3\u7801\u3002
\u793A\u4F8B\u8F93\u51FA\uFF1A
\`\`\`json
{
  "category": "S",
  "tags": ["tdd", "workflow"],
  "type": "practice",
  "nature": "subjective",
  "trigger": "\u5F00\u59CB\u5B9E\u73B0\u65B0\u529F\u80FD\u524D",
  "wrong_pattern": "",
  "correct_pattern": "\u5148\u5199\u5931\u8D25\u6D4B\u8BD5\u518D\u5199\u5B9E\u73B0\uFF08TDD\uFF09",
  "reasoning": "\u56E2\u961F\u91C7\u7528 TDD \u8282\u594F\uFF1A\u7EA2\u2192\u7EFF\u2192\u91CD\u6784\uFF0C\u80FD\u51CF\u5C11\u56DE\u5F52\u5E76\u5F3A\u5236\u63A5\u53E3\u5148\u884C"
}
\`\`\`

\u793A\u4F8B\u8F93\u5165\uFF1A\u7528\u6237\u8BF4 "\u4E0D\u5BF9" \u4F46\u6CA1\u7ED9\u66FF\u4EE3\u65B9\u6848\uFF0C\u4E0A\u4E0B\u6587\u4E5F\u770B\u4E0D\u51FA\u539F\u56E0\u3002
\u793A\u4F8B\u8F93\u51FA\uFF1A
\`\`\`json
null
\`\`\`

\u3010\u53CD\u4F8B\u2014\u2014\u4E0D\u8981\u8FD9\u6837\u505A\u3011
\u274C \u9519\u8BEF\uFF1Awrong_pattern = "AI \u76F4\u63A5\u8DD1 npm install moment, \u6CA1\u5148\u67E5\u9879\u76EE\u6709\u6CA1\u6709\u7528\u522B\u7684\u65F6\u95F4\u5E93"
\u2705 \u6B63\u786E\uFF1Awrong_pattern = "moment"   \uFF08\u53EA\u8981\u5E93\u540D\u672C\u8EAB\uFF0C\u6574\u53E5\u63CF\u8FF0\u8FDB reasoning\uFF09

\u274C \u9519\u8BEF\uFF1Awrong_pattern = "\u76F4\u63A5\u5728 pipeline \u91CC emit \u65B0 source \u503C"
\u2705 \u6B63\u786E\uFF1Atype \u6539 "practice"\uFF0Cwrong_pattern \u7559\u7A7A    \uFF08\u627E\u4E0D\u5230\u901A\u7528\u5173\u952E\u8BCD\u65F6\u522B\u786C\u5199\uFF09

\u274C \u9519\u8BEF\uFF1Awrong_pattern = "packages/core/src/scorer.ts \u672A\u5224\u7A7A"
\u2705 \u6B63\u786E\uFF1Awrong_pattern = ""\uFF08\u9879\u76EE\u5185\u90E8\u8DEF\u5F84\u65E0\u666E\u9002\u4EF7\u503C\uFF0Ctype="practice"\uFF09`;
var INSTRUCTIONS_BLOCK = `\u3010\u4E25\u683C\u8981\u6C42\u3011
1. \u53EA\u8F93\u51FA**\u4E00\u6BB5** JSON\uFF08\u5728 \`\`\`json fenced block \u91CC\uFF09\u6216\u5B57\u9762\u91CF \`null\`
2. \u4E0D\u8981\u5728 JSON \u524D\u540E\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57
3. \u5982\u679C\u4E0A\u4E0B\u6587\u4FE1\u606F\u4E0D\u8DB3\u4EE5\u63D0\u53D6\u51FA\u6709\u7528\u7684\u77E5\u8BC6\uFF08\u4F8B\u5982\u7528\u6237\u53EA\u8BF4"\u4E0D\u5BF9"\u4F46\u6CA1\u7ED9\u66FF\u4EE3\u3001\u6216\u7EA0\u6B63\u5185\u5BB9\u592A\u79C1\u4EBA\u5316\uFF09\uFF0C\u8F93\u51FA \`null\`
4. trigger \u8981\u5199\u5F97\u901A\u7528\u4E00\u4E9B\uFF0C\u8BA9\u672A\u6765\u4E0D\u540C\u4EFB\u52A1\u91CC\u90FD\u80FD\u5339\u914D\uFF1B\u4E0D\u8981\u628A\u5177\u4F53\u5B9E\u73B0\u7EC6\u8282\u5199\u8FDB trigger
5. wrong_pattern \u5FC5\u987B\u662F**\u53EF\u8DE8\u9879\u76EE\u590D\u7528**\u7684\u5E93\u540D/API \u7B26\u53F7/\u547D\u4EE4/\u914D\u7F6E\u952E\u540D\u3002\u6574\u53E5\u63CF\u8FF0\u3001\u9879\u76EE\u5185\u90E8\u8DEF\u5F84\u3001\u62BD\u8C61\u52A8\u4F5C\u63CF\u8FF0\u4E00\u5F8B\u4E0D\u63A5\u53D7\u2014\u2014\u627E\u4E0D\u5230\u65F6\u5C31\u6539 type="practice" \u7559\u7A7A`;
function buildRetrofitPrompt(input) {
  return [
    "\u4F60\u5728\u6539\u9020\u4E00\u6761\u65E7\u77E5\u8BC6\u6761\u76EE\u7684 wrong_pattern \u5B57\u6BB5\u3002",
    "\u539F\u5B57\u6BB5\u662F\u4E0A\u4E00\u7248 LLM \u63D0\u53D6\u65F6\u6284\u8FDB\u53BB\u7684\u539F\u59CB\u4F1A\u8BDD\u7247\u6BB5\uFF0C\u73B0\u5728\u8981\u538B\u6210**\u53EF\u8DE8\u9879\u76EE\u590D\u7528**\u7684\u901A\u7528\u5173\u952E\u8BCD\u3002",
    "",
    "\u3010\u539F\u89C4\u5219\u3011",
    `trigger:         ${input.trigger}`,
    `wrong_pattern:   ${input.wrong_pattern}`,
    `correct_pattern: ${input.correct_pattern}`,
    `reasoning:       ${input.reasoning}`,
    input.tags?.length ? `tags:            ${input.tags.join(", ")}` : "",
    "",
    "\u3010\u4F60\u8981\u505A\u7684\u3011",
    "\u4ECE\u4E0A\u9762 4 \u4E2A\u5B57\u6BB5\u91CC\u62BD\u51FA**\u53EF substring \u5339\u914D**\u7684\u901A\u7528\u5173\u952E\u8BCD\u3002",
    "",
    "\u3010\u5143\u539F\u5219\u3011 (3 \u6761\u5FC5\u987B\u5168\u4E2D)",
    "(a) \u5B57\u9762\u7A33\u5B9A \u2014\u2014 \u8DE8\u9879\u76EE\u8DE8\u56E2\u961F\uFF0C\u8FD9\u4E32\u5B57\u7B26\u542B\u4E49\u76F8\u540C",
    "(b) \u53EF substring \u547D\u4E2D \u2014\u2014 \u5728\u4EE3\u7801/\u547D\u4EE4/\u914D\u7F6E\u6587\u672C\u91CC\u4F1A\u539F\u6837\u51FA\u73B0",
    "(c) \u8131\u79BB\u4E0A\u4E0B\u6587\u4ECD\u6307\u5411\u95EE\u9898 \u2014\u2014 \u770B\u5230\u5C31\u77E5\u9053\u8E29\u5751\uFF0C\u4E0D\u5FC5\u61C2\u5468\u56F4\u542B\u4E49",
    "",
    "\u3010\u5141\u8BB8\u7684 18 \u7C7B\u3011",
    "A. \u4EE3\u7801/\u8BED\u8A00:",
    "  A1 \u4F9D\u8D56/\u5305/\u6A21\u5757\u540D (moment, jQuery, @reduxjs/toolkit, lodash)",
    "  A2 API/\u65B9\u6CD5/\u5C5E\u6027 (localStorage.getItem, document.write, eval(, innerHTML =)",
    "  A3 \u8BED\u6CD5/\u5173\u952E\u5B57   (var [\u5E26\u7A7A\u683C], == , != , new Function(, with ()",
    "  A4 \u7C7B\u578B\u7CFB\u7EDF      (as any, : any, @ts-ignore, @ts-nocheck, Record<string, any>)",
    "  A5 \u6846\u67B6\u53CD\u6A21\u5F0F    (dangerouslySetInnerHTML, key={index}, v-html)",
    "B. \u57FA\u7840\u8BBE\u65BD/\u547D\u4EE4:",
    "  B1 Git           (git push --force, git commit --no-verify, git reset --hard)",
    "  B2 \u5305\u7BA1\u7406        (npm install -g, pip install --user, :latest)",
    "  B3 Shell \u5371\u9669    (rm -rf /, chmod 777, sudo rm, umask 000, eval $)",
    "  B4 Docker        (`:latest` [\u5B57\u9762], USER root, privileged: true, --cap-add=ALL)",
    "  B5 Kubernetes    (hostNetwork: true, runAsUser: 0, hostPath:)",
    "C. \u914D\u7F6E/\u73AF\u5883:",
    "  C1 \u914D\u7F6E\u952E        (allowJs, strict: false, noImplicitAny: false)",
    "  C2 \u73AF\u5883\u53D8\u91CF      (NODE_ENV=development, DEBUG=*, DISABLE_AUTH=)",
    "  C3 URL/\u7F51\u7EDC      (http://, localhost:, 0.0.0.0/0)",
    "D. \u6570\u636E/\u67E5\u8BE2:",
    "  D1 SQL \u53CD\u6A21\u5F0F    (SELECT *, DROP TABLE, DELETE FROM [\u65E0 WHERE], OR 1=1)",
    "  D2 \u6B63\u5219\u98CE\u9669      (.*.*.*, (.+)+ \u56DE\u6EAF\u70B8\u5F39)",
    "E. \u5B89\u5168/\u8D28\u91CF:",
    "  E1 \u51ED\u8BC1\u524D\u7F00      (AKIA, ghp_, sk_live_, SG.)",
    "  E2 XSS/\u53CD\u5E8F\u5217\u5316  (innerHTML =, document.write(, eval(, new Function(, javascript:)",
    "  E3 \u6D4B\u8BD5/\u65E5\u5FD7\u6B8B\u7559 (.only(, .skip(, xdescribe(, console.log(, print()",
    "",
    "\u591A\u4E2A\u5019\u9009\u7528 `|` \u5206\u9694\u3002\u6BCF\u6BB5 \u22653 \u5B57\u7B26\uFF0C\u226440 \u5B57\u7B26\u3002",
    "",
    "\u3010\u56DB\u6761\u94C1\u5F8B\u3011",
    "1. \u6700\u957F\u516C\u5171\u7247\u6BB5 \u2014\u2014 \u5B81\u8981 `npm install` \u4E00\u4E2A\u77ED\u8BCD\uFF0C\u4E0D\u8981 `npm install --save moment^2.29`",
    "2. pipe \u5206\u591A variant \u2014\u2014 \u540C\u6982\u5FF5\u591A\u5199\u6CD5 `innerHTML =|innerHTML+=`",
    "3. \u907F\u514D\u8FC7\u5EA6\u901A\u7528 \u2014\u2014 \u7981 `if`/`for`/`return`/`log(` \u5355\u72EC\u51FA\u73B0",
    "4. \u4E0D\u5199\u6B63\u5219 \u2014\u2014 matcher \u53EA\u505A substring, `\\d+` \u4E0D\u751F\u6548, \u7528\u5B57\u9762\u524D\u7F00",
    "",
    "\u3010\u7981\u6B62\u3011",
    "\u274C \u6574\u53E5\u81EA\u7136\u8BED\u8A00 ('demote=0 \u65F6\u8FD4\u56DE currentTier', 'AI \u6CA1\u5148\u67E5...')",
    "\u274C \u9879\u76EE\u5185\u90E8\u8DEF\u5F84 (packages/..., @teamagent/..., src/...)",
    "\u274C \u9879\u76EE\u5185\u90E8\u51FD\u6570/\u53D8\u91CF (tierFromDemerit, calibrator.adjust)",
    "\u274C \u8FC7\u5EA6\u62BD\u8C61 ('\u76F4\u63A5 emit \u65B0 source \u503C')",
    `\u274C \u6D4B\u8BD5\u4EE3\u7801\u5B57\u9762\u91CF ("tierFromDemerit(4, 'stable')")`,
    "\u274C \u8D85\u957F\u5B57\u9762\u91CF (>40 \u5B57\u7B26)",
    "",
    "\u3010\u8F93\u51FA\u683C\u5F0F\u3011",
    "\u53EA\u8F93\u51FA\u4E00\u884C\u7EAF\u6587\u672C\uFF1A",
    "- \u627E\u5230\u5173\u952E\u8BCD \u2192 \u8F93\u51FA\u5173\u952E\u8BCD\u672C\u8EAB (\u5982 `moment` \u6216 `innerHTML =|document.write(`)",
    "- \u627E\u4E0D\u5230\u901A\u7528\u5173\u952E\u8BCD \u2192 \u8F93\u51FA\u5B57\u9762\u91CF `null`",
    "",
    "\u4E0D\u8981 JSON, \u4E0D\u8981\u5F15\u53F7, \u4E0D\u8981\u89E3\u91CA, \u4E0D\u8981 ```fenced block\u3002"
  ].filter(Boolean).join("\n");
}

// ../core/src/importer/claude-md-parser.ts
init_esm_shims();
function extractRuleBullets(md) {
  const lines = md.split("\n");
  const out = [];
  let inTeamagentBlock = false;
  let inCodeFence = false;
  let currentBullet = null;
  let currentIndent = 0;
  const flush = () => {
    if (currentBullet && currentBullet.length > 0) {
      const joined = currentBullet.join(" ").trim();
      if (joined) out.push(joined);
    }
    currentBullet = null;
  };
  for (const rawLine of lines) {
    if (/^\s*```/.test(rawLine)) {
      inCodeFence = !inCodeFence;
      flush();
      continue;
    }
    if (inCodeFence) continue;
    if (/<!--\s*TEAMAGENT:START/.test(rawLine)) {
      inTeamagentBlock = true;
      flush();
      continue;
    }
    if (/<!--\s*TEAMAGENT:END/.test(rawLine)) {
      inTeamagentBlock = false;
      continue;
    }
    if (inTeamagentBlock) continue;
    const bulletMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const text = bulletMatch[3];
      if (currentBullet !== null && indent > currentIndent) {
        currentBullet.push(text);
        continue;
      }
      flush();
      currentBullet = [text];
      currentIndent = indent;
      continue;
    }
    if (currentBullet !== null) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flush();
        continue;
      }
      const leadingSpace = rawLine.match(/^(\s*)/)[1].length;
      if (leadingSpace > currentIndent) {
        currentBullet.push(trimmed);
        continue;
      }
      flush();
    }
  }
  flush();
  return out;
}

// ../core/src/importer/cursor-rules-parser.ts
init_esm_shims();
function extractCursorRules(content) {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const bullets = extractRuleBullets(content);
  if (bullets.length > 0) return bullets;
  const paragraphs = trimmed.split(/\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 0).filter((p) => !isMarkdownHeader(p));
  if (paragraphs.length >= 1) return paragraphs;
  return [trimmed];
}
function isMarkdownHeader(text) {
  const firstLine2 = text.split("\n")[0];
  return text.split("\n").length === 1 && /^#{1,6}\s+/.test(firstLine2);
}

// ../core/src/importer/rule-structurer.ts
init_esm_shims();

// ../core/src/extractor/llm-based.ts
init_esm_shims();
var llmBasedKnowledgeExtractor = {
  async extract(input, callLLM) {
    const prompt = buildExtractionPrompt(input);
    const raw = await callLLM(prompt);
    return parseExtractionResponse(raw);
  }
};
function parseExtractionResponse(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = extractFencedJson(trimmed);
  const candidate = fenced ?? trimmed;
  if (/^null$/i.test(candidate.trim())) return null;
  let obj = tryParseJson(candidate);
  if (!obj) {
    const braced = extractFirstBracedObject(trimmed);
    if (braced) obj = tryParseJson(braced);
  }
  if (!obj) return null;
  return validateExtractedFields(obj);
}
function extractFencedJson(text) {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return m ? m[1].trim() : null;
}
function extractFirstBracedObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
function tryParseJson(text) {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v;
    }
    return null;
  } catch {
    return null;
  }
}
var VALID_CATEGORY = /* @__PURE__ */ new Set(["C", "E", "S", "K"]);
var VALID_TYPE = /* @__PURE__ */ new Set(["avoidance", "practice"]);
var VALID_NATURE = /* @__PURE__ */ new Set(["objective", "subjective"]);
function validateExtractedFields(raw) {
  const {
    category,
    tags,
    type,
    nature,
    trigger,
    wrong_pattern,
    correct_pattern,
    reasoning
  } = raw;
  if (typeof category !== "string" || !VALID_CATEGORY.has(category)) return null;
  if (typeof type !== "string" || !VALID_TYPE.has(type)) return null;
  if (typeof nature !== "string" || !VALID_NATURE.has(nature)) return null;
  if (typeof trigger !== "string" || !trigger.trim()) return null;
  if (typeof correct_pattern !== "string" || !correct_pattern.trim()) return null;
  if (typeof reasoning !== "string" || !reasoning.trim()) return null;
  let tagArr = [];
  if (Array.isArray(tags)) {
    tagArr = tags.filter((t) => typeof t === "string" && t.trim() !== "");
  }
  const wp = typeof wrong_pattern === "string" ? wrong_pattern : "";
  return {
    category,
    tags: tagArr,
    type,
    nature,
    trigger: trigger.trim(),
    wrong_pattern: wp,
    correct_pattern: correct_pattern.trim(),
    reasoning: reasoning.trim()
  };
}

// ../core/src/importer/rule-structurer.ts
async function structureRuleText(text, callLLM) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return llmBasedKnowledgeExtractor.extract(
    { kind: "rule-text", context: trimmed, weight: DEFAULT_IMPORT_CONFIDENCE },
    callLLM
  );
}
var DEFAULT_IMPORT_CONFIDENCE = 0.7;
async function structureRuleTextsBatch(texts, callLLM, opts = {}) {
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const result = {
    total: texts.length,
    structured: [],
    skipped: 0,
    failed: 0
  };
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) {
      result.skipped++;
      continue;
    }
    try {
      const partial = await structureRuleText(trimmed, callLLM);
      if (partial === null) {
        result.skipped++;
        opts.bus?.emit({
          kind: "importer.skipped",
          source: "importer",
          severity: "info",
          userFacingValue: `\u89C4\u5219\u6587\u672C\u65E0\u6CD5\u7ED3\u6784\u5316: ${truncate2(trimmed, 60)}`,
          timestamp: now().toISOString()
        });
      } else {
        result.structured.push({ sourceText: trimmed, partial });
        opts.bus?.emit({
          kind: "importer.structured",
          source: "importer",
          severity: "highlight",
          userFacingValue: `\u5DF2\u5BFC\u5165: ${truncate2(trimmed, 60)}`,
          timestamp: now().toISOString()
        });
      }
    } catch (err) {
      result.failed++;
      opts.bus?.emit({
        kind: "importer.failed",
        source: "importer",
        severity: "warning",
        userFacingValue: `\u5BFC\u5165\u5931\u8D25 (${String(err).slice(0, 80)}): ${truncate2(trimmed, 40)}`,
        timestamp: now().toISOString()
      });
    }
  }
  return result;
}
function truncate2(s, max) {
  return s.length <= max ? s : s.slice(0, max) + "\u2026";
}

// ../core/src/detect-stack/index.ts
init_esm_shims();
function detectStack(fs) {
  const languages = /* @__PURE__ */ new Set();
  const frameworks = /* @__PURE__ */ new Set();
  const pms = /* @__PURE__ */ new Set();
  const testRunners = /* @__PURE__ */ new Set();
  const other = /* @__PURE__ */ new Set();
  const raw = {};
  const note = (bucket, signal) => {
    if (!raw[bucket]) raw[bucket] = [];
    raw[bucket].push(signal);
  };
  if (fs.exists("pnpm-lock.yaml")) {
    pms.add("pnpm");
    note("packageManagers", "pnpm-lock.yaml");
  }
  if (fs.exists("yarn.lock")) {
    pms.add("yarn");
    note("packageManagers", "yarn.lock");
  }
  if (fs.exists("package-lock.json")) {
    pms.add("npm");
    note("packageManagers", "package-lock.json");
  }
  if (fs.exists("bun.lockb") || fs.exists("bun.lock")) {
    pms.add("bun");
    note("packageManagers", "bun.lock*");
  }
  const pkgJson = fs.read("package.json");
  if (fs.exists("package.json")) {
    languages.add("javascript");
    note("languages", "package.json");
    if (fs.exists("tsconfig.json") || fs.exists("tsconfig.base.json")) {
      languages.add("typescript");
      note("languages", "tsconfig.json");
    }
    if (pkgJson) {
      const deps = extractDeps(pkgJson);
      const has = (name) => deps.includes(name);
      if (has("react")) frameworks.add("react");
      if (has("vue")) frameworks.add("vue");
      if (has("svelte")) frameworks.add("svelte");
      if (has("next")) frameworks.add("next");
      if (has("nuxt")) frameworks.add("nuxt");
      if (has("astro")) frameworks.add("astro");
      if (has("express")) frameworks.add("express");
      if (has("fastify")) frameworks.add("fastify");
      if (has("@nestjs/core")) frameworks.add("nestjs");
      if (has("vitest")) testRunners.add("vitest");
      if (has("jest")) testRunners.add("jest");
      if (has("mocha")) testRunners.add("mocha");
      if (has("playwright") || has("@playwright/test")) testRunners.add("playwright");
      if (has("cypress")) testRunners.add("cypress");
      for (const f of frameworks) note("frameworks", `package.json \u2192 ${f}`);
      for (const t of testRunners) note("testRunners", `package.json \u2192 ${t}`);
    }
  }
  if (fs.exists("pnpm-workspace.yaml")) {
    other.add("monorepo");
    note("otherSignals", "pnpm-workspace.yaml");
  } else if (pkgJson && /"workspaces"\s*:/.test(pkgJson)) {
    other.add("monorepo");
    note("otherSignals", "package.json workspaces");
  }
  if (fs.exists("pyproject.toml")) {
    languages.add("python");
    note("languages", "pyproject.toml");
    const py = fs.read("pyproject.toml") ?? "";
    if (/poetry/.test(py)) pms.add("poetry");
    if (/\[tool\.uv\]/.test(py) || fs.exists("uv.lock")) pms.add("uv");
    if (/pytest/.test(py)) testRunners.add("pytest");
    if (/django/.test(py)) frameworks.add("django");
    if (/fastapi/.test(py)) frameworks.add("fastapi");
    if (/flask/.test(py)) frameworks.add("flask");
  }
  if (fs.exists("requirements.txt")) {
    languages.add("python");
    note("languages", "requirements.txt");
  }
  if (fs.exists("Pipfile")) {
    languages.add("python");
    pms.add("pipenv");
    note("languages", "Pipfile");
  }
  if (fs.exists("go.mod")) {
    languages.add("go");
    note("languages", "go.mod");
  }
  if (fs.exists("Cargo.toml")) {
    languages.add("rust");
    pms.add("cargo");
    note("languages", "Cargo.toml");
  }
  if (fs.exists("pom.xml")) {
    languages.add("java");
    pms.add("maven");
    note("languages", "pom.xml");
  }
  if (fs.exists("build.gradle") || fs.exists("build.gradle.kts")) {
    languages.add("java");
    if (fs.exists("build.gradle.kts")) languages.add("kotlin");
    pms.add("gradle");
    note("languages", "build.gradle");
  }
  if (fs.exists("Dockerfile") || fs.exists("docker-compose.yml")) {
    other.add("docker");
    note("otherSignals", "Dockerfile/compose");
  }
  if (fs.exists(".github/workflows")) {
    other.add("github-actions");
    note("otherSignals", ".github/workflows");
  }
  if (fs.exists("CLAUDE.md")) {
    other.add("claude-code");
    note("otherSignals", "CLAUDE.md");
  }
  if (fs.exists(".cursorrules") || fs.exists(".cursor/rules")) {
    other.add("cursor");
    note("otherSignals", ".cursorrules");
  }
  return {
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    packageManagers: [...pms].sort(),
    testRunners: [...testRunners].sort(),
    otherSignals: [...other].sort(),
    raw
  };
}
function extractDeps(pkgJson) {
  try {
    const obj = JSON.parse(pkgJson);
    const names = /* @__PURE__ */ new Set();
    for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
      const section = obj[key];
      if (section && typeof section === "object") {
        for (const name of Object.keys(section)) names.add(name);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

// ../core/src/init/meta-principles.ts
init_esm_shims();
function getMetaPrinciples(now = () => /* @__PURE__ */ new Date()) {
  const created = now().toISOString();
  return [
    // ── 保留 ──
    makePreset({
      id: "preset-tdd-cycle",
      category: "S",
      tags: ["tdd", "workflow"],
      trigger: "\u5F00\u59CB\u5B9E\u73B0\u4E00\u4E2A\u65B0\u529F\u80FD\u6216\u4FEE bug \u65F6",
      correct: "\u5148\u5199\u5931\u8D25\u6D4B\u8BD5\uFF08\u7EA2\uFF09\u2192 \u5199\u6700\u5C0F\u5B9E\u73B0\uFF08\u7EFF\uFF09\u2192 \u91CD\u6784\uFF08\u5982\u9700\uFF09\u2192 commit\uFF1B\u9A8C\u8BC1\u4EA7\u51FA\uFF08\u8DD1\u6D4B\u8BD5\u3001\u624B\u52A8\u9A8C\u8BC1\uFF09\u540E\u518D\u58F0\u660E\u5B8C\u6210",
      reason: "TDD \u8BA9\u63A5\u53E3\u8BBE\u8BA1\u5148\u884C\uFF1B\u672A\u7ECF\u9A8C\u8BC1\u76F4\u63A5\u58F0\u660E\u5B8C\u6210\u662F\u5E38\u89C1\u9519\u8BEF\uFF0C\u5B9E\u9645\u8F93\u51FA\u4E0E\u9884\u671F\u53EF\u80FD\u504F\u5DEE",
      created
    }),
    makePreset({
      id: "preset-small-commits",
      category: "S",
      tags: ["git", "workflow"],
      trigger: "\u51C6\u5907 git commit \u65F6",
      correct: "\u4E00\u4E2A commit \u53EA\u505A\u4E00\u4EF6\u6982\u5FF5\u4E0A\u5B8C\u6574\u7684\u4E8B\uFF0Ctests \u8981\u8FC7\uFF1Bcommit message \u8BF4\u6E05'\u505A\u4E86\u4EC0\u4E48+\u4E3A\u4EC0\u4E48'",
      reason: "\u5C0F commit \u8BA9 review \u5BB9\u6613\u3001\u56DE\u6EDA\u7C92\u5EA6\u7EC6\u3001git bisect \u6709\u610F\u4E49\uFF1B\u6279\u91CF\u63D0\u4EA4\u4F1A\u8BA9 bug \u5B9A\u4F4D\u53D8\u5669\u68A6",
      created
    }),
    makePreset({
      id: "preset-prefer-edit-over-create",
      category: "S",
      tags: ["scope", "workflow"],
      trigger: "\u51C6\u5907\u65B0\u5EFA\u4E00\u4E2A\u6587\u4EF6\u5B8C\u6210\u67D0\u4EFB\u52A1\u65F6",
      correct: "\u5148\u786E\u8BA4\u9879\u76EE\u91CC\u6709\u6CA1\u6709\u5DF2\u6709\u6587\u4EF6\u80FD\u627F\u8F7D\u8BE5\u6539\u52A8\uFF1B\u4F18\u5148\u7F16\u8F91\u73B0\u6709\u6587\u4EF6\uFF0C\u53EA\u5728\u771F\u7684\u9700\u8981\u65F6\u624D\u65B0\u5EFA",
      reason: "\u4E0D\u5FC5\u8981\u7684\u65B0\u6587\u4EF6\u4F1A\u8BA9 reviewer \u5206\u5FC3\u3001\u8BA9 import \u5173\u7CFB\u590D\u6742\uFF1B\u5927\u591A\u6570\u5C0F\u6539\u52A8\u5E94\u8BE5\u5728\u73B0\u6709\u6A21\u5757\u91CC\u5B8C\u6210",
      created
    }),
    makeCanonicalPreset({
      id: "preset-search-web-before-trusting-memory",
      category: "K",
      tags: ["epistemics", "web-search", "groundedness"],
      trigger: "\u7528\u6237\u63D0\u5230\u4E00\u4E2A\u4F60\u6CA1\u89C1\u8FC7\u6216\u4E0D\u5B8C\u5168\u786E\u5B9A\u7684\u6982\u5FF5\u3001\u5E93\u540D\u3001API\u3001\u672F\u8BED\u65F6",
      correct: "\u4E0D\u8981\u51ED\u8BB0\u5FC6\u4F5C\u7B54\uFF1B\u4F18\u5148\u7528 WebSearch/WebFetch \u6216 mcp \u641C\u7D22\u5DE5\u5177\u9A8C\u8BC1\uFF0C\u518D\u7ED3\u5408\u5F53\u524D\u4EE3\u7801\u4E0A\u4E0B\u6587\u4F5C\u7B54",
      reason: "\u6A21\u578B\u8BB0\u5FC6\u4F1A\u8FC7\u65F6\u6216\u81C6\u9020\uFF08\u5E7B\u89C9\uFF09\uFF1B\u7528\u6237\u7528\u5230\u7684\u65B0\u6982\u5FF5\u5E38\u5728\u8BAD\u7EC3\u6570\u636E\u622A\u6B62\u4E4B\u540E\u51FA\u73B0\u3002\u5148\u641C\u7D22\u518D\u4F5C\u7B54\u53EF\u907F\u514D\u7ED9\u51FA\u9519\u8BEF\u4E8B\u5B9E\u3001\u8BEF\u5BFC\u7528\u6237",
      created
    }),
    // ── 新增 ──
    makePreset({
      id: "preset-audience-adaptive",
      category: "K",
      tags: ["communication", "explanation"],
      trigger: "\u5411\u7528\u6237\u8BB2\u89E3\u6280\u672F\u7CFB\u7EDF\u3001\u65B9\u6848\u3001\u5206\u6790\u7ED3\u679C\u6216\u64CD\u4F5C\u6D41\u7A0B\u65F6",
      correct: "\u5148\u5224\u65AD\u53D7\u4F17\u5C42\u7EA7\uFF1A\u975E\u6280\u672F\u53D7\u4F17\u7ED9\u529F\u80FD\u9AA8\u67B6\uFF08\u505A\u4EC0\u4E48/\u4E3A\u4EC0\u4E48\uFF09\u4E0D\u7ED9\u5B9E\u73B0\u7EC6\u8282\uFF1B\u6280\u672F\u53D7\u4F17\u7ED9\u673A\u5236\u5C42\uFF1B\u6240\u6709\u53D7\u4F17\u90FD\u5148\u7ED3\u8BBA\u540E\u7EC6\u8282\uFF0C\u4ECE\u7B80\u5230\u7E41",
      reason: "\u6280\u672F\u7EC6\u8282\u4F1A\u6DF9\u6CA1\u975E\u6280\u672F\u53D7\u4F17\uFF1B\u8FC7\u5EA6\u7B80\u5316\u4F1A\u6D6A\u8D39\u6280\u672F\u53D7\u4F17\u65F6\u95F4\uFF1B\u5148\u5339\u914D\u53D7\u4F17\u5FC3\u667A\u6A21\u578B\u518D\u8C03\u6574\u6DF1\u5EA6\uFF0C\u662F\u6700\u9AD8\u6548\u7684\u8BB2\u89E3\u8DEF\u5F84",
      created
    }),
    makePreset({
      id: "preset-execute-not-analyze",
      category: "S",
      tags: ["execution", "workflow"],
      trigger: "\u6536\u5230\u660E\u786E\u7684\u6267\u884C\u7C7B\u4EFB\u52A1\uFF08\u4FEE bug\u3001\u5B9E\u73B0\u529F\u80FD\u3001\u591A\u6B65\u5DE5\u4F5C\u6D41\u3001\u6279\u91CF\u5904\u7406\uFF09\u65F6",
      correct: "\u6267\u884C\u5B8C\u6574\u5E8F\u5217\u5230\u5E95\uFF0C\u4E0D\u8981\u5728\u5206\u6790/\u6C47\u62A5\u9636\u6BB5\u505C\u4E0B\u7B49\u5F85\u786E\u8BA4\uFF1B\u53EA\u5728\u9047\u5230\u4E0D\u53EF\u9006\u64CD\u4F5C\uFF08\u5220\u5E93\u3001force push\uFF09\u6216\u771F\u6B63\u65E0\u6CD5\u89E3\u51B3\u7684\u6B67\u4E49\u65F6\u624D\u6682\u505C",
      reason: "\u7528\u6237\u671F\u671B AI \u4E3B\u52A8\u63A8\u8FDB\u5DE5\u4F5C\uFF1B\u9891\u7E41\u505C\u4E0B'\u5148\u62A5\u544A''\u5148\u5BF9\u9F50'\u4F1A\u5272\u88C2\u4E0A\u4E0B\u6587\u3001\u964D\u4F4E\u6548\u7387\uFF1B\u5B8C\u6574\u6267\u884C\u518D\u62A5\u7ED3\u679C\u662F\u66F4\u597D\u7684\u8282\u594F",
      created
    }),
    makePreset({
      id: "preset-read-before-asserting",
      category: "K",
      tags: ["groundedness", "file-access"],
      trigger: "\u5373\u5C06\u65AD\u8A00\u67D0\u6587\u4EF6/\u529F\u80FD/\u6A21\u5757\u4E0D\u5B58\u5728\uFF0C\u6216\u58F0\u79F0\u300C\u8BA1\u5212\u6587\u6863\u8FD8\u6CA1\u5B9E\u73B0\u300D\u300C\u8FD9\u4E2A\u8DEF\u5F84\u6CA1\u6709\u5185\u5BB9\u300D\u65F6",
      correct: "\u5148\u7528 Read \u5DE5\u5177\u8BFB\u53D6\u7528\u6237\u6307\u5411\u7684\u8DEF\u5F84\uFF0C\u4EE5\u5B9E\u9645\u6587\u4EF6\u5185\u5BB9\u4E3A\u51C6\uFF0C\u518D\u57FA\u4E8E\u771F\u5B9E\u5185\u5BB9\u63A8\u8FDB\uFF1B\u4E0D\u8981\u51ED\u5370\u8C61\u6216\u5BF9\u8BDD\u5386\u53F2\u65AD\u8A00\u5B58\u5728\u6027",
      reason: "AI \u65AD\u8A00\u6587\u4EF6\u4E0D\u5B58\u5728\u4F46\u7528\u6237\u5DF2\u6307\u5411\u5177\u4F53\u8DEF\u5F84\u662F\u5E38\u89C1\u9519\u8BEF\uFF1B\u5B9E\u9645\u6587\u4EF6\u53EF\u80FD\u5DF2\u7ECF\u5B58\u5728\u6216\u5DF2\u5B9E\u73B0\uFF0C\u51ED\u5370\u8C61\u65AD\u8A00\u4F1A\u8BEF\u5BFC\u7528\u6237\u5E76\u6D6A\u8D39\u8C03\u8BD5\u65F6\u95F4",
      created
    }),
    makePreset({
      id: "preset-full-pipeline-for-complex",
      category: "S",
      tags: ["workflow", "architecture", "planning"],
      trigger: "\u9762\u5BF9\u591A\u7EC4\u4EF6\u3001\u591A\u9636\u6BB5\u7684\u590D\u6742\u65B0\u529F\u80FD\u6216\u7CFB\u7EDF\u6539\u9020\u65F6",
      correct: "\u8C03\u7814 \u2192 brainstorm+\u9700\u6C42\u786E\u8BA4 \u2192 \u8BBE\u8BA1\u6587\u6863 \u2192 \u5B9E\u73B0\u8BA1\u5212 \u2192 \u6267\u884C\uFF1B\u4E0D\u5F97\u8DF3\u8FC7\u524D\u671F\u8BBE\u8BA1\u76F4\u63A5\u5199\u4EE3\u7801",
      reason: "\u8DF3\u8FC7\u524D\u671F\u8BBE\u8BA1\u76F4\u63A5\u5B9E\u73B0\u4F1A\u5BFC\u81F4\u67B6\u6784\u8FD4\u5DE5\uFF1B\u5B8C\u6574\u6D41\u6C34\u7EBF\u786E\u4FDD\u9700\u6C42\u5BF9\u9F50\u540E\u518D\u62C6\u4EFB\u52A1\uFF0C\u6267\u884C\u65F6\u8FB9\u754C\u6E05\u6670\u3001\u51CF\u5C11\u53CD\u590D",
      created
    })
  ];
}
function makePreset(args) {
  return {
    id: args.id,
    scope: { level: "global" },
    category: args.category,
    tags: args.tags,
    type: "practice",
    nature: "subjective",
    trigger: args.trigger,
    wrong_pattern: "",
    correct_pattern: args.correct,
    reasoning: args.reason,
    confidence: 0.6,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: args.created,
    last_hit_at: "",
    last_validated_at: args.created,
    source: "preset",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    // M4-A: meta principles are abstract guidance (no literal wrong_pattern),
    // so they live in passive-knowledge channel — CLAUDE.md only, no runtime hook.
    channel: "passive-knowledge"
  };
}
function makeCanonicalPreset(args) {
  return {
    ...makePreset(args),
    confidence: 0.95,
    enforcement: "warn",
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: args.created
  };
}

// ../core/src/init/default-plugins.ts
init_esm_shims();
var DEFAULT_MARKETPLACES = [
  { name: "claude-plugins-official", repo: "anthropics/claude-plugins-official" }
];
var DEFAULT_PLUGINS = [
  { plugin: "playground", marketplace: "claude-plugins-official" },
  { plugin: "claude-code-setup", marketplace: "claude-plugins-official" },
  { plugin: "code-review", marketplace: "claude-plugins-official" },
  { plugin: "code-simplifier", marketplace: "claude-plugins-official" },
  { plugin: "commit-commands", marketplace: "claude-plugins-official" },
  { plugin: "frontend-design", marketplace: "claude-plugins-official" }
];
function parsePluginSpec(raw) {
  const spec = raw.trim();
  const atIdx = spec.indexOf("@");
  if (atIdx <= 0 || atIdx === spec.length - 1) {
    throw new Error(`invalid plugin spec: "${raw}" (expected "plugin@marketplace")`);
  }
  return {
    plugin: spec.slice(0, atIdx),
    marketplace: spec.slice(atIdx + 1)
  };
}
function formatPluginSpec(p) {
  return `${p.plugin}@${p.marketplace}`;
}

// ../core/src/calibrator/default.ts
init_esm_shims();
var W_PRE_BLOCKED = 0.05;
var W_PRE_WARNED = 0.02;
var W_POST_SUCCESS_AFTER_FIRE = 0.03;
var W_POST_FAIL_AFTER_BLOCK = -0.1;
var W_STREAK_BONUS = 0.05;
var STREAK_THRESHOLD = 5;
var ARCHIVE_THRESHOLD = 0.3;
function normalize2(n) {
  if (n <= 0) return 0;
  return Math.log2(1 + n);
}
function isDocOrTestContext(event) {
  const fp = event.tool?.input?.file_path;
  if (typeof fp !== "string" || fp.length === 0) return false;
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(fp)) return true;
  if (/(?:^|[/\\])(docs?|__tests__|tests?|spec|specs|fixtures?|examples?)(?:[/\\]|$)/i.test(
    fp
  )) {
    return true;
  }
  if (fp.includes("/.teamagent/") || fp.includes("\\.teamagent\\")) return true;
  return false;
}
var defaultCalibrator = {
  calibrate(entry, events) {
    const ourEvents = events.filter((e) => e.knowledge_id === entry.id);
    const signals = [];
    const blockedAll = ourEvents.filter((e) => e.kind === "hook-pre.blocked");
    const warnedAll = ourEvents.filter((e) => e.kind === "hook-pre.warned");
    const blockedReal = blockedAll.filter((e) => !isDocOrTestContext(e));
    const blockedDoc = blockedAll.filter((e) => isDocOrTestContext(e));
    const warnedReal = warnedAll.filter((e) => !isDocOrTestContext(e));
    const warnedDoc = warnedAll.filter((e) => isDocOrTestContext(e));
    if (blockedReal.length > 0) {
      signals.push({
        kind: "hook-pre.blocked",
        weight: W_PRE_BLOCKED * normalize2(blockedReal.length),
        event_ids: blockedReal.map((e) => e.id)
      });
    }
    if (blockedDoc.length > 0) {
      signals.push({
        kind: "hook-pre.blocked.doc_context",
        weight: -W_PRE_BLOCKED * normalize2(blockedDoc.length),
        event_ids: blockedDoc.map((e) => e.id)
      });
    }
    if (warnedReal.length > 0) {
      signals.push({
        kind: "hook-pre.warned",
        weight: W_PRE_WARNED * normalize2(warnedReal.length),
        event_ids: warnedReal.map((e) => e.id)
      });
    }
    if (warnedDoc.length > 0) {
      signals.push({
        kind: "hook-pre.warned.doc_context",
        weight: -W_PRE_WARNED * normalize2(warnedDoc.length),
        event_ids: warnedDoc.map((e) => e.id)
      });
    }
    const postEvents = ourEvents.filter((e) => e.kind === "hook-post.result");
    const preFireByToolUseId = /* @__PURE__ */ new Map();
    for (const e of ourEvents) {
      if ((e.kind === "hook-pre.matched" || e.kind === "hook-pre.warned" || e.kind === "hook-pre.blocked") && e.tool_use_id) {
        preFireByToolUseId.set(e.tool_use_id, e);
      }
    }
    const successAfterFire = [];
    const failAfterBlock = [];
    for (const post of postEvents) {
      if (!post.tool_use_id) continue;
      const pre = preFireByToolUseId.get(post.tool_use_id);
      if (!pre) continue;
      if (post.result?.succeeded === true) {
        successAfterFire.push(post);
      } else if (post.result?.succeeded === false && pre.kind === "hook-pre.blocked") {
        failAfterBlock.push(post);
      }
    }
    if (successAfterFire.length > 0) {
      signals.push({
        kind: "post.success_after_fire",
        weight: W_POST_SUCCESS_AFTER_FIRE * normalize2(successAfterFire.length),
        event_ids: successAfterFire.map((e) => e.id)
      });
    }
    if (failAfterBlock.length > 0) {
      signals.push({
        kind: "post.fail_after_block",
        weight: W_POST_FAIL_AFTER_BLOCK * normalize2(failAfterBlock.length),
        event_ids: failAfterBlock.map((e) => e.id)
      });
    }
    if (successAfterFire.length >= STREAK_THRESHOLD && failAfterBlock.length === 0) {
      signals.push({
        kind: "streak_bonus",
        weight: W_STREAK_BONUS
      });
    }
    const totalDelta = signals.reduce((s, sig) => s + sig.weight, 0);
    const rawNewConf = entry.confidence + totalDelta;
    const newConfidence = Math.max(0, Math.min(1, rawNewConf));
    let newStatus = entry.status;
    if (entry.status === "active" && newConfidence < ARCHIVE_THRESHOLD) {
      newStatus = "archived";
    }
    return {
      confidence: newConfidence,
      status: newStatus,
      delta: newConfidence - entry.confidence,
      applied_signals: signals
    };
  }
};

// ../core/src/pipeline/calibration-pipeline.ts
init_esm_shims();
async function runCalibrationPipeline(deps) {
  const allEntries = deps.store.getAll();
  const eventsByKnowledgeId = indexEventsByKnowledgeId(deps.events);
  const adjusted = [];
  const archivedNew = [];
  for (const entry of allEntries) {
    if (entry.status !== "active") continue;
    const entryEvents = eventsByKnowledgeId.get(entry.id) ?? [];
    if (entryEvents.length === 0) continue;
    const result = deps.calibrator.calibrate(entry, entryEvents);
    if (result.delta === 0 && result.status === entry.status) continue;
    deps.store.update(entry.id, {
      confidence: result.confidence,
      status: result.status,
      last_validated_at: deps.now().toISOString()
    });
    adjusted.push({
      knowledge_id: entry.id,
      before: entry.confidence,
      after: result.confidence,
      delta: result.delta,
      status_before: entry.status,
      status_after: result.status,
      signals: result.applied_signals
    });
    if (result.status === "archived" && entry.status === "active") {
      archivedNew.push(entry.id);
    }
    deps.bus?.emit({
      kind: "calibrator.adjusted",
      source: "calibrator",
      knowledgeId: entry.id,
      confidenceBefore: entry.confidence,
      confidenceAfter: result.confidence,
      statusBefore: entry.status,
      statusAfter: result.status,
      severity: result.status === "archived" && entry.status === "active" ? "warning" : "info",
      userFacingValue: result.status === "archived" && entry.status === "active" ? `${entry.id} \u81EA\u52A8\u5F52\u6863\uFF08confidence ${entry.confidence.toFixed(2)} \u2192 ${result.confidence.toFixed(2)}\uFF09` : `${entry.id} confidence ${entry.confidence.toFixed(2)} \u2192 ${result.confidence.toFixed(2)} (${result.delta > 0 ? "+" : ""}${result.delta.toFixed(2)})`,
      timestamp: deps.now().toISOString()
    });
  }
  return {
    scanned: allEntries.length,
    adjusted,
    archivedNew
  };
}
function indexEventsByKnowledgeId(events) {
  const idx = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (!e.knowledge_id) continue;
    const list = idx.get(e.knowledge_id);
    if (list) list.push(e);
    else idx.set(e.knowledge_id, [e]);
  }
  return idx;
}

// ../core/src/scenario/runner.ts
init_esm_shims();

// ../core/src/pipeline/extract-pipeline.ts
init_esm_shims();
import { createHash } from "crypto";

// ../core/src/pipeline/semantic-descriptions.ts
init_esm_shims();
function buildSemanticDescriptions(source) {
  const trigger = source.trigger?.trim() || "Apply this rule when the current task matches the stored rule context.";
  const wrong = source.wrong_pattern?.trim() ?? "";
  const correct = source.correct_pattern?.trim() ?? "";
  const reason = source.reasoning?.trim() ?? "";
  return {
    trigger_description: [trigger, reason].filter(Boolean).join(" "),
    pattern_description: wrong ? [`Using or producing ${wrong}.`, correct ? `Prefer ${correct}.` : "", reason].filter(Boolean).join(" ") : [correct || trigger, reason].filter(Boolean).join(" ")
  };
}

// ../core/src/pipeline/extract-pipeline.ts
function momentSignature(moment) {
  const parts = [
    String(moment.turnIndex),
    moment.signal,
    (moment.correctionText ?? "").slice(0, 200),
    (moment.previousAssistantText ?? "").slice(0, 200)
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
async function runExtractPipeline(session, deps) {
  const corrections = deps.detector.detect(session);
  const result = {
    correctionsFound: corrections.length,
    extracted: [],
    skipped: 0,
    failed: 0,
    rejected: [],
    deduped: 0
  };
  for (const moment of corrections) {
    const signature = momentSignature(moment);
    if (deps.isMomentSeen && deps.isMomentSeen(signature)) {
      result.deduped++;
      emit(deps.bus, {
        kind: "extractor.deduped",
        source: "extractor",
        count: 1,
        severity: "info",
        userFacingValue: `\u5DF2\u5728\u5386\u53F2 run \u4E2D\u5904\u7406\u8FC7\uFF08turn ${moment.turnIndex}\uFF09`,
        timestamp: isoNow(deps.now)
      });
      continue;
    }
    const context = formatCorrectionContext(moment);
    try {
      const partial = await deps.extractor.extract(
        { kind: "correction", context, weight: moment.weight },
        deps.callLLM
      );
      if (partial === null) {
        result.skipped++;
        deps.markMomentSeen?.(signature);
        emit(deps.bus, {
          kind: "extractor.skipped",
          source: "extractor",
          count: 1,
          severity: "info",
          userFacingValue: `\u7EA0\u6B63\u4FE1\u53F7\u4E0D\u8DB3\uFF0C\u672A\u63D0\u53D6\uFF08turn ${moment.turnIndex}\uFF09`,
          timestamp: isoNow(deps.now)
        });
        continue;
      }
      const entry = assembleEntry(partial, moment, deps);
      if (deps.validator) {
        const l0 = deps.validator.validateLevel0({
          entry,
          sourceText: context,
          existingRules: deps.store.getAll().map((r) => ({
            id: r.id,
            trigger: r.trigger,
            wrong_pattern: r.wrong_pattern
          })),
          projectStack: deps.projectStack ?? []
        });
        if (!l0.ok) {
          result.rejected.push({ entry, reasons: l0.failed_checks });
          deps.markMomentSeen?.(signature);
          if (deps.rejectionLog) {
            try {
              await deps.rejectionLog(entry, l0);
            } catch {
            }
          }
          emit(deps.bus, {
            kind: "extractor.rejected-l0",
            source: "extractor",
            knowledgeId: entry.id,
            count: 1,
            severity: "info",
            userFacingValue: `L0 \u62D2\u7EDD\uFF1A${l0.failed_checks.join(", ")}`,
            timestamp: isoNow(deps.now)
          });
          continue;
        }
      }
      if (deps.store.addWithEmbedding) {
        await deps.store.addWithEmbedding(entry);
      } else {
        deps.store.add(entry);
      }
      result.extracted.push(entry);
      deps.markMomentSeen?.(signature);
      emit(deps.bus, {
        kind: "extractor.extracted",
        source: "extractor",
        knowledgeId: entry.id,
        count: 1,
        severity: "highlight",
        userFacingValue: `\u5B66\u5230\uFF1A${entry.trigger} \u2192 ${entry.correct_pattern}`,
        timestamp: isoNow(deps.now)
      });
    } catch (err) {
      result.failed++;
      emit(deps.bus, {
        kind: "extractor.failed",
        source: "extractor",
        count: 1,
        severity: "warning",
        userFacingValue: `\u63D0\u53D6\u5931\u8D25\uFF08turn ${moment.turnIndex}\uFF09: ${String(err).slice(0, 120)}`,
        timestamp: isoNow(deps.now)
      });
    }
  }
  if (deps.recompile) {
    try {
      await deps.recompile(deps.store.getActive());
      emit(deps.bus, {
        kind: "compiler.recompiled",
        source: "compiler",
        count: result.extracted.length,
        severity: "info",
        userFacingValue: `CLAUDE.md \u5DF2\u6309\u65B0\u77E5\u8BC6\u91CD\u7F16\u8BD1\uFF08+${result.extracted.length}\uFF09`,
        timestamp: isoNow(deps.now)
      });
    } catch (err) {
      emit(deps.bus, {
        kind: "compiler.failed",
        source: "compiler",
        severity: "warning",
        userFacingValue: `\u91CD\u7F16\u8BD1\u5931\u8D25: ${String(err).slice(0, 120)}`,
        timestamp: isoNow(deps.now)
      });
    }
  }
  return result;
}
function formatCorrectionContext(moment) {
  const tools = moment.previousToolCalls.length ? `[AI \u4E4B\u524D\u8C03\u7528\u7684\u5DE5\u5177: ${moment.previousToolCalls.join(", ")}]
` : "";
  return [
    `[\u4FE1\u53F7: ${moment.signal}, \u6743\u91CD: ${moment.weight.toFixed(2)}]`,
    moment.previousAssistantText ? `AI \u4E4B\u524D\u8BF4: ${truncate3(moment.previousAssistantText, 600)}` : "",
    tools,
    `\u7528\u6237\u7EA0\u6B63: ${truncate3(moment.correctionText, 600)}`
  ].filter(Boolean).join("\n");
}
var DEFAULT_CODE_FILE_TYPES = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.mjs",
  "*.cjs",
  "*.py",
  "*.go",
  "*.rs",
  "*.java",
  "*.kt",
  "*.c",
  "*.cpp",
  "*.h",
  "*.hpp",
  "*.sh",
  "*.bash",
  "*.rb",
  "*.php",
  "*.cs",
  "*.json",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.sql"
];
function assembleEntry(partial, moment, deps) {
  const confidence = moment.weight;
  const nature = partial.nature ?? "subjective";
  const enforcement = computeEnforcement(confidence, nature);
  const nowIso = isoNow(deps.now);
  const descriptions = buildSemanticDescriptions({
    trigger: partial.trigger,
    wrong_pattern: partial.wrong_pattern,
    correct_pattern: partial.correct_pattern,
    reasoning: partial.reasoning
  });
  const scopeHasExplicitRange = deps.scope.paths && deps.scope.paths.length > 0 || deps.scope.file_types && deps.scope.file_types.length > 0;
  const scope = scopeHasExplicitRange ? deps.scope : { ...deps.scope, paths: ["**/*"], file_types: [...DEFAULT_CODE_FILE_TYPES] };
  return {
    id: deps.idGen(),
    scope,
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: {
      success_sessions: 0,
      success_users: 0,
      correction_sessions: 1
    },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: deps.source ?? "accumulated",
    conflict_with: [],
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    trigger_description: partial.trigger_description ?? descriptions.trigger_description,
    pattern_description: partial.pattern_description ?? descriptions.pattern_description,
    fire_threshold: partial.fire_threshold ?? DEFAULT_FIRE_THRESHOLD,
    threshold_alpha: partial.threshold_alpha ?? 1,
    threshold_beta: partial.threshold_beta ?? 1,
    embedder_model_id: partial.embedder_model_id ?? ""
  };
}
function emit(bus, event) {
  if (!bus) return;
  try {
    bus.emit(event);
  } catch {
  }
}
function isoNow(now) {
  return now().toISOString();
}
function truncate3(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\u2026";
}

// ../core/src/scenario/runner.ts
async function runScenario(scenario, deps) {
  const errors = [];
  const result = {
    scenarioId: scenario.id,
    passed: false,
    phaseA: {
      detectorCalled: false,
      correctionsFound: 0,
      expectedMatches: [],
      passed: false
    },
    phaseB: {
      extractorCalled: false,
      ruleGenerated: false,
      rulePredicates: [],
      passed: false
    },
    phaseC: {
      matcherCalled: false,
      actualBehavior: "no-match",
      expectedBehavior: scenario.phaseC.expectedBehavior,
      passed: false
    },
    prr: 0,
    kp: 0,
    errors
  };
  let corrections;
  try {
    corrections = deps.detector.detect(scenario.phaseA.session);
    result.phaseA.detectorCalled = true;
    result.phaseA.correctionsFound = corrections.length;
  } catch (err) {
    errors.push(`Phase A detector threw: ${String(err)}`);
    return result;
  }
  result.phaseA.expectedMatches = scenario.phaseA.expectedCorrections.map(
    (exp) => ({
      signal: exp.signal,
      matched: corrections.some(
        (c) => c.signal === exp.signal && (exp.minWeight === void 0 || c.weight >= exp.minWeight) && (exp.turnIndex === void 0 || c.turnIndex === exp.turnIndex)
      )
    })
  );
  result.phaseA.passed = result.phaseA.expectedMatches.every((m) => m.matched);
  const store = deps.makeStore();
  let counter = 0;
  const idGen = deps.idGen ?? (() => `scenario-${scenario.id}-${++counter}`);
  let pipelineResult;
  try {
    pipelineResult = await runExtractPipeline(scenario.phaseA.session, {
      detector: deps.detector,
      extractor: deps.extractor,
      callLLM: async () => scenario.phaseB.mockLLMResponse,
      store,
      scope: { level: "team" },
      now: deps.now,
      idGen
    });
    result.phaseB.extractorCalled = true;
    result.phaseB.ruleGenerated = pipelineResult.extracted.length > 0;
  } catch (err) {
    errors.push(`Phase B pipeline threw: ${String(err)}`);
    return result;
  }
  const newRule = pipelineResult.extracted[0];
  if (newRule) {
    const exp = scenario.phaseB.expectedRule;
    const checks = [];
    if (exp.categoryEquals !== void 0) {
      checks.push({
        predicate: `category == ${exp.categoryEquals}`,
        passed: newRule.category === exp.categoryEquals
      });
    }
    if (exp.typeEquals !== void 0) {
      checks.push({
        predicate: `type == ${exp.typeEquals}`,
        passed: newRule.type === exp.typeEquals
      });
    }
    if (exp.natureEquals !== void 0) {
      checks.push({
        predicate: `nature == ${exp.natureEquals}`,
        passed: newRule.nature === exp.natureEquals
      });
    }
    if (exp.triggerContains !== void 0) {
      checks.push({
        predicate: `trigger contains "${exp.triggerContains}"`,
        passed: newRule.trigger.includes(exp.triggerContains)
      });
    }
    if (exp.wrongPatternContains !== void 0) {
      checks.push({
        predicate: `wrong_pattern contains "${exp.wrongPatternContains}"`,
        passed: (newRule.wrong_pattern ?? "").includes(exp.wrongPatternContains)
      });
    }
    if (exp.correctPatternContains !== void 0) {
      checks.push({
        predicate: `correct_pattern contains "${exp.correctPatternContains}"`,
        passed: newRule.correct_pattern.includes(exp.correctPatternContains)
      });
    }
    if (exp.reasoningContains !== void 0) {
      checks.push({
        predicate: `reasoning contains "${exp.reasoningContains}"`,
        passed: newRule.reasoning.includes(exp.reasoningContains)
      });
    }
    result.phaseB.rulePredicates = checks;
    result.phaseB.passed = checks.length > 0 && checks.every((c) => c.passed);
  }
  try {
    const activeRules = store.getActive();
    const matches = matchRules(
      {
        toolName: scenario.phaseC.toolCall.toolName,
        input: scenario.phaseC.toolCall.input
      },
      activeRules
    );
    result.phaseC.matcherCalled = true;
    if (matches.length === 0) {
      result.phaseC.actualBehavior = "no-match";
    } else {
      result.phaseC.actualBehavior = matches[0].enforcement;
    }
    result.phaseC.passed = result.phaseC.actualBehavior === scenario.phaseC.expectedBehavior;
  } catch (err) {
    errors.push(`Phase C matcher threw: ${String(err)}`);
  }
  result.prr = result.phaseC.passed ? 100 : 0;
  if (result.phaseB.rulePredicates.length > 0) {
    const passedCount = result.phaseB.rulePredicates.filter((c) => c.passed).length;
    result.kp = passedCount / result.phaseB.rulePredicates.length * 5;
  }
  result.passed = result.phaseA.passed && result.phaseB.passed && result.phaseC.passed;
  return result;
}
async function runVerify(scenarios, deps) {
  const results = [];
  for (const s of scenarios) {
    results.push(await runScenario(s, deps));
  }
  const passed = results.filter((r) => r.passed).length;
  const avgPRR = results.length > 0 ? results.reduce((s, r) => s + r.prr, 0) / results.length : 0;
  const avgKP = results.length > 0 ? results.reduce((s, r) => s + r.kp, 0) / results.length : 0;
  return {
    total: results.length,
    passed,
    scenarios: results,
    averagePRR: avgPRR,
    averageKP: avgKP
  };
}
function entryFromPartial(partial, id, now) {
  const confidence = partial.confidence ?? 0.7;
  const nature = partial.nature ?? "subjective";
  const nowIso = now().toISOString();
  return {
    id,
    scope: { level: "team" },
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement: computeEnforcement(confidence, nature),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action"
  };
}

// ../core/src/calibrator/v2/index.ts
init_esm_shims();

// ../core/src/calibrator/v2/wilson.ts
init_esm_shims();
var HALF_LIFE_DAYS = {
  experimental: 30,
  probation: 45,
  stable: 60,
  canonical: 75,
  enforced: 90
};
var DAY_MS = 24 * 3600 * 1e3;
var Z = 1.96;
function computeConfidence(observations, maxTierEver, now) {
  if (observations.length === 0) return 0;
  const tier = maxTierEver === "dormant" ? "experimental" : maxTierEver;
  const halfLife = HALF_LIFE_DAYS[tier];
  const lambda = Math.LN2 / halfLife;
  let weightedSuccess = 0;
  let weightedFailure = 0;
  for (const o of observations) {
    const tsMs = new Date(o.timestamp).getTime();
    if (!Number.isFinite(tsMs)) continue;
    const daysAgo = (now.getTime() - tsMs) / DAY_MS;
    const w = Math.exp(-lambda * Math.max(0, daysAgo));
    if (o.outcome === "success") weightedSuccess += w;
    else weightedFailure += w;
  }
  const n = weightedSuccess + weightedFailure;
  if (n === 0) return 0;
  const p = weightedSuccess / n;
  const wilson = (p + Z * Z / (2 * n) - Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n))) / (1 + Z * Z / n);
  return Math.max(0, Math.min(1, wilson));
}

// ../core/src/calibrator/v2/demerit.ts
init_esm_shims();
var DAY_MS2 = 24 * 3600 * 1e3;
var DEMERIT_HALF_LIFE_DAYS = {
  experimental: 7,
  probation: 10,
  stable: 14,
  canonical: 21,
  enforced: 28
};
var DEMERIT_BASE_BY_TIER = {
  experimental: 1,
  probation: 2,
  stable: 3,
  canonical: 5,
  enforced: 10
};
function computeDemerit(input, events, now) {
  const breakdown = [];
  const tier = input.current_tier === "dormant" ? "experimental" : input.current_tier;
  let d = input.current;
  if (d > 0 && input.last_updated) {
    const daysSince = Math.max(0, (now.getTime() - new Date(input.last_updated).getTime()) / DAY_MS2);
    if (daysSince > 0) {
      const lambda = Math.LN2 / DEMERIT_HALF_LIFE_DAYS[tier];
      const decayed = d * Math.exp(-lambda * daysSince);
      breakdown.push({
        type: "demerit_decay",
        days_since: daysSince,
        demerit_delta: decayed - d,
        note: `half-life=${DEMERIT_HALF_LIFE_DAYS[tier]}d at tier=${tier}`
      });
      d = decayed;
    }
  }
  for (const e of events) {
    const base = DEMERIT_BASE_BY_TIER[tier];
    const cappedConf = Math.min(input.confidence, 0.99);
    const multiplier = Math.max(1, -Math.log(1 - cappedConf));
    const userOverride = e.source === "user_reject" ? 10 : 0;
    const delta = base * multiplier + userOverride;
    breakdown.push({
      type: "demerit_added",
      demerit_delta: delta,
      note: `source=${e.source}, base=${base}, mult=${multiplier.toFixed(2)}, override=+${userOverride}`
    });
    d += delta;
  }
  return { demerit: Math.max(0, d), breakdown };
}

// ../core/src/calibrator/v2/tier.ts
init_esm_shims();
var TIER_ORDER = [
  "experimental",
  "probation",
  "stable",
  "canonical",
  "enforced"
];
function tierFromConfidence(conf) {
  if (conf < 0.3) return "experimental";
  if (conf < 0.55) return "probation";
  if (conf < 0.75) return "stable";
  if (conf < 0.9) return "canonical";
  return "enforced";
}
function tierFromDemerit(demerit, currentTier) {
  if (demerit >= 50) return "dormant";
  const activeTier = currentTier === "dormant" ? "experimental" : currentTier;
  const idx = TIER_ORDER.indexOf(activeTier);
  if (idx === -1) return currentTier;
  let demote = 0;
  if (demerit >= 15) demote = 2;
  else if (demerit >= 5) demote = 1;
  if (demote === 0) return "enforced";
  return TIER_ORDER[Math.max(0, idx - demote)];
}
function effectiveTier(confidence, demerit, currentTier) {
  const byConf = tierFromConfidence(confidence);
  const byDemerit = tierFromDemerit(demerit, currentTier);
  if (byDemerit === "dormant") return "dormant";
  const confIdx = TIER_ORDER.indexOf(byConf);
  const demIdx = TIER_ORDER.indexOf(byDemerit);
  return TIER_ORDER[Math.min(confIdx, demIdx)];
}

// ../core/src/calibrator/v2/hysteresis.ts
init_esm_shims();
var DAY_MS3 = 24 * 3600 * 1e3;
var MIN_OBS_FOR_PROMOTION = 10;
var MIN_DAYS_FOR_DEMOTION = 7;
var MAX_DEMERIT_FOR_PROMOTION = 2.5;
function tierRank(t) {
  if (t === "dormant") return -1;
  return TIER_ORDER.indexOf(t);
}
function applyHysteresis(input) {
  const cur = input.current_tier;
  const cand = input.candidate_tier;
  if (cur === cand) return { final_tier: cur };
  if (cand === "dormant") return { final_tier: "dormant" };
  if (cur === "dormant") return { final_tier: cand };
  const curRank = tierRank(cur);
  const candRank = tierRank(cand);
  if (candRank > curRank) {
    if (input.observation_count_in_current_tier < MIN_OBS_FOR_PROMOTION) {
      return {
        final_tier: cur,
        blocked_reason: `need >= ${MIN_OBS_FOR_PROMOTION} observations in current tier (have ${input.observation_count_in_current_tier})`
      };
    }
    if (input.demerit >= MAX_DEMERIT_FOR_PROMOTION) {
      return {
        final_tier: cur,
        blocked_reason: `demerit ${input.demerit.toFixed(2)} >= promotion threshold ${MAX_DEMERIT_FOR_PROMOTION}`
      };
    }
    return { final_tier: cand };
  }
  if (input.demerit >= 30) return { final_tier: cand };
  const enteredMs = input.tier_entered_at ? new Date(input.tier_entered_at).getTime() : input.now.getTime();
  const daysSince = (input.now.getTime() - enteredMs) / DAY_MS3;
  if (daysSince < MIN_DAYS_FOR_DEMOTION) {
    return {
      final_tier: cur,
      blocked_reason: `demotion requires >= 7 days in current tier (${daysSince.toFixed(1)} days so far)`
    };
  }
  return { final_tier: cand };
}

// ../core/src/calibrator/v2/index.ts
var DEMERIT_KIND_TO_SOURCE = {
  "ai.override.ignored": "ai_override_ignored",
  // M3: block 被绕路 → 复用 ai_override_ignored 权重（demerit base 一致）
  "ai.override.blocked_circumvented": "ai_override_ignored",
  // M4-A: AI 被注入警告后下一轮又说了同类话术 → 教育失败，复用 ignored 权重
  "ai.narrative.recurred": "ai_override_ignored",
  "calibrator.user_reject": "user_reject",
  "validator.failure": "validator_fail"
};
function eventsToDemeritEvents(events, knowledgeId) {
  const out = [];
  for (const e of events) {
    if (e.knowledge_id !== knowledgeId) continue;
    const source = DEMERIT_KIND_TO_SOURCE[e.kind];
    if (!source) continue;
    out.push({ source, timestamp: e.timestamp });
  }
  return out;
}
function statusFromTier(oldStatus, tier) {
  if (tier === "dormant") return "dormant";
  if (oldStatus === "conflict" || oldStatus === "stale") return oldStatus;
  return "active";
}
var v2Calibrator = {
  calibrate(entry, input) {
    const ownObs = input.observations.filter(
      (o) => o.knowledge_id === entry.id
    );
    const newConfidence = ownObs.length > 0 ? computeConfidence(ownObs, entry.max_tier_ever, input.now) : entry.confidence;
    const demeritEvents = eventsToDemeritEvents(input.events, entry.id);
    const demeritRes = computeDemerit(
      {
        current: entry.demerit,
        last_updated: entry.demerit_last_updated,
        current_tier: entry.current_tier,
        // Penalize surprise against the rule's confidence before this calibration.
        // Synthetic ignored failures may drop Wilson confidence in the same pass.
        confidence: entry.confidence
      },
      demeritEvents,
      input.now
    );
    const candidate = effectiveTier(newConfidence, demeritRes.demerit, entry.current_tier);
    const enteredAt = entry.tier_entered_at || entry.created_at;
    const obsInCurrentTier = ownObs.filter(
      (o) => new Date(o.timestamp) >= new Date(enteredAt)
    ).length;
    const hys = applyHysteresis({
      current_tier: entry.current_tier,
      candidate_tier: candidate,
      confidence: newConfidence,
      demerit: demeritRes.demerit,
      tier_entered_at: enteredAt,
      observation_count_in_current_tier: obsInCurrentTier,
      now: input.now
    });
    const breakdown = [];
    if (ownObs.length > 0) {
      breakdown.push({
        type: "obs_added",
        weight: ownObs.length,
        conf_delta: newConfidence - entry.confidence,
        note: `${ownObs.length} observations \u2192 Wilson LB`
      });
    }
    breakdown.push(...demeritRes.breakdown);
    const tierTransition = hys.final_tier !== entry.current_tier ? {
      from: entry.current_tier,
      to: hys.final_tier,
      reason: demeritRes.demerit >= 30 ? "death_chain_dormant" : "hysteresis_passed"
    } : null;
    if (tierTransition) {
      breakdown.push({
        type: "tier_transition",
        note: `${tierTransition.from} \u2192 ${tierTransition.to} (${tierTransition.reason})`
      });
    }
    return {
      confidence: newConfidence,
      demerit: demeritRes.demerit,
      tier_before: entry.current_tier,
      tier_after: hys.final_tier,
      status: statusFromTier(entry.status, hys.final_tier),
      confidence_delta: newConfidence - entry.confidence,
      demerit_delta: demeritRes.demerit - entry.demerit,
      delta_breakdown: breakdown,
      tier_transition: tierTransition,
      reason_for_no_transition: hys.blocked_reason
    };
  }
};

// ../core/src/pipeline/calibration-pipeline-v2.ts
init_esm_shims();
async function runCalibrationPipelineV2(deps) {
  const entries = deps.store.getAll();
  const now = deps.now();
  const syntheticObs = deps.events.filter((e) => e.knowledge_id && syntheticOutcomeForEvent(e.kind) !== null).map((e) => ({
    id: `synth-${e.kind}-${e.id}`,
    knowledge_id: e.knowledge_id,
    timestamp: e.timestamp,
    outcome: syntheticOutcomeForEvent(e.kind),
    source_event: e.id,
    tool_use_id: e.tool_use_id
  }));
  const allObservations = [...deps.observations, ...syntheticObs];
  const obsIdx = indexByKnowledgeId(allObservations);
  const evtIdx = indexByKnowledgeId(deps.events);
  const adjusted = [];
  const dormantNew = [];
  for (const entry of entries) {
    if (entry.status === "archived") continue;
    const isDormant = entry.status === "dormant" || entry.current_tier === "dormant";
    if (isDormant && entry.demerit >= 50) continue;
    const obsForEntry = obsIdx.get(entry.id) ?? [];
    const evtForEntry = evtIdx.get(entry.id) ?? [];
    if (!isDormant && obsForEntry.length === 0 && evtForEntry.length === 0 && entry.demerit === 0) {
      continue;
    }
    const calResult = deps.calibrator.calibrate(entry, {
      events: evtForEntry,
      observations: obsForEntry,
      now
    });
    let result = calResult;
    if (deps.validator && deps.callLLM && result.tier_transition && isPromotion(result.tier_before, result.tier_after)) {
      const proposedTier = result.tier_after;
      const needsL1 = L1_GATED_TIERS.has(proposedTier);
      if (needsL1) {
        const similar = deps.similarityFinder ? await deps.similarityFinder(entry).catch(() => []) : [];
        const l1 = await deps.validator.validateLevel1({ entry, similarRules: similar }, deps.callLLM).catch((e) => ({
          ok: false,
          confidence: 0,
          reason: `validator_l1_error: ${String(e).slice(0, 120)}`
        }));
        if (!l1.ok) {
          result = overrideTier(
            result,
            entry.current_tier,
            `l1_blocked: ${l1.reason}`
          );
          deps.bus?.emit({
            kind: "validator.blocked-promotion",
            source: "validator",
            knowledgeId: entry.id,
            level: "l1",
            fromTier: entry.current_tier,
            toTier: proposedTier,
            reason: l1.reason,
            severity: "info",
            userFacingValue: `L1 blocked ${entry.current_tier} \u2192 ${proposedTier}: ${l1.reason}`,
            timestamp: now.toISOString()
          });
        }
      }
      const needsL2 = L2_GATED_TIERS.has(proposedTier) && result.tier_transition !== null;
      if (needsL2) {
        const recentHits = evtForEntry.filter(
          (e) => e.kind === "hook-pre.matched" || e.kind === "hook-pre.blocked"
        ).slice(-20).map((e) => ({
          tool_input: e.payload?.tool_input ?? null,
          timestamp: e.timestamp
        }));
        const seniors = deps.store.getAll().filter(
          (r) => (r.current_tier === "canonical" || r.current_tier === "enforced") && r.id !== entry.id
        );
        const l2 = await deps.validator.validateLevel2(
          { entry, recentHits, existingSeniorRules: seniors },
          deps.callLLM
        ).catch((e) => ({
          ok: false,
          confidence: 0,
          reason: `validator_l2_error: ${String(e).slice(0, 120)}`
        }));
        if (!l2.ok) {
          result = overrideTier(
            result,
            entry.current_tier,
            `l2_blocked: ${l2.reason}`
          );
          deps.bus?.emit({
            kind: "validator.blocked-promotion",
            source: "validator",
            knowledgeId: entry.id,
            level: "l2",
            fromTier: entry.current_tier,
            toTier: proposedTier,
            reason: l2.reason,
            severity: "info",
            userFacingValue: `L2 blocked ${entry.current_tier} \u2192 ${proposedTier}: ${l2.reason}`,
            timestamp: now.toISOString()
          });
        }
      }
    }
    const confChanged = Math.abs(result.confidence_delta) > 1e-6;
    const demChanged = Math.abs(result.demerit_delta) > 1e-6;
    const tierChanged = result.tier_transition !== null;
    if (!confChanged && !demChanged && !tierChanged) continue;
    if (tierChanged) {
      const wasStablePlus = STABLE_PLUS.has(result.tier_before);
      const isStablePlus = STABLE_PLUS.has(result.tier_after);
      if (!wasStablePlus && isStablePlus) {
        deps.bus?.emit({
          kind: "compile.skill-should-write",
          source: "compile",
          knowledgeId: entry.id,
          tierBefore: result.tier_before,
          tierAfter: result.tier_after,
          severity: "info",
          userFacingValue: `tier ${result.tier_before} \u2192 ${result.tier_after}\uFF0C\u5C06\u5BFC\u51FA skill`,
          timestamp: now.toISOString()
        });
      } else if (wasStablePlus && !isStablePlus) {
        deps.bus?.emit({
          kind: "compile.skill-should-remove",
          source: "compile",
          knowledgeId: entry.id,
          tierBefore: result.tier_before,
          tierAfter: result.tier_after,
          severity: "info",
          userFacingValue: `tier ${result.tier_before} \u2192 ${result.tier_after}\uFF0C\u5C06\u79FB\u9664 skill`,
          timestamp: now.toISOString()
        });
      }
    }
    if (!deps.dryRun) {
      deps.store.update(entry.id, {
        confidence: result.confidence,
        demerit: result.demerit,
        current_tier: result.tier_after,
        status: result.status,
        demerit_last_updated: now.toISOString(),
        tier_entered_at: tierChanged ? now.toISOString() : entry.tier_entered_at,
        max_tier_ever: tierChanged && tierRankGt(result.tier_after, entry.max_tier_ever) ? result.tier_after : entry.max_tier_ever,
        last_validated_at: now.toISOString()
      });
    }
    if (result.tier_after === "dormant") {
      dormantNew.push(entry.id);
    }
    adjusted.push({
      knowledge_id: entry.id,
      confidence_before: entry.confidence,
      confidence_after: result.confidence,
      status_after: result.status,
      demerit_before: entry.demerit,
      demerit_after: result.demerit,
      tier_before: result.tier_before,
      tier_after: result.tier_after,
      tier_transition: result.tier_transition,
      delta_breakdown: result.delta_breakdown
    });
    deps.bus?.emit({
      kind: "calibrator.v2-adjusted",
      source: "calibrator",
      knowledgeId: entry.id,
      confidenceBefore: entry.confidence,
      confidenceAfter: result.confidence,
      tierBefore: result.tier_before,
      tierAfter: result.tier_after,
      demeritBefore: entry.demerit,
      demeritAfter: result.demerit,
      severity: result.tier_after === "dormant" ? "warning" : "info",
      userFacingValue: result.tier_transition ? `${entry.id}: ${result.tier_before} \u2192 ${result.tier_after} (${result.tier_transition.reason})` : `${entry.id}: conf ${entry.confidence.toFixed(2)} \u2192 ${result.confidence.toFixed(2)}`,
      timestamp: now.toISOString()
    });
  }
  return { scanned: entries.length, adjusted, dormantNew };
}
function indexByKnowledgeId(items) {
  const m = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!it.knowledge_id) continue;
    const list = m.get(it.knowledge_id);
    if (list) list.push(it);
    else m.set(it.knowledge_id, [it]);
  }
  return m;
}
var TIER_RANK = {
  experimental: 0,
  probation: 1,
  stable: 2,
  canonical: 3,
  enforced: 4,
  dormant: -1
};
function tierRankGt(a, b) {
  return (TIER_RANK[a] ?? -1) > (TIER_RANK[b] ?? -1);
}
function isPromotion(from, to) {
  if (from === "dormant" || to === "dormant") return false;
  return tierRankGt(to, from);
}
var L1_GATED_TIERS = /* @__PURE__ */ new Set(["stable", "canonical", "enforced"]);
var L2_GATED_TIERS = /* @__PURE__ */ new Set(["canonical", "enforced"]);
var STABLE_PLUS = /* @__PURE__ */ new Set(["stable", "canonical", "enforced"]);
function syntheticOutcomeForEvent(kind) {
  if (kind === "hook-pre.blocked" || kind === "ai.override.complied" || kind === "ai.narrative.complied") {
    return "success";
  }
  if (kind === "ai.override.ignored" || kind === "ai.override.blocked_circumvented" || kind === "ai.narrative.recurred") {
    return "failure";
  }
  return null;
}
function overrideTier(result, revertTo, reason) {
  return {
    ...result,
    tier_after: revertTo,
    tier_transition: null,
    delta_breakdown: [
      ...result.delta_breakdown,
      {
        type: "tier_transition",
        note: `reverted to ${revertTo}: ${reason}`
      }
    ]
  };
}

// ../core/src/pipeline/ingest-pipeline.ts
init_esm_shims();
async function runIngestPipeline(deps) {
  const accepted = [];
  const rejected = [];
  let skipped = 0;
  let failed = 0;
  for (const input of deps.inputs) {
    let partial = null;
    try {
      partial = await deps.extractor.extract(input, deps.callLLM);
    } catch {
      failed += 1;
      emit2(deps.bus, {
        kind: "ingest.failed",
        source: "ingest",
        count: 1,
        severity: "warning",
        userFacingValue: `\u63D0\u53D6\u5931\u8D25\uFF08kind=${input.kind}\uFF09`,
        timestamp: deps.now().toISOString()
      });
      continue;
    }
    if (!partial) {
      skipped += 1;
      emit2(deps.bus, {
        kind: "ingest.skipped",
        source: "ingest",
        count: 1,
        severity: "info",
        userFacingValue: `\u4FE1\u53F7\u4E0D\u8DB3\uFF0C\u672A\u63D0\u53D6\uFF08kind=${input.kind}\uFF09`,
        timestamp: deps.now().toISOString()
      });
      continue;
    }
    const entry = completeEntry(partial, input, deps);
    const l0 = deps.validator.validateLevel0({
      entry,
      sourceText: input.context,
      existingRules: deps.store.getAll().map((r) => ({
        id: r.id,
        trigger: r.trigger,
        wrong_pattern: r.wrong_pattern
      })),
      projectStack: deps.projectStack
    });
    if (!l0.ok) {
      rejected.push({ entry, reasons: l0.failed_checks });
      emit2(deps.bus, {
        kind: "ingest.rejected-l0",
        source: "ingest",
        knowledgeId: entry.id,
        severity: "info",
        userFacingValue: `L0 \u62D2\u7EDD\uFF1A${l0.failed_checks.join(", ")}`,
        timestamp: deps.now().toISOString()
      });
      continue;
    }
    if (!deps.dryRun) {
      if (deps.store.addWithEmbedding) {
        await deps.store.addWithEmbedding(entry);
      } else {
        deps.store.add(entry);
      }
    }
    accepted.push(entry);
    emit2(deps.bus, {
      kind: "ingest.accepted",
      source: "ingest",
      knowledgeId: entry.id,
      severity: "highlight",
      userFacingValue: `\u5165\u5E93\uFF1A${entry.trigger}`,
      timestamp: deps.now().toISOString()
    });
  }
  return {
    scanned: deps.inputs.length,
    accepted,
    rejected,
    skipped,
    failed
  };
}
function completeEntry(partial, input, deps) {
  const nowIso = deps.now().toISOString();
  const nature = partial.nature ?? "subjective";
  const confidence = partial.confidence ?? Math.max(0, Math.min(1, input.weight));
  return {
    id: partial.id ?? deps.idGen(),
    scope: partial.scope ?? deps.scope,
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement: partial.enforcement ?? computeEnforcement(confidence, nature),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: {
      success_sessions: 0,
      success_users: 0,
      correction_sessions: 0
    },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: deps.source,
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: nowIso,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action"
  };
}
function emit2(bus, event) {
  if (!bus) return;
  try {
    bus.emit(event);
  } catch {
  }
}

// ../core/src/validator/index.ts
init_esm_shims();

// ../core/src/validator/l0.ts
init_esm_shims();
var IMPORT_PATH_RE = /^[@a-zA-Z0-9_\-./]+$/;
function tokenSet(text) {
  const tokens = text.toLowerCase().split(/\W+/).filter((t) => t.length >= 2);
  return new Set(tokens);
}
function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
var REQUIRED_FIELDS = ["id", "trigger", "correct_pattern"];
function validateLevel0(input) {
  const failed = [];
  const { entry, sourceText, existingRules, projectStack } = input;
  const L0_MIN_TOKEN = 3;
  if (entry.type === "avoidance" && entry.wrong_pattern) {
    const patterns = entry.wrong_pattern.split("|").map((s) => s.trim()).filter((s) => s.length >= L0_MIN_TOKEN);
    const hit = patterns.length > 0 && patterns.some((p) => sourceText.includes(p));
    if (!hit) failed.push("wrong_pattern_not_in_source");
  }
  const importPath = entry.correct_pattern_import_path;
  if (typeof importPath === "string" && !IMPORT_PATH_RE.test(importPath)) {
    failed.push("invalid_import_path_format");
  }
  const fileTypes = entry.scope?.file_types;
  if (fileTypes && fileTypes.length > 0 && projectStack.length > 0) {
    const normalized = fileTypes.map((s) => s.replace(/^\*?\.?/, ""));
    const overlap = normalized.some((t) => projectStack.includes(t));
    if (!overlap) failed.push("file_types_stack_mismatch");
  }
  if (entry.trigger) {
    const exists = existingRules.some(
      (r) => r.id !== entry.id && r.trigger === entry.trigger
    );
    if (exists) failed.push("trigger_collision");
  }
  if (entry.type === "avoidance") {
    const paths = entry.scope?.paths;
    if (!paths || paths.length === 0) {
      failed.push("scope_paths_empty");
    } else {
      const malformed = paths.some((p) => typeof p !== "string" || p.length === 0);
      if (malformed) failed.push("scope_paths_malformed");
    }
  }
  if (entry.type === "practice" && entry.wrong_pattern) {
    failed.push("practice_must_not_have_wrong_pattern");
  }
  if (entry.type === "avoidance" && !entry.wrong_pattern) {
    failed.push("avoidance_must_have_wrong_pattern");
  }
  if (entry.wrong_pattern && entry.correct_pattern && entry.wrong_pattern.trim() !== "" && entry.wrong_pattern.trim() === entry.correct_pattern.trim()) {
    failed.push("wrong_correct_patterns_identical");
  }
  if (typeof entry.confidence === "number") {
    if (entry.confidence < 0 || entry.confidence > 1) {
      failed.push("confidence_out_of_range");
    }
  }
  for (const field of REQUIRED_FIELDS) {
    const val = entry[field];
    if (val === void 0 || val === null || val === "") {
      failed.push(`missing_required_field:${field}`);
    }
  }
  const JACCARD_CONFLICT_THRESHOLD = 0.85;
  const entryWrongPattern = (entry.wrong_pattern ?? "").trim();
  if (entryWrongPattern.length > 0) {
    const entryBody = [entry.trigger ?? "", entryWrongPattern].join(" ");
    const entryTokens = tokenSet(entryBody);
    for (const existing of existingRules) {
      if (existing.id === entry.id) continue;
      const existingWrongPattern = (existing.wrong_pattern ?? "").trim();
      if (existingWrongPattern.length === 0) continue;
      const existingBody = [existing.trigger ?? "", existingWrongPattern].join(" ");
      const existingTokens = tokenSet(existingBody);
      const sim = jaccardSimilarity(entryTokens, existingTokens);
      if (sim >= JACCARD_CONFLICT_THRESHOLD) {
        failed.push(`embedding_conflict:${existing.id}`);
        break;
      }
    }
  }
  return {
    ok: failed.length === 0,
    failed_checks: failed,
    notes: failed.length ? `L0 failed: ${failed.join(", ")}` : void 0
  };
}

// ../core/src/validator/l1.ts
init_esm_shims();
async function validateLevel1(input, callLLM) {
  const prompt = buildL1Prompt(input);
  let raw;
  try {
    raw = await callLLM(prompt);
  } catch (e) {
    return {
      ok: false,
      confidence: 0,
      reason: `llm_error: ${truncate4(String(e), 120)}`
    };
  }
  return parseLLMValidation(raw);
}
function buildL1Prompt(input) {
  const entry = input.entry;
  return [
    "\u4F60\u662F\u89C4\u5219\u8D28\u91CF\u5BA1\u67E5\u5B98\uFF08L1\uFF0CHaiku \u7EA7\u8F7B\u91CF\u8BED\u4E49\u68C0\u67E5\uFF09\u3002",
    "\u8BF7\u5224\u65AD\u8FD9\u6761\u89C4\u5219\u662F\u5426\u8DB3\u591F specific\uFF0C\u4EE5\u53CA\u662F\u5426\u4E0E\u8FD1\u90BB\u89C4\u5219\u660E\u663E\u51B2\u7A81\u3002",
    "",
    "\u3010\u5F85\u5BA1\u89C4\u5219\u3011",
    JSON.stringify(
      {
        trigger: entry.trigger,
        wrong_pattern: entry.wrong_pattern,
        correct_pattern: entry.correct_pattern,
        reasoning: entry.reasoning,
        scope: entry.scope
      },
      null,
      2
    ),
    "",
    "\u3010\u8FD1\u90BB\u89C4\u5219\uFF08\u53EC\u56DE top-k\uFF09\u3011",
    input.similarRules.length > 0 ? input.similarRules.map((r) => `- ${r.id}: ${r.trigger}`).join("\n") : "(\u65E0)",
    "",
    "\u3010\u8F93\u51FA\u8981\u6C42\u3011",
    "\u4E25\u683C\u8F93\u51FA\u4E00\u6BB5 JSON\uFF08\u53EF\u5305\u88F9\u5728 ```json fenced block \u91CC\uFF09\uFF1A",
    '{"ok": true|false, "confidence": 0-1, "reason": "\u4E00\u4E24\u53E5\u4EBA\u8BDD", "conflicts_with": ["id1"]}',
    "- ok=false \u65F6 reason \u5FC5\u987B\u8BF4\u660E\u4E3A\u4EC0\u4E48",
    "- confidence \u662F\u4F60\u5BF9\u672C\u5224\u65AD\u7684\u628A\u63E1\u5EA6\uFF08\u4E0D\u662F\u89C4\u5219\u81EA\u8EAB\u7684 confidence\uFF09"
  ].join("\n");
}
function parseLLMValidation(raw) {
  const stripped = raw.trim().replace(/^```(?:json)?\s*\n?|\n?```$/g, "");
  let obj;
  try {
    obj = JSON.parse(stripped);
  } catch {
    return {
      ok: false,
      confidence: 0,
      reason: "llm_response_unparseable"
    };
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, confidence: 0, reason: "llm_response_not_object" };
  }
  const o = obj;
  const ok = typeof o.ok === "boolean" ? o.ok : false;
  const confidence = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0;
  const reason = typeof o.reason === "string" && o.reason.trim() ? o.reason : "no_reason";
  const conflicts = Array.isArray(o.conflicts_with) ? o.conflicts_with.filter((x) => typeof x === "string") : void 0;
  return {
    ok,
    confidence,
    reason,
    ...conflicts && conflicts.length > 0 ? { conflicts_with: conflicts } : {}
  };
}
function truncate4(s, max) {
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

// ../core/src/validator/l2.ts
init_esm_shims();
async function validateLevel2(input, callLLM) {
  const prompt = buildL2Prompt(input);
  let raw;
  try {
    raw = await callLLM(prompt);
  } catch (e) {
    return {
      ok: false,
      confidence: 0,
      reason: `llm_error: ${String(e).slice(0, 120)}`
    };
  }
  return parseLLMValidation(raw);
}
function buildL2Prompt(input) {
  const entry = input.entry;
  const samples = input.recentHits.slice(0, 20);
  return [
    "\u4F60\u662F\u89C4\u5219\u8D28\u91CF\u5BA1\u67E5\u5B98\uFF08L2\uFF0CSonnet \u7EA7\u6DF1\u5EA6\u68C0\u67E5\uFF09\u3002",
    "\u76EE\u6807\uFF1A\u5224\u65AD\u8FD9\u6761\u89C4\u5219\u664B\u5347\u5230 canonical/enforced \u7EA7\u522B\u662F\u5426\u5408\u9002\u3002",
    "",
    "\u4E3B\u8981\u5224\u522B\u4E24\u4EF6\u4E8B\uFF1A",
    "  1) \u8FC7\u62DF\u5408\uFF1A\u6837\u672C tool_input \u662F\u5426\u90FD\u662F\u540C\u4E00\u7C7B\u9879\u76EE/\u540C\u4E00\u7C7B\u60C5\u5F62\uFF1F\u82E5\u662F\uFF0C\u89C4\u5219\u53EF\u80FD\u5BF9\u5176\u5B83\u573A\u666F\u8BEF\u62E6\u3002",
    "  2) \u5197\u4F59\uFF1A\u662F\u5426\u4E0E\u67D0\u6761\u5DF2\u6709 senior \u89C4\u5219\u672C\u8D28\u4E0A\u91CD\u590D\uFF08\u540C trigger \u540C pattern\uFF09\uFF1F",
    "",
    "\u3010\u5F85\u5BA1\u89C4\u5219\u3011",
    JSON.stringify(
      {
        id: entry.id,
        trigger: entry.trigger,
        wrong_pattern: entry.wrong_pattern,
        correct_pattern: entry.correct_pattern,
        reasoning: entry.reasoning,
        scope: entry.scope,
        current_tier: entry.current_tier
      },
      null,
      2
    ),
    "",
    "\u3010\u6700\u8FD1 20 \u6B21\u547D\u4E2D\u7684 tool_input \u6837\u672C\u3011",
    samples.length > 0 ? samples.map(
      (s, i) => `${i + 1}. [${s.timestamp}] ${truncate5(JSON.stringify(s.tool_input ?? null), 160)}`
    ).join("\n") : "(\u65E0\u6837\u672C)",
    "",
    "\u3010\u5DF2\u6709 senior \u89C4\u5219\uFF08canonical/enforced\uFF09\u3011",
    input.existingSeniorRules.length > 0 ? input.existingSeniorRules.map((r) => `- ${r.id} [${r.current_tier}]: ${r.trigger}`).join("\n") : "(\u65E0)",
    "",
    "\u3010\u8F93\u51FA\u8981\u6C42\u3011",
    "\u4E25\u683C\u8F93\u51FA\u4E00\u6BB5 JSON\uFF08\u53EF\u5305\u88F9\u5728 ```json fenced block \u91CC\uFF09\uFF1A",
    '{"ok": true|false, "confidence": 0-1, "reason": "\u4E00\u4E24\u53E5\u4EBA\u8BDD", "conflicts_with": ["id1"]}',
    "- \u82E5\u5224\u5B9A\u8FC7\u62DF\u5408\u6216\u5197\u4F59\uFF0Cok=false \u4E14 reason \u6307\u660E\u54EA\u4E2A",
    "- confidence \u662F\u4F60\u5BF9\u672C\u5224\u65AD\u7684\u628A\u63E1\u5EA6"
  ].join("\n");
}
function truncate5(s, max) {
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

// ../core/src/validator/index.ts
var defaultValidator = {
  validateLevel0,
  validateLevel1,
  validateLevel2
};

// ../core/src/compiler/agent-skill.ts
init_esm_shims();
var MAX_DESCRIPTION_LENGTH = 400;
function formatAsAgentSkill(entry) {
  const summary = entry.reasoning.length > MAX_DESCRIPTION_LENGTH ? entry.reasoning.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "\u2026" : entry.reasoning;
  const frontmatter = [
    "---",
    `name: ${entry.id}`,
    `description: >`,
    `  ${summary}`,
    `  \u4F7F\u7528\u573A\u666F\uFF1A${entry.trigger}`,
    `  \u89E6\u53D1\u5173\u952E\u8BCD\uFF1A${entry.trigger}`,
    "---"
  ].join("\n");
  const body = [
    "## \u80CC\u666F",
    "",
    entry.reasoning,
    "",
    "## \u505A\u6CD5",
    "",
    "### \u2705 \u6B63\u786E",
    "",
    entry.correct_pattern
  ];
  if (entry.wrong_pattern) {
    body.push("", "### \u274C \u9519\u8BEF", "", entry.wrong_pattern);
  }
  body.push(
    "",
    "## \u5143\u4FE1\u606F",
    "",
    `- Rule ID: ${entry.id}`,
    `- Tier: ${entry.current_tier}`,
    `- Confidence: ${entry.confidence.toFixed(2)}`,
    `- Source: ${entry.source}`
  );
  return frontmatter + "\n\n" + body.join("\n") + "\n";
}

// ../core/src/pipeline/compile-pipeline.ts
init_esm_shims();
async function runCompile(deps) {
  const entries = deps.store.getAll();
  let mdPath = "(skipped)";
  let mdLineCount = 0;
  if (deps.writeMarkdown && deps.markdownCompiler && !deps.dryRun) {
    const info = deps.markdownCompiler.writeToFile(entries);
    mdPath = info.filePath;
    mdLineCount = info.blockLineCount;
  } else if (deps.writeMarkdown && deps.dryRun) {
    mdPath = "(dry-run)";
  }
  const artifacts = deps.skillCompiler.compile(entries);
  const written = deps.dryRun ? artifacts.map((a) => a.ruleId) : (await deps.skillCompiler.write(artifacts)).written;
  const toRemove = deps.skillEvents?.filter((e) => e.action === "skill_should_remove").map((e) => e.id) ?? [];
  const removed = deps.dryRun ? toRemove : (await deps.skillCompiler.cleanup(toRemove)).removed;
  deps.bus?.emit({
    kind: "compile.skills-compiled",
    source: "compile",
    written: written.length,
    removed: removed.length,
    severity: "info",
    userFacingValue: `Skills written: ${written.length}, removed: ${removed.length}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  return {
    markdown: { path: mdPath, blockLineCount: mdLineCount },
    skills: { written, removed }
  };
}

// ../core/src/pipeline/override-signal.ts
init_esm_shims();
function detectIgnoredSignals(currentToolUseId, recentEvents) {
  return recentEvents.filter(
    (e) => e.kind === "hook-pre.warned" && e.tool_use_id === currentToolUseId && Boolean(e.knowledge_id)
  ).map((e) => ({ knowledge_id: e.knowledge_id }));
}
function detectBlockedCircumventedSignals(currentToolName, recentEvents, now, windowMs = 3e5) {
  const cutoff = now.getTime() - windowMs;
  const alreadyEmitted = /* @__PURE__ */ new Set();
  for (const e of recentEvents) {
    if (e.kind === "ai.override.blocked_circumvented" && e.knowledge_id) {
      alreadyEmitted.add(e.knowledge_id);
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const e of recentEvents) {
    if (e.kind === "hook-pre.blocked" && e.knowledge_id && e.tool_name === currentToolName && new Date(e.timestamp).getTime() > cutoff && !alreadyEmitted.has(e.knowledge_id) && !seen.has(e.knowledge_id)) {
      seen.add(e.knowledge_id);
      result.push({ knowledge_id: e.knowledge_id });
    }
  }
  return result;
}
function detectCompliedSignals(currentToolName, recentEvents, now, windowMs = 3e5) {
  const cutoff = now.getTime() - windowMs;
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const e of recentEvents) {
    if (e.kind === "hook-pre.warned" && e.knowledge_id && e.tool_name === currentToolName && new Date(e.timestamp).getTime() > cutoff && !seen.has(e.knowledge_id)) {
      seen.add(e.knowledge_id);
      result.push({ knowledge_id: e.knowledge_id });
    }
  }
  return result;
}

// ../core/src/error-collector/cross-session-cluster.ts
init_esm_shims();
function clusterByTag(signals, minSessions, now) {
  if (signals.length === 0) return [];
  const keywordSessions = /* @__PURE__ */ new Map();
  for (const sig of signals) {
    const tokens = tokenize(sig.context);
    const sessionId = sig.sessionIds[0] ?? "unknown";
    for (const token of tokens) {
      if (!keywordSessions.has(token)) {
        keywordSessions.set(token, /* @__PURE__ */ new Set());
      }
      keywordSessions.get(token).add(sessionId);
    }
  }
  const result = [];
  for (const [keyword, sessionSet] of keywordSessions.entries()) {
    if (sessionSet.size < minSessions) continue;
    const sessionIds = Array.from(sessionSet);
    const matchingSignals = signals.filter(
      (s) => s.context.toLowerCase().includes(keyword)
    );
    const weight = Math.min(sessionSet.size / 5, 1);
    const contextSummary = [
      `[H \u805A\u7C7B] \u5173\u952E\u8BCD "${keyword}" \u5728 ${sessionSet.size} \u4E2A\u4E0D\u540C session \u4E2D\u91CD\u590D\u51FA\u73B0`,
      `\u76F8\u5173\u4E0A\u4E0B\u6587\u7247\u6BB5\uFF1A`,
      ...matchingSignals.slice(0, 3).map((s) => `  - ${s.context.slice(0, 120)}`)
    ].join("\n");
    result.push({
      id: `h-${keyword}-${sessionIds.slice(0, 3).join("-")}`,
      signalType: "H",
      weight,
      sessionIds,
      context: contextSummary,
      suggestedCategory: void 0,
      timestamp: now.toISOString()
    });
  }
  return result;
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  // 通用英文虚词
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "been",
  "were",
  "they",
  "their",
  "there",
  "when",
  "what",
  "which",
  "will",
  "also",
  "into",
  "more",
  "some",
  "then",
  "than",
  "these",
  "those",
  "such",
  "your",
  "about",
  "after",
  "before",
  // session compaction 摘要高频词（防止 H 聚类把元信息当错误模式）
  "session",
  "conversation",
  "context",
  "summary",
  "previous",
  "continued",
  "earlier",
  "portion",
  "covers",
  "below",
  "request",
  "intent",
  "primary",
  "being",
  "user",
  // 错误类通用词（太宽泛，无区分度）
  "error",
  "fail",
  "failed",
  "failure",
  "could",
  "would",
  "should"
]);
function tokenize(text) {
  return text.toLowerCase().split(/[\s\-_./\\:,;()[\]{}'"!?\uff01\uff0c\uff1a\uff1b\u3001\u3002]+/).filter((t) => t.length >= 4 && !STOP_WORDS.has(t) && !isLabelToken(t));
}
function isLabelToken(t) {
  return /^[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+$/.test(t);
}

// ../core/src/error-collector/signal-filter.ts
init_esm_shims();
function filterSignals(signals, opts) {
  if (signals.length === 0) return [];
  const dedupMap = /* @__PURE__ */ new Map();
  for (const sig of signals) {
    const existing = dedupMap.get(sig.id);
    if (!existing || sig.weight > existing.weight) {
      dedupMap.set(sig.id, sig);
    }
  }
  return Array.from(dedupMap.values()).filter((sig) => {
    if (sig.weight < opts.weightThreshold) return false;
    if (sig.signalType !== "H") {
      const uniqueSessions = new Set(sig.sessionIds).size;
      if (uniqueSessions < opts.minSessions) return false;
    }
    return true;
  });
}

// ../core/src/pii/redactor.ts
init_esm_shims();
function luhnCheck(digits) {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i] ?? "0", 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
var PATTERNS = [
  { kind: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  {
    kind: "secret",
    pattern: /\b(?:Authorization:\s*Bearer\s+[^\s"']+|[A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Z0-9_]*=[^\s"']+|sk-ant-[A-Za-z0-9._-]+|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/gi
  },
  {
    kind: "uuid",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  },
  {
    kind: "private-ip",
    pattern: /\b(?:10|192\.168|172\.(?:1[6-9]|2[0-9]|3[01]))\.(?:[0-9]{1,3}\.){1,2}[0-9]{1,3}\b/g
  },
  {
    kind: "internal-host",
    pattern: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|corp|local|lan)\b/gi
  },
  {
    kind: "private-path",
    pattern: /(?:\/Users\/[^\s"'`]+|\/home\/[^\s"'`]+|[A-Za-z]:\\Users\\[^\s"'`]+)/g
  },
  {
    // AWS access key IDs: AKIA/ASIA/ABIA followed by 16 uppercase alphanumeric chars
    kind: "aws-key",
    pattern: /\b(?:AKIA|ASIA|ABIA)[0-9A-Z]{16}\b/g
  },
  {
    // JWT: three base64url segments separated by dots, first two starting with eyJ
    kind: "jwt",
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
  },
  {
    // Phone: +CC-AAA-PPP-NNNN, (AAA) PPP-NNNN, +CC AAA PPP NNNN
    // Requires country code or area code context to avoid over-matching plain digits
    kind: "phone",
    pattern: /(?:\+\d{1,3}[-\s]\d{3}[-\s]\d{3}[-\s]\d{4}|\(\d{3}\)\s?\d{3}-\d{4})/g
  },
  {
    // Chinese resident ID: 17 digits + 1 check char (digit or X/x). Placed
    // before the credit-card pass so an 18-digit ID is redacted as PII, not
    // mis-classified as a card number. M2 验证 step 3 ("模拟身份证号").
    kind: "chinese-id",
    pattern: /\b\d{17}[\dXx]\b/g
  }
];
var REDACT_MAP = {
  "email": "[redacted]",
  "secret": "[redacted]",
  "uuid": "[redacted]",
  "private-ip": "[redacted]",
  "internal-host": "[redacted]",
  "private-path": "[redacted]",
  "aws-key": "[redacted]",
  "jwt": "[redacted]",
  "phone": "[redacted]",
  "chinese-id": "[redacted]",
  "credit-card": "[redacted]"
};
function detectSensitiveText(text) {
  const findings = [];
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[0]) findings.push({ kind, match: match[0] });
    }
  }
  const ccPattern = /\b(\d[ -]?){13,19}\b/g;
  ccPattern.lastIndex = 0;
  for (const match of text.matchAll(ccPattern)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      findings.push({ kind: "credit-card", match: match[0] });
    }
  }
  return findings;
}
function redactSensitiveText(text) {
  let redacted = text;
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, REDACT_MAP[kind]);
  }
  const ccPattern = /\b(\d[ -]?){13,19}\b/g;
  redacted = redacted.replace(ccPattern, (match) => {
    const digits = match.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      return REDACT_MAP["credit-card"];
    }
    return match;
  });
  return redacted;
}

// ../core/src/error-collector/error-batch-builder.ts
init_esm_shims();

// ../core/src/error-collector/error-extraction-prompt.ts
init_esm_shims();
function buildBatchErrorExtractionPrompt(signals, category) {
  const categoryDesc = {
    C: "\u4EE3\u7801\u5C42\uFF08\u8BED\u6CD5\u3001\u7C7B\u578B\u3001API \u7528\u6CD5\uFF09",
    E: "\u5DE5\u7A0B\u5C42\uFF08\u67B6\u6784\u3001\u4F9D\u8D56\u3001\u5DE5\u5177\u94FE\u3001\u6784\u5EFA\uFF09",
    S: "\u7B56\u7565\u5C42\uFF08\u4EFB\u52A1\u5206\u89E3\u3001\u5B9E\u73B0\u987A\u5E8F\u3001\u53D6\u820D\uFF09",
    K: "\u8BA4\u77E5\u5C42\uFF08\u7528\u6237\u504F\u597D\u3001\u5FC3\u667A\u6A21\u578B\u3001\u534F\u4F5C\u65B9\u5F0F\uFF09"
  };
  const signalBlock = signals.map(
    (s, i) => `--- \u4FE1\u53F7 ${i + 1} [${s.signalType}] weight=${s.weight.toFixed(2)} sessions=${s.sessionIds.length} ---
${s.context.trim()}`
  ).join("\n\n");
  return `\u4F60\u662F\u77E5\u8BC6\u63D0\u53D6\u5668\u3002\u4E0B\u9762\u662F ${signals.length} \u6761\u6765\u81EA\u5F00\u53D1\u8FC7\u7A0B\u7684\u9519\u8BEF\u4FE1\u53F7\uFF0C\u7C7B\u522B\u4E3A ${category}\uFF08${categoryDesc[category]}\uFF09\u3002

\u8BF7\u5206\u6790\u8FD9\u4E9B\u4FE1\u53F7\uFF0C\u63D0\u70BC\u51FA 1-3 \u6761\u6709\u4EF7\u503C\u7684"\u77E5\u8BC6\u6761\u76EE"\uFF08\u5982\u679C\u4FE1\u53F7\u592A\u5F31\u6216\u5185\u5BB9\u91CD\u590D\uFF0C\u63D0\u70BC\u66F4\u5C11\u6761\u751A\u81F3 0 \u6761\uFF09\u3002

\u3010\u9519\u8BEF\u4FE1\u53F7\u3011
${signalBlock}

\u3010\u8F93\u51FA\u5B57\u6BB5\uFF08\u6BCF\u6761\u77E5\u8BC6\u6761\u76EE\uFF09\u3011
- category: "${category}"\uFF08\u56FA\u5B9A\uFF09
- tags: string[] \u81EA\u7531\u6807\u7B7E\uFF0C2-5 \u4E2A\u77ED\u8BCD
- type: "avoidance" | "practice"
- nature: "objective" | "subjective"
- trigger: string \u4F55\u65F6\u751F\u6548\uFF0C\u901A\u7528\u573A\u666F\u63CF\u8FF0
- wrong_pattern: string \u9519\u8BEF\u505A\u6CD5\u5173\u952E\u5B57\uFF1B\u4E0D\u9002\u7528\u586B ""
- correct_pattern: string \u6B63\u786E\u505A\u6CD5\u4E00\u53E5\u8BDD
- reasoning: string \u4E00\u53E5\u8BDD\u89E3\u91CA\u539F\u56E0

\u3010\u4E25\u683C\u8981\u6C42\u3011
1. \u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u6570\u7EC4\uFF08\u5728 \`\`\`json fenced block \u91CC\uFF09\uFF0C\u6570\u7EC4\u5143\u7D20\u662F 0-3 \u4E2A\u77E5\u8BC6\u6761\u76EE\u5BF9\u8C61
2. \u5982\u679C\u6240\u6709\u4FE1\u53F7\u90FD\u592A\u5F31\u6216\u592A\u79C1\u4EBA\u5316\uFF0C\u8F93\u51FA\u7A7A\u6570\u7EC4 \`[]\`
3. \u4E0D\u8981\u8F93\u51FA\u9664 JSON \u4EE5\u5916\u7684\u4EFB\u4F55\u6587\u5B57

\u3010\u793A\u4F8B\u8F93\u51FA\u3011
\`\`\`json
[
  {
    "category": "E",
    "tags": ["vitest", "windows", "concurrency"],
    "type": "avoidance",
    "nature": "objective",
    "trigger": "\u5728 Windows \u73AF\u5883\u4E0B\u914D\u7F6E vitest",
    "wrong_pattern": "fileParallelism: true",
    "correct_pattern": "fileParallelism: false",
    "reasoning": "Windows \u4E0B vitest \u5E76\u53D1\u6A21\u5F0F\u4F1A\u5BFC\u81F4 OOM\uFF0C\u5FC5\u987B\u987A\u5E8F\u8DD1"
  }
]
\`\`\``;
}

// ../core/src/error-collector/error-batch-builder.ts
function buildErrorBatches(signals) {
  if (signals.length === 0) return [];
  const groups = /* @__PURE__ */ new Map();
  for (const sig of signals) {
    const cat = sig.suggestedCategory ?? "E";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(sig);
  }
  return Array.from(groups.entries()).map(([category, sigs]) => ({
    category,
    signals: sigs,
    prompt: buildBatchErrorExtractionPrompt(sigs, category)
  }));
}

// ../core/src/update/update-state.ts
init_esm_shims();
function defaultUpdateState() {
  return {
    last_check_ts: 0,
    interval_hours: 1,
    last_installed_sha: "",
    last_installed_version: "",
    installed_at: 0,
    consecutive_install_failures: 0,
    last_install_error: null,
    pending_banner: null,
    reinstall_banner_shown_at: 0,
    last_branch_etag: "",
    last_branch_sha: "",
    next_check_after_ts: 0,
    consecutive_rate_limits: 0,
    snooze_until_ts: 0,
    snooze_level: 0,
    never_prompt: false,
    prompt_dismissed_for_to: ""
  };
}
function parseUpdateState(raw) {
  const def = defaultUpdateState();
  if (!raw || !raw.trim()) return def;
  try {
    const obj = JSON.parse(raw);
    return {
      last_check_ts: typeof obj.last_check_ts === "number" ? obj.last_check_ts : def.last_check_ts,
      interval_hours: typeof obj.interval_hours === "number" ? obj.interval_hours : def.interval_hours,
      last_installed_sha: typeof obj.last_installed_sha === "string" ? obj.last_installed_sha : def.last_installed_sha,
      last_installed_version: typeof obj.last_installed_version === "string" ? obj.last_installed_version : def.last_installed_version,
      installed_at: typeof obj.installed_at === "number" ? obj.installed_at : def.installed_at,
      consecutive_install_failures: typeof obj.consecutive_install_failures === "number" ? obj.consecutive_install_failures : def.consecutive_install_failures,
      last_install_error: typeof obj.last_install_error === "string" ? obj.last_install_error : null,
      pending_banner: isPendingBanner(obj.pending_banner) ? normalizePendingBanner(obj.pending_banner) : null,
      reinstall_banner_shown_at: typeof obj.reinstall_banner_shown_at === "number" ? obj.reinstall_banner_shown_at : def.reinstall_banner_shown_at,
      last_branch_etag: typeof obj.last_branch_etag === "string" ? obj.last_branch_etag : def.last_branch_etag,
      last_branch_sha: typeof obj.last_branch_sha === "string" ? obj.last_branch_sha : def.last_branch_sha,
      next_check_after_ts: typeof obj.next_check_after_ts === "number" ? obj.next_check_after_ts : def.next_check_after_ts,
      consecutive_rate_limits: typeof obj.consecutive_rate_limits === "number" ? obj.consecutive_rate_limits : def.consecutive_rate_limits,
      snooze_until_ts: typeof obj.snooze_until_ts === "number" ? obj.snooze_until_ts : def.snooze_until_ts,
      snooze_level: typeof obj.snooze_level === "number" ? obj.snooze_level : def.snooze_level,
      never_prompt: typeof obj.never_prompt === "boolean" ? obj.never_prompt : def.never_prompt,
      prompt_dismissed_for_to: typeof obj.prompt_dismissed_for_to === "string" ? obj.prompt_dismissed_for_to : def.prompt_dismissed_for_to
    };
  } catch {
    return def;
  }
}
function serializeUpdateState(s) {
  return JSON.stringify(s, null, 2);
}
function isPendingBanner(v) {
  if (!v || typeof v !== "object") return false;
  const o = v;
  return typeof o.from === "string" && typeof o.to === "string" && typeof o.at === "number" && typeof o.shown === "boolean";
}
function normalizePendingBanner(raw) {
  const out = {
    from: raw.from,
    to: raw.to,
    at: raw.at,
    shown: raw.shown
  };
  const o = raw;
  if (typeof o.pr_creator === "boolean") out.pr_creator = o.pr_creator;
  if (typeof o.pr_number === "number") out.pr_number = o.pr_number;
  return out;
}

// ../core/src/update/should-check.ts
init_esm_shims();
var FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1e3;
var FAILURE_THRESHOLD = 3;
function shouldCheckUpdate(input) {
  if (input.env.TEAMAGENT_AUTO_UPDATE === "0") return false;
  if (input.disabledMarkerExists) return false;
  const { state, now } = input;
  if (state.consecutive_install_failures >= FAILURE_THRESHOLD && now - state.last_check_ts < FAILURE_BACKOFF_MS) {
    return false;
  }
  const intervalMs = (state.interval_hours || 1) * 60 * 60 * 1e3;
  return now - state.last_check_ts >= intervalMs;
}

// ../core/src/update/pr-creator-match.ts
init_esm_shims();
function isLocalUserPrCreator(input) {
  const target = (input.prCreatorLogin ?? "").trim().toLowerCase();
  if (!target) return false;
  const ghLogin = (input.ghLogin ?? "").trim().toLowerCase();
  if (ghLogin && ghLogin === target) return true;
  const env = input.env ?? {};
  const envUser = (env.GITHUB_USER ?? env.GH_USER ?? "").trim().toLowerCase();
  if (envUser && envUser === target) return true;
  const email = (input.gitEmail ?? "").trim().toLowerCase();
  if (email.endsWith("@users.noreply.github.com")) {
    const localPart = email.slice(0, -"@users.noreply.github.com".length);
    const stripped = localPart.replace(/^\d+\+/, "");
    if (stripped === target) return true;
  }
  return false;
}

// ../core/src/update/snooze.ts
init_esm_shims();
var SNOOZE_DURATIONS_MS = [
  24 * 60 * 60 * 1e3,
  // level 0 → 1: 24h
  48 * 60 * 60 * 1e3,
  // level 1 → 2: 48h
  7 * 24 * 60 * 60 * 1e3
  // level 2 → 3+: 7d (cap)
];
function nextSnooze(currentLevel, now) {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  const idx = Math.min(safeLevel, SNOOZE_DURATIONS_MS.length - 1);
  const duration = SNOOZE_DURATIONS_MS[idx];
  return {
    snooze_level: safeLevel + 1,
    snooze_until_ts: now + duration
  };
}
function shouldPromptUpgrade(input) {
  const { state, now, env, pendingToVersion } = input;
  if (env["TEAMAGENT_NEVER_PROMPT"] === "1") return false;
  if (state.never_prompt) return false;
  const haveBanner = state.pending_banner !== null;
  const haveExplicitPending = typeof pendingToVersion === "string" && pendingToVersion.length > 0;
  if (!haveBanner && !haveExplicitPending) return false;
  if (state.snooze_until_ts > 0 && now < state.snooze_until_ts) return false;
  const dismissedFor = state.prompt_dismissed_for_to;
  const currentTo = state.pending_banner?.to ?? pendingToVersion ?? "";
  if (dismissedFor && dismissedFor === currentTo) return false;
  return true;
}

// ../core/src/update/changelog-parser.ts
init_esm_shims();
var VERSION_HEADING_RE = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?(?:\s*[—\-–:]\s*.*)?$/;
var SUBSECTION_HEADING_RE = /^###\s+(.+?)\s*$/;
var BULLET_RE = /^[\s]*[-*]\s+(.+?)\s*$/;
var UNRELEASED_RE = /^##\s+Unreleased\s*$/i;
function parseChangelog(content, fromVersion, toVersion, options = {}) {
  const max = options.maxBullets ?? 7;
  if (!content || max <= 0) return [];
  if (compareVersion(fromVersion, toVersion) >= 0) return [];
  const lines = content.split(/\r?\n/);
  const out = [];
  let currentVersion = null;
  let currentTheme = "";
  let inRange = false;
  let inBullet = false;
  for (const raw of lines) {
    if (UNRELEASED_RE.test(raw)) {
      currentVersion = null;
      inRange = false;
      currentTheme = "";
      inBullet = false;
      continue;
    }
    const versionMatch = raw.match(VERSION_HEADING_RE);
    if (versionMatch) {
      currentVersion = versionMatch[1] ?? null;
      currentTheme = "";
      inBullet = false;
      inRange = currentVersion !== null && compareVersion(currentVersion, fromVersion) > 0 && compareVersion(currentVersion, toVersion) <= 0;
      continue;
    }
    if (!currentVersion) {
      continue;
    }
    const subsectionMatch = raw.match(SUBSECTION_HEADING_RE);
    if (subsectionMatch) {
      currentTheme = subsectionMatch[1] ?? "";
      inBullet = false;
      continue;
    }
    if (!inRange) continue;
    if (raw.startsWith("  ") || raw.startsWith("	")) {
      continue;
    }
    const bulletMatch = raw.match(BULLET_RE);
    if (bulletMatch) {
      const text = stripBulletDecor(bulletMatch[1] ?? "");
      if (text.length > 0) {
        out.push({
          version: currentVersion,
          theme: currentTheme,
          bullet: text
        });
        inBullet = true;
        if (out.length >= max) break;
      }
      continue;
    }
    if (raw.trim() === "") {
      inBullet = false;
    } else {
      inBullet = false;
    }
  }
  return out;
}
function compareVersion(a, b) {
  if (a === b) return 0;
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);
  const n = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < n; i++) {
    const av = partsA[i] ?? 0;
    const bv = partsB[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}
function parseVersionParts(v) {
  const cleaned = v.replace(/[^\d.]/g, "");
  if (!cleaned) return [0];
  return cleaned.split(".").map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}
function stripBulletDecor(text) {
  let s = text;
  s = s.replace(/^\*\*[^*]+\*\*\s*[:：]\s*/, "");
  s = s.replace(/\s*\(#[\d, #]+\)\s*$/, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ../core/src/update/prompt-text.ts
init_esm_shims();
function renderUpgradePrompt(input) {
  const { fromVersion, toVersion, bullets, snoozeLevel } = input;
  const lines = [];
  const sep = "\u2501".repeat(48);
  lines.push("");
  lines.push(sep);
  lines.push(`\u2728 TeamAgent ${toVersion} \u53EF\u7528 (\u4F60\u88C5\u7684\u662F ${fromVersion || "(unknown)"})`);
  lines.push(sep);
  if (bullets.length > 0) {
    lines.push("");
    lines.push("\u672C\u6B21\u65B0\u589E:");
    for (const b of bullets) {
      const themePrefix = b.theme ? `[${b.theme}] ` : "";
      lines.push(`  \u2022 ${themePrefix}${b.bullet}`);
    }
  }
  lines.push("");
  lines.push("\u4E09\u9009\u4E00:");
  lines.push("  A) teamagent update --now      \u7ACB\u523B\u5347\u7EA7 (\u524D\u53F0\u6267\u884C, \u51E0\u5341\u79D2)");
  lines.push("  B) teamagent update --snooze   \u4E0B\u6B21\u518D\u8BF4 (24h \u2192 48h \u2192 7d \u9000\u907F)");
  lines.push("  C) teamagent update --never    \u6C38\u8FDC\u522B\u95EE (--enable \u53EF\u6062\u590D)");
  if (snoozeLevel > 0) {
    lines.push("");
    lines.push(`(\u5DF2 snooze ${snoozeLevel} \u6B21, \u4E0B\u6B21 snooze \u5C06\u5EF6\u957F\u9000\u907F\u7A97\u53E3)`);
  }
  lines.push(sep);
  lines.push("");
  return lines.join("\n");
}
function renderWhatsNewTail(input) {
  const { installedVersion, bullets } = input;
  if (bullets.length === 0) return "";
  const lines = [];
  lines.push("");
  lines.push("\u2501".repeat(48));
  lines.push(`\u{1F195} \u672C\u6B21\u5B89\u88C5\u7684 ${installedVersion} \u65B0\u589E:`);
  lines.push("");
  for (const b of bullets) {
    const themePrefix = b.theme ? `[${b.theme}] ` : "";
    lines.push(`  \u2022 ${themePrefix}${b.bullet}`);
  }
  lines.push("");
  lines.push("\u8BE6\u60C5: teamagent whatsnew");
  lines.push("\u2501".repeat(48));
  return lines.join("\n");
}

// ../core/src/update/upgrade-events.ts
init_esm_shims();
function isoFromMs(epochMs) {
  return new Date(epochMs).toISOString();
}
function makeUpdatePromptShownEvent(input) {
  return {
    kind: "update-prompt-shown",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    fromVer: input.fromVer,
    toVer: input.toVer,
    snoozeLevel: input.snoozeLevel
  };
}
function makeUpdateSnoozedEvent(input) {
  return {
    kind: "update-snoozed",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    level: input.level,
    untilTs: input.untilTs
  };
}
function makeUpdateNeverSetEvent(input) {
  return {
    kind: "update-never-set",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs)
  };
}
function makeUpdateInstalledEvent(input) {
  return {
    kind: "update-installed",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    fromVer: input.fromVer,
    toVer: input.toVer,
    durationMs: input.durationMs
  };
}
function isUpgradeAttributionEvent(e) {
  return e.kind === "update-prompt-shown" || e.kind === "update-snoozed" || e.kind === "update-never-set" || e.kind === "update-installed";
}
function attributionToPersistedRow(e, randSuffix) {
  const id = `update-${e.kind}-${Date.parse(e.timestamp)}-${randSuffix}`;
  switch (e.kind) {
    case "update-prompt-shown":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          fromVer: e.fromVer,
          toVer: e.toVer,
          snoozeLevel: e.snoozeLevel
        }
      };
    case "update-snoozed":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          level: e.level,
          untilTs: e.untilTs
        }
      };
    case "update-never-set":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {}
      };
    case "update-installed":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          fromVer: e.fromVer,
          toVer: e.toVer,
          durationMs: e.durationMs
        }
      };
    default: {
      const _exhaustive = e;
      void _exhaustive;
      throw new Error(`unhandled upgrade event kind: ${e.kind}`);
    }
  }
}

// ../core/src/narrative-scanner/index.ts
init_esm_shims();

// ../core/src/narrative-scanner/scan.ts
init_esm_shims();
var MIN_ASCII_TOKEN_LENGTH = 3;
var MIN_CJK_TOKEN_LENGTH = 2;
function splitPatterns2(raw) {
  const tokens = [];
  for (const piece of raw.split("|")) {
    const t = piece.trim();
    if (t.length === 0) continue;
    const hasNonAscii = /[^\x00-\x7f]/.test(t);
    const min = hasNonAscii ? MIN_CJK_TOKEN_LENGTH : MIN_ASCII_TOKEN_LENGTH;
    if (t.length >= min) tokens.push(t);
  }
  return tokens;
}
function containsNonExtending2(textLower, patternLower) {
  const lastChar = patternLower[patternLower.length - 1] ?? "";
  if (!isLetterOrDigit2(lastChar)) {
    return textLower.includes(patternLower);
  }
  let offset = textLower.indexOf(patternLower);
  while (offset !== -1) {
    const afterIdx = offset + patternLower.length;
    const afterChar = afterIdx < textLower.length ? textLower[afterIdx] : "";
    if (!isLetterOrDigit2(afterChar)) return true;
    offset = textLower.indexOf(patternLower, offset + 1);
  }
  return false;
}
function isLetterOrDigit2(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 97 && code <= 122 || // a-z
  code >= 65 && code <= 90 || // A-Z
  code >= 48 && code <= 57;
}
function snippet(haystack, needle, pad = 20) {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle;
  const start = Math.max(0, idx - pad);
  const end = Math.min(haystack.length, idx + needle.length + pad);
  return haystack.slice(start, end);
}
function summarize(rule) {
  return rule.correct_pattern || rule.reasoning || rule.wrong_pattern || rule.id;
}
function scanNarrative(text, rules) {
  if (!text) return [];
  if (rules.length === 0) return [];
  const hits = [];
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!rule.wrong_pattern) continue;
    if (normalizeChannel(rule.channel) !== "ai-narrative") continue;
    const patterns = splitPatterns2(rule.wrong_pattern);
    for (const p of patterns) {
      if (p.length === 0) continue;
      if (containsNonExtending2(lower, p.toLowerCase())) {
        hits.push({
          knowledge_id: rule.id,
          matched_snippet: snippet(text, p),
          rule_summary: summarize(rule),
          confidence: rule.confidence,
          correct_pattern: rule.correct_pattern,
          reasoning: rule.reasoning
        });
        break;
      }
    }
  }
  return hits;
}

// ../core/src/narrative-scanner/pending-warnings.ts
init_esm_shims();
function formatPendingRecord(hit, ctx) {
  return {
    session_id: ctx.session_id,
    turn_index: ctx.turn_index,
    knowledge_id: hit.knowledge_id,
    matched_snippet: hit.matched_snippet,
    rule_summary: hit.rule_summary,
    confidence: hit.confidence,
    correct_pattern: hit.correct_pattern,
    reasoning: hit.reasoning,
    at: ctx.at
  };
}
function mergePending(existing, incoming) {
  const key = (p) => `${p.session_id}|${p.turn_index}|${p.knowledge_id}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const p of incoming) {
    if (!seen.has(key(p))) {
      out.push(p);
      seen.add(key(p));
    }
  }
  return out;
}
function selectTopForInjection(pending, max) {
  return [...pending].sort((a, b) => b.confidence - a.confidence).slice(0, max);
}
function formatInjectionText(warnings) {
  if (warnings.length === 0) return "";
  const lines = [
    "\u25C8 TeamAgent observation from previous turn",
    "In your previous reply the following patterns triggered team rules:"
  ];
  for (const w of warnings) {
    const hint = w.correct_pattern || w.reasoning || w.rule_summary;
    lines.push(
      `- "${w.matched_snippet.trim()}" (rule ${w.knowledge_id}, conf ${w.confidence.toFixed(2)}): ${hint}`
    );
  }
  lines.push("Please avoid such phrasing this turn and proceed based on evidence.");
  return lines.join("\n");
}

// ../core/src/hook/pre-tool-use-handler.ts
init_esm_shims();
function createPreToolUseHandler(deps) {
  return async (input) => {
    const { tool_name, tool_input } = input;
    const tool_use_id = input.tool_use_id ?? deps.idGen();
    const now = deps.now();
    const { matched, semanticHits } = await deps.matcher.match({ tool_name, tool_input });
    if (matched.length === 0) {
      const recent = deps.eventLog.readLast(50);
      const complied = detectCompliedSignals(tool_name, recent, new Date(now));
      for (const c of complied) {
        deps.eventLog.append({
          id: `e-complied-${tool_use_id}-${c.knowledge_id}`,
          kind: "ai.override.complied",
          knowledge_id: c.knowledge_id,
          tool_use_id,
          timestamp: now,
          schema_version: 1
        });
      }
      deps.eventLog.append({
        id: `e-${tool_use_id}-passed`,
        kind: "hook-pre.passed",
        tool_use_id,
        timestamp: now,
        schema_version: 1
      });
      if (deps.visibility === "verbose") {
        const n = typeof deps.ruleCount === "number" ? deps.ruleCount : 0;
        const hits = semanticHits ?? [];
        const hitSummary = hits.length > 0 ? `, \u8BED\u4E49\u547D\u4E2D ${hits.length} \u6761` : "";
        const lines = [`\u25C8 TeamAgent: \u2713 ${tool_name} \u653E\u884C (\u68C0\u67E5 ${n} \u6761\u89C4\u5219${hitSummary})`];
        for (const h of hits) {
          lines.push(`  \xB7 [${h.id}] ${sanitizeUserFacingText(h.trigger).slice(0, 40)} (score ${h.score.toFixed(2)})`);
        }
        return { permissionDecision: "allow", systemMessage: lines.join("\n") };
      }
      return { permissionDecision: "allow" };
    }
    const sorted = [...matched].sort(
      (a, b) => severityOrder(b.enforcement) - severityOrder(a.enforcement)
    );
    const top = sorted[0];
    const nowDate = new Date(now);
    if (top.enforcement === "block") {
      const reason2 = formatBlockReason(top, nowDate, deps.formatStyle);
      deps.eventLog.append({
        id: `e-${tool_use_id}-blocked`,
        kind: "hook-pre.blocked",
        knowledge_id: top.id,
        tool_use_id,
        tool_name,
        // M3: 供 detectBlockedCircumventedSignals 用
        timestamp: now,
        schema_version: 1
      });
      return { permissionDecision: "allow", systemMessage: reason2 };
    }
    if (top.enforcement === "passive") {
      deps.eventLog.append({
        id: `e-${tool_use_id}-passive`,
        kind: "hook-pre.passive_matched",
        knowledge_id: top.id,
        tool_use_id,
        tool_name,
        timestamp: now,
        schema_version: 1
      });
      return { permissionDecision: "allow" };
    }
    const reason = formatWarnMessage(top, nowDate, deps.formatStyle);
    deps.eventLog.append({
      id: `e-${tool_use_id}-warned`,
      kind: "hook-pre.warned",
      knowledge_id: top.id,
      tool_use_id,
      tool_name,
      // M2.5: 供 detectCompliedSignals 用
      timestamp: now,
      schema_version: 1
    });
    return { permissionDecision: "allow", systemMessage: reason };
  };
}
function severityOrder(e) {
  return { block: 3, warn: 2, suggest: 1, passive: 0 }[e] ?? 0;
}
function relativeTime(dateStr, now) {
  const diffMs = now.getTime() - new Date(dateStr).getTime();
  if (isNaN(diffMs)) return "\u672A\u77E5";
  const days = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
  if (days < 1) return "\u4ECA\u5929";
  if (days < 7) return `${days}\u5929\u524D`;
  if (days < 30) return `${Math.floor(days / 7)}\u5468\u524D`;
  return `${Math.floor(days / 30)}\u4E2A\u6708\u524D`;
}
function formatWarnMessage(rule, now, style) {
  if (style === "ascii-box") {
    return formatLegacyWarnBox(rule, now);
  }
  return formatHumaneBlock(
    rule,
    now,
    /*severity*/
    "warn"
  );
}
function formatBlockReason(rule, now, style) {
  if (style === "ascii-box") {
    return formatLegacyBlockBox(rule, now);
  }
  return formatHumaneBlock(
    rule,
    now,
    /*severity*/
    "block"
  );
}
function formatHumaneBlock(rule, now, severity) {
  const age = rule.created_at ? relativeTime(rule.created_at, now) : "\u672A\u77E5";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const hitCount = typeof rule.hit_count === "number" ? rule.hit_count : 0;
  const ruleIdShort = ruleIdShortForm(rule.id ?? rule.rule_id);
  const correct = sanitizeUserFacingText(rule.correct_pattern ?? rule.trigger ?? "");
  const summary = sanitizeUserFacingText(
    rule.summary ?? rule.trigger ?? rule.wrong_pattern ?? "\u9700\u8981\u6CE8\u610F"
  );
  const prefix = severity === "block" ? "\u26A0\uFE0F TeamAgent \u62E6\u4E86\u4E00\u4E0B" : "\u26A0\uFE0F TeamAgent \u63D0\u9192";
  const firstLine2 = trimAt(`${prefix} \u2014 ${summary}`, 80);
  const suggestionLine = correct ? `   \u590D\u5236\u5373\u53EF: ${trimAt(correct, 200)}` : `   \u5EFA\u8BAE: \u89C1\u4E0B\u65B9\u89C4\u5219\u7EC6\u8282`;
  const hitPart = severity === "block" ? ` \xB7 \u5DF2\u89E6\u53D1 ${hitCount} \u6B21` : "";
  const detailLine = `   \u7EC6\u8282: conf=${conf} ${age}\u5B66\u5230${hitPart}${ruleIdShort ? ` rule=${ruleIdShort}` : ""}`;
  return [firstLine2, suggestionLine, detailLine].join("\n");
}
function formatLegacyWarnBox(rule, now) {
  const age = rule.created_at ? relativeTime(rule.created_at, now) : "\u672A\u77E5";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const correct = sanitizeUserFacingText(rule.correct_pattern ?? rule.trigger ?? "");
  const wrong = sanitizeUserFacingText(rule.wrong_pattern ?? "");
  const reasoning = sanitizeUserFacingText(rule.reasoning ?? "");
  const lines = [`\u7F6E\u4FE1\u5EA6 ${conf} \xB7 ${age}\u5B66\u5230`];
  if (wrong) lines.push(...formatRuleField("\u907F\u514D", wrong));
  if (correct) lines.push(...formatRuleField("\u4F7F\u7528", correct));
  if (reasoning) lines.push(...formatRuleField("\u7406\u7531", reasoning));
  return formatAsciiRuleBlock("TeamAgent \u7ECF\u9A8C\u63D0\u9192", lines);
}
function formatLegacyBlockBox(rule, now) {
  const age = rule.created_at ? relativeTime(rule.created_at, now) : "\u672A\u77E5";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const hitCount = typeof rule.hit_count === "number" ? rule.hit_count : 0;
  const correct = sanitizeUserFacingText(rule.correct_pattern ?? rule.trigger ?? "");
  const wrong = sanitizeUserFacingText(rule.wrong_pattern ?? "");
  const reasoning = sanitizeUserFacingText(rule.reasoning ?? "");
  const lines = [`\u7F6E\u4FE1\u5EA6 ${conf} \xB7 \u5DF2\u89E6\u53D1 ${hitCount} \u6B21 \xB7 ${age}\u5B66\u5230`];
  if (wrong) lines.push(...formatRuleField("\u907F\u514D", wrong));
  if (correct) lines.push(...formatRuleField("\u4F7F\u7528", correct));
  if (reasoning) lines.push(...formatRuleField("\u7406\u7531", reasoning));
  return formatAsciiRuleBlock("TeamAgent \u5F3A\u70C8\u63D0\u9192", lines);
}
function trimAt(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}
function ruleIdShortForm(id) {
  if (typeof id !== "string" || id.length === 0) return "";
  const tail = id.split("-").pop();
  if (!tail) return id.slice(0, 8);
  return tail.length > 8 ? tail.slice(0, 8) : tail;
}
var RULE_BOX_WIDTH = 72;
var RULE_BOX_INNER_WIDTH = RULE_BOX_WIDTH - 4;
function formatRuleField(label, value) {
  return wrapRuleLine(`${label}: ${value}`, RULE_BOX_INNER_WIDTH);
}
function formatAsciiRuleBlock(title, lines) {
  const titlePrefix = `+-- ${title} `;
  const titleBorder = "-".repeat(Math.max(2, RULE_BOX_WIDTH - titlePrefix.length - 1));
  const border = `+${"-".repeat(RULE_BOX_WIDTH - 2)}+`;
  const body = lines.flatMap((line) => wrapRuleLine(line, RULE_BOX_INNER_WIDTH));
  return [
    `${titlePrefix}${titleBorder}+`,
    ...body.map((line) => `| ${line.padEnd(RULE_BOX_INNER_WIDTH, " ")} |`),
    border
  ].join("\n");
}
function wrapRuleLine(line, width) {
  if (line.length <= width) return [line];
  const wrapped = [];
  let current = "";
  for (const word of line.split(/(\s+)/)) {
    if (word.length === 0) continue;
    if (/^\s+$/.test(word)) {
      if (current && !current.endsWith(" ")) current += " ";
      continue;
    }
    if (word.length > width) {
      if (current.trim()) {
        wrapped.push(current.trimEnd());
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        wrapped.push(word.slice(i, i + width));
      }
      continue;
    }
    if ((current + word).length > width) {
      if (current.trim()) wrapped.push(current.trimEnd());
      current = word;
    } else {
      current += word;
    }
  }
  if (current.trim()) wrapped.push(current.trimEnd());
  return wrapped.length > 0 ? wrapped : [line.slice(0, width)];
}

// ../core/src/hook/post-tool-use-handler.ts
init_esm_shims();
function createPostToolUseHandler(deps) {
  return async (input) => {
    const tool_use_id = input.tool_use_id ?? deps.idGen();
    const { tool_response } = input;
    const now = deps.now();
    const success = inferToolSuccess(tool_response);
    const recent = deps.eventLog.readLast(50);
    const preEvents = recent.filter(
      (e) => e.tool_use_id === tool_use_id && e.kind.startsWith("hook-pre.")
    );
    for (const pre of preEvents) {
      if (!pre.knowledge_id) continue;
      deps.eventLog.append({
        id: `e-post-${tool_use_id}-${pre.knowledge_id}`,
        kind: "hook-post.result",
        knowledge_id: pre.knowledge_id,
        tool_use_id,
        timestamp: now,
        schema_version: 1,
        payload: { success, source_pre_kind: pre.kind }
      });
    }
    const ignoredList = detectIgnoredSignals(tool_use_id, recent);
    for (const ig of ignoredList) {
      deps.eventLog.append({
        id: `e-override-ignored-${tool_use_id}-${ig.knowledge_id}`,
        kind: "ai.override.ignored",
        knowledge_id: ig.knowledge_id,
        tool_use_id,
        timestamp: now,
        schema_version: 1
      });
    }
    const toolName = input.tool_name;
    if (success && toolName) {
      const circumList = detectBlockedCircumventedSignals(
        toolName,
        recent,
        new Date(now)
      );
      for (const c of circumList) {
        deps.eventLog.append({
          id: `e-override-circum-${tool_use_id}-${c.knowledge_id}`,
          kind: "ai.override.blocked_circumvented",
          knowledge_id: c.knowledge_id,
          tool_use_id,
          timestamp: now,
          schema_version: 1
        });
      }
    }
    return {};
  };
}
function inferToolSuccess(toolResponse) {
  if (toolResponse === null || toolResponse === void 0) return true;
  if (typeof toolResponse !== "object") return true;
  const r = toolResponse;
  if (r.is_error && r.is_error !== false && r.is_error !== 0) return false;
  if (r.error) return false;
  if (typeof r.exit_code === "number" && r.exit_code !== 0) return false;
  return true;
}

// ../core/src/m5/manifest.ts
init_esm_shims();
function parseManifest(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`manifest: invalid JSON: ${e.message}`);
  }
  validateManifest(raw);
  return raw;
}
function validateManifest(m) {
  if (m === null || typeof m !== "object") {
    throw new Error("manifest: must be an object");
  }
  if (m.schema_version !== 1) {
    throw new Error(
      `manifest: unsupported schema_version ${m.schema_version}; expected 1`
    );
  }
  if (typeof m.teamagent_version !== "string") {
    throw new Error("manifest: teamagent_version must be a string");
  }
  if (!Array.isArray(m.required_plugins)) {
    throw new Error("manifest: required_plugins must be an array");
  }
  if (!Array.isArray(m.required_project_skills)) {
    throw new Error("manifest: required_project_skills must be an array");
  }
  if (!Array.isArray(m.required_hooks)) {
    throw new Error("manifest: required_hooks must be an array");
  }
  if (typeof m.created_by !== "string" || m.created_by.length === 0) {
    throw new Error("manifest: created_by must be non-empty string");
  }
  if (typeof m.created_at !== "string") {
    throw new Error("manifest: created_at must be ISO 8601 string");
  }
}
function serializeManifest(m) {
  const sorted = {};
  for (const k of Object.keys(m).sort()) {
    sorted[k] = m[k];
  }
  return JSON.stringify(sorted, null, 2);
}

// ../core/src/m5/infect-planner.ts
init_esm_shims();
var PRE_COMMIT_HOOK = `#!/usr/bin/env bash
# TeamAgent M5 pre-commit anchor (multi-point enforcement, M5-D \u964D\u7EA7\u6A21\u5F0F)
# \u8BBE\u8BA1\uFF1A\u8B66\u544A\u800C\u4E0D\u963B\u585E\u2014\u2014TeamAgent \u7F3A\u5931/\u5931\u8D25\u4E0D\u80FD\u8BA9\u5168\u961F\u5DE5\u4F5C\u762B
# Escape: \u8BBE TEAMAGENT_BOOTSTRAP_SKIP=1 \u8DF3\u8FC7

if [ "\${TEAMAGENT_BOOTSTRAP_SKIP:-}" = "1" ]; then
  exit 0
fi

if ! command -v teamagent >/dev/null 2>&1; then
  echo "[teamagent] \u8B66\u544A\uFF1A\u672C\u673A\u672A\u5B89\u88C5 TeamAgent CLI" >&2
  echo "[teamagent] \u63D0\u793A\uFF1Anpm install -g github:libz-renlab-ai/TeamBrain#release" >&2
  exit 0  # \u4E0D\u963B\u585E commit
fi

# \u517C\u5BB9\u65E7\u7248\u672C teamagent\uFF1A\u5148\u68C0\u6D4B\u662F\u5426\u652F\u6301 m5-bootstrap\uFF0C\u907F\u514D\u8F93\u51FA"\u672A\u77E5\u547D\u4EE4"
if teamagent --help 2>&1 | grep -q "m5-bootstrap"; then
  # \u663E\u5F0F\u53D6 git repo root \u4F20\u7ED9 --project-root\uFF0C\u907F\u514D wrapper / pnpm / nvm \u7B49\u6539\u53D8 pwd
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  teamagent m5-bootstrap --project-root "$REPO_ROOT" --check 2>&1 || true
else
  echo "[teamagent] \u63D0\u793A\uFF1A\u672C\u673A teamagent \u7248\u672C\u4E0D\u652F\u6301 m5-bootstrap (M5+)" >&2
  echo "[teamagent] \u5347\u7EA7\uFF1Anpm install -g github:libz-renlab-ai/TeamBrain#release" >&2
fi
exit 0
`;
var SHARED_CLAUDE_MD = `# Shared CLAUDE.md (M5)

This file is auto-merged into the project's CLAUDE.md when team members run
\`teamagent compile\`. Edit shared rules / conventions here; they sync across
the team via git.
`;
var POST_MERGE_HOOK = `#!/usr/bin/env bash
# TeamAgent M5 post-merge\uFF1A\u62C9\u53D6\u540E\u81EA\u52A8\u540C\u6B65\u56E2\u961F\u89C4\u5219\u8FDB\u672C\u5730 KB
# \u8BBE\u8BA1\uFF1A\u8B66\u544A\u800C\u4E0D\u963B\u585E\u2014\u2014sync \u5931\u8D25\u4E0D\u80FD\u8BA9 git pull \u5931\u8D25

if [ "\${TEAMAGENT_BOOTSTRAP_SKIP:-}" = "1" ]; then
  exit 0
fi

if ! command -v teamagent >/dev/null 2>&1; then
  exit 0
fi

if teamagent --help 2>&1 | grep -q "m5-sync"; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  teamagent m5-sync --project-root "$REPO_ROOT" --apply 2>&1 || true
fi
exit 0
`;
function planInfection(snap, input) {
  const files = {};
  const dirs = [];
  if (!snap.has_manifest) {
    const manifest = {
      schema_version: 1,
      teamagent_version: input.teamagent_version,
      required_plugins: [],
      required_project_skills: [],
      required_hooks: ["UserPromptSubmit", "Stop"],
      created_by: input.author,
      created_at: input.now
    };
    files[".teamagent/manifest.json"] = serializeManifest(manifest);
  }
  if (!snap.has_team_dir) dirs.push(".teamagent/team");
  if (!snap.has_shared_skills_dir) dirs.push(".teamagent/shared-skills");
  if (!snap.has_shared_claude_md) {
    files[".teamagent/shared-claude.md"] = SHARED_CLAUDE_MD;
  }
  if (!snap.has_githooks_dir) dirs.push(".githooks");
  const nonHookMissing = Object.keys(files).length > 0 || dirs.length > 0;
  const hookMissing = !snap.has_pre_commit_hook || !snap.has_post_merge_hook;
  const required = nonHookMissing || hookMissing;
  if (required) {
    files[".githooks/pre-commit"] = PRE_COMMIT_HOOK;
    files[".githooks/post-merge"] = POST_MERGE_HOOK;
  }
  return {
    required,
    files_to_create: files,
    dirs_to_create: dirs
  };
}

// ../core/src/m5/bootstrap-diff.ts
init_esm_shims();
function computeBootstrapDiff(m, s) {
  const installVer = needsTeamagentVersion(m.teamagent_version, s.teamagent_version);
  const missingPlugins = diffMissing(m.required_plugins, s.installed_plugins);
  const missingSkills = diffMissing(
    m.required_project_skills,
    s.installed_project_skills
  );
  const missingHooks = diffMissing(
    m.required_hooks,
    s.installed_hooks
  );
  const needs = installVer !== null || missingPlugins.length > 0 || missingSkills.length > 0 || missingHooks.length > 0;
  return {
    needs_bootstrap: needs,
    install_teamagent_version: installVer,
    install_plugins: missingPlugins,
    install_project_skills: missingSkills,
    install_hooks: missingHooks
  };
}
function needsTeamagentVersion(required, installed) {
  if (required === "") return null;
  if (installed === null) return required;
  if (compareSemver(installed, required) >= 0) return null;
  return required;
}
function diffMissing(required, installed) {
  const have = new Set(installed);
  return required.filter((x) => !have.has(x));
}
function compareSemver(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10) | 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) | 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

// ../core/src/m5/secret-scanner.ts
init_esm_shims();
var MAX_SCAN_INPUT_BYTES = 4096;
var PATTERNS2 = [
  // 绝对路径
  {
    kind: "absolute_path",
    pattern: /(?:\/Users|\/home|\/root|\/etc|\/var|\/opt|\/tmp|\/mnt|\/data|\/private\/var)\/[A-Za-z0-9._-]+/g
  },
  {
    kind: "absolute_path",
    pattern: /[A-Za-z]:\\(?:Users|Program Files|Program Files \(x86\)|Windows|ProgramData)\\[A-Za-z0-9._\\-]+/g
  },
  // 邮箱
  {
    kind: "email",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  },
  // 电话（中美常见格式；保守以避免误杀短数字串）
  {
    kind: "phone",
    pattern: /(?:\+?1[\s-]?)?\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}\b|\b1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}\b/g
  },
  // === api_token rules (placed BEFORE credit_card so overlap dedup picks
  //     the more-specific kind — W15-008) ===
  // OpenAI sk- token / Anthropic sk-ant- — W15-008: min 19 (was 20) so a
  // single character less than the historical limit no longer slips into
  // the credit_card pattern by accident.
  {
    kind: "api_token",
    pattern: /\bsk-[A-Za-z0-9_-]{19,}\b/g
  },
  // OpenAI org-scoped sk_proj / sk_test variants (W15-004 base64-decoded form)
  {
    kind: "api_token",
    pattern: /\bsk_(?:proj|test|live|org)[A-Za-z0-9_-]{15,}\b/g
  },
  // Stripe live/test key (sk_live_, sk_test_, pk_live_, pk_test_, rk_live_, etc.)
  {
    kind: "api_token",
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g
  },
  // GitHub PAT
  {
    kind: "api_token",
    pattern: /\bgh[psuro]_[A-Za-z0-9_]{16,}\b/g
  },
  // GitLab PAT
  {
    kind: "api_token",
    pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g
  },
  // Slack tokens
  {
    kind: "api_token",
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g
  },
  // AWS Access Key
  {
    kind: "api_token",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g
  },
  // Google API Key (AIzaSy...)
  {
    kind: "api_token",
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g
  },
  // === Webhook URLs (W15-006) — promoted to api_token kind so they seal
  //     L1 just like a real bearer token. Publishing one of these to a
  //     team git repo lets anyone post arbitrary messages to the channel. ===
  {
    kind: "api_token",
    // Slack incoming webhook
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/g
  },
  {
    kind: "api_token",
    // Discord incoming webhook
    pattern: /https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g
  },
  {
    kind: "api_token",
    // Microsoft Teams incoming webhook
    pattern: /https:\/\/[A-Za-z0-9-]+\.webhook\.office\.com\/webhookb2\/[A-Za-z0-9@/-]+\/IncomingWebhook\/[A-Za-z0-9/_-]+/g
  },
  // PEM-encoded private keys (RSA/EC/OPENSSH/generic)
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  },
  // Database connection string with embedded password
  // postgres://user:password@host, mongodb://user:pass@host, mysql://, redis://
  {
    kind: "api_token",
    pattern: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis|amqp|amqps):\/\/[A-Za-z0-9._%+-]+:[^\s@]{4,}@[A-Za-z0-9.-]+/g
  },
  // JWT 三段式（base64url. base64url. base64url）
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  // === credit_card LAST so api_token wins overlap dedup (W15-008) ===
  // Two non-backtracking alternatives: a contiguous 13-19 digit run, or
  // a standard 4-4-4-x card number with consistent separators. The
  // historical pattern /\b(?:\d[ -]?){13,19}\b/g exhibited catastrophic
  // backtracking on long alternating digit/whitespace blobs (W15-013).
  {
    kind: "credit_card",
    pattern: /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/g
  }
];
var SPACE_FRAGMENT_RE = /[\s ]+/g;
function isPrintable(s) {
  if (!s.length) return false;
  let printable = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 && c < 127 || c === 9 || c === 10 || c === 13) {
      printable++;
    }
  }
  return printable / s.length >= 0.8;
}
function scanRaw(text) {
  const out = [];
  for (const rule of PATTERNS2) {
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(text)) !== null) {
      out.push({
        kind: rule.kind,
        snippet: redact(m[0]),
        start: m.index,
        end: m.index + m[0].length
      });
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  return out;
}
function scanBase64Recursive(text, outerAnchor, prefix, depthRemaining, out) {
  if (depthRemaining <= 0) return;
  const re = /[A-Za-z0-9+/]{20,}={0,2}/g;
  let cand;
  while ((cand = re.exec(text)) !== null) {
    let decoded;
    try {
      decoded = Buffer.from(cand[0], "base64").toString("utf-8");
    } catch {
      continue;
    }
    if (!isPrintable(decoded)) continue;
    const anchor = outerAnchor ?? { start: cand.index, end: cand.index + cand[0].length };
    for (const inner of scanRaw(decoded)) {
      out.push({
        kind: inner.kind,
        snippet: `${prefix}${inner.snippet}`,
        start: anchor.start,
        end: anchor.end
      });
    }
    scanBase64Recursive(decoded, anchor, `b64:${prefix}`, depthRemaining - 1, out);
  }
}
function dedupApiTokenOverCreditCard(matches) {
  const apiTokens = matches.filter((m) => m.kind === "api_token");
  return matches.filter((m) => {
    if (m.kind !== "credit_card") return true;
    const overlaps = apiTokens.some(
      (a) => Math.max(a.start, m.start) < Math.min(a.end, m.end)
    );
    return !overlaps;
  });
}
function scanForSecrets(text) {
  const safe = text.length > MAX_SCAN_INPUT_BYTES ? text.slice(0, MAX_SCAN_INPUT_BYTES) : text;
  const matches = scanRaw(safe);
  const collapsed = safe.replace(SPACE_FRAGMENT_RE, "");
  if (collapsed !== safe) {
    for (const m of scanRaw(collapsed)) {
      const already = matches.some(
        (x) => x.kind === m.kind && x.snippet === m.snippet
      );
      if (!already) matches.push(m);
    }
  }
  scanBase64Recursive(safe, null, "b64:", 2, matches);
  const deduped = dedupApiTokenOverCreditCard(matches);
  return { hit: deduped.length > 0, matches: deduped };
}
function redact(s) {
  if (s.length <= 4) return "[redacted]";
  return `${s.slice(0, 4)}[redacted-${s.length}]`;
}
function createSecretScanner() {
  return {
    async scan(text) {
      return scanForSecrets(text);
    }
  };
}

// ../core/src/m5/scope-classifier.ts
init_esm_shims();
var PERSONAL_SIGNALS = [
  {
    pattern: /(?:\/Users|\/home|\/root)\/[A-Za-z0-9._-]+/,
    reason: "\u5305\u542B\u672C\u673A\u7EDD\u5BF9\u8DEF\u5F84"
  },
  {
    pattern: /[A-Za-z]:\\(?:Users|Program Files)\\/,
    reason: "\u5305\u542B Windows \u7528\u6237\u76EE\u5F55\u8DEF\u5F84"
  },
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    reason: "\u5305\u542B\u5177\u4F53\u90AE\u7BB1"
  },
  {
    pattern: /(?:张|李|王|刘|陈|杨|赵|周|吴|徐|孙|马|朱|胡|郭|何|高|林|罗|郑)[一-龥]{1,3}(?:之前|之前在|说过|告诉|认为|说不行|说行)/,
    reason: "\u5305\u542B\u5177\u4F53\u4EBA\u540D + \u4E0A\u4E0B\u6587"
  },
  // W15-007: free-text personal-context markers — these mean "this is my
  // own working note", which the historical classifier ignored on
  // mixed-language input that also contained an engineering keyword
  // ("PR", "review", "CI", ...) and got auto-promoted to L2.
  {
    pattern: /我个人|我的电脑|我自己|我本机|私人(?:笔记|记录|草稿)?|本地草稿|草稿(?:版|本)?(?![一-鿿]*(?:协议|流程|约定))/,
    reason: "\u51FA\u73B0\u4E2A\u4EBA/\u672C\u673A/\u8349\u7A3F\u7B49\u79C1\u4EBA\u4E0A\u4E0B\u6587\u6807\u8BB0"
  },
  {
    pattern: /\b(?:my\s+(?:personal|local|own|private)|just\s+for\s+me|local\s+note|draft\s+note)\b/i,
    reason: "\u51FA\u73B0 personal / local / draft \u7B49\u82F1\u6587\u79C1\u4EBA\u6807\u8BB0"
  }
];
var SHAREABLE_SIGNALS = [
  {
    pattern: /\b(PR|merge|commit|review|CI|test|typecheck|lint)\b/i,
    reason: "\u8BA8\u8BBA PR/CI/\u6D4B\u8BD5\u7B49\u5DE5\u7A0B\u6D41\u7A0B"
  },
  {
    pattern: /(契约|测试|实现|端到端|纯函数|签名|抽象|接口|Port|Adapter)/,
    reason: "\u8BA8\u8BBA\u4EE3\u7801\u6A21\u5F0F\u6216\u67B6\u6784\u6982\u5FF5"
  },
  {
    pattern: /(?:必须|应当|不要|禁止|建议|应该|不该|约定)/,
    reason: "\u660E\u786E\u9648\u8FF0\u9879\u76EE\u7EA6\u5B9A\u6216\u89C4\u5219"
  },
  {
    pattern: /\b(?:codex|claude|chatgpt|gpt|llm|agent|hook)\b/i,
    reason: "\u8BA8\u8BBA AI/\u5DE5\u5177\u94FE\u4F7F\u7528\u7ECF\u9A8C"
  }
];
function classifyScope(text) {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return {
      scope: "uncertain",
      reason: "\u6587\u672C\u592A\u77ED\uFF0C\u65E0\u6CD5\u5224\u65AD"
    };
  }
  const personalHits = PERSONAL_SIGNALS.filter((s) => s.pattern.test(text));
  if (personalHits.length > 0) {
    return {
      scope: "personal",
      reason: `\u547D\u4E2D personal \u4FE1\u53F7: ${personalHits.map((h) => h.reason).join("; ")}`
    };
  }
  const shareableHits = SHAREABLE_SIGNALS.filter((s) => s.pattern.test(text));
  if (shareableHits.length >= 1) {
    return {
      scope: "shareable",
      reason: `\u547D\u4E2D shareable \u4FE1\u53F7: ${shareableHits.map((h) => h.reason).join("; ")}`
    };
  }
  return {
    scope: "personal",
    reason: "\u672A\u547D\u4E2D\u4EFB\u4F55\u5F3A\u4FE1\u53F7\u2014\u2014\u4FDD\u5B88\u6309 personal"
  };
}
function createScopeClassifier() {
  return {
    async classify(text) {
      return classifyScope(text);
    }
  };
}

// ../core/src/m5/auto-share-pipeline.ts
init_esm_shims();
function decideShareAction(input) {
  if (input.scan.hit) {
    const kinds = Array.from(
      new Set(input.scan.matches.map((m) => m.kind))
    ).join(", ");
    return {
      kind: "seal_in_l1",
      reason: `\u95F8\u95E8 1 \u547D\u4E2D\uFF08${kinds}\uFF09\uFF0C\u6C38\u5C01 L1\uFF0C\u4E0D\u53EF\u63A8 L2`
    };
  }
  if (input.userOverride === "personal") {
    return {
      kind: "keep_in_l1",
      reason: "\u7528\u6237\u663E\u5F0F\u6807\u8BB0 personal"
    };
  }
  if (input.userOverride === "team") {
    return {
      kind: "promote_to_l2",
      reason: "\u7528\u6237\u663E\u5F0F\u6807\u8BB0 team\uFF08\u95F8\u95E8 1 \u5DF2\u901A\u8FC7\uFF09"
    };
  }
  if (input.classification.scope === "shareable") {
    return {
      kind: "promote_to_l2",
      reason: `\u81EA\u52A8\u5206\u7C7B: ${input.classification.reason}`
    };
  }
  return {
    kind: "keep_in_l1",
    reason: `\u81EA\u52A8\u5206\u7C7B ${input.classification.scope}: ${input.classification.reason}`
  };
}

// ../core/src/m5/team-rule.ts
init_esm_shims();
function serializeTeamRule(r) {
  return JSON.stringify(sortDeep(r), null, 2);
}
function parseTeamRule(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`team-rule: invalid JSON: ${e.message}`);
  }
  validateTeamRule(raw);
  return raw;
}
var SAFE_RULE_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
var SAFE_AUTHOR_RE = /^[A-Za-z0-9._-]{1,100}$/;
var VALID_SCOPES = /* @__PURE__ */ new Set(["personal", "team", "global"]);
function validateTeamRule(r) {
  if (!r || typeof r !== "object") {
    throw new Error("team-rule: must be an object");
  }
  if (typeof r.rule_id !== "string" || r.rule_id.length === 0) {
    throw new Error("team-rule: rule_id required");
  }
  if (!SAFE_RULE_ID_RE.test(r.rule_id)) {
    throw new Error(
      `team-rule: rule_id "${r.rule_id}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`
    );
  }
  if (typeof r.author !== "string" || r.author.length === 0) {
    throw new Error("team-rule: author required");
  }
  if (!SAFE_AUTHOR_RE.test(r.author)) {
    throw new Error(
      `team-rule: author "${r.author}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`
    );
  }
  const c = r.current;
  if (!c || typeof c !== "object") {
    throw new Error("team-rule: current required");
  }
  if (c.deleted === true) {
    if (typeof c.deleted_by !== "string") {
      throw new Error("team-rule: deleted requires deleted_by");
    }
    if (typeof c.deleted_ts !== "string") {
      throw new Error("team-rule: deleted requires deleted_ts");
    }
  } else {
    const alive = c;
    if (typeof alive.content !== "string") {
      throw new Error("team-rule: alive requires content");
    }
    if (typeof alive.modified_by !== "string") {
      throw new Error("team-rule: alive requires modified_by");
    }
    if (typeof alive.modified_ts !== "string") {
      throw new Error("team-rule: alive requires modified_ts");
    }
    if ("confidence" in alive && alive.confidence !== void 0) {
      const conf = alive.confidence;
      if (typeof conf !== "number" || !Number.isFinite(conf) || conf < 0 || conf > 1) {
        throw new Error(
          `team-rule: confidence must be a number in [0, 1], got ${JSON.stringify(conf)}`
        );
      }
    }
    if ("scope" in alive && alive.scope !== void 0) {
      if (!VALID_SCOPES.has(alive.scope)) {
        throw new Error(
          `team-rule: scope "${alive.scope}" not in {personal, team, global}`
        );
      }
    }
  }
}
function isSafeRuleId(s) {
  return SAFE_RULE_ID_RE.test(s);
}
function isSafeAuthor(s) {
  return SAFE_AUTHOR_RE.test(s);
}
var WINDOWS_MAX_PATH_BUDGET = 250;
function estimateTeamRulePathLength(projectRoot, author, ruleId) {
  const FIXED = ".teamagentteam.json";
  return projectRoot.length + 1 + // sep
  FIXED.length + 3 + // 3 more separators after .teamagent / team / <author>
  author.length + ruleId.length;
}
function isTeamRulePathLengthSafe(projectRoot, author, ruleId, budget = WINDOWS_MAX_PATH_BUDGET) {
  return estimateTeamRulePathLength(projectRoot, author, ruleId) <= budget;
}
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const o = {};
    for (const k of Object.keys(value).sort()) {
      o[k] = sortDeep(value[k]);
    }
    return o;
  }
  return value;
}

// ../core/src/m5/lww-merge.ts
init_esm_shims();
function mergeLww(claims) {
  if (claims.length === 0) {
    return {
      winner: void 0,
      winner_claim_author: void 0,
      original_author: void 0
    };
  }
  let best = claims[0];
  let bestTs = effectiveTs(best.file.current);
  for (let i = 1; i < claims.length; i++) {
    const c = claims[i];
    const ts = effectiveTs(c.file.current);
    if (ts > bestTs) {
      best = c;
      bestTs = ts;
    } else if (ts === bestTs) {
      if (c.claim_author < best.claim_author) {
        best = c;
      }
    }
  }
  return {
    winner: best.file.current,
    winner_claim_author: best.claim_author,
    original_author: best.file.author
  };
}
function effectiveTs(s) {
  return s.deleted ? s.deleted_ts : s.modified_ts;
}
function mergeLwwBatch(allClaims) {
  const byId = /* @__PURE__ */ new Map();
  for (const c of allClaims) {
    const arr = byId.get(c.file.rule_id) ?? [];
    arr.push(c);
    byId.set(c.file.rule_id, arr);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [id, arr] of byId) {
    out.set(id, mergeLww(arr));
  }
  return out;
}

// ../core/src/m5/team-rule-projection.ts
init_esm_shims();
function teamRuleToKnowledgeEntry(ruleId, alive, originalAuthor, teamId) {
  const confidence = alive.confidence;
  const nature = "objective";
  const enforcement = computeEnforcement(confidence, nature);
  return {
    id: ruleId,
    scope: {
      level: "team",
      ...teamId ? { project: teamId } : {}
    },
    category: "K",
    // K = knowledge / practice，最通用
    tags: ["m5-team-sync", `original-author:${originalAuthor}`],
    type: "practice",
    // team rules 默认 practice
    nature,
    trigger: "",
    // 没结构化字段——团队规则只有自由文本
    wrong_pattern: "",
    correct_pattern: "",
    reasoning: alive.content,
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: alive.modified_ts,
    last_hit_at: "",
    last_validated_at: "",
    source: "team-shared",
    // 把 originalAuthor 编进 tags 便于追溯
    // 注意：source 字段是受约束 enum，不能塞自由字符串
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: alive.modified_ts,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0
  };
}

// ../core/src/packs/index.ts
init_esm_shims();
var PROMPT_VERSION = 1;
var PROMPT_OPEN_MARKER = `<!-- teamagent-pack-prompt v${PROMPT_VERSION} -->`;
var PROMPT_CLOSE_MARKER = `<!-- /teamagent-pack-prompt v${PROMPT_VERSION} -->`;
var OBSERVED_FILE_LIST = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "Dockerfile",
  "requirements.txt",
  "go.mod"
];
var PackMetaSchema = external_exports.object({
  name: external_exports.string().min(1),
  description: external_exports.string(),
  tags: external_exports.array(external_exports.string()),
  file_hints: external_exports.array(external_exports.string()),
  prompt_version: external_exports.literal(PROMPT_VERSION)
});
function parsePackMeta(text) {
  const obj = JSON.parse(text);
  return PackMetaSchema.parse(obj);
}
function packTag(name) {
  return `pack:${name}`;
}
function entryHasPackTag(entry, name) {
  if (!entry.tags || entry.tags.length === 0) return false;
  return entry.tags.includes(packTag(name));
}
function diffPackRequest(input) {
  const expanded = expandAll(input.requested, input.available);
  const seen = /* @__PURE__ */ new Set();
  const toAdd = [];
  const alreadyInstalled = [];
  const notFound = [];
  const installedSet = new Set(input.installed);
  const availableSet = new Set(input.available);
  for (const name of expanded) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!availableSet.has(name)) {
      notFound.push(name);
      continue;
    }
    if (installedSet.has(name)) {
      alreadyInstalled.push(name);
      continue;
    }
    toAdd.push(name);
  }
  return { toAdd, alreadyInstalled, notFound };
}
function expandAll(requested, available) {
  if (requested.length === 1 && requested[0] === "all") return [...available];
  return requested;
}
function renderPackPromptBody(input) {
  const lines = [];
  lines.push(PROMPT_OPEN_MARKER);
  lines.push("## TeamAgent: select stack packs");
  lines.push("");
  lines.push(
    "Observed in your project (file presence only \u2014 TeamAgent does not infer stack):"
  );
  lines.push("");
  for (const f of OBSERVED_FILE_LIST) {
    const present = input.observed[f] === true;
    lines.push(`- ${present ? "\u2713" : "\u2717"} \`${f}\``);
  }
  lines.push("");
  const installedSet = new Set(input.installed);
  if (input.available.length === 0) {
    lines.push("Available packs: (no packs shipped in this version)");
    lines.push("");
    lines.push(
      "**Recommended action**: this teamagent build ships no stack packs yet. Run `teamagent doctor` to check for an updated build, or run `teamagent pack add <name>` once packs are available."
    );
  } else {
    const installedAvailable = input.available.filter(
      (p) => installedSet.has(p.name)
    );
    const remaining = input.available.filter((p) => !installedSet.has(p.name));
    if (installedAvailable.length > 0) {
      lines.push(
        `Already installed: ${installedAvailable.map((p) => p.name).join(", ")}`
      );
      lines.push("");
    }
    lines.push(`Available packs (${input.available.length}):`);
    lines.push("");
    for (const p of input.available) {
      const installedSuffix = installedSet.has(p.name) ? " (already installed)" : "";
      const fileHints = p.file_hints.map((h) => `\`${h}\``).join(", ");
      lines.push(
        `- **${p.name}** [tags: ${p.tags.join(", ")}] \u2014 ${p.description}. file_hints: ${fileHints}${installedSuffix}`
      );
    }
    lines.push("");
    const sample = (remaining.length > 0 ? remaining : input.available).slice(0, 2).map((p) => p.name).join(",");
    lines.push(
      "**Recommended action** (read by your coding agent): if any of the file_hints above match observed files, pick the relevant pack(s) and run, e.g."
    );
    lines.push("");
    lines.push(`\`teamagent pack add ${sample}\``);
  }
  lines.push("");
  lines.push("Power-user paths (skip this prompt next time):");
  lines.push("");
  lines.push("- `teamagent init --pack all` \u2014 install every available pack");
  const powerSample = input.available.length >= 2 ? `${input.available[0].name},${input.available[1].name}` : input.available.length === 1 ? input.available[0].name : "X,Y";
  lines.push(
    `- \`teamagent init --pack ${powerSample}\` \u2014 explicit comma-separated list (--pack X,Y form)`
  );
  lines.push("");
  lines.push(PROMPT_CLOSE_MARKER);
  return lines.join("\n");
}

// ../core/src/presence/index.ts
init_esm_shims();

// ../core/src/presence/state-machine.ts
init_esm_shims();
var DEFAULT_PRESENCE_CONFIG = {
  activeTtlMs: 10 * 60 * 1e3,
  idleAfterMs: 10 * 60 * 1e3,
  offlineAfterMs: 60 * 60 * 1e3
};
var PRESENCE_UNKNOWN = "offline";
function computePresenceState(snapshot, now, config) {
  if (!snapshot) return PRESENCE_UNKNOWN;
  if (snapshot.errorFlag === true) return "error";
  const merged = {
    activeTtlMs: config?.activeTtlMs ?? DEFAULT_PRESENCE_CONFIG.activeTtlMs,
    idleAfterMs: config?.idleAfterMs ?? DEFAULT_PRESENCE_CONFIG.idleAfterMs,
    offlineAfterMs: config?.offlineAfterMs ?? DEFAULT_PRESENCE_CONFIG.offlineAfterMs
  };
  const nowMs = now instanceof Date ? now.getTime() : now;
  const tsMs = Date.parse(snapshot.ts);
  if (!Number.isFinite(nowMs) || !Number.isFinite(tsMs)) {
    return "offline";
  }
  const ageMs = nowMs - tsMs;
  if (snapshot.event === "stop" || snapshot.event === "session_end") {
    return "offline";
  }
  const clampedAge = ageMs < 0 ? 0 : ageMs;
  if (clampedAge > merged.offlineAfterMs) return "offline";
  if (snapshot.event === "user_prompt_submit") {
    return clampedAge <= merged.activeTtlMs ? "active" : "idle";
  }
  if (snapshot.event === "session_start") {
    if (clampedAge <= merged.activeTtlMs) return "active";
    return "idle";
  }
  return clampedAge <= merged.activeTtlMs ? "active" : "idle";
}
function presenceColor(state) {
  switch (state) {
    case "active":
      return "green";
    case "idle":
      return "yellow";
    case "offline":
      return "gray";
    case "error":
      return "red";
  }
}

export {
  scoreEntry,
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_TARGETS,
  STATIC_USER_SKILL_CONTENT,
  planStaticUserSkillInstall,
  computeDestPath,
  TRANSLATIONS,
  isDuckModeEnabled,
  duckify,
  duckifyText,
  writeDuckified,
  BLOCK_START,
  BLOCK_END,
  compileMarkdownBlock,
  injectBlockIntoDoc,
  stripLegacyTeamagentBlock,
  NESTED_TIERS,
  formatRuleAsMarkdown,
  formatTierIndex,
  formatRootIndex,
  compileNestedRuleArtifacts,
  compileCursorRules,
  matchRules,
  matchRules2,
  DEFAULT_SOFTAND,
  scoreSoftAnd,
  semanticMatch,
  confidenceWeight,
  rerankByConfidence,
  MAX_HARD_NEG,
  accumulateHardNegative,
  ruleBasedCorrectionDetector,
  ruleBasedSuccessDetector,
  parseSessionFile,
  encodeCwdToProjectDir,
  decodeProjectDirToCwd,
  toProjectKey,
  scanTodayActivity,
  digestProjectGroup,
  matchPrompt,
  matchPromptWithIntentCheck,
  parseExtraTriggersEnv,
  composeAdditionalContext,
  composeArchiveMarkdown,
  buildExtractionPrompt,
  buildRetrofitPrompt,
  extractRuleBullets,
  extractCursorRules,
  llmBasedKnowledgeExtractor,
  parseExtractionResponse,
  structureRuleText,
  DEFAULT_IMPORT_CONFIDENCE,
  structureRuleTextsBatch,
  detectStack,
  getMetaPrinciples,
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  parsePluginSpec,
  formatPluginSpec,
  defaultCalibrator,
  runCalibrationPipeline,
  buildSemanticDescriptions,
  momentSignature,
  runExtractPipeline,
  formatCorrectionContext,
  DEFAULT_CODE_FILE_TYPES,
  runScenario,
  runVerify,
  entryFromPartial,
  v2Calibrator,
  runCalibrationPipelineV2,
  runIngestPipeline,
  validateLevel0,
  validateLevel1,
  validateLevel2,
  defaultValidator,
  formatAsAgentSkill,
  runCompile,
  detectIgnoredSignals,
  detectBlockedCircumventedSignals,
  detectCompliedSignals,
  clusterByTag,
  filterSignals,
  detectSensitiveText,
  redactSensitiveText,
  buildErrorBatches,
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  shouldCheckUpdate,
  isLocalUserPrCreator,
  SNOOZE_DURATIONS_MS,
  nextSnooze,
  shouldPromptUpgrade,
  parseChangelog,
  compareVersion,
  renderUpgradePrompt,
  renderWhatsNewTail,
  makeUpdatePromptShownEvent,
  makeUpdateSnoozedEvent,
  makeUpdateNeverSetEvent,
  makeUpdateInstalledEvent,
  isUpgradeAttributionEvent,
  attributionToPersistedRow,
  scanNarrative,
  formatPendingRecord,
  mergePending,
  selectTopForInjection,
  formatInjectionText,
  createPreToolUseHandler,
  createPostToolUseHandler,
  inferToolSuccess,
  parseManifest,
  validateManifest,
  serializeManifest,
  planInfection,
  computeBootstrapDiff,
  scanForSecrets,
  createSecretScanner,
  classifyScope,
  createScopeClassifier,
  decideShareAction,
  serializeTeamRule,
  parseTeamRule,
  validateTeamRule,
  isSafeRuleId,
  isSafeAuthor,
  WINDOWS_MAX_PATH_BUDGET,
  estimateTeamRulePathLength,
  isTeamRulePathLengthSafe,
  mergeLww,
  mergeLwwBatch,
  teamRuleToKnowledgeEntry,
  PROMPT_VERSION,
  PROMPT_OPEN_MARKER,
  PROMPT_CLOSE_MARKER,
  OBSERVED_FILE_LIST,
  PackMetaSchema,
  parsePackMeta,
  packTag,
  entryHasPackTag,
  diffPackRequest,
  renderPackPromptBody,
  DEFAULT_PRESENCE_CONFIG,
  PRESENCE_UNKNOWN,
  computePresenceState,
  presenceColor
};
