```
  Feature #3 wedge — judge harness
  task → outputs → probe (raw JSON) → LLM-judge (read JSON only)

  fixture.mp4 ─► teamagent video upload ─► /v1/videos ─► share link
              ◄────── curl bytes back ──── /api/file?...
   shasum -a 256 fixture.mp4 round.mp4  →  evidence/<run-id>/*.json
                                           │
                                           ▼  LLM judge reads JSON only
                                           verdict: PASS / FAIL
```

# Feature #3 video-upload judge harness

Third-party verification path for the `video recording and uploading to
centralized data storage is easy to use` anchor in
[`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md). It is the
**only** harness that counts toward Feature 3's "shipped wedge" claim —
unit tests, `pnpm typecheck`, `/review` PASS do not substitute (per the
user-level `feedback_verification_only_judge_harness.md` rule). MAIN agent
dispatches four probes; each emits raw JSON to `evidence/<run-id>/`; an
LLM judge reads **only the JSON** and renders PASS/FAIL.

## 1. Task description

Confirm that on a fresh tmp dir, a real user can: (1) start the
digital-twin collector; (2) record a screen video (substituted by a
deterministic `ffmpeg` lavfi fixture for reproducibility); (3) run **one**
`teamagent video upload <file>` and receive a share link; (4) fetch the
bytes back via that link with SHA-256 equality and the correct
`Content-Type`. The OS-native record step (`screencapture -v` /
`ffmpeg x11grab` / `ffmpeg gdigrab`) is an upstream OS contract, **not**
under test — the wedge under test is upload + retrieve.

## 2. Expected outputs

For PASS the harness must produce all of the following artifacts:

| Artifact | Where | What it proves |
|----------|-------|----------------|
| `help.json` | `--help` parse | CLI surface lists `--endpoint`/`--label`/`--user-id`/`--json` and the four accepted containers. |
| `upload.json` | `video upload --json` stdout | HTTP 200, `id` + `link` + `payload_sha256` present. |
| `round-trip.json` | curl headers + SHA diff | `status=200`, `content_type=video/mp4`, `expected_sha==observed_sha`. |
| `mime.json` | curl `-I` per container | Each ext returns the canonical `video/<container>` (mov→`video/quicktime`, mkv→`video/x-matroska`). |
| `judge-input.json` | aggregator | One JSON pulling the four files together for the LLM judge. |

PASS thresholds (pinned): probe 1 — no MISS; probe 2 — `ok==true` and
`link` starts with endpoint host; probe 3 — `expected_sha==observed_sha`
and `status==200`; probe 4 — every row's `Content-Type` matches table
(case-insensitive).

## 3. How to evaluate (third-party judge harness)

MAIN agent dispatches the four probes as subagents (or `claudefast -p`
calls); each writes raw JSON to `$RUN_DIR` and exits non-zero on failure.
JSON is the ground truth.

### Setup (run once)

```bash
RUN_DIR="evidence/$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
mkdir -p "$RUN_DIR"
COLLECTOR_DIR="$(mktemp -d)/collector"
PORT=$((20000 + RANDOM % 1000))
( PORT=$PORT TEAMAGENT_COLLECTOR_DIR=$COLLECTOR_DIR \
    npx tsx packages/digital-twin/src/bin-prod-server.ts \
    > "$RUN_DIR/collector.log" 2>&1 ) &
COLLECTOR_PID=$!
sleep 2  # give the listener a moment
ENDPOINT="http://127.0.0.1:$PORT"
trap 'kill $COLLECTOR_PID 2>/dev/null' EXIT
```

### Probe 1 — CLI surface (subagent or `claudefast -p`)

```bash
HELP="$(npx tsx packages/cli/src/bin.ts video --help 2>/dev/null)"
jq -n --arg help "$HELP" '{
  probe: "help",
  required_substrings: [
    "teamagent video upload",
    "--endpoint",
    "--label",
    "--user-id",
    "--json",
    "mov",
    "mp4",
    "webm",
    "mkv"
  ],
  observed: $help,
  misses: [
    "teamagent video upload","--endpoint","--label","--user-id","--json",
    "mov","mp4","webm","mkv"
  ] - ([
    "teamagent video upload","--endpoint","--label","--user-id","--json",
    "mov","mp4","webm","mkv"
  ] | map(select(. as $s | $help | contains($s))))
}' > "$RUN_DIR/help.json"
```

### Probe 2 + 3 — upload + round-trip equality

```bash
FIXTURE="$RUN_DIR/fixture.mp4"
ffmpeg -y -loglevel error -f lavfi -i color=c=blue:s=160x120:r=2 -t 1 \
       -c:v libx264 -pix_fmt yuv420p "$FIXTURE"
