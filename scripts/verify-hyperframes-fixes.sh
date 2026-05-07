#!/usr/bin/env bash
# =============================================================================
#  verify-hyperframes-fixes.sh
#  One-shot verification for two HyperFrames fixes:
#    1. Kokoro TTS  — narration.wav replaced by Kokoro pipeline
#    2. index.html  — composition_file_too_large warning eliminated
#
#  Usage:
#    bash scripts/verify-hyperframes-fixes.sh           # skip render (fast)
#    RENDER=1 bash scripts/verify-hyperframes-fixes.sh  # include render (slow)
#
#  Exit 0 = all checks PASS, exit 1 = one or more FAILs
# =============================================================================

set -uo pipefail

# ---------------------------------------------------------------------------
# Locate repo root (script may be invoked from any CWD)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HF_DIR="$REPO_ROOT/docs/hyperframes/teamagent-hook"
RENDER="${RENDER:-0}"

FAILS=0
SECTION_RESULTS=()   # "PASS: ..." or "FAIL: ..."

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() { echo "  [PASS] $*"; }
fail() { echo "  [FAIL] $*"; FAILS=$((FAILS + 1)); }
warn() { echo "  [WARN] $*"; }
section() { echo; echo "===== Section $1: $2 ====="; }
record_section() {
  local id="$1" label="$2" result="$3"
  if [ "$result" = "PASS" ]; then
    SECTION_RESULTS+=("  [PASS] $id $label")
  else
    SECTION_RESULTS+=("  [FAIL] $id $label")
  fi
}

# ---------------------------------------------------------------------------
# Section 1: Prerequisites
# ---------------------------------------------------------------------------
section 1 "Environment prerequisites"

S1_FAILS=0

if which ffprobe > /dev/null 2>&1; then
  pass "ffprobe found: $(which ffprobe)"
  echo "       ffprobe version: $(ffprobe -version 2>&1 | head -1)"
else
  fail "ffprobe not found — install ffmpeg"
  S1_FAILS=$((S1_FAILS + 1))
fi

if which node > /dev/null 2>&1; then
  pass "node found: $(node --version)"
else
  fail "node not found"
  S1_FAILS=$((S1_FAILS + 1))
fi

if which npm > /dev/null 2>&1; then
  pass "npm found: $(npm --version)"
else
  fail "npm not found"
  S1_FAILS=$((S1_FAILS + 1))
fi

if [ "$S1_FAILS" -gt 0 ]; then
  FAILS=$((FAILS + S1_FAILS))
  record_section "1" "Environment prerequisites" "FAIL"
else
  record_section "1" "Environment prerequisites" "PASS"
fi

# ---------------------------------------------------------------------------
# Section 2: Kokoro TTS validation
# ---------------------------------------------------------------------------
section 2 "Kokoro TTS — narration.wav"

S2_FAILS=0
WAV="$HF_DIR/assets/narration.wav"
BAK="$HF_DIR/assets/narration.say.wav.bak"

# 2a: file exists
if [ -f "$WAV" ]; then
  pass "narration.wav exists"
else
  fail "narration.wav MISSING at $WAV"
  S2_FAILS=$((S2_FAILS + 1))
fi

