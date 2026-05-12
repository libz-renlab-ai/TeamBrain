# PR-PLAN — issue #350, /review iter 1 fixes

(Renamed to `docs/plans/2026-05-12-pr-<N>-fix-plan.md` once the PR opens.)

## Task description

`/review` iter 1 on `feat/issue-350` surfaced one P1 (DoS) plus several P2/P3
hardening + maintainability findings on the cc-status server store + statusline
push. Fix them in the same branch (no follow-up issues, per `docs/PR-PLAN.md`):

1. **[P1] `parseSinceMs` integer overflow → server crash.** `GET /api/cc-status/history?since=<huge>`
   makes `parseSinceMs` return a value past the max valid `Date` (8.64e15 ms);
   `new Date(sinceMs).toISOString()` then throws `RangeError` *inside the
   request handler* → uncaught → the unauthenticated collector process crashes.
   → clamp `sinceMs` to `[0, 8.64e15]` in `parseSinceMs`.
2. **[P2] unbounded `.cc-status.jsonl` growth.** `appendCcStatusSnapshot` only
   ever appends; a loop POSTing with a fixed `session_id` grows one file without
   bound, and every read (`readSnapshotLines` / `readLatestPerSession` / `readHistory`)
   re-parses the whole file. → before append, if the file exceeds a size cap,
   keep only the tail N snapshots (atomic rewrite).
3. **[P2] no length cap on snapshot string fields.** A 30 MB `cwd`/`event`/`model`
   under `MAX_BODY_BYTES` is persisted verbatim. → clamp each string field in
   `sanitizeCcStatusSnapshot`.
4. **[P3] `readLatestAllUsers` scans every user dir uncapped.** → cap user count.
5. **[P3] `session_id` allows `..` and Windows reserved device names.** Not a
   traversal today (`.cc-status.jsonl` suffix neutralizes `..`), but inconsistent
   with `mock-server.validateIdParam` and a Windows correctness wart. → reject
   `..` and `^(con|prn|aux|nul|com[1-9]|lpt[1-9])$` (case-insensitive) in
   `sanitizeCcStatusSnapshot`.
6. **[P3] `readLatestPerSession` assumes "last line = freshest".** Non-monotonic
   client clock within a UTC day breaks it. → pick `max-by-ts` over the file's
   lines.
7. **[P3] statusline `claimCcStatusPushSlot` TOCTOU + temp-file leak.** The
   "claim the slot" comment overstates a stat→write race (benign — server is
   last-wins); the detached push's temp file leaks if the child is SIGKILL'd.
   → soften the comment to be accurate; pass the push body via the child's
   stdin instead of a temp file (no file → no leak).
8. **[P3] maintainability** — `safeStatusUserId` / `dateStampFor` are near-verbatim
   copies of `mock-server.safeUserId` / `dateStamp`; `1e12` epoch-ms threshold is
   a bare magic number; the `reason: 'path'` branch of `appendCcStatusSnapshot`
   is effectively unreachable; the `.cjs` `aggregateCcExtras` file-key list omits
   `filePath` that `compute.ts.fileFromToolInput` has. → extract
   `cc-status/path-safety.ts` (`safeUserId` + `dateStamp`) imported by both
   `mock-server.ts` and `store.ts`; name the threshold const; comment the
   unreachable branch; add `filePath` to the `.cjs` list.

## Expected outputs

- `parseSinceMs` clamps; a regression test posts `?since=9999999999999999`
  and the server returns `200` (not a crash).
- `appendCcStatusSnapshot` keeps the per-session file bounded; a test appends
  past the cap and asserts the file shrank to the tail and `readLatestForSession`
  still returns the freshest snapshot.
- `sanitizeCcStatusSnapshot` truncates long strings; a test posts a 50 KB `cwd`
  and asserts the stored row's `cwd` is `<= 4096` chars.
