# `scripts/ablation/` — m5 rule propagation L4 ablation harness

Counterfactual Ablation paired t-test for issue #332, per
[`docs/verify/E2E-LEARNING.md`](../../docs/verify/E2E-LEARNING.md):

> "Counterfactual Ablation = `scipy.stats.ttest_rel` paired t-test on
> rule-ON vs rule-OFF runs of the same prompt set, producing numeric Δ
> + p-value + 95% CI."

## Files

- `ttest_l4.py` — the paired t-test runner. Pure Python + scipy, no
  TeamBrain imports.
- `sample-data/rule-on.json` + `sample-data/rule-off.json` — deterministic
  hand-crafted samples that produce `verdict=PASS` at α=0.01 for offline
  smoke testing (10 paired observations: rule-on=[1×10], rule-off=[0×10]).

## Usage

```bash
# Install scipy first (the project doesn't pull it in npm install — Python
# is only used for this ablation script).
pip install 'scipy>=1.11'

# Run on canonical sample data (smoke test, should print PASS).
python scripts/ablation/ttest_l4.py \
    --rule-on  scripts/ablation/sample-data/rule-on.json \
    --rule-off scripts/ablation/sample-data/rule-off.json \
    --alpha 0.01

# Real nightly invocation (slice 7 will wire this into a GitHub Actions job).
python scripts/ablation/ttest_l4.py \
    --rule-on  /tmp/nightly-out/avoidance-on.json \
    --rule-off /tmp/nightly-out/avoidance-off.json \
    --alpha 0.01 \
    --scenario m5-rule-propagation-l4-avoidance
```

Stdout is a single-line JSON verdict. Exit code is `0` if `verdict=PASS`,
`1` if `FAIL_INCONCLUSIVE` or `FAIL_DIRECTION`, `2` on input error.

## Verdict schema

```json
{
  "scenario": "m5-rule-propagation-l4-avoidance",
  "n": 10,
  "mean_on": 1.0,
  "mean_off": 0.0,
  "delta": 1.0,
  "t_statistic": Infinity,
  "p_value": 0.0,
  "ci_low": 1.0,
  "ci_high": 1.0,
  "alpha": 0.01,
  "verdict": "PASS"
}
```

| Verdict             | Condition                                       |
| ------------------- | ----------------------------------------------- |
| `PASS`              | `p < alpha` AND `delta > 0` (correct direction) |
| `FAIL_INCONCLUSIVE` | `p >= alpha` (no statistical significance)      |
| `FAIL_DIRECTION`    | `p < alpha` but `delta <= 0` (wrong direction)  |

## Why a separate Python script

The grill plan locks scipy as the third-party harness anchor:

> "Both verdicts are deterministic numbers or bytes — no LLM-as-judge in
> the loop, so the model cannot fabricate a pass."

`scipy.stats.ttest_rel` predates this repo by a decade, has a well-defined
mathematical contract, and is unfakeable. A bespoke Node implementation
would either depend on a smaller jstat-style library (less canonical) or
reimplement the math (potentially buggy + LLM-fakeable).

Slice 7 (nightly CI) handles the `pip install scipy` step; PR CI does not
install scipy — the script lives in the repo as data + smoke-tested
manually until the nightly workflow lands.

## Input contract

Both `--rule-on` and `--rule-off` JSON files share this shape:

```json
{
  "scenario":     "m5-rule-propagation-l4-<kind>",
  "condition":    "rule-on" | "rule-off",
  "prompts":      ["paraphrase 1", "paraphrase 2", ...],
  "observations": [<int>, <int>, ...]
}
```

Observations are integers per prompt (one per prompt, same order in both
files). Typically these are:

- `avoidance`: PreToolUse `block` event count per prompt
- `practice`:  UserPromptSubmit injection count per prompt
- `learning`:  `knowledge_entries.hit_count` delta per prompt

The two files MUST list prompts in the same order — the paired t-test
matches `observations[i]` from rule-on against `observations[i]` from rule-off.

## See also

- [docs/verify/E2E-LEARNING.md](../../docs/verify/E2E-LEARNING.md) — canonical
- [docs/adr/0014/332.md](../../docs/adr/0014/332.md) — grill log
- Slice 7 (planned) — nightly CI workflow that runs this script with real data
