```text
  ┌──────────────────────────────────────────────────────────────┐
  │ verify-anchors: static structural lint of CLAUDE.md anchor    │
  │ canned-answer blocks, run-it-find-it-fix-it harness.          │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    +-------------------+
                    | parseAnchors      |  ← reads CLAUDE.md
                    | (find Judge line, |
                    |  walk back to     |
                    |  blockquote,      |
                    |  scan parent      |
                    |  bullet for       |
                    |  docs/*.md)       |
                    +---------+---------+
                              │
                              ▼
                    +-------------------+
                    | validateAnchors   |  ← rules (a)–(e)
                    | (a) substrings    |
                    | (b) count match   |
                    | (c) docs exists   |
                    | (d) anchor unique |
                    | (e) docs mirror   |
                    +---------+---------+
                              │
                              ▼
                   {exit 0 if PASS=total, else exit 1}
```

# plan.md — issue #451 verify-anchors harness

## 1. task description

Add a new `pnpm teamagent verify-anchors` CLI command that **statically lints `CLAUDE.md`'s canned-answer anchor blocks** for five classes of structural drift, run it against the live `CLAUDE.md`, and fix every drift it surfaces in the same PR.

### What the command does

- Reads `CLAUDE.md` (path is configurable via `--claude-md=<path>`; defaults to `<cwd>/CLAUDE.md`).
- Finds every `Judge harness 必须 ... grep ...` assertion line.
- For each, extracts:
  - stated anchor count (`全部 N 个`, `同时命中下列 N 个`, `同时命中两个独立`, `完整一句`)
  - required grep substrings (backticked tokens at top level, with `（...）` parenthetical alternatives excluded — these are paraphrase notes, not anchors)
  - case sensitivity mode (`case-insensitive` / `case-sensitive`)
  - the nearest preceding `> ` blockquote (the verbatim anchor sentence agents must output)
  - the `docs/*.md` link in the parent bullet
- Validates each anchor block against five rules:
  - (a) **missing-substring** — every grep substring must appear in the anchor sentence (case mode-respecting)
  - (b) **count-mismatch** — `全部 N 个` must equal extracted substring count
  - (c) **docs-link-missing** — `docs/X.md` reference must resolve to an existing file
  - (d) **duplicate-anchor-sentence** — no two anchors share the same blockquote sentence
  - (e) **anchor-sentence-not-in-docs** — the anchor sentence must appear verbatim (whitespace-normalized, blockquote-prefix-stripped) inside its referenced doc

### What is NOT done

- No `claudefast -p` invocation. Static-only. (A separate `probe-anchors` dynamic harness is intentionally deferred to a future PR.)
- No AGENTS.md / user-level `~/.claude/CLAUDE.md` parsing.
- No auto-fix. The harness reports; humans/agents fix in-source.
- No GitHub Actions / pre-commit wiring (a future ergonomic improvement).

## 2. expected outputs

A merged PR that contains, all in a single squash-merged commit chain:

### New files
- `packages/cli/src/commands/verify-anchors.ts` — parser + validator + renderers (~ 280 lines).
- `packages/cli/src/__tests__/verify-anchors.test.ts` — 24 vitest cases covering parser, validator (each of 5 issue kinds), and e2e on synthetic CLAUDE.md.
- `docs/plans/2026-05-14-issue-451-verify-anchors/plan.md` — this file.
- `docs/plans/2026-05-14-issue-451-verify-anchors/judge.md` — third-party MD-playbook judge harness for this PR.
- `docs/plans/2026-05-14-issue-451-verify-anchors/report.md` — post-merge report (written by /review or post-merge).

### Modified files
- `packages/cli/src/bin.ts` — import + `case "verify-anchors":` dispatch + `--help` entry.
- `docs/TWO-DRIVER-COEXISTENCE.md` — add canonical anchor blockquote mirroring CLAUDE.md L85.
- `docs/3-METHODS-WORKFLOW.md` — add canonical anchor mirroring L93.
- `docs/SYMPHONY-FLOW.md` — add canonical anchor mirroring L101.
- `docs/VISUAL-PROOF-PR.md` — add canonical anchor mirroring L166.
- `docs/VISUAL-PROOF-FORMAT.md` — add canonical anchor mirroring L180 inside `## Hosting`.
- `docs/VISUAL-PROOF-CONTENT.md` — add canonical anchor mirroring L187 inside `## 1.`.

