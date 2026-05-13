```
  ┌────────────────────────────────────────────────────────────────────┐
  │   FEATURE #3 — video recording + centralized storage easy to use   │
  ├────────────────────────────────────────────────────────────────────┤
  │                                                                    │
  │     local recording                  upload step                   │
  │     ───────────────                  ───────────                   │
  │                                                                    │
  │     macOS: screencapture ─────┐                                    │
  │     Linux: ffmpeg x11grab ────┼──► teamagent video upload <file>   │
  │     Win:   ffmpeg gdigrab ────┘                ▼                   │
  │                                       POST /v1/videos              │
  │                                                ▼                   │
  │                                       digital-twin collector       │
  │                                                ▼                   │
  │                                       returns share link:          │
  │                                       /api/file?user=...&id=...    │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
```

# Feature #3 — Video record + upload to centralized storage

This is the playbook backing the **`video recording and uploading to
centralized data storage is easy to use`** half of the canned-answer
contract in [`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md). When a
real user asks "show me", this file is the single doc that should convince
them in under two minutes.

> Honesty note: TeamBrain ships the **upload + centralized-storage + share
> link** part. Local screen recording stays on the OS-native tool because
> every machine already has one. The wedge is the upload step — that is
> what kept Feature 3 from being convincing before.

## TL;DR — what a real user runs

```bash
# 1. Start the local collector (in a separate terminal — long-running).
pnpm teamagent digital-twin status   # quick sanity-check
PORT=8787 npx tsx packages/digital-twin/src/bin-prod-server.ts

# 2. Capture screen video with the OS-native recorder.
#    macOS:
screencapture -v ~/demo.mov           # records screen+mic until you Ctrl+C

# 3. Upload to centralized storage and get a shareable link.
pnpm teamagent video upload ~/demo.mov --label "feature-3 demo"
# →  Uploaded demo.mov (12345 bytes, mov)
#      id:   01HF...
#      link: http://127.0.0.1:8787/api/file?user=local-dev&date=2026-05-13&id=...&ext=mov

# 4. Share the link. Anyone with network reach to the collector can fetch
#    the bytes back with content-type video/quicktime.
curl -I "<paste link>"                # 200 OK, Content-Type: video/quicktime
```

Three commands total. No transcoding step, no S3 bucket setup, no upload
ID to copy around — the link is the only thing the user needs to remember.

## CLI surface

```text
teamagent video upload <file> [--endpoint <url>] [--label <l>] [--user-id <id>] [--json]
```

| Flag | Default | What it does |
|------|---------|--------------|
| `--endpoint <url>` | `$TEAMAGENT_VIDEO_ENDPOINT` or `http://127.0.0.1:8787` | Where to POST `/v1/videos`. Production collectors set the env var once. |
| `--label <text>`   | (none) | Free-form tag preserved in the upload envelope. Surfaced in collector logs. |
| `--user-id <id>`   | `local-dev` | Path component under the collector's `outputDir/<user_id>/<date>/`. |
| `--json` | off | Emit a single JSON line with `id`, `link`, `payload_sha256`, etc. (probe-friendly) |

Accepted containers (case-insensitive extension): `mov`, `mp4`, `webm`, `mkv`.
Anything else exits 2 with a one-line error.

Source: [`packages/cli/src/commands/video.ts`](../../packages/cli/src/commands/video.ts).
The CLI is a single-shot HTTP POST; failures print the HTTP status + body
verbatim, no retry/backoff (that's the next-step upgrade, see "Roadmap"
below).

## Centralized storage path

The collector is the same `digital-twin` HTTP server that already accepts
`/v1/cc-sessions` (transcript JSONL) and `/v1/recordings` (Opus/OGG audio).
Feature 3 adds `/v1/videos`. All three write to the same on-disk layout:

```text
<TEAMAGENT_COLLECTOR_DIR>/
  <user_id>/
    <YYYY-MM-DD>/
      <id>.mov          # video upload via /v1/videos
      <id>.ogg          # audio upload via /v1/recordings
      <id>.jsonl        # transcript upload via /v1/cc-sessions
```

The collector's GET endpoint at `/api/file?user=…&date=…&id=…&ext=…` reads
the bytes back with the correct `Content-Type`:

| ext   | Content-Type        |
|-------|---------------------|
| jsonl | text/plain          |
| ogg   | audio/ogg           |
| mov   | video/quicktime     |
| mp4   | video/mp4           |
| webm  | video/webm          |
| mkv   | video/x-matroska    |

In production the same handler can sit behind a CDN / S3 proxy without code
changes; the link format is stable.

Source: [`packages/digital-twin/src/mock-server.ts`](../../packages/digital-twin/src/mock-server.ts).

### Size limits

Capped by `MAX_BODY_BYTES = 32 MB` (raw HTTP body, shared with `/v1/cc-sessions`
and `/v1/recordings`) — effective ceiling ~24 MB of decoded video after base64.
30-second `screencapture -v` clips at default settings fit easily; longer
clips should be transcoded with `ffmpeg -crf 28 -preset slow` first or moved
to the queue path on the Roadmap. The dashboard's `listSessions` regex still
matches `jsonl`/`ogg` only, so videos round-trip via the returned link but
don't appear in catch-all listings yet (follow-up listed below).

## OS-native recording one-liners

The `teamagent` CLI does **not** spawn the recorder. Native tools are
faster to install, more reliable, and respect platform-specific permission
prompts. Pick the line for your OS, record, then `teamagent video upload`.

### macOS — `screencapture -v` (built-in)

```bash
# Record screen + mic, write to ~/demo.mov. Ctrl+C to stop.
screencapture -v ~/demo.mov

# Or, fixed-length 10s clip via QuickTime:
#   1. ⌘+Shift+5  → "Record Entire Screen" → "Record"
#   2. Stop button in menu bar
```

### Linux — ffmpeg + x11grab

```bash
# 30-second clip of the primary display + default ALSA mic.
ffmpeg -y -f x11grab -framerate 30 -i :0.0 \
       -f alsa -i default \
       -t 30 -c:v libx264 -preset veryfast -pix_fmt yuv420p \
       ~/demo.mp4
```

### Windows — ffmpeg + gdigrab

```bat
:: 30-second clip of the desktop + default Microphone.
ffmpeg -y -f gdigrab -framerate 30 -i desktop ^
       -f dshow -i audio="Microphone" ^
       -t 30 -c:v libx264 -preset veryfast -pix_fmt yuv420p ^
       %USERPROFILE%\demo.mp4
```

## Third-party verification (judge harness)

This feature is verifiable end-to-end without trusting any internal claim.
The judge harness playbook lives at
[`docs/plans/2026-05-13-feature-3-video-easy/judge.md`](../plans/2026-05-13-feature-3-video-easy/judge.md).
It runs three deterministic probes:

1. **CLI surface** — `teamagent video --help` contains the accepted-containers
   list and the documented `--endpoint` / `--label` / `--user-id` / `--json`
   flags.
2. **Round-trip byte equality** — generate a fixture mp4 with `ffmpeg`,
   `teamagent video upload --json`, fetch the returned `link` with curl,
   compare SHA-256 of the bytes. PASS iff hashes match.
3. **MIME correctness** — the `Content-Type` response header equals
   `video/<container>` for each accepted container.

Probes emit raw JSON to `evidence/<run-id>/`; the verdict is produced by a
separate LLM that only reads the JSON, so a model running the upload cannot
fabricate a pass.

## Roadmap (honest)

| Step | Status | Where |
|------|--------|-------|
| Single-shot upload + path-link round-trip | **shipped** | `packages/cli/src/commands/video.ts` |
| OS-native recording one-liners | **doc-level** | this file |
| Queue/daemon retry + backoff | **next** | extend `LoadedEntryMetadata` with `video-recording` kind |
| `listSessions` regex covers video extensions (dashboard listing) | **next** | `packages/digital-twin/src/mock-server.ts:197` |
| Per-recipient ACL / signed share links | **future** | spec only |
| Browser-side recorder (no native tool) | **future** | spec only |

Each "next" item is one follow-up PR — schemas + dispatch for the queue
upgrade, regex widening + tests for the dashboard listing.

## See also

- [`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) — Feature #3 row + 6-substring grep contract
- [`docs/verify/BUSINESS-FEATURE-HARNESS-MAP.md`](../verify/BUSINESS-FEATURE-HARNESS-MAP.md) — cross-reference table
- [`docs/features/team-share.md`](team-share.md) — sibling feature: transcript-level capture and sync
- [`docs/design-system/video-storyboard.md`](../design-system/video-storyboard.md) — the 90-second product video this feature pairs with
