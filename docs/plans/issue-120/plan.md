```
 moment 1                 /clear cut              moment 2
 ──────────────────────   ───────────────────   ──────────────────────
  user types: moment.js    session boundary     AI tries moment again
  AI uses it               visible in GIF       PreToolUse intercepts
  user corrects: dayjs  ──► rule recorded  ──►  AI auto-uses dayjs ✓
  TeamAgent records rule                         no user re-correction

 ┌──────────────────────────────────────────────────────────────────┐
 │  PIPELINE                                                        │
 │                                                                  │
 │  record GIF  ──►  compress <2 MB  ──►  replace placeholder div  │
 │      │                │                        │                 │
 │  asciinema+agg     ffmpeg/gifsicle         index.html img tag    │
 │  (fallback: 3-screenshot mosaic PNG)                             │
 │                                                                  │
 │  verify: pnpm build + Lighthouse (perf≥85, LCP≤2.5s, CLS≤0.1)  │
 └──────────────────────────────────────────────────────────────────┘
```

# Issue #120 Plan — double-moment demo GIF for landing page hero

## § 1. Task description

### What

Replace the `<div class="gif-placeholder">demo GIF placeholder</div>` in
`apps/landing/src/index.html` (currently the only element with class
`gif-placeholder`) with a real `<img>` tag pointing to
`apps/landing/public/double-moment.gif`.

The GIF must demonstrate the double-moment learning loop:

- **Moment 1**: User writes code that uses `moment.js`. AI uses it. User
  corrects: "use `dayjs` instead of `moment`". TeamAgent records the rule
  (visible in the terminal — e.g. `[teamagent] rule recorded: prefer dayjs`).
- **`/clear` cut**: The `/clear` command is visible on screen, creating a
  clear session boundary.
- **Moment 2**: In a new session, AI is about to use `moment` again.
  PreToolUse hook intercepts (visible intercept banner in terminal). AI
  automatically switches to `dayjs` — no user re-correction needed.

Total runtime: 25–30 seconds. File size: < 2 MB.

### How

1. **Record** using `asciinema` in the TeamBrain sandbox environment
   (`docs/sandbox.md`). Script the two-moment sequence so it is
   reproducible and concise (25–30s).
2. **Convert** the `.cast` file to GIF with `agg` (asciinema GIF generator).
   If `agg` is not available, use `ffmpeg` + `gifsicle` to compress.
3. **Compress** until the file is < 2 MB. Acceptable tools: `gifsicle
   --optimize=3`, `ffmpeg -vf "fps=10,scale=800:-1"`. Drop frame rate to
   10 fps and crop to 800 px wide if needed.
4. **Place** the resulting file at `apps/landing/public/double-moment.gif`.
5. **Replace** the placeholder div in `apps/landing/src/index.html`:

   Replace:
   ```html
   <div class="gif-placeholder">demo GIF placeholder</div>
   ```
   With:
   ```html
   <img src="/double-moment.gif"
        alt="TeamAgent double-moment demo: AI learns dayjs preference in one correction, then self-corrects across sessions"
        width="800"
        style="aspect-ratio:16/9;border-radius:8px;margin:40px 0;max-width:100%;display:block;">
   ```

6. **Verify** the build and Lighthouse metrics (see § 2 and § 3).

### Fallback — when asciinema/agg are unavailable

If `asciinema` or `agg` cannot be installed in the current environment:

- Capture 3 representative terminal screenshots (PNG) covering:
  1. User correction + rule-recorded banner (Moment 1)
  2. `/clear` visible on screen (boundary)
  3. PreToolUse intercept banner + AI using `dayjs` (Moment 2)
- Stitch them into a horizontal mosaic PNG using `ffmpeg` or ImageMagick
  `convert`:
  ```bash
  convert +append moment1.png clear.png moment2.png mosaic.png
  ```
- Place as `apps/landing/public/double-moment.png` and update the `<img>`
  `src` attribute accordingly. The Lighthouse/build acceptance criteria still
  apply; image size must remain < 2 MB.

Document which path was taken in `docs/plans/issue-120/report.md`.

### What NOT to do (anti-goals)

