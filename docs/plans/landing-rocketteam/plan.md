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

Wire `hrdAI3/RocketTeam` (Next.js app, public) into TeamBrain as the source-of-truth for the **feature 2 / feature 3** landing page (per `docs/BUSINESS-FEATURES.md`):

- Feature 2 = team leaders see, in second-level realtime, what each teammate's Claude Code instance is doing
- Feature 3 = video recording + upload to centralized storage

This PR-1 slice does the minimum subset that is reviewable in one squash-merge:

1. Add `hrdAI3/RocketTeam` as git submodule at `landing/rocketteam`, pinned to a specific upstream SHA (no working-tree copy of upstream content into TeamBrain — submodule pointer only).
2. Land a `packages/landing-adapter/` skeleton that defines the TypeScript contract surface our future deploy workflow will call into to inject TeamBrain feature 2/3 data into the RocketTeam landing.
3. Author `plan.md` / `research.md` / `report.md` (this trio) so a future contributor can land the GitHub Pages deploy workflow without re-discovering the design.

Explicitly **out of scope** in PR-1:

- `next.config.js` patch to enable `output: 'export'` on the upstream — that lives in a fork/branch on the upstream, or in our own thin wrapper, not in this PR.
- `.github/workflows/landing-deploy.yml` — separate PR after PR-1 lands and the adapter contract is locked.
- Real implementation of the adapter (PR-1 ships type contracts + TODO stubs only).
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
- **R4**: `next.config.js` in the upstream does not currently enable `output: 'export'`; therefore even after PR-1 lands, GitHub Pages cannot serve the app without a follow-up that either (a) patches via build-time override script in the deploy workflow, or (b) opens an upstream PR. → Tracked as follow-up; not blocking PR-1.

## Follow-up slices (not in PR-1)

- **PR-2**: `.github/workflows/landing-deploy.yml` — checkout with `submodules: recursive`, run `pnpm --filter landing/rocketteam install && next build` with `output: 'export'` override, publish `out/` to `gh-pages` branch, enable Pages from that branch.
- **PR-3**: real adapter implementation — wires TeamBrain feature 2 (attribution bus / second-level realtime stream) + feature 3 (video upload metadata) into the data shape the RocketTeam landing expects.
- **PR-4**: optional fork of `hrdAI3/RocketTeam` under `libz-renlab-ai` org if upstream becomes a bottleneck.