# 2b: ffprobe metrics (only if file exists and ffprobe available)
if [ -f "$WAV" ] && which ffprobe > /dev/null 2>&1; then
  PROBE_OUT="$(ffprobe -hide_banner -show_streams -show_format "$WAV" 2>&1)"

  # Sample rate
  SAMPLE_RATE="$(echo "$PROBE_OUT" | grep -E '^sample_rate=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [ -n "$SAMPLE_RATE" ]; then
    pass "Sample rate: ${SAMPLE_RATE} Hz"
  else
    warn "Could not parse sample rate"
  fi

  # Channels
  CHANNELS="$(echo "$PROBE_OUT" | grep -E '^channels=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [ -n "$CHANNELS" ]; then
    pass "Channels: $CHANNELS"
  else
    warn "Could not parse channels"
  fi

  # Duration (must be 14-22s)
  DURATION_RAW="$(echo "$PROBE_OUT" | grep -E '^duration=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [ -n "$DURATION_RAW" ] && [ "$DURATION_RAW" != "N/A" ]; then
    DURATION_INT="$(printf '%.0f' "$DURATION_RAW" 2>/dev/null || echo 0)"
    pass "Duration: ${DURATION_RAW}s (≈${DURATION_INT}s)"
    if [ "$DURATION_INT" -ge 14 ] && [ "$DURATION_INT" -le 22 ]; then
      pass "Duration in expected range [14-22s]"
    else
      fail "Duration ${DURATION_INT}s outside expected range [14-22s]"
      S2_FAILS=$((S2_FAILS + 1))
    fi
  else
    fail "Could not parse duration from ffprobe output"
    S2_FAILS=$((S2_FAILS + 1))
  fi

  # Codec
  CODEC="$(echo "$PROBE_OUT" | grep -E '^codec_name=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [ -n "$CODEC" ]; then
    pass "Codec: $CODEC"
  fi

  # Encoder metadata — distinguish Kokoro (Lavf encoder) vs macOS say (no Lavf)
  ENCODER_TAG="$(echo "$PROBE_OUT" | grep -iE 'TAG:encoder' | head -1)"
  if echo "$ENCODER_TAG" | grep -qi "Lavf"; then
    pass "Encoder tag: '$ENCODER_TAG' — looks like Kokoro/ffmpeg pipeline"
    WAV_SOURCE="Kokoro (Lavf encoder present)"
  elif [ -n "$ENCODER_TAG" ]; then
    warn "Encoder tag: '$ENCODER_TAG' — unusual, verify manually"
    WAV_SOURCE="Unknown encoder"
  else
    warn "No encoder tag found — may be macOS say output or untagged Kokoro; verify manually"
    WAV_SOURCE="Unknown (no encoder tag)"
  fi
  echo "       Source assessment: $WAV_SOURCE"
fi

# 2c: backup file
if [ -f "$BAK" ]; then
  pass "Backup found: narration.say.wav.bak — confirms Kokoro agent replaced the file"
else
  warn "No backup narration.say.wav.bak found — Kokoro agent may not have run yet, or backed up differently"
fi

if [ "$S2_FAILS" -gt 0 ]; then
  FAILS=$((FAILS + S2_FAILS))
  record_section "2" "Kokoro TTS — narration.wav" "FAIL"
else
  record_section "2" "Kokoro TTS — narration.wav" "PASS"
fi

# ---------------------------------------------------------------------------
# Section 3: index.html split — composition_file_too_large
# ---------------------------------------------------------------------------
section 3 "index.html split — composition_file_too_large warning"

S3_FAILS=0
INDEX_HTML="$HF_DIR/index.html"

# 3a: file stats
if [ -f "$INDEX_HTML" ]; then
  LINE_COUNT="$(wc -l < "$INDEX_HTML" | tr -d '[:space:]')"
  BYTE_COUNT="$(wc -c < "$INDEX_HTML" | tr -d '[:space:]')"
  pass "index.html exists: $LINE_COUNT lines, $BYTE_COUNT bytes"
else
  fail "index.html MISSING at $INDEX_HTML"
  S3_FAILS=$((S3_FAILS + 1))
fi

# 3b: list new split directories (only report, not fail if absent — they may not exist yet)
echo "  Checking for split sub-composition directories:"
for SUBDIR in styles scripts "compositions/components" compositions; do
  FULL="$HF_DIR/$SUBDIR"
  if [ -d "$FULL" ]; then
    FILE_COUNT="$(find "$FULL" -maxdepth 2 -type f | wc -l | tr -d '[:space:]')"
    pass "Found $SUBDIR/ ($FILE_COUNT files)"
    find "$FULL" -maxdepth 2 -type f | sed 's|'"$HF_DIR/"'||' | while IFS= read -r f; do
      echo "         $f"
    done
  else
    warn "$SUBDIR/ does not exist (will exist after index.html fix is applied)"
  fi
done