- `sanitizeCcStatusSnapshot` rejects `session_id` `..` and `con`/`nul`/etc.; a
  test asserts those POSTs `400`.
- `readLatestPerSession` returns the max-by-ts snapshot even when an
  out-of-order line is last; a test asserts it.
- statusline push: no temp file is created; the existing J2/J5/J4 tests still
  pass (the body now arrives via stdin).
- `cc-status/path-safety.ts` exists; `mock-server.ts` re-exports `safeUserId` /
  `dateStamp` from it (public API unchanged); `pnpm typecheck` clean; the full
  digital-twin + statusline test suites stay green.

## Judge harness

```bash
pnpm exec vitest run \
  packages/digital-twin/src/cc-status/__tests__/compute.test.ts \
  packages/digital-twin/src/cc-status/__tests__/store.test.ts \
  packages/digital-twin/src/__tests__/mock-server-cc-status.test.ts \
  packages/digital-twin/src/__tests__/mock-server.test.ts \
  packages/cli/src/__tests__/statusline-cc-status-push.test.ts \
  packages/cli/src/__tests__/statusline-format.test.ts
pnpm typecheck
```

All green + typecheck clean ⇒ iter 1 fixes verified. A Verification subagent
(read-only, reads `git diff HEAD~N` + the grill + this fix-plan) appends a
`pass | fail | uncertain` verdict + a repro command below before `/review`
re-runs.

### Verification subagent verdict

**VERDICT: pass** (read-only Verification subagent, per `docs/AGENTIC-CODING-POLICY.md` §3,
on commit `d0063c0`).

- All 8 fix-plan items verified present in `git diff HEAD~1` (parseSinceMs clamp +
  `EPOCH_MS_THRESHOLD`/`MAX_DATE_MS`; `rotateIfOversize` byte-bounded tail;
  `sanitizeCcStatusSnapshot` string caps + `isUnreservedComponent` for `session_id`;
  `readLatestAllUsers` 500-user cap; `readLatestPerSession` max-by-ts; statusline
  push-via-stdin + corrected `claimCcStatusPushSlot` comment + `filePath` key;
  `cc-status/path-safety.ts` extracted, `mock-server.ts` re-exports `safeUserId`/`dateStamp`
  — public API unchanged).
- Judge harness green: `pnpm exec vitest run <6 files>` → 109/109 passed
  (compute 11, store 17, mock-server-cc-status 10, mock-server 45, statusline-cc-status-push 5,
  statusline-format 21). `pnpm typecheck` exit 0.
- Counter-examples now handled (were breakable pre-`d0063c0`):
  `?since=99999999999999999` → was an uncaught `RangeError` → collector crash; now `200`.
  50 KB `cwd` → was persisted verbatim; now clamped to 4096 chars.
  Loop POSTing a fixed `session_id` → was unbounded `.cc-status.jsonl`; now ~1–2 MB (rotates).
  `session_id` `..`/`con`/`nul`/`com1` → was accepted as a filename component; now `400`.
  Out-of-order older-`ts` line written last → was returned as "latest"; now max-by-ts wins.
  SIGKILL of the detached push child → was leaking a `teamagent-ccstatus-*.json` temp file;
  now no temp file is created.

REPRO:
```bash
git show d0063c0 --stat
git diff HEAD~1 -- packages/digital-twin/src/mock-server.ts packages/digital-twin/src/cc-status/store.ts packages/digital-twin/src/cc-status/path-safety.ts scripts/teamagent-statusline.cjs
pnpm exec vitest run packages/digital-twin/src/cc-status/__tests__/compute.test.ts packages/digital-twin/src/cc-status/__tests__/store.test.ts packages/digital-twin/src/__tests__/mock-server-cc-status.test.ts packages/digital-twin/src/__tests__/mock-server.test.ts packages/cli/src/__tests__/statusline-cc-status-push.test.ts packages/cli/src/__tests__/statusline-format.test.ts
pnpm typecheck
```
