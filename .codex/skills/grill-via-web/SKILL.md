---
name: grill-via-web
description: Pop a clickable ChatGPT and Claude.ai URL that prefills a grill-me prompt referencing a public GitHub issue, so a human can finish the grill in a browser tab. Use when the user wants to grill an issue in a web LLM (no API, no local Claude needed). Trigger phrases include "grill via web", "grill issue N in chatgpt", "/grill-via-web", "give me a chatgpt url to grill <issue>", or "pop a grill URL for issue N".
---

```
       __                       ┌──────────────────────────┐
  ___ ( o)>    issue URL ──────▶│   /grill-via-web         │
  \  =._)                       │                          │
   `---'   URL-encode prompt ──▶│   pop two Chrome URLs    │
    呷呷~                       │   ChatGPT + Claude.ai    │
                                └─────────────┬────────────┘
                                              │
              human clicks Chrome ────────────┘
              LLM fetches mattpocock/skills/grill-me
              LLM grills 1 question per turn
              human answers, repeat until convergence
```

## 0. Pre-grill claim (cross-host mutex, mandatory)

Per `docs/PRE-GRILL-CLAIM.md`, **before** generating any Chrome URL the agent must:

> **make a comment claiming we have started grilling this issue and add tag "grilling"**

Concretely (in the same order):

1. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grilling$' && exit`
   — if `grilling` already present, another agent is on it; post `🚦 deferred: grill already in progress (grilling tag is set)` and stop. **Do NOT** force-remove.
2. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grill-ready$' && exit`
   — if the issue is already grilled, do not re-grill; route the user to `/fixed-flow-driver` instead.
3. `gh issue comment <N> --body "🍳 grill picked up at <ISO timestamp> on <hostname> via /grill-via-web. Following docs/PRE-GRILL-CLAIM.md."`
4. `gh issue edit <N> --add-label grilling`

Only after both the comment AND the label succeed: proceed to §1 URL generation.

If `gh issue edit` fails because the label `grilling` does not exist on the repo, post `⛔ grilling label missing on repo; ask a maintainer to create it via gh api repos/<owner>/<repo>/labels --method POST -f name=grilling` and stop. Do NOT auto-create the label.

When the human pastes the grill output back into the issue (later, after the browser-side grilling finishes), the same human is responsible for `gh issue edit <N> --remove-label grilling --add-label grill-ready` to swap the lock to the next-phase label.

## What it does

Takes a public GitHub issue URL (default scope: `libz-renlab-ai/TeamBrain`),
URL-encodes a fixed prompt template, and outputs **two clickable URLs**:

```
follow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : <ISSUE_URL>
```

into:

- `https://chatgpt.com/?q=<encoded>`
- `https://claude.ai/new?q=<encoded>`

Only `<ISSUE_URL>` varies. The grill-me playbook URL is **pinned** to
mattpocock's public skills repo so any anonymous LLM fetcher can read it.

## Why URLs (not API / not local Claude)

Human-in-the-loop, by design. The skill does not run the grill — it only
**pops a Chrome URL**. Human:

1. Clicks the URL → ChatGPT/Claude tab opens with prompt prefilled.
2. Hits send → LLM fetches the grill-me skill + the issue.
3. LLM asks one question → human answers → next question.
4. Done. Move to next issue. New URL. Repeat.

No auth, no API key, no rate limit, no agent loop. Cheap and throttle-free.

## Template (do NOT change this string in code)

```
follow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : <ISSUE_URL>
```

Note the **two spaces** before `and` — preserved from upstream usage so
URLs round-trip with anything that compares strings byte-for-byte.

## Generator (bash one-liner)

```bash
ISSUE_URL="$1"
PROMPT="follow instructions in https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md  and grill me for this : ${ISSUE_URL}"
ENC=$(printf '%s' "$PROMPT" | jq -sRr @uri | sed 's/%20/+/g')
echo "ChatGPT:  https://chatgpt.com/?q=${ENC}"
echo "Claude:   https://claude.ai/new?q=${ENC}"
```

If `jq` is not available, swap to python:

```bash
ENC=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote_plus(sys.argv[1]))" "$PROMPT")
```

## When to invoke

User types or says any of:

- `/grill-via-web`
- `grill via web`
- `grill me on issue N`
- `grill issue N in chatgpt`
- `give me a chatgpt url to grill issue N`
- `pop a grill URL for issue N`

## Output format

1. Two clickable markdown links (ChatGPT first, Claude second).
2. Three-line ASCII flow showing the human-in-loop step.
3. Done. No extra commentary.

## Caveats

1. **Public issues only.** Anonymous web LLMs cannot read private repos.
   For private TeamBrain issues, fall back to inline-paste flow.
2. **ChatGPT does not auto-submit.** It pre-fills the input box; the
   human clicks send.
3. **Claude.ai `?q=` may be deprecated post-2025-10.** If the input
   field stays empty, switch to ChatGPT or paste manually. See
   [Claude Help Center](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link).
4. **URL length budget < 2000 chars.** This skill does not embed the
   issue body — the LLM fetches it from GitHub via the URL reference.
   If the issue is private or the URL is gigantic, this skill won't work.

## Example

```
Input:  https://github.com/libz-renlab-ai/TeamBrain/issues/276

Output:
  ChatGPT:  https://chatgpt.com/?q=follow+instructions+in+https%3A%2F%2Fgithub.com%2Fmattpocock%2Fskills%2Fblob%2Fmain%2Fskills%2Fproductivity%2Fgrill-me%2FSKILL.md++and+grill+me+for+this+%3A+https%3A%2F%2Fgithub.com%2Flibz-renlab-ai%2FTeamBrain%2Fissues%2F276
  Claude:   https://claude.ai/new?q=follow+instructions+in+https%3A%2F%2Fgithub.com%2Fmattpocock%2Fskills%2Fblob%2Fmain%2Fskills%2Fproductivity%2Fgrill-me%2FSKILL.md++and+grill+me+for+this+%3A+https%3A%2F%2Fgithub.com%2Flibz-renlab-ai%2FTeamBrain%2Fissues%2F276
```