# 3c: run lint and check for composition_file_too_large
echo
echo "  Running: npx --yes hyperframes@0.4.45 lint (in $HF_DIR)"
LINT_OUT="$(cd "$HF_DIR" && npx --yes hyperframes@0.4.45 lint 2>&1)"
LINT_EXIT=$?
echo "$LINT_OUT" | sed 's/^/  | /'

if echo "$LINT_OUT" | grep -q "composition_file_too_large"; then
  fail "composition_file_too_large warning still present in lint output"
  S3_FAILS=$((S3_FAILS + 1))
else
  if [ $LINT_EXIT -eq 0 ]; then
    pass "composition_file_too_large NOT found in lint output — warning eliminated"
  else
    # Lint exited non-zero but warning not present; could be a different error
    warn "Lint exited $LINT_EXIT but composition_file_too_large not found — check lint output above"
  fi
fi

# Check if there are non-zero errors in lint (match "N error(s)" where N > 0)
ERR_COUNT="$(echo "$LINT_OUT" | grep -oE '[0-9]+ error' | grep -v '^0 error' | head -1)"
if [ -n "$ERR_COUNT" ]; then
  warn "Lint reports: $ERR_COUNT(s) — check output above"
fi

if [ "$S3_FAILS" -gt 0 ]; then
  FAILS=$((FAILS + S3_FAILS))
  record_section "3" "index.html split — lint warning" "FAIL"
else
  record_section "3" "index.html split — lint warning" "PASS"
fi

# ---------------------------------------------------------------------------
# Section 4: Render regression (only if RENDER=1)
# ---------------------------------------------------------------------------
section 4 "Render regression"

S4_FAILS=0

if [ "${RENDER:-0}" != "1" ]; then
  echo "  [SKIP] Render skipped (set RENDER=1 to enable)"
  echo "         Command that would run:"
  echo "           cd $HF_DIR && timeout 600 npx --yes hyperframes@0.4.45 render -o out/teamagent-hook.verify.mp4"
  record_section "4" "Render regression" "SKIP"
