```text
   TeamBrain main repo                  upstream hrdAI3/RocketTeam
   ───────────────────                  ──────────────────────────
        │                                       │
        │  git submodule add (pinned SHA)       │
        ├──────────────────────────────────────►│   landing/rocketteam/
        │                                       │   ├── src/  (Next.js app)
        │                                       │   ├── package.json
        │                                       │   └── ...
        │
        │  adapter expose feature 2 / feature 3
        ▼
   packages/landing-adapter/
   └── src/index.ts  (TeamBrain ↔ RocketTeam data shape)
        │
        │  (FOLLOW-UP PR)  GitHub Pages workflow
        ▼
   gh-pages branch  →  https://libz-renlab-ai.github.io/TeamBrain/
```

# Plan — Landing page via RocketTeam submodule (PR-1 slice)

## Task description

Wire `hrdAI3/RocketTeam` (Next.js app, public) into TeamBrain as a **content source** for the **feature 2 / feature 3** landing page (per `docs/BUSINESS-FEATURES.md`):

- Feature 2 = team leaders see, in second-level realtime, what each teammate's Claude Code instance is doing
- Feature 3 = video recording + upload to centralized storage

### Locked architecture (resolved 2026-05-12 after surfacing conflict with existing `apps/landing/`)

The existing `apps/landing/README.md` explicitly bans Next.js / React / Vue / any JS framework (decision source: `docs/specs/2026-05-07-landing-copy-actually-needed.md` decisions 1 / 7; P5 anti-slop). `.github/workflows/landing-deploy.yml` already owns the `libz-renlab-ai.github.io/TeamBrain/` Pages slot.

Chosen path: **keep both** — submodule is the upstream content source, existing `apps/landing/` static HTML/CSS stays the deploy form. The adapter is the **content bridge**: at build time it reads structured content out of `landing/rocketteam/` and writes Pretext-native HTML fragments that `apps/landing/src/` includes. **No `next build` is ever run** in CI; **no second Pages workflow** is added.

This PR-1 slice does the minimum subset that is reviewable in one squash-merge:

1. Add `hrdAI3/RocketTeam` as git submodule at `landing/rocketteam`, pinned to a specific upstream SHA (no working-tree copy of upstream content into TeamBrain — submodule pointer only).
2. Land a `packages/landing-adapter/` skeleton that defines the TypeScript contract surface for the content bridge described above.
3. Author `plan.md` / `research.md` / `report.md` (this trio) so a future contributor can land the content bridge without re-discovering the design.

Explicitly **out of scope** in PR-1:

- No second `landing-deploy.yml` workflow — existing one stays canonical.
- No `next.config.js` `output: 'export'` work — we never run `next build`, so this is not needed.
- Real adapter implementation that reads `landing/rocketteam/` content and emits HTML fragments — that lives in PR-3 once the content extraction target is scoped (which RocketTeam files / which sections feed which apps/landing/ blocks).
- Editing or copying upstream RocketTeam files into our tree — submodule is a pointer, not a fork.

## Expected outputs (acceptance criteria)

| Deliverable | Path | Pass condition |
|---|---|---|
| Submodule pointer | `.gitmodules` + `landing/rocketteam` gitlink | `git submodule status landing/rocketteam` returns one line ending `(heads/main)` with the pinned SHA |
| Plan trio | `docs/plans/landing-rocketteam/{plan,research,report}.md` | Three files exist, each opens with ASCII art per `AGENTS.md` rule 10, plan.md follows the three-segment rule |
| Adapter package skeleton | `packages/landing-adapter/{package.json,tsconfig.json,src/index.ts}` | `pnpm install` resolves the new workspace; `pnpm --filter @teamagent/landing-adapter typecheck` succeeds |
| Atomic commits | git log on branch | One commit per concept (submodule add / docs / adapter), `feat(landing):` / `docs(landing):` prefixes per `CLAUDE.md` 开发节奏 |
| PR | `gh pr view` | Normal PR (no `--draft`), CI green, `/review` PASS before squash-merge per ADR-0007 |

## How-to-evaluate (third-party judge harness)

Per TeamBrain's `docs/PLAN-RESEARCH-REPORT.md` three-segment rule: a separate playbook a different agent runs, dumps raw JSON, then an independent LLM judge reads only the raw JSON and decides PASS/FAIL — the implementer must not be the judge.

