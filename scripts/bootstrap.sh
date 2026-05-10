#!/usr/bin/env bash
set -euo pipefail

#
# scripts/bootstrap.sh — contributor / from-source 1-prompt installer
# ==================================================================
#
# Usage (from cloned TeamBrain repo root):
#   bash scripts/bootstrap.sh [--preview] [--skip-vector-model] [--skip-init]
#
# Goal: V1=1 (issue #155 grill Q4) — under Claude Code's strict permission mode,
# the AI invokes Bash *once*, this script then runs `pnpm install` → `pnpm build`
# → `pnpm teamagent init` in-process (no further Bash prompts), achieving
# end-to-end install in one user-authorized Bash call.
#
# Path B (contributor / source) entry point. Contrast with `release/install.sh`
# (Path A: tarball-based end-user installer; runs as remote `curl|bash`).
#
# Idempotency (per ADR-0011): every step is naturally idempotent (pnpm cache,
# overwrite-on-rebuild, init's "skip if already registered" checks). Re-running
# this script after Ctrl-C is safe — it picks up where it left off without a
# resume notebook.
#
# 5-section manifest source: docs/install-manifest.txt (canonical, byte-locked
# by CI snapshot test against release/install.sh's embedded heredoc).
#

PREVIEW_MODE=0
SKIP_VECTOR_MODEL=0
SKIP_INIT=0

# ── Argument parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --preview)            PREVIEW_MODE=1 ;;
    --skip-vector-model)  SKIP_VECTOR_MODEL=1 ;;
    --skip-init)          SKIP_INIT=1 ;;
    --help|-h)
      cat <<'HELP_EOF'
usage: bash scripts/bootstrap.sh [--preview] [--skip-vector-model] [--skip-init]

  --preview            print 5-section install manifest and exit 0 (no install)
  --skip-vector-model  opt-out of the 120 MB vector model load (writes ~/.teamagent/.skip-vector-model)
  --skip-init          run pnpm install + pnpm build but skip `pnpm teamagent init`

After successful run, you have a working `pnpm teamagent` CLI in this checkout.
HELP_EOF
      exit 0
      ;;
    *)
      printf 'unknown flag: %s\n' "$arg" >&2
      printf 'see: bash scripts/bootstrap.sh --help\n' >&2
      exit 1
      ;;
  esac
done

# ── Locate repo root + manifest ──────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
MANIFEST_PATH="$REPO_ROOT/docs/install-manifest.txt"

if [ ! -f "$MANIFEST_PATH" ]; then
  printf 'error: manifest not found at %s\n' "$MANIFEST_PATH" >&2
  printf 'are you running this from a fresh clone? (expected docs/install-manifest.txt)\n' >&2
  exit 1
fi

# ── Preview gate ─────────────────────────────────────────────────────────────
if [ "$PREVIEW_MODE" -eq 1 ]; then
  cat "$MANIFEST_PATH"
  exit 0
fi

# ── Manifest reprint (issue #155 decision 5: announce before acting) ─────────
printf '\n[bootstrap] ---- install manifest (what will be written / downloaded) ----\n'
cat "$MANIFEST_PATH"
printf '\n[bootstrap] ---- (set --preview to see manifest only without install) ----\n\n'

# ── Dependency check ─────────────────────────────────────────────────────────
for cmd in pnpm node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'error: required command not found: %s\n' "$cmd" >&2
    if [ "$cmd" = "pnpm" ]; then
      printf 'install pnpm: npm install -g pnpm\n' >&2
    fi
    exit 1
  fi
done

cd "$REPO_ROOT"

# ── Step 1: pnpm install ─────────────────────────────────────────────────────
# Idempotent: pnpm cache + lockfile means re-running is fast (no re-download).
printf '[bootstrap] [1/3] pnpm install...\n'
pnpm install

# ── Step 2: pnpm build ───────────────────────────────────────────────────────
# Idempotent: TypeScript build re-emits to dist/; safe to rerun.
printf '\n[bootstrap] [2/3] pnpm build...\n'
pnpm build

# ── Step 3: pnpm teamagent init (with skip-vector-model honored) ─────────────
# Idempotent: init checks for existing hook registrations and skips re-doing.
# Per ADR-0011, no resume notebook needed.
if [ "$SKIP_INIT" -eq 1 ]; then
  printf '\n[bootstrap] --skip-init given; pnpm install + pnpm build done. Run init manually: pnpm teamagent init\n'
  exit 0
fi

if [ "$SKIP_VECTOR_MODEL" -eq 1 ]; then
  mkdir -p "$HOME/.teamagent"
  printf 'created by bootstrap.sh --skip-vector-model on %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$HOME/.teamagent/.skip-vector-model"
  printf '[bootstrap] skip-vector-model marker written to %s/.teamagent/.skip-vector-model\n' "$HOME"
  printf '[bootstrap] (intent recorded; current daemon does not yet read this marker — see issue #155 follow-up)\n'
fi

printf '\n[bootstrap] [3/3] pnpm teamagent init...\n'
if [ "$SKIP_VECTOR_MODEL" -eq 1 ]; then
  TEAMAGENT_SKIP_VECTOR_MODEL=1 pnpm teamagent init
else
  pnpm teamagent init
fi

printf '\n[bootstrap] ✓ TeamBrain installed from source. (V1=1 single-prompt path complete)\n'
printf '[bootstrap] Try: pnpm teamagent --help\n'