- Do NOT modify any file outside of:
  - `apps/landing/src/index.html`
  - `apps/landing/public/double-moment.gif` (or `.png` in fallback)
  - `docs/plans/issue-120/` (plan, research, report, judge)
- Do NOT alter the CSS for `.gif-placeholder` — only replace the element
  itself; other elements referencing that class are out of scope.
- Do NOT remove the `.gif-placeholder` CSS rule from `<style>` — it may be
  referenced by other tooling or tests.
- Do NOT create a draft PR — open a normal PR per project convention.
- Do NOT implement any new TeamAgent code logic (hooks, matchers, rules
  engine); this PR is purely a landing page asset + HTML change.
- Do NOT change `apps/landing/package.json` build scripts.
- Do NOT touch `main` directly; work on branch
  `feat/issue-84-gif-double-moment`.

---

## § 2. Expected outputs

> **Pre-action**: branch `feat/issue-84-gif-double-moment` must be created from
> the current worktree HEAD before the first commit. The PR's `headRefName` must
> equal `feat/issue-84-gif-double-moment`. Do not commit on `worktree-issue12p`
> or any other branch.

| Deliverable | Criterion |
|---|---|
| `apps/landing/public/double-moment.gif` | Exists; file size < 2 MB; 25–30s playback |
| `apps/landing/src/index.html` | `gif-placeholder` div replaced with `<img>` pointing to `/double-moment.gif`; no other lines changed |
| `pnpm --filter @teamagent/landing build` | Exits 0 |
| `pnpm --filter @teamagent/landing verify` (Lighthouse) | perf ≥ 85, LCP ≤ 2.5s, CLS ≤ 0.1 |
| Branch `feat/issue-84-gif-double-moment` | Contains exactly the above changes; normal (non-draft) PR opened against `main` |
| PR passes CI | All CI checks green |
| `/review` skill PASS | No P1 or P2 findings; per ADR-0007, Codex bot replaced by local `/review` skill |
| `.fastprobe/issue-120/export.txt` | tmux interactive `/export` attached to PR description |
| `docs/plans/issue-120/report.md` | Records which recording path was taken (asciinema vs mosaic), actual file size, and evidence pointers |

**Negative outputs (anti-goals — reviewer must confirm absent)**

- No new JS/TS source files added.
- No changes to `pnpm-lock.yaml` or `package.json` files.
- No changes to `~/.claude/settings.json` or project `.claude/settings.local.json`.
- `git diff --name-only main` shows at most 2 files:
  `apps/landing/src/index.html` and `apps/landing/public/double-moment.gif`
  (plus plan docs under `docs/plans/issue-120/`).

---

## § 3. How to verify (third-party judge harness)

**No fixed bash script.** The judge harness is the markdown playbook at
`docs/plans/issue-120/judge.md` (written in parallel by Worker C).
The MAIN agent dispatches that playbook via subagents or `claudefast -p`
probes; it is never a `.sh` script per project rule
(third-party judge harness forbidden fixed scripts; MUST use md playbook).

### What judge.md checks (summary)

The `judge.md` playbook runs three sections:

**§V1 RUN** — fixed tools invoked and stdout captured to `evidence_dir`:
- `pnpm --filter @teamagent/landing build` → exit code recorded
- `pnpm --filter @teamagent/landing verify` → Lighthouse JSON captured
- File existence check: `apps/landing/public/double-moment.gif`
- File size check: `stat` or `wc -c` on the GIF
- HTML diff: confirm `gif-placeholder` div is absent, `<img>` with
  `/double-moment.gif` src is present
- GIF duration check via `ffprobe` or frame count heuristic

**§V2 DUMP** — after all sub-agents complete, main agent writes `verdict.json` to
`docs/plans/issue-120/judge-output/<run-id>/verdict.json`. Each sub-agent first
writes its own `step-<N>/raw.json` and dumps evidence under
`docs/plans/issue-120/judge-output/<run-id>/step-<N>/evidence/`.