Playbook lives at `docs/plans/landing-rocketteam/judge.md` (to be authored as a follow-up before merge; for PR-1 a minimal inline matrix is acceptable since the deliverable is mechanical).

Probes the judge harness runs (each must dump stdout/stderr + exit code into `.judge/<run>/`):

1. **Submodule pointer probe** — `git submodule status landing/rocketteam` → JSON `{ "sha": "...", "branch": "heads/main", "dirty": false }`. PASS if `dirty=false` and `sha` matches the SHA recorded in this plan's `report.md` (locked at merge time).
2. **Submodule isolation probe** — `git ls-tree -r HEAD -- landing/rocketteam | wc -l` from the parent repo's index → must be `0` (gitlink only, no files materialised in the parent tree). PASS if `0`.
3. **Plan trio existence probe** — `for f in plan.md research.md report.md; do test -f docs/plans/landing-rocketteam/$f; done` → JSON `{ "plan": true, "research": true, "report": true }`. PASS if all three `true`.
4. **Adapter typecheck probe** — `pnpm --filter @teamagent/landing-adapter typecheck` exit code, stdout, stderr to JSON. PASS if exit `0`.
5. **Plan three-segment lint probe** — grep this `plan.md` for the three required H2/H3 anchors: `Task description`, `Expected outputs`, `How-to-evaluate (third-party judge harness)`. PASS if all three substrings present.
6. **`/review` PASS gate** — POSTPR `/review` skill run, raw output captured. PASS if `/review` returns PASS per ADR-0007.

LLM judge (a separate `claudefast -p` or subagent invocation) reads only the six raw JSON outputs above + this `plan.md` + the diff, and returns PASS/FAIL with one-sentence rationale per probe. The implementer (this session) does not write the judge verdict.

## Risks / open questions (resolved without blocking, per session ground rules)

- **R1**: upstream `hrdAI3/RocketTeam` is owned by a different account; future churn there can drift the landing. → Mitigation: pin by SHA in submodule (this is what `git submodule add` does by default). Bumping the SHA is a separate, reviewable PR.
- **R2**: PR-1 ships an adapter skeleton with no real implementation. → Acceptable because the GitHub Pages workflow PR is gated on this skeleton's contract being merged first; splitting per `docs/TRIAGE-AND-SPLIT.md` Single-PR Shippable Test.
- **R3**: FIXEDFLOW deviation — this PR did not originate from a grilled GitHub issue with `grill-ready` label and a `grill-working` claim per `docs/HOW-TO-CLAIM-ISSUE.md` / `docs/PRE-IMPLEMENT-CLAIM.md`. → Flag for maintainer review; if FIXEDFLOW compliance is required, close this PR, open a `<=50` word issue, re-grill, re-claim, redo.
- **R4**: upstream RocketTeam content shape is not yet inspected in detail (only file tree + build scripts in `research.md`). The adapter contract in `packages/landing-adapter/src/index.ts` currently models `Feature2Signal` / `Feature3Signal` as **TeamBrain-side runtime signals**, not as **upstream content sections**. PR-3 will either (a) add new content-bridge types alongside the runtime-signal types, or (b) refactor — depending on how the content bridge ends up wired. → Tracked as follow-up; not blocking PR-1 because PR-1 ships only the contract surface, no callers yet.

## Follow-up slices (not in PR-1)

- **PR-2**: update existing `.github/workflows/landing-deploy.yml` to checkout submodules (`submodules: recursive`) and add a `landing-adapter run` step before `pnpm --filter landing build`, so the adapter can drop generated HTML fragments into `apps/landing/src/_generated/` before the existing static build copies them into `dist/`. No new workflow file, no new Pages slot, no `next build`.
- **PR-3**: real adapter implementation — reads structured content from `landing/rocketteam/` (specific files TBD in PR-3 scoping) and emits Pretext-native HTML fragments under `apps/landing/src/_generated/` for inclusion by `apps/landing/src/index.html`. Stays inside the existing "no JS frameworks" landing policy.
- **PR-4**: optional fork of `hrdAI3/RocketTeam` under `libz-renlab-ai` org if upstream becomes a bottleneck for content updates.
