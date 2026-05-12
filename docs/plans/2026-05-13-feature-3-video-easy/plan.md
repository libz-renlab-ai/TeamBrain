```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Plan — Feature #3 wedge (video record + upload easy to use)     │
  │  task → outputs → how-to-eval via judge.md (third-party harness) │
  └──────────────────────────────────────────────────────────────────┘
```

# Plan — Feature 3 wedge

Per [`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md), every
plan must have three sections: **task description**, **expected outputs**,
**how-to-eval-from-3rd-party-harness**. This file is that plan; the §3
harness lives in [`judge.md`](judge.md).

## 1. Task description

Make Feature #3 — *video recording and uploading to centralized data
storage is easy to use* — convincing to a real user. "Convincing" means
ONE command produces a shareable centralized link the recipient can
actually fetch back. Out of scope: the OS-native screen-record step
(macOS `screencapture -v` / Linux `ffmpeg x11grab` / Windows
`ffmpeg gdigrab`) — that stays on the platform. In scope: the upload step
that was missing, and the docs / harness that lets a third party verify
it.

Do NOT:
- transcode video in the CLI (the user already has a file);
- add a queue/daemon retry path in this PR (that is the explicit next-step
  Vision upgrade in `docs/features/video-record-upload.md` §Roadmap);
- change the canned-answer anchor sentence in `docs/BUSINESS-FEATURES.md`
  (the 6-substring grep contract stays intact).

## 2. Expected outputs (acceptance deliverables)

| Deliverable | Path | Status |
|-------------|------|--------|
| CLI: `teamagent video upload <file> [--endpoint --label --user-id --json]` | `packages/cli/src/commands/video.ts` + `packages/cli/src/bin.ts` wiring | shipped (commit `9bb25445`) |
| Collector endpoint `POST /v1/videos` + video-MIME GET on `/api/file` | `packages/digital-twin/src/mock-server.ts` | shipped (commit `5880cc18`) |
| User-facing playbook | `docs/features/video-record-upload.md` | shipped (commit `8d7045b9`) |
| `BUSINESS-FEATURES.md` Feature 3 row + expansion + Honesty note refreshed | `docs/BUSINESS-FEATURES.md` | shipped (commit `8d7045b9`) |
| `BUSINESS-FEATURE-HARNESS-MAP.md` Feature 3 row refreshed | `docs/verify/BUSINESS-FEATURE-HARNESS-MAP.md` | shipped (commit `8d7045b9`) |
| Third-party judge harness playbook (this plan's §3) | [`judge.md`](judge.md) | shipped |

Behavioral acceptance (must all hold on `main` after merge):

- `pnpm teamagent video --help` lists all four flags and the four accepted
  containers.
- `pnpm teamagent video upload <fixture.mp4> --endpoint=http://127.0.0.1:N --json`
  returns HTTP 200 with `id`, `link`, `payload_sha256`.
- `curl <link>` returns 200 with `Content-Type: video/mp4` and bytes whose
  SHA-256 equals the input fixture's SHA-256.
- The canonical 6-substring grep contract in `docs/BUSINESS-FEATURES.md`
  still passes (all six tokens present).

## 3. How to evaluate (third-party harness)

See [`judge.md`](judge.md) in this directory. The harness dispatches four
probes (help / upload / round-trip SHA-256 equality / MIME correctness),
dumps raw JSON to `evidence/<run-id>/`, and lets an LLM judge that reads
only the JSON render PASS/FAIL. Pinned PASS thresholds are stated inline
in §2 of `judge.md`.

The harness deliberately excludes anything an LLM could fabricate:
- byte-level SHA-256 equality is deterministic;
- HTTP status code + Content-Type header are server-observable;
- MIME assertions are a fixed table, not a free-form judgement.

A PASS verdict that lacks one of the four probe JSON files in
`evidence/<run-id>/` is by definition a fabrication.

## 4. Wild-world visual proof (run `20260513-feature3-wild-020505`)

Evidence: [`evidence/20260513-feature3-wild-020505/`](evidence/20260513-feature3-wild-020505/).

A live tmux session was orchestrated with three panes — collector / upload
CLI / recipient curl — and the entire happy path executed end-to-end on
real macOS:

| Artifact | What it proves | File |
|----------|----------------|------|
| `pane-{0,1,2}.txt` | Real tmux session text snapshot of each pane | `evidence/<run>/pane-*.txt` |
| `screen-1600.png` | `screencapture -x` of the desktop showing the tmux panes | `evidence/<run>/screen-1600.png` |
| `upload.json` | CLI returned HTTP 200 + share link for `demo-clip.mp4` | `evidence/<run>/upload.json` |
| `dogfood-upload.json` | We re-uploaded our own `screencapture -V 3` recording (`screen.mov`, 1.35 MB) through the same CLI | `evidence/<run>/dogfood-upload.json` |
| `recipient-headers.txt` | Recipient `curl -D` shows status 200 + correct `Content-Type` | `evidence/<run>/recipient-headers.txt` |
| `manifest.json` | Aggregator with byte-equality verdict for both round-trips | `evidence/<run>/manifest.json` |
| `proof.html` | Self-contained boss-UI report (inline CSS + base64 PNG) — `open` in Chrome | `evidence/<run>/proof.html` |
| `chrome-proof-1600.png` | Second screencap showing the proof.html rendered live in Chrome on the same desktop | `evidence/<run>/chrome-proof-1600.png` |

The dogfood step is the strongest social proof: the CLI shipping Feature 3
was used to publish a recording of its own demo session, and the bytes
round-trip with SHA `86406a82f221f921292865ebaa02f4d87f663a5567f33e8aacb7af65d3388b5e`
intact.

## See also

- [`judge.md`](judge.md) — third-party verification playbook
- [`docs/features/video-record-upload.md`](../../features/video-record-upload.md) — user-facing playbook
- [`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) — Feature 3 canonical anchor
- [`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md) — three-section plan rule
