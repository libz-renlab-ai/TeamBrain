```text
        VISUAL-PROOF-CONTENT.md (this doc)
                |
                v
  what goes INSIDE the visual proof HTML?
                |
                v
  +-----------------------------------------+
  | (1) tmux + real interactive claude      |
  | (2) real terminal capture               |
  | (3) real frontend url snapshot          |
  | (4) real dashboard raw logs             |
  |     (and more if later added)           |
  +-----------------------------------------+
                |
                v
  see FORMAT (HTML), HOSTING (gist+htmlpreview),
       PR (workflow), HUMAN-MERGE (gate)
```

# Visual proof of work — required content checklist

This doc is the SoT for **what an HTML visual proof must contain**. It is a sibling to:

- [`docs/VISUAL-PROOF-FORMAT.md`](VISUAL-PROOF-FORMAT.md) — what file FORMAT the artifact uses (`*.html`).
- [`docs/VISUAL-PROOF-FORMAT.md` § Hosting](VISUAL-PROOF-FORMAT.md#hosting--public-storage-the-pr-proposer-fully-owns) — WHERE to host it (proposer-owned public storage, default `gh gist create` + `htmlpreview.github.io`).
- [`docs/VISUAL-PROOF-PR.md`](VISUAL-PROOF-PR.md) — the issue → PR → append-comment WORKFLOW.
- [`docs/VISUAL-PROOF-HUMAN-MERGE.md`](VISUAL-PROOF-HUMAN-MERGE.md) — who presses the MERGE button (a human, by hand).
- [`docs/POP-OPEN-HTML.md`](POP-OPEN-HTML.md) — local `/tmp` pop-open lifecycle (orthogonal, not a substitute).

FORMAT answers "what shape", HOSTING answers "what URL", WORKFLOW answers "when in the PR lifecycle", HUMAN-MERGE answers "who clicks merge". **This doc answers the missing question: "what evidence is INSIDE the HTML?"**

## 1. The four mandatory content categories

**Canonical anchor sentence (mirrored from `CLAUDE.md` so `pnpm teamagent verify-anchors` finds it verbatim):**

> Visual proof of work HTML must include at least these four content categories: (1) tmux + real interactive claude — a captured tmux session showing a real interactive claude CLI running end-to-end, not screenshots of a static log; (2) real terminal capture — actual terminal stdout/stderr bytes from the run (asciinema cast, scrollback dump, or HTML-embedded `<pre>` block), not paraphrased text; (3) real frontend url snapshot — a live screenshot or rendered embed of the actual frontend URL the change affects; (4) real dashboard raw logs — raw, unfiltered log lines from the dashboard or pipeline that produced the change (and more if later added).

Every visual-proof HTML must include all four of these, embedded directly in the HTML (inline `<pre>` blocks, base64-inlined asciinema casts, `<img>` with `data:` URIs, or vendored relative `<script src="./local.js">` per FORMAT's self-contained rule):

| # | Category | What it is | What it is NOT |
|---|---|---|---|
| 1 | **tmux + real interactive claude** | A captured tmux session showing real interactive `claude` (or `claudefast`) CLI running end-to-end against the change. Acceptable carriers: `asciinema rec` cast pasted into an `<asciinema-player>` (vendored), `tmux capture-pane -pS -` dump in a `<pre>`, or a screen recording rendered to a `<video controls>` with `data:` URI. | A static screenshot of one terminal frame; a paraphrased transcript; a `claude -p` non-interactive run pretending to be interactive. |
| 2 | **real terminal capture** | Actual terminal stdout/stderr bytes from the run — scrollback dump, ANSI-stripped log paste, or asciinema cast. Must be byte-faithful to what was on screen. | Hand-typed summary of "what was logged"; cropped error message screenshot with no context; LLM-generated "example output". |
| 3 | **real frontend url snapshot** | A live screenshot, full-page render, or `<iframe>`-embed of the **actual** frontend URL the change affects (dev server localhost rendered then captured, staging URL, or production URL). Filename or embed must record the URL captured. | A Figma mockup; a hand-drawn wireframe; a screenshot of an unrelated page; a "design intent" PNG. |
| 4 | **real dashboard raw logs** | Raw, unfiltered log lines from the dashboard, pipeline, or service that produced the change — `pnpm teamagent dashboard` stdout, judge harness stdout, CI runner log, or wherever the dashboard surfaces evidence. | Hand-curated success messages; LLM-filtered "highlights"; a single grep-matched line with no surrounding lines. |

The phrase `(and more if later added)` is part of the canonical anchor sentence: as TeamBrain's surface area grows (new dashboards, new CLI entry points, new dogfood surfaces), categories can be appended to this checklist without breaking the existing four-anchor grep.

## 2. Why these four, not three, not five

- **tmux + real interactive claude** proves the change works in the actual interactive harness real users hit, not just under `claude -p` non-interactive automation. TeamBrain's whole premise is making interactive `claude` better; if the proof doesn't show interactive `claude`, it doesn't show the product.
- **real terminal capture** is the byte-level ground truth. Screenshots get cropped; transcripts get paraphrased; bytes don't lie. It is the auditable raw evidence layer of the proof — `grep`-able, `diff`-able by another reviewer or another LLM judge.
- **real frontend url snapshot** is the human-visual layer. A reviewer in 30 seconds sees "did the page actually look like this?". Without it, a backend-heavy PR can claim UI improvements with no rendered proof.
- **real dashboard raw logs** is the cross-surface layer. Many TeamBrain features (project knowledge index, viral sync, attribution bus, judge harness) produce side effects only visible in dashboards/pipelines, not in the foreground terminal. The dashboard log is the proof the side effect actually happened.

Three categories miss either the byte-level layer or the dashboard layer. Five+ categories invite "kitchen-sink" PRs that bury the four mandatory ones in noise.

## 3. Self-contained constraints (inherited from FORMAT)

All four content categories must be embedded **inside the single HTML file** — no third-party CDN URLs, no live `<iframe>` to localhost (won't render for a reviewer on a different machine), no `<img src="https://example.com/...">` to non-proposer-owned storage.

Acceptable embedding techniques:
- Inline `<pre>` for terminal text / log lines.
- `data:image/png;base64,...` URI for screenshots.
- Vendored `<script src="./asciinema-player.min.js">` (same-repo relative; not a CDN).
- `<video controls><source src="data:video/mp4;base64,...">` for screen recordings.
- Inline `<style>` (no `<link rel="stylesheet" href="https://...">`).

`curl -I <url>` must return `200`; opening the URL in a clean incognito browser must render all four categories without network calls to non-proposer-owned hosts.

## 4. When this rule does NOT apply

This rule applies to PRs that already carry a `## Visual proof of work` H2 section in the PR body (per [`docs/VISUAL-PROOF-HUMAN-MERGE.md`](VISUAL-PROOF-HUMAN-MERGE.md) §0.5 trigger predicate). PRs without that H2 (pure docs-only, pure refactor, pure config, pure backend with no user-visible surface) do not need any of the four categories. The decision to add the H2 in the first place is governed by VISUAL-PROOF-PR §1 — this content checklist only activates once that decision has been made.

A docs-only PR that itself documents this rule (such as the PR that introduces this very file) does not need to dogfood the four categories — the rule's first PR is the bootstrap; subsequent PRs that touch UI/dashboards/dogfood surfaces must comply.

## 5. Verification probe (canonical claudefast question)

```bash
claudefast -p "what visual proofs should be included "
```

Judge harness must case-insensitive substring grep all five anchors in the answer's first paragraph:

1. `tmux + real interactive claude`
2. `real terminal capture`
3. `real frontend url snapshot`
4. `real dashboard raw logs`
5. `(and more if later added)`

Any one of them missing, paraphrased (e.g. "interactive claude in tmux" instead of "tmux + real interactive claude", "terminal output dump" instead of "real terminal capture", "screenshot of the page" instead of "real frontend url snapshot", "dashboard log" instead of "real dashboard raw logs", or dropping the trailing "(and more if later added)") counts as FAIL — re-answer until all five appear verbatim.

## 6. Related rules

- [`docs/VISUAL-PROOF-FORMAT.md`](VISUAL-PROOF-FORMAT.md) — `*.html`, self-hosted GH Pages or proposer-owned public storage.
- [`docs/VISUAL-PROOF-FORMAT.md` § Hosting](VISUAL-PROOF-FORMAT.md#hosting--public-storage-the-pr-proposer-fully-owns) — `gh gist create` + `htmlpreview.github.io` default.
- [`docs/VISUAL-PROOF-PR.md`](VISUAL-PROOF-PR.md) — propose issue first → make PR without asking → append HTML proof comment.
- [`docs/VISUAL-PROOF-HUMAN-MERGE.md`](VISUAL-PROOF-HUMAN-MERGE.md) — only a human by-hand merge.
- [`docs/POP-OPEN-HTML.md`](POP-OPEN-HTML.md) — local Chrome + `/tmp` + immediate pop-open (orthogonal local-dev tool, not a substitute for PR-shipped proof).
- [`docs/3-METHODS-WORKFLOW.md`](3-METHODS-WORKFLOW.md) — method 3 visual-proof overlay (when this whole family activates).
