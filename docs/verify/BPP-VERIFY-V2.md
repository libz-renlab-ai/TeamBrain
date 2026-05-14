# BPP-VERIFY-V2 — Gap 5 closure: full 5-fixture tier (a) + real scipy tier (b) + tier (c) skeleton

**Status**: Phase 6 PR-2/3 (Gap 5). Spec: [`docs/superpowers/specs/2026-05-13-best-practice-push-design.md`](../superpowers/specs/2026-05-13-best-practice-push-design.md) §8.

**Predecessor**: [`docs/verify/BPP-VERIFY.md`](./BPP-VERIFY.md) — the scaffold doc.
This V2 doc supersedes V1's "Current status" and "Roadmap" sections; everything
else in V1 (TL;DR, three-tier table, objective grep criteria, "why this is
LLM-uncheatable") remains canonical.

## What changed since V1

| Slice | V1 status | V2 status | Artifact |
|---|---|---|---|
| P6.1 — tier (a) byte-diff fixtures | 1 of 5 (`bpp-brainstorm-habit`) | **5 of 5** | 5 directories under `tests/fixtures/scenarios/bpp-*/` |
| P6.2 — tier (b) Counterfactual Ablation | single-task placeholder (`scripts/bpp-ablation.ts`) | **real scipy.stats.ttest_rel on 17-task corpus** | `scripts/bpp-counterfactual-ablation.py` + `scripts/bpp-ablation-data/17-task-corpus.json` |
| P6.3 — tier (c) LLM judge | not started | **skeleton present** (claudefast pipe, graceful fallback) | `scripts/bpp-llm-judge.ts` |
| P6.4 — verify doc | scaffold (`BPP-VERIFY.md`) | this file | `docs/verify/BPP-VERIFY-V2.md` |

V1 stays intact as the "intent" doc; V2 is the "Gap 5 closure" doc.

## Tier (a) — full 5-fixture corpus

The 5 fixtures cover **4 `BpType`s + 1 conflict pair**, mirroring spec §8.3:

| Fixture | type | topic | What pattern it captures |
|---|---|---|---|
| `bpp-brainstorm-habit/` (V1) | `habit` | `ai-collab` | `superpowers:brainstorming` skill → `Write` |
| `bpp-skill-dispatch-parallel/` (V2 new) | `skill` | `ai-collab` | `superpowers:dispatching-parallel-agents` skill → ≥2 `Task` |
| `bpp-habit-tdd/` (V2 new) | `habit` | `testing` | `Write(*.test.ts)` → `Bash(vitest run, see red)` → `Write(impl)` |
| `bpp-context-atomic-commits/` (V2 new) | `context-mgmt` | `git-flow` | `Write`/`Edit` immediately followed by `Bash(git add <file> && git commit ...)` covering only that file |
| `bpp-conflict-mock-vs-real-db/` (V2 new) | `rule` × 2 | `testing` | Two sessions emit two opposing BPs that get linked via double-written `conflict_with` |

Each fixture directory contains:
- `transcript.jsonl` — input session(s) for the miner
- `expected-candidate-bp.json` — pre-Wilson mining output (`confidence_tier="low"`)
- `expected-final-bp.json` — post-rollup + Wilson + tier gate output
- `judge.md` — pattern detector contract, pass criteria, caveats

### Conflict-pair fixture detail

`bpp-conflict-mock-vs-real-db/` is the **only** fixture whose JSON files contain
**arrays of 2** (not a single object). Its purpose is to lock the
`conflict_with` double-link semantics:

- BP_A's `conflict_with` array contains BP_B's id.
- BP_B's `conflict_with` array contains BP_A's id.
- Both BPs reach `canonical` tier independently (Wilson LB(16,0) ≈ 0.8064 and
  LB(15,0) ≈ 0.7961).

The test (`fixture-replay-all.test.ts`) explicitly asserts this double-link:

```ts
expect(bpYes.conflict_with).toEqual([bpNo.id]);
expect(bpNo.conflict_with).toEqual([bpYes.id]);
```

**Why hardcode the conflict pair (not use the LLM detector)**: spec §7.1 says
the conflict detector runs an LLM ("LLM 二分类 '矛盾 / 不矛盾'"). LLMs are
non-deterministic; tier (a) must be byte-deterministic. So this fixture asserts
the **post-link** invariant only — given the link exists, both BPs' arrays are
populated correctly. The LLM detector itself is exercised in tier (c).

### How to run tier (a)

```bash
# original 1-fixture test (V1)
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay.test.ts

# expanded 4-fixture test (V2)
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay-all.test.ts

# both at once
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay*.test.ts
```

Expected: **12 tests pass** (3 from V1 + 9 from V2). Failure means
mining or gate logic drifted from one of the fixtures.

### Spec §8.2 grep across all 5 fixtures

```bash
for f in tests/fixtures/scenarios/bpp-*/expected-final-bp.json; do
  # Handle both single-object and array fixtures:
  jq -c 'if type == "array" then . else [.] end | .[] | {id, rate: (.mining_evidence.pattern_count / .mining_evidence.sessions_observed), rejects: .mining_evidence.reject_count}' "$f"
done | awk -F'[,:}]' '
  { sub(/.*"rate"/,""); sub(/.*"id"/,""); print }
'
```

Each emitted BP must show `rate ≥ 0.7` and `rejects == 0` per §8.2.

## Tier (b) — scipy.stats.ttest_rel on a real (synthetic) 17-task corpus

V1 had `scripts/bpp-ablation.ts` which emitted a `p_value_placeholder: 0.01`
constant. V2 ships `scripts/bpp-counterfactual-ablation.py` which:

1. Reads `scripts/bpp-ablation-data/17-task-corpus.json` (17 rows of
   `{task_id, bpp_on_outcome, bpp_off_outcome}` where each outcome ∈
   `{avoided, failed}`).
2. Converts outcomes to binary (`avoided=1`, `failed=0`).
3. Runs `scipy.stats.ttest_rel(on, off)` for the paired t-test.
4. Computes Cohen's d (paired) and a 95% CI on the paired delta.
5. Emits a single-line JSON verdict.
6. Exits 0 on `conclusion == "PASS"` (p < 0.05 AND delta > 0), 1 otherwise.
7. Exits 1 with a help line if `scipy` is not installed (hint: `pip install scipy`).
8. Exits 2 on input errors (missing corpus, malformed JSON, length mismatch).

### Output format

```json
{
  "scenario": "bpp-counterfactual-ablation-17task",
  "n_pairs": 17,
  "mean_on": 0.8235,
  "mean_off": 0.1765,
  "delta": 0.6471,
  "t_stat": 3.3947,
  "p_value": 0.003702,
  "effect_size_cohen_d": 0.8233,
  "ci_low": 0.243,
  "ci_high": 1.0511,
  "alpha": 0.05,
  "conclusion": "PASS",
  "note": "PoC: synthetic 17-task corpus. Replace with real BPP replay for production p-value."
}
```

### How to run

```bash
# default corpus
python scripts/bpp-counterfactual-ablation.py

# custom corpus / alpha
python scripts/bpp-counterfactual-ablation.py \
    --corpus path/to/corpus.json \
    --alpha 0.01
```

### Important caveat (loud)

The shipped `17-task-corpus.json` carries **synthetic** outcomes (14 of 17
tasks where bpp-on=avoided/bpp-off=failed, 3 of 17 where the reverse holds —
yielding p ≈ 0.0037 and Cohen's d ≈ 0.82 at α=0.05). This is sufficient to
prove the harness wiring is correct; it is **NOT** sufficient to claim
production efficacy.

For a real verdict, the corpus rows must be replaced with **actual** outcomes
from running each task twice (once with BPP enabled, once disabled) through a
live Claude Code session and recording whether the model avoided the
documented mistake. That replay harness is tracked by issue #343 and is
**explicitly out of scope** for this PR — see spec §8 and
`docs/verify/E2E-LEARNING.md` for the canonical replay recipe.

## Tier (c) — LLM-judge skeleton

V1 had no tier (c) artifact. V2 ships `scripts/bpp-llm-judge.ts`:

- Reads `{"bp_a": {...}, "bp_b": {...}}` JSON on stdin.
- Builds a short judge prompt.
- Shells out to `claudefast -p '<prompt>' --output-format text` (per
  `docs/CLAUDEFAST.md`).
- Parses the model's JSON reply.
- Emits `{verdict, confidence, reasoning, judge, spec_ref}` to stdout.

### Output format

```json
{
  "verdict": "real_conflict" | "not_conflict" | "ambiguous",
  "confidence": 0.0,
  "reasoning": "≤30 words from the model, or skeleton fallback message",
  "judge": "claudefast" | "skeleton-fallback",
  "spec_ref": "docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (c)"
}
```

### Use cases

The script is **ONLY** for the semantic-ambiguity bottleneck called out in
spec §8.1: "two BPs disagree but neither violates the objective grep — are
they really conflicting?". Concretely:

- Use case A: in the conflict-detector pipeline (spec §7.1), after embedding
  retrieval pulls top-K candidate pairs, run this judge on each pair before
  writing `conflict_with` to the BP table.
- Use case B: in a human-in-the-loop console where a reviewer wants a
  "second opinion" on whether two ranked candidate pairs are truly opposing
  practices vs. apply-to-different-scopes overlap.

### Hard limits

1. **Not a main gate.** Spec §8.1: "主门禁是 tier (a) + (b). tier (c) 仅作
   semantic-ambiguity 兜底." Do NOT block PR landing on the tier (c) verdict.
2. **Single judge only.** Production-quality usage requires the 3-judge
   voting pattern from spec §8 (majority wins, log dissent). This skeleton
   exposes the per-call primitive; vote orchestration is a future PR.
3. **Graceful fallback.** If `claudefast` is not on PATH, the script emits
   `{"verdict":"ambiguous","confidence":0,"judge":"skeleton-fallback"}`
   rather than crashing — so CI lanes without provisioned models can still
   gather signal.
4. **Non-deterministic verdicts.** The same input may yield different
   verdicts across runs. Callers MUST gate behavior on `confidence ≥ threshold`
   and / or majority vote, not on a single judge call.

### How to run

```bash
echo '{
  "bp_a": {"id":"bp-2026-05-13-tests-must-mock-db",      "title":"Tests MUST mock the database",    "body":"...", "type":"rule","topic":"testing"},
  "bp_b": {"id":"bp-2026-05-13-tests-must-not-mock-db",  "title":"Tests MUST NOT mock the database","body":"...", "type":"rule","topic":"testing"}
}' | npx tsx scripts/bpp-llm-judge.ts
```

Sample skeleton-fallback output (when claudefast not installed):

```json
{"verdict":"ambiguous","confidence":0,"reasoning":"claudefast not available — tier (c) skeleton fallback. Install per docs/CLAUDEFAST.md to enable real judging.","judge":"skeleton-fallback","spec_ref":"docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (c)"}
```

## End-to-end verify recipe (Gap 5 closure)

To claim "BPP Gap 5 PR is done", run all three tiers:

```bash
# tier (a): byte-diff all 5 fixtures
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay*.test.ts
# expect: 12 tests pass

# tier (b): scipy ttest_rel
python scripts/bpp-counterfactual-ablation.py
# expect: conclusion=PASS, p_value < 0.05, exit 0

# tier (c): LLM judge skeleton (sanity)
echo '{"bp_a":{"id":"a","title":"x","body":"y","type":"rule","topic":"testing"},"bp_b":{"id":"b","title":"x2","body":"y2","type":"rule","topic":"testing"}}' | npx tsx scripts/bpp-llm-judge.ts
# expect: single-line JSON, exit 0
```

When all three return success, Gap 5 is closed. The main gates are still
tier (a) + (b); tier (c) is a sanity skeleton that does NOT block.

## Diff vs `docs/verify/BPP-VERIFY.md` (V1)

V1 sections that are still canonical (do NOT re-read here):
- TL;DR (hallucinated practices + no-op effect failure modes)
- Three-tier table at a high level
- Objective grep criteria (§8.2 — `pattern_count/sessions_observed ≥ 0.7 AND reject_count == 0`)
- "Why this is LLM-uncheatable" (load-bearing properties 1–3)
- "Relation to existing verify infra" (E2E-LEARNING.md parent doctrine,
  ADR-0013 inner-loop CI, existing fixture pool)

V1 sections **superseded** by V2:
- V1 "Current status (Phase 6 PR-1)" table — replaced by V2 "What changed" table at top.
- V1 "Roadmap to 'done'" table — Gap 5 closes the first three roadmap rows
  (`P6.1 expand`, `P6.2 expand`, `P6.3`); V1 row `P6.4` is itself this doc.
- V1 sample tier (b) output (with `p_value_placeholder: 0.01`) — replaced
  by V2 real scipy output (`p_value: 0.003702` etc.).

## Future work (NOT this PR)

- Replace the synthetic 17-task corpus with real LLM-replay outcomes
  (issue #343 / E2E-LEARNING corpus reuse).
- Wire the 3-judge voting pattern on top of `scripts/bpp-llm-judge.ts`.
- Add a 6th fixture if a new `BpTopic` ships (currently we have testing /
  git-flow / ai-collab — `code-style` and `ctx-mgmt` are unrepresented).
- Promote V1 + V2 to a single canonical `BPP-VERIFY.md` when the synthetic
  corpus is replaced with real data (Phase 6 PR-3 candidate).
