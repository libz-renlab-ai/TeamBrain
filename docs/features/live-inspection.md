```
                       ┌──────────────────────────┐
   leader CLI click →  │ teamagent inspect-member │  → Markdown summary
                       │       <member>           │  + inspection.json
                       └──────────────────────────┘  + incident.json (if 🚨)
                              │
              reads          │           fetches
       ┌──────────────────┐  │  ┌─────────────────────────┐
       │ events.db (#308) │←─┴─→│ GitHubActivityPort       │
       │                  │     │  (gh CLI / git fallback) │
       └──────────────────┘     └─────────────────────────┘
                              │
                       ┌──────┴──────┐
                       │ correlate    │  pure
                       │ detectAbnormal│ fns
                       │ summarize    │
                       │ freezeIncident│
                       └──────────────┘
```

# Live inspection (issue #372)

> Per grill verdict §7 option C: **leader clicks → live inspection session**.
> Not a background daemon. One-shot CLI primitive that the future Feature #2
> dashboard sits on top of.

## CLI

```bash
teamagent inspect-member <member> [options]
```

| Flag | Default | Meaning |
|------|---------|---------|
| (positional) | — | GitHub login (or git author name when only `git log` is reachable) |
| `--project <owner/repo>` | none | GitHub repo slug. Without it, the `gh` adapter falls back to empty arrays (use `--github-fake` for offline runs). |
| `--window 24h \| 7d \| since-creation \| session+24h` | `24h` | Time window; matches grill defaults (member=24h, project=7d, issue/PR=since-creation, green light=session+24h). |
| `--now <ISO8601>` | wall clock | Pin "now" for determinism (judge harness uses this). |
| `--out <path>` | — | Also write the inspection JSON to this path (in addition to the canonical home-dir copy). |
| `--github-fake` | off | Use the in-memory fake GitHub adapter — useful for offline / CI / judge runs. |
| `--fake-abnormal repeated_deny\|education_loop\|stuck` | none | Inject a fake abnormal-path fixture into the event stream. Judge harness uses `repeated_deny` to verify the incident path. |
| `--teamagent-home <dir>` | `$TEAMAGENT_HOME` or `~/.teamagent` | Override the home directory (judge harness uses a temp dir per run). |
| `-h, --help` | — | Print usage. |

## Output

### Markdown summary (stdout)

```
## Inspection summary

- **member**: `alice`
- **project**: `owner/repo`
- **window**: 2026-05-12T10:00:00Z → 2026-05-13T10:00:00Z
- **generated at**: 2026-05-13T10:00:00Z

### Counts
- AI events: **5**
- commits: **2**
- PRs: **1** opened, **1** merged
- issues opened: **0**
- pre-tool-use denies: **0**
- narrative recurrences: **0**
- prompt injections: **0**

### Status
healthy — no abnormal signals detected.

### Recent timeline (3 entries)
- `2026-05-13T07:00:00Z` PR #42 (merged) fix bug
- `2026-05-13T08:00:00Z` commit `abc1234` fix: typo
- `2026-05-13T09:30:00Z` event `ai.narrative.injected`

> inspection: ~/.teamagent/<project_slug>/inspections/20260513T100000-alice.json
```

### Files

| Path | When written | Contents |
|------|--------------|----------|
| `~/.teamagent/<project_slug>/inspections/<ts>-<member>.json` | every run | full `InspectionResult` (member, window, counts, timeline, abnormalSignals) |
| `~/.teamagent/<project_slug>/incidents/<incidentId>.json` | only when `abnormalSignals` is non-empty | `Incident` snapshot: signals + counts + last 200 timeline entries |
| `<--out>` | when `--out` is supplied | duplicate of inspection.json for ad-hoc handoff to UI / pipeline |

`<project_slug>` is derived from `--project owner/repo` (uses the `repo` segment, sanitized) or from `path.basename(cwd)` when `--project` is omitted.

## Abnormal signal heuristics

Pure function `detectAbnormal(counts, thresholds)` in
`packages/core/src/live-inspection/detect-abnormal.ts`. Defaults:

| Signal id | Trigger | Threshold |
|-----------|---------|-----------|
| `repeated_deny` | pre-tool-use deny fires ≥ N | 3 in window |
| `education_loop` | `ai.narrative.recurred` ≥ N | 3 in window |
| `stuck` | 0 commits AND ≥ N prompt injections | 10 injections |
| `no_activity` | 0 events AND 0 GitHub activity | unconditional |

Thresholds are injectable per-call; the CLI uses defaults. Future PRs can
plug in policy-specific thresholds without touching the core function.

## Architecture

```
packages/ports/src/github-activity-port.ts           Port interface
packages/ports/src/github-activity-port-inmemory.ts  runtime-safe fake
packages/ports/src/__tests__/.../contract.ts          golden contract suite

packages/adapters/src/github-activity/gh-cli-adapter.ts  gh CLI / git fallback

packages/core/src/live-inspection/                    pure functions
  ├ types.ts                  InspectionResult / Incident / AbnormalSignal
  ├ correlate.ts              merge events + activity into timeline
  ├ detect-abnormal.ts        heuristics
  ├ summarize.ts              Markdown renderer
  ├ freeze-incident.ts        Incident serializer
  └ __tests__/                20 unit tests

packages/cli/src/commands/inspect-member.ts           parse / execute / render
packages/cli/src/bin.ts                               case "inspect-member"
```

The Port lets the future Feature #2 dashboard plug in a GraphQL-backed
adapter or a multi-repo aggregator without touching core logic. The pure
functions keep abnormal heuristics testable and policy-changeable.

## What this is NOT (out of scope)

- **Not a background daemon.** Runs once per click, exits.
- **Not the Feature #2 dashboard UI.** This is the CLI primitive the
  dashboard later calls. Method 3 visual-proof PR will deliver the UI in
  a separate PR.
- **Not a daily report.** Issue #371 ships the daily aggregation; this is
  click-time only.
- **Not multi-member parallel.** One member per call. Concurrent inspections
  are safe (no shared state), but caller orchestrates them.
- **Not a #308 emitter.** Reads `events.db` only; never writes to it.

## Related

- Grill verdict: [ADR-0014 §7 / issue #372 comment](https://github.com/libz-renlab-ai/TeamBrain/issues/372#issuecomment-4436664614)
- Plan / research / judge: `docs/plans/2026-05-13-issue-372-live-inspection/`
- Sibling features: [#308 green light](https://github.com/libz-renlab-ai/TeamBrain/issues/308), [#371 daily summary](https://github.com/libz-renlab-ai/TeamBrain/issues/371)
- Architecture rule: `CLAUDE.md` §元约束 (Functional Core / Imperative Shell)
