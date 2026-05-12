# iter-1-fix-plan.md — issue #368, /review pass 1

(per `docs/PR-PLAN.md`: task / expected outputs / judge harness. PR not open yet — renamed to `<date>-pr-<N>-fix-plan.md` after `/ship`.)

## Task

`/review` (Claude adversarial subagent) on the `feat/issue-368` diff found 3 low-severity issues:
1. **[P2]** `teamagent doctor`'s new `checkDigitalTwinUploader` unconditionally spawns the staged `~/.teamagent/digital-twin/bin-uploader.cjs`. Against a *pre-#368* staged binary (which is exactly the broken-install population this PR targets — they have the old bin, possibly + a manual `cp ulid` hack), `TEAMAGENT_UPLOADER_DRYRUN=1` is ignored, so the daemon enters the real `loadConfig → acquirePidLock → mainLoop` upload path, races the live Stop-hook daemon for the PID lock, then gets SIGKILLed at the 5 s timeout → doctor reports a misleading `BROKEN — dry-run hung >5s` for a binary that actually works (and leaves a stale PID file).
2. **[P3]** `defaultUploaderProbe` calls `child.stdin?.end()` with no `'error'` listener — a fast-exiting daemon can raise an unhandled EPIPE into `teamagent doctor`.
3. **[P3]** `uploader-log.ts` `ERROR_LINE_RE` includes the loose keyword `\bthrow\b` (and `/i`), so a benign daemon line that merely mentions "throw" / "error" could be surfaced as `last_error`.

## Expected outputs

1. `checkDigitalTwinUploader`: read the staged file; if it lacks the `TEAMAGENT_UPLOADER_DRYRUN` marker → `status: "skip"` with a "re-run `teamagent install-hook`" hint (never spawn it). Unreadable staged file → `status: "fail"` with a clear message. Only marker-bearing (post-#368) bins get probed.
2. `defaultUploaderProbe`: `child.stdin?.on("error", () => {})` before `.end()`.
3. `ERROR_LINE_RE`: anchored to error-class names (`Error:`/`TypeError:`/…), known prefixes (`daemon crash:`/`auth failed`/`MODULE_NOT_FOUND`/`UnhandledPromiseRejection`), and errno tokens (`EACCES`/`ENOENT`/…) — case-sensitive, no loose `\bthrow\b`.
4. `doctor.test.ts`: marker-bearing fake bin in the fixture + a new test asserting a marker-less staged bin → `skip` AND the probe is not called.

Not in scope (deliberate): not adding `tsup` to `digital-twin`'s devDependencies — neither `packages/cli` nor `packages/teamagent` declares it locally either; all three rely on the workspace-root hoist (the adversarial subagent's claim that `teamagent` declares it is incorrect — `grep tsup packages/teamagent/package.json` shows only the `"build": "tsup"` line). Not touching `checkHookSpawn`'s identical `stdin.end()` pattern (pre-existing, out of scope; "see something, say something" noted here).

## Judge harness

```bash
# 1. doctor skips a marker-less staged bin without spawning it
pnpm vitest run packages/cli/src/__tests__/doctor.test.ts -t "predates the dry-run probe"   # → 1 passed
# 2. all checkDigitalTwinUploader variants
pnpm vitest run packages/cli/src/__tests__/doctor.test.ts -t "checkDigitalTwinUploader"      # → 8 passed
# 3. log error regex behaviour
pnpm vitest run packages/digital-twin/src/daemon/__tests__/uploader-log.test.ts              # → 5 passed
# 4. EPIPE-safe probe + everything else still green
pnpm vitest run packages/cli/src/__tests__/doctor.test.ts packages/cli/src/__tests__/digital-twin-command.test.ts   # → 80 passed
pnpm --filter @teamagent/cli typecheck && pnpm --filter @teamagent/digital-twin typecheck    # → clean
# 5. rebuilt bin still self-contained + carries the marker
pnpm --filter @teamagent/digital-twin build
grep -c "TEAMAGENT_UPLOADER_DRYRUN" packages/digital-twin/dist/bin-uploader.cjs              # → 1
grep -cE "require\(['\"]ulid['\"]\)" packages/digital-twin/dist/bin-uploader.cjs || echo 0   # → 0 (ulid inlined)
```

Verdict: all judge probes verified PASS in the worktree on 2026-05-12 (doctor.test.ts 57 ✓, uploader-log 5 ✓, digital-twin-command 23 ✓, both typechecks clean, rebuilt bin has the marker + no `require("ulid")`).

Verification subagent (read-only, per `docs/AGENTIC-CODING-POLICY.md` §3) — 2026-05-12: **pass**. Confirmed all 6 grill decisions + the 3 /review-pass-1 fixes landed; ran the suites (doctor 57 / digital-twin-command 23 / uploader-log 5 / bin-uploader 2 / build-config 5 / tap-session 13, all green), rebuilt `dist/bin-uploader.cjs` (marker count = 1, `require("ulid")` count = 0). Non-blocking counter-examples noted: a corrupted partial copy that contains the marker string but doesn't short-circuit would be probed (timeout→SIGKILL) — low risk, marker only emitted by this build; `tap-session` still falls back to `stdio:'ignore'` if `openSync(uploader.log)` throws (documented).
