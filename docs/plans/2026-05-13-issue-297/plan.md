# Plan: issue-297 — `teamagent record start` audio device defaults + escape hatch

## task description

Fix the Windows-vs-mac/Linux asymmetry in `teamagent record start` reported in
[#297](https://github.com/libz-renlab-ai/TeamBrain/issues/297): on Windows the
hardcoded default `audio=virtual-audio-capturer` records the speaker loopback
(not the user's voice) AND requires an external third-party DirectShow filter
that ships separately from `https://github.com/rdp/virtual-audio-capturer`.
macOS (`avfoundation :0`) and Linux (`pulse default`) already record from a
microphone source.

The grill comment (`docs/adr/0014/297.md`, §31 verdict
"三平台默认 mic；第一次确认设备；`--input` / `--device` / `audio devices`")
bundles the broader `record` → `audio` rename and event-source plugin model
across #296 / #297 / #310. **This PR is strictly scoped to #297** —
defaults + escape hatch + device discovery surface. The rename is tracked by
[#296](https://github.com/libz-renlab-ai/TeamBrain/issues/296); the event/plugin
model is tracked by [#310](https://github.com/libz-renlab-ai/TeamBrain/issues/310).

## expected outputs

1. **Windows default flips to a microphone-shaped device**:
   `resolvePlatformInput({ platform: 'win32' })` returns
   `{ format: 'dshow', device: 'audio=Microphone' }` instead of
   `audio=virtual-audio-capturer`. macOS / Linux defaults are unchanged.

2. **New `--device <name>` flag on `record start`**: `parseRecordArgs(['start',
   '--device', 'audio=Stereo Mix'])` produces `{ sub: 'start',
   device: 'audio=Stereo Mix' }`. Both `--device <v>` and `--device=<v>` forms
   accepted. The value plumbs through `executeRecordStart` →
   `ffmpegStart.input.deviceArg` →
   `resolvePlatformInput.deviceArg`, preserving the existing override channel.

3. **New `teamagent record devices` subcommand**: prints the platform-specific
   ffmpeg device list (via `ffmpeg -list_devices true -f dshow -i dummy` on
   Windows; `ffmpeg -f avfoundation -list_devices true -i ""` on macOS;
   `ffmpeg -f pulse -list_devices true -i dummy` on Linux). Exit 0 on success,
   exit 1 if ffmpeg is missing or the listing call fails. Output is verbatim
   ffmpeg stderr so users can grep for the exact `audio=...` string ffmpeg
   accepts.

4. **`record start` error path mentions `record devices`**: when ffmpeg errors
   (e.g. "Could not find audio device"), `executeRecordStart` printErr emits an
   additional line `hint: run \`teamagent record devices\` to list available
   audio devices, then pass --device <name>`. This addresses the issue's
   acceptance item 3 ("Improve error message when default device not found")
   without requiring stderr capture of the detached child process.

5. **All existing tests pass unchanged** except the Windows default assertion
   in `packages/digital-twin/src/recorder/__tests__/ffmpeg-wrapper.test.ts:58-62`,
   which already uses a permissive `/^audio=/` regex and stays green with the
   new default.

6. **New tests** (TDD: red → green → commit):
   - `parseRecordArgs` accepts `--device <name>` and `--device=<value>` for
     `start` subcommand, and `devices` as a subcommand
   - `resolvePlatformInput` returns `audio=Microphone` on win32 when no
     `deviceArg`
   - `executeRecordDevices` invokes the platform-correct ffmpeg argv via DI'd
     `spawnSync`, prints stderr, returns exit 0 on success / 1 on failure
   - `executeRecordStart` passes `parsed.device` through to
     `ffmpegStart.input.deviceArg`
   - `executeRecordStart` error path includes the `record devices` hint

## how to verify (3rd-party harness, JSON-judgeable)

Verification harness: `pnpm --filter @teamagent/cli test
record-command.test.ts && pnpm --filter @teamagent/digital-twin test
ffmpeg-wrapper.test.ts`. Both suites must exit 0. The Windows default
assertion at `ffmpeg-wrapper.test.ts:58-62` continues to pass under the new
default because the regex is permissive (`/^audio=/`).

Additional JSON-judgeable checks an LLM judge can grep without re-running the
code:

| Probe | Expected (substring in source) | File |
|---|---|---|
| Windows default literal | `'audio=Microphone'` | `packages/digital-twin/src/recorder/platform-input.ts` |
| `--device` flag in parseRecordArgs | `'--device'` | `packages/cli/src/commands/record.ts` |
| `devices` subcommand handler | `executeRecordDevices` | `packages/cli/src/commands/record.ts` |
| device-listing ffmpeg args (win32) | `'-list_devices', 'true'` AND `'-f', 'dshow'` | `packages/digital-twin/src/recorder/platform-input.ts` |
| start error hint mentions `record devices` | `record devices` substring in printErr branch | `packages/cli/src/commands/record.ts` |

## claudefast probes

(none — this PR is a pure CLI flag + default change; no canonical-help JSON
snapshot change is required because `teamagent record --help` is not currently
snapshot-tested per `snapshots/` directory contents. If `/review` requests
snapshot coverage, add one in the same PR.)

## explicit out-of-scope (deferred to other issues)

- Renaming `record` subcommand to `audio` → **#296**
- `--input mic|system|both` flag (system / both capture is non-trivial on
  win32+linux+darwin; needs its own grill cycle) → **#310** or follow-up #297
  child if grill verdict reopens
- First-run interactive device-confirmation UX with persisted
  `~/.teamagent/digital-twin/audio-default.json` cache → deferred; the
  `record devices` subcommand + `--device` flag give users a non-interactive
  escape hatch which is sufficient to close acceptance items 1-3 from #297's
  issue body
- Audio event source + plugin model (RecordingMemoryPlugin etc.) → **#310**
- API rename `/v1/recordings` → `/v1/audio-recordings` → **#296**

## driver session metadata

- session: `145f69e2`
- host: `LAPTOP-HJ1RMFRI`
- branch: `feat/issue-297`
- worktree: `D:\0jingtong\TeamBrain\.claude\worktrees\issue-297`
- driver: `/fixed-flow-driver` (Claude Code project skill)
- claim time: 2026-05-13T03:11:35Z
