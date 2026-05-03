```
   ┌──────────────────── CALIBRATOR v2 ────────────────────┐
   │                                                       │
   │   Wilson↑                                  Demerit↓   │
   │   (success)                                (fail)     │
   │      │                                       │        │
   │      ▼                                       ▼        │
   │   confidence ─────► tier ◄───── death-chain demote    │
   │                       │                               │
   │                  hysteresis                           │
   │                       │                               │
   │   experimental ─► probation ─► stable ─► canonical ─► enforced
   │        ▲                                                │
   │        └────── dormant (revival when demerit < 50) ─────┘
   └─────────────────────────────────────────────────────────┘
```

# Calibrator v2

## Goal

Self-calibrate every learned rule's `confidence` and `tier` based on observed success/failure events, so high-quality rules get promoted and bad rules get demoted automatically — no manual tuning.

## Status

**default path** (since M2.2, 2026-04-16). Fully implemented and CLI-visible:

- 5 maturity tiers + special `dormant` — all transitions wired
- Wilson Score Lower Bound (95% CI) + time-decay weighting — implemented
- Demerit death chain (≥5 / ≥15 / ≥50) — implemented
- Hysteresis guards (10 obs + demerit<2.5 to promote / 7-day cooldown to demote) — implemented
- Dormant revival (demerit decays below 50) — implemented
- CLI: `pnpm teamagent calibrate` shows `[old → new]` tier transitions; `pnpm teamagent stats --explain <rule-id>` prints full breakdown

## How it works

### 5 maturity tiers (confidence thresholds)

| Tier | Confidence | Retrieval weight |
|------|-----------|------------------|
| `experimental` | [0.00, 0.30) | × 0.5 |
| `probation`    | [0.30, 0.55) | × 0.7 |
| `stable`       | [0.55, 0.75) | × 0.9 |
| `canonical`    | [0.75, 0.90) | × 1.0 |
| `enforced`     | [0.90, 1.01] | × 1.0 |
| `dormant`      | (death)      | excluded from retrieval |

### Wilson Score (upscoring) — `packages/core/src/calibrator/v2/wilson.ts:53`

```
LB = (p + z²/2n − z × √(p(1−p)/n + z²/4n²)) / (1 + z²/n)    // z = 1.96
```

Each observation is exponentially decayed by `weight = exp(−ln(2) × daysAgo / halfLife)`. Half-life depends on highest-tier-ever-reached: 30 / 45 / 60 / 75 / 90 days. Conservative LB means few-observation rules don't get inflated scores.

### Demerit (downscoring) — `packages/core/src/calibrator/v2/demerit.ts:50`

Bad events add penalty `delta = base × multiplier (+ 10 if user_reject)` then decay over time:

| Tier | Base | Demerit half-life |
|------|------|-------------------|
| experimental | 1  | 7 days  |
| probation    | 2  | 10 days |
| stable       | 3  | 14 days |
| canonical    | 5  | 21 days |
| enforced     | 10 | 28 days |

`multiplier = max(1, −log(1 − min(conf, 0.99)))` → high-confidence rules that fail cost more (they should have known better).

Demerit sources: `ai.override.ignored`, `ai.override.blocked_circumvented`, `ai.narrative.recurred`, `calibrator.user_reject`, `validator.failure`.

### Death chain (immediate demotions) — `packages/core/src/calibrator/v2/tier.ts:37`

| Demerit | Effect |
|---------|--------|
| ≥ 5  | soft demote 1 tier |
| ≥ 15 | hard demote 2 tiers |
| ≥ 50 | → `dormant` (rule dies) |

`effectiveTier = pessimistic(confidenceTier, demeritTier)` — always picks the worse one.

### Hysteresis (anti-flapping) — `packages/core/src/calibrator/v2/hysteresis.ts:35`

**Promotion** needs all of:
- ≥ 10 observations in current tier
- demerit < 2.5

**Demotion** needs:
- ≥ 7 days since last tier change
- UNLESS demerit ≥ 30 → bypass cooldown (death chain)

### Dormant revival — `packages/core/src/calibrator/v2/hysteresis.ts:43`

A `dormant` rule whose demerit decays below 50 immediately becomes `experimental` — no waiting period. The rule gets a second chance.

## How to verify

```bash
# 1. Run unit + contract tests
pnpm test -- --run packages/core/src/calibrator/v2/__tests__/v2.test.ts
pnpm test -- --run packages/ports/src/__tests__/calibrator-v2-contract.ts

# 2. CLI tier transition output
pnpm teamagent calibrate                            # shows [old → new] per rule
pnpm teamagent stats --explain <rule-id>            # full confidence/demerit breakdown
pnpm teamagent stats --stuck-in-promotion           # rules blocked at probation

# 3. FASTPROBE summary (third-party harness)
claudefast -p "what is TeamBrain's Calibrator v2 confidence calibration feature? include 5 maturity tiers, Wilson Score, Demerit, hysteresis, Dormant revival, current implementation status"
```

Pass criteria: output mentions all 5 tier names + Wilson + Demerit + Hysteresis + Dormant revival + "default path" / "已实现" / "implemented".

## Known limitations

- `calibrator.user_reject` and `validator.failure` events are defined in schema but **no production code currently emits them** — only `ai.override.ignored` is actively producing demerit deltas in the wild.
- Demerit death-chain dormant threshold is `50` (not `30`); historical docs sometimes still cite the old `30`.
- Wilson `z` is hardcoded at 1.96 (95% CI) — not configurable per project yet.

## Links

- Code: `packages/core/src/calibrator/v2/{index,wilson,demerit,tier,hysteresis}.ts`
- Pipeline: `packages/core/src/pipeline/calibration-pipeline-v2.ts`
- Port + contract: `packages/ports/src/calibrator-v2.ts`, `packages/ports/src/__tests__/calibrator-v2-contract.ts`
- CLI: `packages/cli/src/commands/calibrate.ts`
- E2E audit: `audit/runners/feature-07-calibrate.ts`
- Original implementation plan (long, historical): [docs/superpowers/plans/2026-04-16-m2.2-calibrator-v2.md](../superpowers/plans/2026-04-16-m2.2-calibrator-v2.md)
- Phase 2 design: [docs/superpowers/specs/2026-04-15-phase2-design-v2.md](../superpowers/specs/2026-04-15-phase2-design-v2.md)