else
  # 4a: npm run check (lint + validate + inspect)
  echo "  Running: npm run check (in $HF_DIR)"
  CHECK_OUT="$(cd "$HF_DIR" && npm run check 2>&1)"
  CHECK_EXIT=$?
  echo "$CHECK_OUT" | sed 's/^/  | /' | head -40
  if [ $CHECK_EXIT -eq 0 ]; then
    pass "npm run check passed"
  else
    fail "npm run check failed (exit $CHECK_EXIT)"
    S4_FAILS=$((S4_FAILS + 1))
  fi

  # 4b: render
  VERIFY_MP4="$HF_DIR/out/teamagent-hook.verify.mp4"
  echo "  Running: hyperframes render -o out/teamagent-hook.verify.mp4 (timeout 600s)"
  if timeout 600 sh -c "cd '$HF_DIR' && npx --yes hyperframes@0.4.45 render -o out/teamagent-hook.verify.mp4" 2>&1 | sed 's/^/  | /'; then
    if [ -f "$VERIFY_MP4" ]; then
      pass "Render produced: $VERIFY_MP4"
    else
      fail "Render exited 0 but output file missing: $VERIFY_MP4"
      S4_FAILS=$((S4_FAILS + 1))
    fi
  else
    fail "Render command failed or timed out"
    S4_FAILS=$((S4_FAILS + 1))
  fi

  # 4c: ffprobe on verify mp4
  if [ -f "$VERIFY_MP4" ] && which ffprobe > /dev/null 2>&1; then
    echo "  ffprobe on verify output:"
    VPROBE="$(ffprobe -hide_banner "$VERIFY_MP4" 2>&1)"
    echo "$VPROBE" | sed 's/^/  | /'

    # Width/height
    if echo "$VPROBE" | grep -qE "1080x1920|1920x1080"; then
      pass "Resolution looks correct (1080x1920)"
    else
      RES="$(echo "$VPROBE" | grep -oE '[0-9]{3,4}x[0-9]{3,4}' | head -1)"
      fail "Expected 1080x1920, got: ${RES:-unknown}"
      S4_FAILS=$((S4_FAILS + 1))
    fi

    # FPS — look for "30 fps" or "30/1 tbr"
    if echo "$VPROBE" | grep -qE "30 fps|30\.00 fps|30/1 tbr"; then
      pass "Frame rate: 30fps"
    else
      FPS="$(echo "$VPROBE" | grep -oE '[0-9]+\.?[0-9]* fps' | head -1)"
      warn "Frame rate may not be 30fps: ${FPS:-unknown}"
    fi

    # Duration in range
    VDUR="$(echo "$VPROBE" | grep -oE 'Duration: [0-9:\.]+' | head -1 | sed 's/Duration: //')"
    if [ -n "$VDUR" ]; then
      pass "Video duration: $VDUR"
      # Convert HH:MM:SS.ms to seconds for range check
      VDUR_S="$(echo "$VDUR" | awk -F: '{ printf "%.0f", ($1*3600)+($2*60)+$3 }')"
      if [ "$VDUR_S" -ge 14 ] && [ "$VDUR_S" -le 22 ]; then
        pass "Video duration ${VDUR_S}s in range [14-22s]"
      else
        fail "Video duration ${VDUR_S}s outside expected range [14-22s]"
        S4_FAILS=$((S4_FAILS + 1))
      fi
    fi
  fi

  # 4d: compare with existing out/teamagent-hook.mp4
  OLD_MP4="$HF_DIR/out/teamagent-hook.mp4"
  if [ -f "$OLD_MP4" ] && [ -f "$VERIFY_MP4" ] && which ffprobe > /dev/null 2>&1; then
    echo "  Comparing with reference: $OLD_MP4"
    OLD_RES="$(ffprobe -hide_banner "$OLD_MP4" 2>&1 | grep -oE '[0-9]{3,4}x[0-9]{3,4}' | head -1)"
    NEW_RES="$(ffprobe -hide_banner "$VERIFY_MP4" 2>&1 | grep -oE '[0-9]{3,4}x[0-9]{3,4}' | head -1)"
    if [ "$OLD_RES" = "$NEW_RES" ]; then
      pass "Resolution matches reference ($OLD_RES)"
    else
      fail "Resolution mismatch: ref=$OLD_RES new=$NEW_RES"
      S4_FAILS=$((S4_FAILS + 1))
    fi
    OLD_DUR="$(ffprobe -hide_banner -show_format "$OLD_MP4" 2>&1 | grep '^duration=' | cut -d= -f2 | tr -d '[:space:]')"
    NEW_DUR="$(ffprobe -hide_banner -show_format "$VERIFY_MP4" 2>&1 | grep '^duration=' | cut -d= -f2 | tr -d '[:space:]')"
    OLD_DUR_I="$(printf '%.0f' "${OLD_DUR:-0}" 2>/dev/null || echo 0)"
    NEW_DUR_I="$(printf '%.0f' "${NEW_DUR:-0}" 2>/dev/null || echo 0)"
    DIFF=$(( NEW_DUR_I - OLD_DUR_I ))
    if [ "${DIFF#-}" -le 2 ]; then
      pass "Duration within 2s of reference (ref=${OLD_DUR_I}s new=${NEW_DUR_I}s)"
    else
      warn "Duration differs by ${DIFF}s vs reference (ref=${OLD_DUR_I}s new=${NEW_DUR_I}s)"
    fi
  fi

  if [ "$S4_FAILS" -gt 0 ]; then
    FAILS=$((FAILS + S4_FAILS))
    record_section "4" "Render regression" "FAIL"
  else
    record_section "4" "Render regression" "PASS"
  fi
fi

# ---------------------------------------------------------------------------
# Section 5: Summary
# ---------------------------------------------------------------------------
section 5 "Summary"
echo
echo "  Results per section:"
for r in "${SECTION_RESULTS[@]}"; do
  echo "$r"
done
echo
if [ "$FAILS" -eq 0 ]; then
  echo "  ============================================"
  echo "   ALL CHECKS PASSED  (RENDER=${RENDER})"
  echo "  ============================================"
else
  echo "  ============================================"
  echo "   $FAILS CHECK(S) FAILED  (RENDER=${RENDER})"
  echo "  ============================================"
fi
echo

exit $FAILS
