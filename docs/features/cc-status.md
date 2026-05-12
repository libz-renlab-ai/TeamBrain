# CC runtime status upload + query API (issue #350, epic #335 F2-D)

**Status:** shipped (server endpoints + statusline push path).

## What it is

A point-in-time picture of one Claude Code instance — model, context usage,
cost, rolling 5h/7d token windows, session health, quota utilization, and a few
output-volume aggregates — pushed to the digital-twin collector and served back
over HTTP so **downstream projects can pull it directly** instead of
screen-scraping a statusline.

`#337` already shipped the field computation (it renders those fields onto the
local status bar via `scripts/teamagent-statusline.cjs`). `#331` was closed
COMPLETED by `#337` but the *upload-to-server* intent was never addressed —
this feature is that part.

## Data model

`packages/digital-twin/src/cc-status/types.ts` — `CcStatusSnapshot`. Required:
`schema_version` (1), `session_id`, `user_id`, `ts`, `event`. Best-effort
(omitted when not computable, never emitted as a misleading `0`):

| group | fields |
|---|---|
| identity / location | `display_name`, `machine_id`, `cwd`, `git_branch` |
| model + context | `model`, `context_tokens`, `context_pct`, `session_health` (`OK`/`OVER_200K`), `cost_usd`, `tokens_5h`, `tokens_7d` |
| quota (issue #283 cache) | `subscription_tier`, `five_hour_utilization`, `seven_day_utilization`, `five_hour_reset_at`, `seven_day_reset_at`, `quota_stale` |
| output volume (1 transcript scan) | `turn_count`, `tool_calls_total`, `tool_calls_failed`, `files_touched`, `session_started_at` |

`CcStatusQueryRow` = `CcStatusSnapshot` + `stale_seconds` (= `now − ts`, floored
at 0; computed server-side at query time).

## Transport

A lighter channel than `/v1/cc-sessions` (which keeps uploading gzipped
transcript JSONL — the learning loop + Feature #3 video depend on it). The
snapshot is a flat JSON object, **not gzipped, not enveloped**:

```
POST <uploader.endpoint>/v1/cc-status
Authorization: Bearer <uploader.token>
Content-Type: application/json

{ ...CcStatusSnapshot }
```

→ `200 {ok:true, user_id, date, session_id}` or `400` (malformed — unlike the
optional quota sidecar on `/v1/cc-sessions`, the snapshot *is* the payload).

A dropped snapshot is fine — the next push re-sends. Fire-and-forget, detached,
never blocks CC, no retry, no queue. It's a latest-state snapshot, not durable
data like transcripts.

## Server storage

Sits next to the existing transcript / `quota.json` files
(`packages/digital-twin/src/cc-status/store.ts`):

```
<collectorDir>/<user>/<YYYY-MM-DD>/<session>.cc-status.jsonl   # one snapshot per line, appended
```

Latest = last valid line; history = the whole file (filtered by `since`). A
session crossing a UTC midnight has its lines split across two date dirs — the
readers scan every date dir under the user and group by the `<session>`
filename, so that's transparent. Same `safeUserId` + path-traversal defenses as
`mock-server.ts`; bounded scans (≤60 date dirs, ≤500 files/dir, ≤5000 history
rows). Zero new deps.

## Query API

Unauthenticated, like the other `/api/*` endpoints. **Known exposure:** anyone
on the LAN can read everyone's live CC activity — the issue body flags this;
adding auth to `/api/*` is a separate issue.

| endpoint | returns |
|---|---|
| `GET /api/cc-status?user=<uid>` | `{sessions: [latest row per session for that user]}`, freshest first |
| `GET /api/cc-status?user=<uid>&session=<sid>` | the single latest row (`404` if none) |
| `GET /api/cc-status/all` | `{sessions: [latest row per session, all users]}` — leader roster |
| `GET /api/cc-status/history?user=<uid>&session=<sid>&since=<ts>` | `{user_id, session_id, since, history: [time series]}` (`since` accepts ISO-8601 / epoch-ms / epoch-sec; missing → last 24h) |

Both `runProdServer` and `startMockServer` expose these (the prod server wraps
the mock server).

## Client push site

The push lives **in the statusline** (`scripts/teamagent-statusline.cjs`,
`maybePushCcStatus`), not in a hook entry. Rationale: the statusline is the only
process that gets `model` / `cost` / `exceeds_200k_tokens` (those are on the
statusline's stdin payload, not on hook stdin), it already computes the
transcript-derived fields, and it requires zero new hook registration. The
statusline runs far more often than every 30s, so:

- **throttle** — `~/.teamagent/cc-status/.last-push` (mtime). At most one push
  per 30s; the timestamp is stamped *before* the push so two near-simultaneous
  renders don't both spawn.
- **detached** — the POST runs in a `node -e <fetch> <tmpfile>` child
  (`detached`, `unref`, `windowsHide`, 10s fetch timeout). A hung server can
  never slow the status row.
- **best-effort** — every step is wrapped; a failure never affects the render.

`event` is `"Status"` (the statusline's `hook_event_name`). Wiring additional
push sites onto the frequent hooks (`UserPromptSubmit` / `PreToolUse` /
`PostToolUse`, throttled) or low-frequency ones (`Stop` / `SessionEnd` /
`PreCompact`, every time) is a mechanical follow-up using the same body shape —
the data model in `cc-status/compute.ts` already exposes `shouldPush(...)` and
`buildCcStatusSnapshot(...)` for that. Deliberately out of scope for the first
PR to keep it reviewable.

`scripts/teamagent-statusline.cjs` is standalone (it can't import a workspace
package), so its inline `buildCcStatusBody` parallels
`packages/digital-twin/src/cc-status/compute.ts` — that TS module is the
canonical spec and carries the unit tests.

## Verification

See `docs/plans/2026-05-12-issue-350/judge.md` (J1–J5). The acceptance red line
is J5: from a real CC session the structured status is retrievable over HTTP
from the collector.

## Out of scope (declined on purpose)

- Local statusline rendering — already done in #337.
- Auth on `/api/*` — separate issue.
- `intercepts_today` / `last_activity_at` — needs `events.db` / OS process,
  follow-up.
- Second-level realtime SSE/WebSocket push — cadence is minute-level for now;
  the architecture leaves the door open (epic #335 Feature #2) but does not
  rewrite the upload path.
- Audio/recording transcription — Feature #3 territory.
- Opt-out / pause switch — silent upload, same as transcripts.
