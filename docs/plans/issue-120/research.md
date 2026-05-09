```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │                  ISSUE #120 — GIF REPLACEMENT DISCOVERY MAP                  │
 │                                                                               │
 │   apps/landing/src/index.html                                                 │
 │       line 18 ─── .gif-placeholder CSS (aspect-ratio: 16/9, border-radius)   │
 │       line 53 ─── <div class="gif-placeholder">demo GIF placeholder</div>    │
 │                              ↓ replace with ↓                                 │
 │   <img src="/double-moment.gif" alt="..." loading="lazy" .../>                │
 │                              ↓ produced by ↓                                  │
 │   asciinema rec → /tmp/double-moment.cast                                     │
 │       → agg --font-size 14 --theme monokai --speed 1.5 → double-moment.gif   │
 │       → apps/landing/public/double-moment.gif   (< 2MB)                      │
 │                                                                               │
 │   FALLBACK: 3-screenshot mosaic PNG → apps/landing/public/double-moment.png  │
 └───────────────────────────────────────────────────────────────────────────────┘
```

# Issue #120 — Research Dump

Context collected 2026-05-08. This file is the result of reading the sources — not
a guide for what to read next.

---

## § 1. Current Landing Placeholder

**File**: `apps/landing/src/index.html` (131 lines total)

**CSS declaration** — line 18 (inside `<style>` block):
```
.gif-placeholder { aspect-ratio: 16/9; background: #f0f0f0; display: flex;
  align-items: center; justify-content: center; border-radius: 8px;
  margin: 40px 0; font-size: 0.9rem; color: #888; border: 1px solid #e0e0e0; }
```

**HTML element** — line 53 (inside `.container`, immediately after closing `</header>`,
before `.install-box`):
```html
<div class="gif-placeholder">demo GIF placeholder</div>
```

**Parent layout context**: the `.container` div (`max-width: 900px; margin: 0 auto; padding: 0 24px`) wraps the full page. The placeholder sits at the page hero — between the `<header>` block (lines 48–51) and the install command box (lines 55–58). No JS wrapping.

**Replacement options** (both confirmed valid per recording script):

Option A — img inside the existing placeholder div (preserves 16:9 frame):
```html
<div class="gif-placeholder">
  <img src="/double-moment.gif"
       alt="TeamAgent double-moment: moment→dayjs correction then auto-block"
       loading="lazy"
       style="width:100%; height:100%; object-fit:contain;" />
</div>
```

Option B — replace div entirely with standalone img (simpler, needs own sizing CSS).

---

## § 2. Existing Recording Script Summary

**Path** (committed in git, accessible via git show):
`docs/plans/issue-84/i-phase/gif-recording-script.md`

**Git commit**: `a5fa2ab` — "docs(issue-84): GIF recording script for Decision 3 (double-moment demo)"

**Status**: file is present in the current worktree's git history (confirmed via
`git ls-files` — it's tracked on the current branch `worktree-issue12p`).

**Timing budget**: 25–30 seconds total (matches spec P7 step `demo` 30s budget).

**Terminal recording pipeline**:
1. `asciinema rec --idle-time-limit=2 --title "TeamAgent double-moment" /tmp/double-moment.cast`
2. Record the two-moment sequence in the terminal (see § 2 below for steps)
3. Exit with `Ctrl-D`
4. Convert: `agg --font-size 14 --theme monokai --speed 1.5 --idle-time-limit 1 /tmp/double-moment.cast apps/landing/public/double-moment.gif`
5. Verify size: `ls -lh apps/landing/public/double-moment.gif` → must be < 2MB

**Content to record** (per script, matching issue spec decisions 3/4):
- Moment 1: user says "用 moment.js 写个时间格式化函数" → AI uses moment → user says "不要用 moment, 用 dayjs" → AI corrects → `teamagent stats --recent` shows `+1 avoidance rule learned: avoid moment, use dayjs` → `exit`
- Visible cut marker: `/clear` or terminal restart
- Moment 2: new session → user asks "写个时区转换工具" → AI prepares to use moment → PreToolUse hook fires: `⛔ TeamAgent: previous correction said use dayjs, not moment` → AI auto-uses dayjs

**Output path**: `apps/landing/public/double-moment.gif`

**Install hint for toolchain** (from script, § 0):
```bash
brew install asciinema agg
# or: cargo install --git https://github.com/asciinema/agg
```

---

## § 3. Toolchain Availability on This Machine

| Tool | Status | Version | Path |
|------|--------|---------|------|
| asciinema | AVAILABLE | 3.2.0 | `/opt/homebrew/bin/asciinema` |
| agg | AVAILABLE | 1.7.0 | `/opt/homebrew/bin/agg` |

Both tools are installed and operational. No install step needed before recording.

Full command outputs:
- `asciinema --version` → `asciinema 3.2.0`
- `agg --version` → `agg 1.7.0`

---

## § 4. Landing Package Commands

**File**: `apps/landing/package.json`

Relevant `scripts` entries (literal):
```json
"build":   "cp -r src/. dist/ && cp -r public/. dist/ 2>/dev/null || true",
"preview": "npx serve dist",
"lint":    "htmlhint src/",
"verify":  "lhci autorun --config=./lighthouserc.json"
```

**Confirmed pnpm filter targets**:
- `pnpm --filter @teamagent/landing build` — real target (package name is `@teamagent/landing`)
- `pnpm --filter @teamagent/landing verify` — real target; runs `lhci autorun`
- `pnpm --filter @teamagent/landing preview` — local preview after build

