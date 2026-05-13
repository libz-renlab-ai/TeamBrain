# Recording off-device (issue #310)

Body of issue #310 reads in one sentence:

> 不需要开电脑，随时开录

The literal asks: capture audio when the laptop is closed or out of reach.

## Today, in one CLI command

The `teamagent record import` subcommand already accepts arbitrary audio
files. There is no requirement that the recording was produced by
`teamagent record start` on the same machine — any audio file ffmpeg
can decode is valid input.

```bash
# 1. Record on phone (Voice Memos / Recorder app / call recorder),
#    or any external recorder. No laptop required.
# 2. AirDrop / cable / cloud-sync the file to your laptop.
# 3. On laptop:
teamagent record import ~/Downloads/voice-memo-2026-05-13.m4a --label client-call

# 4. Result: the audio is queued into the digital-twin pending/
#    directory under a fresh ULID, ready for downstream processing
#    (transcription, summary, archival) by the daemon you already run.
```

This is the **minimum-viable** "off-device record" path. It is what the
literal body of #310 asks for.

## Supported input formats

`teamagent record import` uses ffmpeg under the hood (see
`packages/digital-twin/src/ffmpeg-wrapper.ts`). Any container ffmpeg
can decode is accepted:

- `.m4a` (iOS Voice Memos default — common case)
- `.wav` (uncompressed PCM)
- `.mp3` (legacy audio)
- `.ogg` / `.opus` (open formats, default of `teamagent record start`)
- `.flac` (lossless)
- `.webm` (Chrome / Android browser recordings)

The CLI's `parseRecordArgs` (`packages/cli/src/commands/record.ts`)
delegates the actual decode + reencode to the digital-twin wrapper,
so adding new container formats does not require CLI changes — only
ffmpeg support.

## What this doc is NOT

This doc is **scoped to the import-from-elsewhere workflow** only. Three
adjacent capabilities the grill comment on #310 lists as desirable are
intentionally **out of scope** for this iteration:

1. **PWA / mobile-web one-click recorder.** The grill comment §21
   verdict (option C) calls for a Progressive Web App with one-tap
   record, background chunk upload, offline cache, and retry/resume.
   That requires a backend Audio Event API + transcription job + summary
   job + plugin dispatch — multi-week work that does not fit a single
   squash-merged PR. Tracked separately; will be filed as a child
   issue per `docs/TRIAGE-AND-SPLIT.md`.
2. **`teamagent record` → `teamagent audio` rename.** The grill §31
   verdict (and #296 verdict) renames the CLI namespace to
   `teamagent audio` with `record` as a deprecated alias. That
   cross-cuts the daemon, REST routes, and tests; deferred to a
   follow-up under the same parent (#296 / #310 / #297 audio-line
   triage).
3. **`/v1/audio-recordings` REST route + event-source plugins.**
   Backend API design + plugin dispatch (Recording Memory plugin,
   Project Evidence plugin, Daily Summary plugin, etc.) is a server-side
   architecture change separate from the CLI surface.

## Why this minimal scope

Two project rules made the larger grill expansion unsuitable for this PR:

- `docs/TRIAGE-AND-SPLIT.md`: when a grilled issue lists ≥2 independent
  expected outputs, it should be split into child issues before the
  driver runs. PWA + Audio Event API + rename qualify.
- This dev machine's user memory disables digital-twin auto-upload
  (`~/.teamagent/digital-twin.json enabled=false + read-only`). Any
  PR introducing a new audio upload path on this dev surface would
  bypass that toggle silently. The import flow shipped here does not
  add a new upload path — it reuses the existing `record import`
  pipeline the user has already configured (or not).

## Acceptance

The literal body — "不需要开电脑，随时开录" — is satisfied by:

- Audio captured on any external device (phone, recorder, browser).
- One CLI command on the laptop to import it: `teamagent record import <file>`.
- New `--help` line on the import subcommand makes this path
  discoverable without needing to read this doc first.

The grill's bigger ask (PWA, Audio Event API) is acknowledged in §"What this doc is NOT" with a pointer to the follow-up triage.
