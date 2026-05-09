```
                  plan.md — landing a11y rework on top of PR #179
                  ================================================

   PR #177 merged ──► /review specialist backfill ──► 7 a11y CRITICAL
                                                              │
   PR #179 merged                                             ▼
   (real GIF + index.html)               attempted PR #184 (slice 1)
                              │                       │
                              ▼                       ▼
                    rebase blew up — PR #179's        reset to main +
                    GIF differs from mine             redo on PR #179's
                              │                       content
                              ▼
                          this PR (rework)
                              │
   ┌──────────────────────────┼──────────────────────────┐
   │                          │                          │
   ▼                          ▼                          ▼
   a11y fixes (7)        strict build script       maintenance
   composed onto         + asset lockstep guard    comment for
   PR #179's content                               GIF/PNG pair
                              │
                              ▼
                      normal PR · /review · squash
```

# Plan — Landing A11y Rework (post-#177, post-#179 rebase)

## Why this is a rework

- PR #177 (merged 2026-05-08) shipped python-pil placeholder GIF + initial a11y attempt.
- /review specialist backfill on PR #177 found 7 CRITICAL a11y findings.
- PR #184 attempted to bundle-fix all 7 + 3 doc-length violations on a branch off origin/main.
- During PR #184's POSTPR loop, **PR #179 landed on main with a real recorded `double-moment.gif`** (688×490, real teamagent CLI of dayjs/moment.js teaching narrative) plus its own `<img>` tag in `apps/landing/src/index.html` with different alt text and inline `style="object-fit:contain"`.
- Rebase produced unrecoverable conflicts because PR #184's a11y changes targeted an `<img>` element PR #179 had concurrently rewritten.
- **This PR is the rework**: reset PR #184's branch to fresh origin/main, then re-apply only the a11y patches that compose with PR #179's existing content. PR #179's GIF + alt text are preserved; my <picture>+source wrapper, contrast fixes, table semantics, focus-visible, sr-only spans go on top.

## ① Task description

7 a11y CRITICAL fixes layered onto PR #179's hero, plus strict build script + asset lockstep guard. **Doc-length violations dropped from this PR's scope** — they were bundled originally but the rebase mess argues for tighter scope; doc-splits will land in a separate PR.

| # | Issue | Source | Fix |
|---|---|---|---|
| 1 | `lang="en"` on Chinese page | WCAG 3.1.1 Level A | → `lang="zh-CN"` |
| 2 | GIF stretched (688×490 in 16:9 box, no `object-fit`) | introduced by PR #177's GIF + still ambiguous on PR #179 | `aspect-ratio: 688/490` (matches asset) + `object-fit: contain` + dark letterbox |
| 3 | Auto-playing GIF, no pause / `prefers-reduced-motion` | WCAG 2.2.2 | `<picture>` + `<source media="(prefers-reduced-motion: reduce)" srcset="double-moment-static.png">` + 21 KB static frame extracted from PR #179's GIF |
| 4 | TeamAgent column header `#e85c0d` background, white text = 3.52:1 | WCAG AA fails | → `#b84200` (5.50:1) |
| 5 | `.cross` color `#999` = 2.85:1 (load-bearing data) | WCAG AA fails | → `#767676` (4.51:1) |
| 6 | Footer `#888` at 0.75rem = 3.54:1 | WCAG AA fails | → `#767676` |
| 7 | 5-column comparison table no responsive rules, overflows 375px viewport | mobile UX | `.table-scroll` wrapper with `role="region"` + `aria-labelledby` + `tabindex`, plus `@media (max-width: 620px)` rules |

Plus the round-2 + round-3 fixes from PR #184's specialist passes (already validated by Design + Adversarial specialists):

- `role="img"` deprecated → `aria-hidden="true"` + sibling `<span class="sr-only">` (avoids NVDA quirks; correct ARIA pattern for icon decoration)
- `<th scope="col">` on all 5 column headers; first-column `<td>` → `<th scope="row">` (WCAG 1.3.1)
- Table `aria-labelledby` + h2 `id` (table accessible name)
- Remaining `#e85c0d` on `.bullets li::before` and `.details-section summary::after` → `#b84200` (consistency)
- `.check` and `<a>` color → `#b84200` (was 3.52:1)
- `:focus-visible` style for a / summary / .table-scroll (WCAG 2.4.11)
- `::after` content uses CSS Level 3 alt-text syntax (`'+' / ''`) so AT doesn't read decorative pseudo-elements
- Maintenance comment above `<picture>` for GIF/PNG lockstep

Plus build hardening:

- `apps/landing/package.json` build script: `mkdir -p dist && cp -r src/. dist/ && cp -r public/. dist/ && test -f dist/{index.html,double-moment.gif,double-moment-static.png}` — fail loudly on missing assets; no more silent `2>/dev/null || true` swallow.

## ② Expected outputs

- [x] `apps/landing/src/index.html` rewritten (CSS + body) preserving PR #179's hero alt text and GIF
- [x] `apps/landing/public/double-moment-static.png` (21 KB, frame 8 of PR #179's GIF — captures "moment 1 · 用户教 AI: moment → dayjs" panel)
- [x] `apps/landing/package.json` build script with explicit asset assertions
- [x] This plan file
- [ ] Normal PR rebased / force-pushed to landing-a11y-cleanup
- [ ] CI green; `/review` PASS

## ③ How-to-verify

- `pnpm --filter landing build` — must exit 0 with all 3 assets in dist/
- `pnpm --filter landing lint` — htmlhint clean
- `grep -c '#e85c0d' apps/landing/src/index.html` — must be 0
- `grep -c 'sr-only\|scope=\|aria-labelledby\|loading="eager"\|aria-hidden\|<picture>' apps/landing/src/index.html` — must be ≥ 20 (was 26 after rework)
- Color contrast of #b84200/#ffffff and #767676/#ffffff verified at 5.50:1 and 4.54:1 against WCAG AA
- Visual: hero element no longer stretches; comparison table scrolls horizontally on mobile; focus rings visible on tab; screen reader (VoiceOver) reads "支持 / 不支持" instead of "check mark / cross mark"

## ④ Anti-goals

- NOT touching landing copy / install one-liner / bullets section text (separate UX concern)
- NOT addressing the 3 doc-length violations from /review maintainability specialist (split to its own PR — bundled rebase pain isn't worth it)
- NOT touching `.github/workflows/landing-deploy.yml` (token lacks `workflow` scope; the strict build script provides equivalent guard at build time)
- NOT regenerating the GIF (PR #179's recording is the canonical asset)