**Build behavior**: copies `src/` and `public/` to `dist/`. This means
`apps/landing/public/double-moment.gif` will be copied to `dist/double-moment.gif`
automatically during build — no additional build config needed.

**Dependency note**: `@lhci/cli: ^0.13.0` is listed as devDependency. Must run
`pnpm install` before `verify` on a fresh worktree.

---

## § 5. Lighthouse Config / Baseline

**lighthouserc.json**: PRESENT at `apps/landing/lighthouserc.json` on this branch
(`worktree-issue12p`, 555 bytes, confirmed 2026-05-08 22:57). No config creation step
needed before running `verify`.

**Actual thresholds as encoded in the file**:
| Metric | Assert key | Threshold |
|--------|-----------|-----------|
| Performance | `performance` minScore | ≥ 0.85 (85) |
| Accessibility | `accessibility` minScore | ≥ 0.90 (90) |
| SEO | `seo` minScore | ≥ 0.90 (90) |
| FCP | `first-contentful-paint` maxNumericValue | ≤ 2500ms |
| CLS | `cumulative-layout-shift` maxNumericValue | ≤ 0.1 |

**Collect settings**: `startServerCommand: pnpm --filter @teamagent/landing preview`,
URL `http://localhost:3000`, `numberOfRuns: 3`.

**Alignment with issue #120 acceptance criteria**: thresholds match exactly.
Adding a large GIF is the primary CLS/FCP risk — use `loading="lazy"` and
`width`/`height` attributes (or the wrapping `.gif-placeholder` aspect-ratio CSS)
to prevent layout shift on load.

---

## § 6. Image Conventions (GIF Size / Format)

**Existing GIFs in `apps/landing/`**: none found. The `public/` directory is empty
on this branch (no files currently in `apps/landing/public/`).

**Established size cap** (from issue #120 acceptance criteria and recording script):
< 2MB for `double-moment.gif`.

**agg output characteristics** at recommended settings (`--font-size 14 --theme monokai
--speed 1.5 --idle-time-limit 1`): a 25–30s terminal recording typically produces
500KB–1.5MB GIF. The `--idle-time-limit 1` flag collapses pauses, keeping file size
manageable.

**No other image conventions** found in the landing package. The `README.md` mentions
"品牌色块或真实产品截图" as preferred over abstract decorative assets (AI-slop
anti-pattern). The GIF itself counts as a "真实产品截图" equivalent.

---

## § 7. Fallback (Mosaic PNG) Plan

**When to use**: if asciinema recording or agg conversion fails (note: both tools
ARE available on this machine, so fallback is currently not needed).

**Fallback format** (from recording script § "Fallback：用静态截图 mosaic"):
Three screenshots arranged vertically:
```
┌────────────────────────────────┐
│ moment 1: 纠正发生              │ ← screenshot 1
└────────────────────────────────┘
┌────────────────────────────────┐
│ ━━━ /clear: 新会话 ━━━          │ ← divider bar
└────────────────────────────────┘
┌────────────────────────────────┐
│ moment 2: PreToolUse 拦截       │ ← screenshot 2
└────────────────────────────────┘
```

**Fallback output path**: `apps/landing/public/double-moment.png`

**HTML swap for fallback** (img `src` only changes, `alt` and `loading` identical):
```html
<img src="/double-moment.png"
     alt="TeamAgent double-moment: moment→dayjs correction then auto-block"
     loading="lazy"
     style="width:100%; height:100%; object-fit:contain;" />
```

**Script note**: "GIF 更直观，推荐优先 asciinema 路径" — fallback is last resort only.

---

## § 8. Branch / PR Cross-Refs

**Current branch**: `worktree-issue12p` (confirmed via `git branch --show-current`)

**Target branch for actual PR** (per issue #120 description): `feat/issue-84-gif-double-moment`
— this branch does not currently exist; implementer must create it from `main` or
from the current worktree branch.

**Parent issue**: #84 (easy-install landing page)

**Parent PR**: #115 — status query returned token scope error (`read:org` required).
Cannot confirm open/closed state via CLI, but issue #120 was created as a child to
unblock #84/#115.

**Open PRs touching landing** (search via `gh pr list`): none of the 5 currently open
PRs have "landing" in their title. All 5 open PRs are `feat(issue-146)` or
`fix(m6)` related (issue-146 digital-twin sidecar PRs #165–#176 and post-PR-152
fix PR #175).

**Recording script branch note**: the script file
`docs/plans/issue-84/i-phase/gif-recording-script.md` is tracked on the current
worktree branch (`worktree-issue12p`) — confirmed via `git ls-files`. The commit
is `a5fa2ab`.

---

## § 9. Open Questions

1. **PR #115 status**: Could not confirm whether PR #115 is open or merged due to
   GitHub token missing `read:org` scope. The issue #120 was created assuming #115
   is still open/in-progress. No blocking consequence for this task — issue #120 is
   explicitly scoped as independent.

2. **Target branch `feat/issue-84-gif-double-moment` does not exist**: Implementer
   needs to create it. Suggested: `git checkout -b feat/issue-84-gif-double-moment`
   from the current worktree state before committing the GIF and HTML change.

3. **`apps/landing/public/` is empty on this branch**: The build step copies
   `public/` to `dist/`, so the GIF must be placed in `public/` before building.
   Directory exists (`ls` returns no files) — just needs the file.

4. **PreToolUse hook availability for recording**: The recording script assumes
   `teamagent` is installed and hooks are active (for the moment-2 interception
   sequence). Implementer should verify `pnpm teamagent skeleton-demo` passes before
   recording to confirm the PreToolUse interception actually fires.