EXPECTED_SHA="$(shasum -a 256 "$FIXTURE" | awk '{print $1}')"

npx tsx packages/cli/src/bin.ts video upload "$FIXTURE" \
    --endpoint="$ENDPOINT" --user-id=judge --label=feature3-harness --json \
    2>/dev/null > "$RUN_DIR/upload.json"

LINK="$(grep -o '"link": *"[^"]*"' "$RUN_DIR/upload.json" \
       | head -1 | sed 's/.*"link": *"\([^"]*\)".*/\1/')"
ROUND="$RUN_DIR/round.mp4"
HEADERS=$(curl -sS -D - -o "$ROUND" -w "%{http_code}\t%{content_type}\n" "$LINK")
STATUS="$(printf '%s' "$HEADERS" | tail -1 | cut -f1)"
CTYPE="$(printf '%s'  "$HEADERS" | tail -1 | cut -f2)"
OBSERVED_SHA="$(shasum -a 256 "$ROUND" | awk '{print $1}')"

jq -n --arg status "$STATUS" --arg ctype "$CTYPE" \
      --arg exp "$EXPECTED_SHA" --arg obs "$OBSERVED_SHA" '{
  probe: "round-trip",
  link: env.LINK,
  status: ($status|tonumber),
  content_type: $ctype,
  expected_sha: $exp,
  observed_sha: $obs,
  match: ($exp == $obs)
}' > "$RUN_DIR/round-trip.json"
```

### Probe 4 — MIME correctness across containers

```bash
declare -A EXPECT=( [mov]="video/quicktime" [mp4]="video/mp4" \
                    [webm]="video/webm" [mkv]="video/x-matroska" )
declare -a ROWS=()
for ext in mov mp4 webm mkv; do
  FX="$RUN_DIR/sample.$ext"
  ffmpeg -y -loglevel error -f lavfi -i color=c=red:s=64x48:r=2 -t 1 \
         -c:v libx264 -pix_fmt yuv420p "$FX"
  OUT="$(npx tsx packages/cli/src/bin.ts video upload "$FX" \
        --endpoint="$ENDPOINT" --user-id=judge --json 2>/dev/null)"
  L="$(printf '%s' "$OUT" | grep -o '"link": *"[^"]*"' \
       | head -1 | sed 's/.*"link": *"\([^"]*\)".*/\1/')"
  CT="$(curl -sSI "$L" | awk 'tolower($1)=="content-type:"{print $2}' | tr -d '\r')"
  ROWS+=( "{\"ext\":\"$ext\",\"expected\":\"${EXPECT[$ext]}\",\"observed\":\"$CT\"}" )
done
printf '{"probe":"mime","rows":[%s]}\n' "$(IFS=,; echo "${ROWS[*]}")" \
  > "$RUN_DIR/mime.json"
```

### Aggregate + LLM judge

```bash
jq -s '{
  help:        .[0],
  upload:      .[1],
  round_trip:  .[2],
  mime:        .[3]
}' "$RUN_DIR/help.json" "$RUN_DIR/upload.json" \
   "$RUN_DIR/round-trip.json" "$RUN_DIR/mime.json" \
  > "$RUN_DIR/judge-input.json"
```

Then dispatch the LLM judge with **only** `judge-input.json` and the
following pinned prompt (paste verbatim — do NOT let the judge re-run the
probes, do NOT show it the source code):

```text
You are a deterministic verdict generator for Feature #3 of TeamBrain.
Read the JSON below. Respond with EXACTLY one line:
  VERDICT: PASS    — iff all four conditions hold:
                       help.misses == []
                       upload.ok == true AND upload.link starts with "http"
                       round_trip.match == true AND round_trip.status == 200
                       every row in mime.rows has expected == observed
  VERDICT: FAIL  <reason>  — otherwise, with one short reason per failed condition.

You may NOT consult any source code, run any probe, or guess values that
are not in the JSON. The JSON is the ground truth.
```

A judge that returns PASS without all four conditions in the JSON itself
is fabricating a result — the property the harness exists to prevent.

## See also

- [`docs/features/video-record-upload.md`](../../features/video-record-upload.md) — user-facing playbook
- [`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) — Feature 3 canonical anchor
- [`docs/verify/BUSINESS-FEATURE-HARNESS-MAP.md`](../../verify/BUSINESS-FEATURE-HARNESS-MAP.md) — cross-feature harness map
- [`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md) — `plan.md` three-section rule
