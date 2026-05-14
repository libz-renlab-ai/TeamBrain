# 里程碑 4 · 挖矿质量验证 — 实验骨架

> Implements `docs/plans/2026-05-13-bpp-full-system-acceptance.md` §M4
> "挖矿质量验证（用真实数据，最重要的一关）"
>
> Status: BLOCKED-ON-HUMAN until a real 6-12 person team is recruited.
> Everything below up to the "press start" step is implemented; pressing
> start is a physical action by a human coordinator.

## End-to-end run sequence

Once a real team is recruited, the coordinator runs these in order. Each
step has an explicit script under this directory.

| Step | Script | Owner | Output |
|---|---|---|---|
| 1. Recruit 6-12 members | `recruitment/recruit.md` | human coordinator | signed informed-consent forms |
| 2. Pre-experiment screening | `recruitment/screening-questionnaire.md` | each member | baseline data per member |
| 3. Random group split | `tools/random-split.py --members <file> --seed <date>` | coordinator | 2 group files |
| 4. Distribute 17 task suite | `tasks/task-suite.md` | coordinator | each member knows their tasks |
| 5. Daily 4-week telemetry | `collection/daily-collector.ts` | per-member auto-run | `daily-<date>-<member>.jsonl` |
| 6. Per-task scoring | `tasks/<NN>-<slug>/score.sh` | auto-run on submission | 0 / 1 |
| 7. Final aggregation | `analysis/aggregate.py` | coordinator on day 28 | `experiment-rollup.json` |
| 8. 4-gate statistical analysis | `analysis/judge.py` | coordinator on day 28 | `m4-verdict.json` |
| 9. Report write-up | `analysis/report-template.md` | coordinator | `m4-experiment-report.md` |

Days 1-28 are the live experiment. Steps 1-4 happen on day 0; step 5-6
run daily; steps 7-9 run on day 28+.

## The 4 quantified gates (acceptance.md §M4)

All four gates must pass at p < 0.05 (95% confidence) for §M4 to count
as PASS:

1. **完成率**：开挖矿组比关挖矿组高 ≥ 10 个百分点
2. **助手犯错次数**：开挖矿组少 ≥ 30%
3. **代码质量分**：开挖矿组高 ≥ 0.5（5 分制）
4. **主观评价分**：开挖矿组高 ≥ 0.3（5 分制）

`analysis/judge.py` computes paired t-test + bootstrap 95% CI for each
gate, returns JSON verdict `{gate_n: PASS|FAIL, p_value, ci_low, ci_high,
delta}` per gate. M4 verdict = AND of all four.

Per acceptance.md §M4 failure handling: if any gate fails, the project
halts and convenes a retrospective before continuing to §M5.

## The synthetic-data trap (acceptance.md §9.5)

Per §9.5, "any 'experiment results', 'data', 'cases', 'comparison
numbers' delivered must come with raw-record physical location and
reproduction script — data without these is not believed."

The harness here is built to make this trap unavoidable to fall into:

- All daily telemetry is auto-collected, never hand-typed.
- All 17 task pass/fail outcomes come from `score.sh` exit code,
  never human discretion.
- `analysis/judge.py` runs against the on-disk JSONL, no manual editing.
- `m4-verdict.json` is a deterministic function of the input data; rerun
  to reproduce.

## Why we can't synthesize this

Acceptance §8 explicitly carves out "AI can't be a real user". The four
gates measure changes in **real human behavior** under the influence of
the BPP system over 4 weeks. AI agents acting as test subjects would
make the experiment circular: BPP would be measuring whether BPP changes
AI behavior, not whether BPP helps humans.

## Directory layout

```
m4-experiment/
  README.md                              ← you are here
  tasks/
    task-suite.md                        ← list of all 17 tasks
    01-parse-duration/                   ← fully spec'd template task
      problem.md
      starter/
      reference-solution/
      score.sh
    02-fix-stale-pr-detection/           ← fully spec'd template task
      problem.md
      starter/
      reference-solution/
      score.sh
    03-migrate-callback-to-promise/      ← fully spec'd template task
    04-15-*.md                           ← outline-only — flesh out before launch
    16-*/  17-*/                         ← outline-only — flesh out before launch
  recruitment/
    recruit.md                           ← how to find 6-12 members
    informed-consent.md                  ← signed before participation
    screening-questionnaire.md           ← baseline AI-collab experience
  collection/
    data-schema.md                       ← what gets collected
    daily-collector.ts                   ← runs on each member's machine
    daily-template.jsonl                 ← example schema
  analysis/
    aggregate.py                         ← rolls up 28 days × N members
    judge.py                             ← scipy.stats 4-gate verdict
    report-template.md                   ← coordinator's writeup skeleton
  tools/
    random-split.py                      ← deterministic group split
```

## What "humans-pluggable" means here

Every step that doesn't physically require a human is implemented now:

- Scripts are runnable today (`python tools/random-split.py --help`).
- Test data flows through `daily-template.jsonl` with a documented schema
  so a coordinator can dry-run the entire pipeline before recruiting.
- `analysis/judge.py` has unit tests using a synthetic but
  schema-conformant input — those tests prove the script works, not
  that the experiment passes.

When real humans are recruited and start producing data, no code
changes are required — just plug their JSONL into the existing
analysis pipeline.

## Dry-run validation

To prove the harness is wired correctly without real humans:

```bash
python tools/random-split.py --members recruitment/example-roster.json \
  --seed 20260513 --out /tmp/groups.json
python analysis/aggregate.py --input collection/example-daily/ \
  --groups /tmp/groups.json --out /tmp/rollup.json
python analysis/judge.py --rollup /tmp/rollup.json --out /tmp/verdict.json
cat /tmp/verdict.json | jq
```

The synthetic example data under `collection/example-daily/` is just to
exercise the pipeline. The verdict it produces is **not** an M4 verdict;
it's a smoke test that the wiring works. Real M4 verdict only counts
once real human data flows through.

## Estimated effort once humans are available

- Day 0: recruit + screening + group split (~ 2 hours of coordinator time)
- Days 1-28: ~ 15 minutes/day of coordinator monitoring, no per-member overhead
- Days 28-30: write-up + verdict (~ 1 full coordinator day)

Total coordinator time over 4 weeks: ~ 12 hours.
Member time: their normal work; experiment is observational.
