```text
   upstream inspection (read-only)
   ───────────────────────────────
        │
        ├── repo metadata     (gh repo view)
        ├── root file listing (gh api contents)
        ├── src/ layout       (after submodule clone)
        └── build scripts     (package.json)
        │
        ▼
   findings used to design adapter contract
```

# Research — upstream RocketTeam shape

## Upstream repo identity

- URL: https://github.com/hrdAI3/RocketTeam
- Visibility: PUBLIC
- Default branch: `main`
- Pinned SHA in PR-1: `3922219668cb1b41b4631487983518f6d3914543` (captured at submodule-add time; record in `report.md` after merge)
- Description (verbatim from `gh repo view`): "Personal-agent mesh for hybrid (human + Claude Code) team coordination — PMA + dual-track sim + Report Agent"

## Stack

- Framework: **Next.js** (`next.config.js` present, `next-env.d.ts` present)
- Package manager: **Bun** (`bun.lock` present; `package.json` scripts use `bun run ...`)
- Styling: **Tailwind** (`tailwind.config.ts`, `postcss.config.js`)
- Tests: **Vitest** (`vitest.config.ts`) + Playwright e2e (`test:e2e` script)
- Package name: `hrdai-team`

## Source layout (`src/`)

Sub-directories observed:

- `_lib/`
- `app/` — Next.js App Router pages
- `bootstrap/`
- `components/`
- `evolution/`
- `lib/`
- `pma/` — referenced in `bootstrap` script
- `report/` — referenced in repo description ("Report Agent")
- `scripts/`
- `sim/` — referenced in repo description ("dual-track sim")
- `types/`

## Build / dev scripts

| Script | Command | Notes |
|---|---|---|
| `dev` | `next dev` | local dev only |
| `build` | `next build` | **does not currently emit static export** — `next.config.js` lacks `output: 'export'` |
| `start` | `next start` | requires Node server, not Pages-compatible |
| `bootstrap` | `bun run src/scripts/bootstrap.ts` | server-side; not part of landing |
| `pma` | `bun run src/scripts/pma.ts` | server-side; not part of landing |

## Implications for TeamBrain integration

1. **Submodule is the right level of vendoring.** Upstream is active, separately owned, has full Next.js tooling; we want a pointer not a fork.
2. **`output: 'export'` gap.** Plain `next build` produces a `.next/` server bundle that Pages cannot host. The deploy workflow (PR-2) must either inject `output: 'export'` at build time or wait for upstream to add it. This is also why PR-1 does **not** attempt to render anything yet — wiring a broken pipeline is worse than wiring nothing.
3. **Bun vs pnpm.** TeamBrain uses pnpm; upstream uses Bun. The deploy workflow (PR-2) must `cd landing/rocketteam && bun install && bun run build` (or its `npm`/`pnpm` equivalent). Our `packages/landing-adapter/` itself stays pnpm-native — it never installs anything inside `landing/rocketteam`.
4. **Data shape unknown until adapter PR-3.** The adapter contract in PR-1 is intentionally narrow — only the two TeamBrain-side signals (feature 2 realtime activity stream, feature 3 video upload manifest) and a `LandingPayload` envelope. Whatever component on the RocketTeam side consumes it will be wired in PR-3 once we explore `src/app/` and `src/components/`.
5. **No copying of upstream content.** Anything that looks like "let me inline the README into our landing page" is the wrong move — submodule + build pipeline does that, and respects upstream's authorship.

## Constraints from TeamBrain rules

- `docs/BUSINESS-FEATURES.md` — feature 2 is currently a VISION (not PRESHIP). Adapter must not pretend feature 2 is fully implemented when it ships data.
- `docs/POP-OPEN-HTML.md` — three rules for any pop-open HTML entry point. The landing page deployed via Pages is NOT a pop-open HTML; it is a built site. So those rules do not apply here, but a future "preview landing locally" CLI **would** trigger them. Out of scope for PR-1.
- `docs/PLAN-RESEARCH-REPORT.md` — plan / research / report must live in the **same directory**. Done: all three under `docs/plans/landing-rocketteam/`.
- `AGENTS.md` rule 6 — plan must describe the work, not "where to read context". Done: plan.md describes the deliverables, this `research.md` captures the actual context.
- `CLAUDE.md` 项目内编辑白名单 — only `AGENTS.md` / `CLAUDE.md` / `docs/` and *.md < 200 lines. The new files under `packages/landing-adapter/` are TypeScript / JSON, not Markdown, so 200-line limit does not apply; they are code, governed by Engineering rules.
