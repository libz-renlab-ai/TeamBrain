# Verification harness — issue #350 (digital-twin → cc-status upload + query API)

The grill comment (issue #350, ending `--- end grill ---`) defined J1–J6.
J6 (post-shutdown) was skipped at grill time (Q6b chose no opt-out switch).
J1–J5 are implemented as automated tests below; J5 is the **acceptance red
line** — from a real CC session the structured status must be retrievable over
HTTP from the collector.

## How to run

```bash
pnpm exec vitest run \
  packages/digital-twin/src/cc-status/__tests__/compute.test.ts \
  packages/digital-twin/src/cc-status/__tests__/store.test.ts \
  packages/digital-twin/src/__tests__/mock-server-cc-status.test.ts \
  packages/cli/src/__tests__/statusline-cc-status-push.test.ts
pnpm typecheck
```

(Full suite runs on CI per `docs/INNER-LOOP-TESTING.md`; the above is the
targeted slice for this feature.)

## J1 — unit: field-computation function

**What:** mock CC stdin + a crafted transcript → assert
model / context / cost / 5h-7d / turn / tool-calls / files are correct.

**Where:** `packages/digital-twin/src/cc-status/__tests__/compute.test.ts`
(`parseTranscriptLines` + `buildCcStatusSnapshot` + `shouldPush`). The
statusline's standalone parallel is exercised end-to-end by J2/J5.

## J2 — upload: server got a valid JSON snapshot

**What:** POST to `/v1/cc-status` → assert the server stored a valid snapshot
(has `schema_version`, the required fields, `user_id` matches) and rejects a
malformed body with `400`.

**Where:** `packages/digital-twin/src/__tests__/mock-server-cc-status.test.ts`
("accepts a well-formed snapshot", "rejects a malformed snapshot with 400")
and the client-side push half in
`packages/cli/src/__tests__/statusline-cc-status-push.test.ts`
("pushes a snapshot retrievable over HTTP …": a real `node scripts/teamagent-statusline.cjs`
run, given a CC stdin payload, lands a valid snapshot on a `startMockServer`).

## J3 — throttle: two high-frequency renders < 30s apart → exactly one push

**What:** the statusline runs far more often than every 30s, so it carries the
throttle (the grill's PreToolUse/PostToolUse role). Three rapid statusline runs
→ assert exactly one snapshot landed; the `~/.teamagent/cc-status/.last-push`
stamp exists. Pure-helper coverage: `shouldPush(lastPushMs, now, minIntervalMs)`
in `compute.test.ts`.

**Where:** `statusline-cc-status-push.test.ts` ("throttles rapid renders to one
push …") + `compute.test.ts` (`describe('shouldPush')`).

## J4 — non-blocking: hung / unreachable server doesn't slow the statusline

**What:** point the uploader at `http://127.0.0.1:1` (nothing listening) and run
the statusline → assert it exits 0, still renders the legacy status row, and
returns well under any plausible network timeout (the detached child's own
fetch timeout is 10s; the parent must not wait for it).

**Where:** `statusline-cc-status-push.test.ts` ("does not block the statusline
when the server hangs / is unreachable").

## J5 — end-to-end query (ACCEPTANCE RED LINE)

**What:** a real `scripts/teamagent-statusline.cjs` render (CC stdin payload +
a transcript on disk) against a real collector server → `GET /api/cc-status?user=<me>&session=<sid>`
returns the latest status for that session with non-empty fields and a sane
`stale_seconds`; `GET /api/cc-status/all` contains the user.

**Where:** `statusline-cc-status-push.test.ts` ("pushes a snapshot retrievable
over HTTP after a CC render (J2 + J5 client slice)") + the HTTP-layer roundtrip
in `mock-server-cc-status.test.ts` ("round-trips: POST then GET …",
"GET /api/cc-status/all spans every user", "GET /api/cc-status/history …").

**Manual smoke against the prod collector** (192.168.22.88:8080):

```bash
# in a real Claude Code session with digital-twin enabled, let the statusline
# render a few times (it pushes at most once per 30s), then:
curl 'http://192.168.22.88:8080/api/cc-status?user=<your-user-id>'
curl 'http://192.168.22.88:8080/api/cc-status/all'
```

→ a `sessions[]` array with your live session's snapshot fields populated and
`stale_seconds` small. This is the downstream-pull contract the issue asks for.

## J6 — post-shutdown

Skipped (Q6b: no opt-out / pause switch — silent upload, same as transcripts).