```json
{
  "run_id": "<run-id>",
  "issue": 120,
  "steps": [
    { "id": 1, "name": "gif-artifact-exists-and-size", "exit_code": 0, "metrics": { "path": "apps/landing/public/double-moment.gif", "size_bytes": "<N>", "format": "gif" } },
    { "id": 2, "name": "placeholder-removed", "exit_code": 0, "metrics": { "placeholder_count": 0, "img_count": 1, "img_src": "double-moment.gif" } },
    { "id": 3, "name": "landing-build-green", "exit_code": 0, "metrics": { "exit_code": 0, "duration_ms": "<N>", "stdout_tail": "..." } },
    { "id": 4, "name": "lighthouse-perf", "exit_code": 0, "metrics": { "perf_score": "<N>", "lcp_ms": "<N>", "cls": "<N>" } },
    { "id": 5, "name": "pr-and-review", "exit_code": 0, "metrics": { "pr_number": "<N>", "pr_state": "OPEN", "is_draft": false, "ci_status": "success", "review_verdict": "PASS" } }
  ],
  "verdict": "pass",
  "verdict_reason": "..."
}
```

Pass condition: all 5 hard steps exit_code == 0, step-1 `size_bytes < 2097152`,
step-4 perf_score >= 85, lcp_ms <= 2500, cls <= 0.1, step-5 `pr_state == "OPEN"`
`is_draft == false` `ci_status == "success"` `review_verdict == "PASS"`.
Step 6 (gif-content-spot-check) is soft — failure downgrades to warning but
does not flip verdict to fail.

**§V3 READ** — the main agent (which also wrote the verdict) reads only the
`verdict.json` and evidence tiebreaks to report pass/fail to the user. No
separate `claudefast -p` invocation is required at this stage; the main agent
has already aggregated all sub-agent JSON and written the authoritative verdict.

---

## § 4. Claudefast probes (the FASTPROBE three-step)

Run these before writing any recording script or touching any files.

### Probe 1 — Narrow: confirm placeholder div location and exact text

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/issue12p/apps/landing/src/index.html. Find every element with class 'gif-placeholder'. Return: (1) the exact line number and full HTML of each matching element; (2) whether any <img> or <video> tag already references a double-moment asset; (3) the exact CSS rule for .gif-placeholder from the <style> block. Output JSON: {\"placeholder_elements\": [{\"line\": N, \"html\": \"...\"}], \"existing_media_tag\": true|false, \"css_rule\": \"...\"}"
```

### Probe 2 — Broad: confirm build + verify commands and Lighthouse acceptance criteria

```bash
claudefast -p "In /Users/m1/projects/TeamBrain/.claude/worktrees/issue12p, read apps/landing/package.json and any Lighthouse config files. Answer: (1) what does 'pnpm --filter @teamagent/landing build' actually run? (2) what does 'pnpm --filter @teamagent/landing verify' run and how does it measure perf/LCP/CLS? (3) are there any existing Lighthouse thresholds configured that differ from perf>=85, LCP<=2.5s, CLS<=0.1? Output JSON: {\"build_script\": \"...\", \"verify_script\": \"...\", \"lighthouse_config\": {...}, \"threshold_conflicts\": []}"
```

### Probe 3 — Acceptance criteria gate: does the plan satisfy all issue #120 criteria?

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/issue12p/docs/plans/issue-120/plan.md. Check it against the following acceptance criteria from issue #120: (a) apps/landing/public/double-moment.gif exists <2MB; (b) 25-30s total; (c) apps/landing/src/index.html uses real <img> instead of placeholder div; (d) pnpm --filter @teamagent/landing build exits 0; (e) Lighthouse perf>=85, LCP<=2.5s, CLS<=0.1; (f) PR opened, CI green, /review PASS. For each criterion: does the plan explicitly cover it? Reply as JSON: {\"criteria\": [{\"id\": \"a\", \"covered\": true|false, \"evidence\": \"...\"}]}"
```

### Probe 4 — Recording toolchain availability

```bash
claudefast -p "In the TeamBrain sandbox environment documented at /Users/m1/projects/TeamBrain/.claude/worktrees/issue12p/docs/sandbox.md, check which of the following tools are available: asciinema, agg, ffmpeg, gifsicle, ImageMagick convert. For each tool: is it in PATH? what version? Output JSON: {\"tools\": [{\"name\": \"asciinema\", \"available\": true|false, \"version\": \"...\"}]}. If none of asciinema+agg are available, confirm that the 3-screenshot mosaic fallback path documented in the plan is feasible."
```