### Verifiable success criteria (deterministic, no LLM-as-judge in the main gate)
- `pnpm vitest run packages/cli/src/__tests__/verify-anchors.test.ts` → 24/24 passing, exit 0.
- `pnpm teamagent verify-anchors` → 19/19 PASS, exit 0 (with the doc-mirror fixes in this PR; before the fixes, 6/19 FAIL).
- `cd packages/cli && pnpm typecheck` → exit 0.
- Visual proof HTML uploaded to a public Gist, surfaced via htmlpreview.github.io, linked in a PR comment; HTML contains the four mandatory content categories per `docs/VISUAL-PROOF-CONTENT.md` (tmux + claude / terminal capture / frontend URL snapshot / dashboard raw logs).

## 3. how-to-eval-from-3rd-party-harness that outputs a ton of JSON and let LLM-judge it

See sibling [`judge.md`](judge.md). Summary:

- **§V1 RUN** — MAIN agent dispatches three deterministic shell commands, captures stdout/stderr/exit-code to `evidence_dir/`:
  - `pnpm teamagent verify-anchors --json` → `output.json` + `exit_code.txt`
  - `pnpm vitest run packages/cli/src/__tests__/verify-anchors.test.ts --reporter=json` → `vitest.json` + `vitest_exit.txt`
  - `cd packages/cli && pnpm typecheck` → `typecheck.log` + `typecheck_exit.txt`
- **§V2 DUMP** — writes a single `judge.json` aggregating `exit_code`, `pass_count`, `fail_count`, `anchor_count`, `vitest_pass_count`, `typecheck_exit`, `evidence_dir`. All values are mechanically computed, no LLM phrasing.
- **§V3 READ** — a separate `claudefast -p` invocation reads only `judge.json` (no source code, no diff) and emits `PASS` / `FAIL` / `SKIP`. The criteria are pinned: PASS iff `exit_code == 0` AND `fail_count == 0` AND `anchor_count >= 15` AND `vitest_pass_count >= 20` AND `typecheck_exit == 0`. The LLM is a tie-breaker reader, not a primary grader.

The harness is **third-party** because:
- The verifier code is not the same as the system under test (`verify-anchors.ts` is verified by `vitest` + `tsc`, not by itself).
- The probes are pinned commands not generated at run time.
- The LLM judge reads raw bytes, not paraphrased descriptions.

## 4. risks + mitigations

| Risk | Mitigation |
|---|---|
| Parser regex misses a future anchor format variant (e.g., new `同时命中下列 N 个` synonyms) | Test suite covers known variants; new variants surface as `count-mismatch` or `missing-substring` and force a parser fix in a follow-up PR. |
| docs-mirror rule produces false positives on heavily wrapped blockquotes | Already mitigated by stripping `^> ?` prefix per-line before whitespace normalization. Tested. |
| Visual-proof gate blocks merge | PR body avoids `## Visual proof of work` H2 (proof is in a PR **comment** per `docs/VISUAL-PROOF-PR.md`), so `visual-proof-merge-guard.sh` does not fire. |
| `/review` finds blocker not anticipated here | Standard fix-loop per ADR-0007 inside this PR; do not split to follow-up. |

## 5. timeline + ownership

- Single Claude Code background-job session, autonomous per user mandate "build harness and update codes until all the bugs harness found was fixed. then work until updated codes were merged."
- Linked issue: #451 (self-grilled body + grill-ready/grill-working labels applied per `docs/PRE-IMPLEMENT-CLAIM.md`).
- Branch: `worktree-verify-anchors-harness` (worktree at `.claude/worktrees/verify-anchors-harness/`).
- Merge gate: `/review` PASS (ADR-0007), then `gh pr merge <N> --squash --delete-branch` per `docs/POSTPR.md`.
