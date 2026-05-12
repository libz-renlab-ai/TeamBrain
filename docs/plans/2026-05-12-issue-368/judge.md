# judge.md — issue #368 verification harness

Each probe dumps evidence; an LLM-judge can read the JSON-ish output and rule.
**Acceptance red line: J3 must PASS.** J1/J2/J4 are the deterministic CI/unit proxies for J3.

---

## J1 — staged `bin-uploader.cjs` loads from a dir with no `node_modules`

```bash
pnpm --filter @teamagent/digital-twin build
DT="$(node -p "require('path').resolve('packages/digital-twin/dist/bin-uploader.cjs')")"
TMP="$(mktemp -d)"   # no node_modules here
( cd "$TMP" && TEAMAGENT_UPLOADER_DRYRUN=1 node -e "require(process.argv[1]); console.log(JSON.stringify({j1:'PASS',loaded:true}))" "$DT" 2>&1 ) ; echo "exit=$?"
( cd "$TMP" && TEAMAGENT_UPLOADER_DRYRUN=1 node "$DT" ; echo "exit=$?  (expect 0 + 'dry-run OK')" )
( cd "$TMP" && node "$DT" ; echo "exit=$?  (expect 2 — config missing, soft exit)" )
rm -rf "$TMP"
```

PASS = no `MODULE_NOT_FOUND` / `Cannot find module`; dry-run exits 0; no-config run exits 2.
Verified 2026-05-12 (worktree): `LOADED OK`, `dry-run OK` exit 0, config-missing exit 2.

## J2 — built `bin-uploader.cjs` has no external `require("ulid")`

```bash
grep -nE "require\(['\"]ulid['\"]\)" packages/digital-twin/dist/bin-uploader.cjs && echo "j2:FAIL (ulid left external)" || echo "j2:PASS (ulid inlined)"
```

PASS = grep finds nothing. Locked at source by `packages/digital-twin/src/__tests__/build-config.test.ts`
(noExternal includes `ulid`) and at artifact by `uploader-bundle-contract.test.ts`. Verified 2026-05-12: PASS.

## J3 (RED LINE) — fresh `teamagent init` actually uploads a transcript

```bash
HOME_BAK="$HOME"; export HOME="$(mktemp -d)"   # clean $HOME, no ulid hack
pnpm --filter teamagent build
node packages/teamagent/dist/bin.js init        # registers Stop hook, stages bin-uploader.cjs
# ... fully restart Claude Code, run a short interactive `claude` session, end it (Stop fires), wait ~10s ...
UID="$(node -e "console.log(require('@teamagent/digital-twin').getUserId())")"
curl -fsS "http://<collector-host>:8080/api/dates?user=$UID"   # must return today's date (YYYY-MM-DD)
export HOME="$HOME_BAK"
```

PASS = `/api/dates?user=<uid>` returns today's date — i.e. the transcript reached the collector with **no manual `cp ulid` hack**. (Requires a reachable collector + a real `claude` session, so it's a manual gate, not CI.)
Pre-fix on the reporter's machine this returned empty / 404; the local `cp -r .../ulid ~/.teamagent/node_modules/ulid` workaround made it return `2026-05-12` — which is exactly the symptom this PR removes the need for.

## J4 — `teamagent doctor` reports `digital-twin-uploader: OK`, flips to `BROKEN` when broken

```bash
node packages/teamagent/dist/bin.js doctor 2>&1 | grep -i "digital-twin-uploader"
# expect: digital-twin-uploader: OK (dry-run 加载了所有 import)   [or 'skip / 未安装' if init wasn't run]
# then break it:
rm -f packages/digital-twin/dist/bin-uploader.cjs   # or stage a bin that throws
cp ~/.teamagent/digital-twin/bin-uploader.cjs ~/.teamagent/digital-twin/bin-uploader.cjs.bak 2>/dev/null
printf "require('definitely-not-a-module');\n" > ~/.teamagent/digital-twin/bin-uploader.cjs
node packages/teamagent/dist/bin.js doctor 2>&1 | grep -i "digital-twin-uploader"   # expect: BROKEN — MODULE_NOT_FOUND ...
mv ~/.teamagent/digital-twin/bin-uploader.cjs.bak ~/.teamagent/digital-twin/bin-uploader.cjs 2>/dev/null
```

PASS = healthy → `OK` (or `skip` when not initialised); deliberately-broken staged bin → `BROKEN — MODULE_NOT_FOUND …` with a `pnpm --filter @teamagent/digital-twin build && pnpm teamagent install-hook` fix hint. Unit-covered by `doctor.test.ts › checkDigitalTwinUploader (issue #368)` (OK / BROKEN / skip / log-note variants) — verified 2026-05-12.

---

## Unit/CI evidence (targeted vitest, verified 2026-05-12 in worktree)

- `packages/digital-twin/src/__tests__/build-config.test.ts` — 5 ✓ (tsup.config.ts entries + `noExternal: ['ulid']`)
- `packages/digital-twin/src/__tests__/uploader-bundle-contract.test.ts` — 2 ✓ (skipped unless `dist/` built; PASS when built)
- `packages/digital-twin/src/__tests__/bin-uploader.test.ts` — 2 ✓ (dry-run exit 0; no-config exit 2)
- `packages/digital-twin/src/daemon/__tests__/uploader-log.test.ts` — 5 ✓ (`readLastUploaderError`)
- `packages/digital-twin/src/__tests__/paths.test.ts` — 10 ✓ (incl. `uploaderLogFile`)
- `packages/digital-twin/src/hooks/__tests__/tap-session.test.ts` — 13 ✓ (incl. stdio→uploader.log fd)
- `packages/cli/src/__tests__/digital-twin-command.test.ts` — 23 ✓ (incl. status `uploader log:` + `last_error:`)
- `packages/cli/src/__tests__/doctor.test.ts` — 56 ✓ (incl. `checkDigitalTwinUploader` block)
- `pnpm --filter @teamagent/digital-twin typecheck` ✓ · `pnpm --filter @teamagent/cli typecheck` ✓
