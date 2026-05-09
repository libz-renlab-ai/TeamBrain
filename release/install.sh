#!/usr/bin/env bash
set -euo pipefail

# TeamBrain / teamagent installer
# Security constraints: URL-pinned, SHA-256 verified, explicit TLS, two-step, redirect-checked, fallback URL

TEAMAGENT_VERSION="${TEAMAGENT_VERSION:-v0.9.4}"
PRIMARY_BASE="https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release"
FALLBACK_BASE="https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TEAMAGENT_VERSION}"
TARBALL_BASE="https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TEAMAGENT_VERSION}"
TARBALL_NAME="teamagent-${TEAMAGENT_VERSION}.tgz"
ARCHIVE_FALLBACK_URL="https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz"

SAFE_MODE=1
DRY_RUN=0
AUTO_MODE=0

# ── Argument parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --safe)        SAFE_MODE=1 ;;
    --auto)        SAFE_MODE=0; AUTO_MODE=1 ;;
    --dry-run)     DRY_RUN=1 ;;
    --verify)      DRY_RUN=1 ;;   # alias
    --no-run)      DRY_RUN=1 ;;   # alias
    --help|-h)
      printf 'usage: install.sh [--safe] [--auto] [--dry-run|--verify|--no-run]\n'
      printf '  --safe     (default) download, show script, prompt y/N before exec\n'
      printf '  --auto     skip review prompt (equivalent to pipe-to-sh mode)\n'
      printf '  --dry-run  echo plan only, do not install\n'
      exit 0
      ;;
    *) printf 'unknown flag: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

# ── Dry-run gate ─────────────────────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] Would install teamagent %s\n' "$TEAMAGENT_VERSION"
  printf '[dry-run] install.sh source : %s/install.sh\n' "$PRIMARY_BASE"
  printf '[dry-run] tarball           : %s/%s\n' "$TARBALL_BASE" "$TARBALL_NAME"
  printf '[dry-run] fallback tarball  : %s/%s\n' "$FALLBACK_BASE" "$TARBALL_NAME"
  printf '[dry-run] archive fallback  : %s\n' "$ARCHIVE_FALLBACK_URL"
  printf '[dry-run] SHA-256 verified  : yes (install.sh.sha256 + tarball.sha256)\n'
  printf '[dry-run] No files written.\n'
  exit 0
fi

# ── Dependency check ─────────────────────────────────────────────────────────
for cmd in curl sha256sum node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    # macOS sha256sum lives inside shasum
    if [ "$cmd" = "sha256sum" ] && command -v shasum >/dev/null 2>&1; then
      sha256sum() { shasum -a 256 "$@"; }
    else
      printf 'error: required command not found: %s\n' "$cmd" >&2
      exit 1
    fi
  fi
done

# ── Helper: curl with explicit TLS + redirect guard ──────────────────────────
# (P4 T-01 / T-02 / N-01)
_curl_safe() {
  local url="$1"; shift
  local out_args=("$@")

  # Redirect domain guard: final URL must stay on allowed_hosts
  local allowed_hosts="raw\.githubusercontent\.com|github\.com|objects\.githubusercontent\.com"
  local effective_url
  effective_url=$(curl \
    --tlsv1.2 \
    --proto '=https' \
    --max-redirs 3 \
    --location \
    --silent --show-error \
    --write-out '%{url_effective}' \
    --output /dev/null \
    "$url" 2>/dev/null || true)

  if [ -n "$effective_url" ]; then
    local host
    host=$(printf '%s' "$effective_url" | sed 's|https\?://||;s|/.*||')
    if ! printf '%s' "$host" | grep -qE "^(${allowed_hosts})$"; then
      printf 'error: redirect to disallowed host: %s\n' "$host" >&2
      exit 1
    fi
  fi

  curl \
    --tlsv1.2 \
    --proto '=https' \
    --max-redirs 3 \
    --location \
    --fail \
    --silent --show-error \
    "${out_args[@]}" \
    "$url"
}

# ── Helper: download with fallback ───────────────────────────────────────────
# (P4 F-01 / F-02)
_download_with_fallback() {
  local primary="$1"
  local fallback="$2"
  local dest="$3"

  if _curl_safe "$primary" -o "$dest"; then
    printf '[install] downloaded from primary: %s\n' "$primary"
    return 0
  fi
  printf '[install] primary failed, trying fallback: %s\n' "$fallback" >&2
  if _curl_safe "$fallback" -o "$dest"; then
    printf '[install] downloaded from fallback: %s\n' "$fallback"
    return 0
  fi
  printf 'error: both primary and fallback download failed\n' >&2
  return 1
}

# ── SHA-256 verification ─────────────────────────────────────────────────────
# (P4 S-01 / S-02 / P-01)
_verify_sha256() {
  local file="$1"
  local checksum_file="$2"
  local label="$3"

  if ! sha256sum --check --status "$checksum_file" 2>/dev/null; then
    printf 'error: SHA-256 verification failed for %s\n' "$label" >&2
    printf 'expected:\n'; cat "$checksum_file"
    printf 'got:     '; sha256sum "$file"
    exit 1
  fi
  printf '[install] SHA-256 OK: %s\n' "$label"
}

# ── Main install sequence ─────────────────────────────────────────────────────
TMPDIR_INSTALL=$(mktemp -d)
trap 'rm -rf "$TMPDIR_INSTALL"' EXIT

# Step 1: Download install.sh itself + its sha256 (P4 P-01 URL pin: uses TEAMAGENT_VERSION tag)
# Note: install.sh lives on the 'release' branch raw URL (spec decision 5 + §G4).
# The tarball it installs lives under GitHub Releases (P8 Route B + §G4).
SELF_URL="${PRIMARY_BASE}/install.sh"
SELF_SHA_URL="${PRIMARY_BASE}/install.sh.sha256"
SELF_SHA_FALLBACK="${FALLBACK_BASE}/install.sh.sha256"

printf '[install] Fetching SHA-256 checksum for install.sh...\n'
# Explicit `|| exit 1` is intentional defense-in-depth (set -euo pipefail at
# top would also abort on `return 1`, but the explicit form documents that
# self-verify download is mandatory and cannot soft-fail to archive fallback).
_download_with_fallback "$SELF_SHA_URL" "$SELF_SHA_FALLBACK" "$TMPDIR_INSTALL/install.sh.sha256" || exit 1

# Re-fetch install.sh from the SHA-anchored URL so self-verify works under
# curl|bash (where $0 is /bin/bash, not the script). The self-fetch + checksum
# pattern is the only way to verify the bytes the user actually executes.
printf '[install] Re-fetching install.sh for self-verification...\n'
_download_with_fallback "$SELF_URL" "${FALLBACK_BASE}/install.sh" "$TMPDIR_INSTALL/install.sh" || exit 1

# Rewrite checksum file to use local filename
sed "s|[^ ]*install.sh|$TMPDIR_INSTALL/install.sh|g" "$TMPDIR_INSTALL/install.sh.sha256" > "$TMPDIR_INSTALL/install.sh.sha256.local"
_verify_sha256 "$TMPDIR_INSTALL/install.sh" "$TMPDIR_INSTALL/install.sh.sha256.local" "install.sh"

# Step 2: Download tarball (P8 Route B: GitHub Release asset)
TARBALL_PRIMARY="${TARBALL_BASE}/${TARBALL_NAME}"
TARBALL_FALLBACK="${FALLBACK_BASE}/${TARBALL_NAME}"
TARBALL_SHA_PRIMARY="${TARBALL_BASE}/${TARBALL_NAME}.sha256"
TARBALL_SHA_FALLBACK="${FALLBACK_BASE}/${TARBALL_NAME}.sha256"

printf '[install] Downloading teamagent %s...\n' "$TEAMAGENT_VERSION"
SKIP_TARBALL_SHA=0
if ! _download_with_fallback "$TARBALL_PRIMARY" "$TARBALL_FALLBACK" "$TMPDIR_INSTALL/$TARBALL_NAME"; then
  printf '[install] tarball download failed; will attempt archive fallback\n' >&2
fi

# Final degrade: archive tarball (legacy URL, BC for users pinning a pre-3a version)
if [ ! -s "$TMPDIR_INSTALL/$TARBALL_NAME" ]; then
  printf '[install] release tarball not found; trying archive fallback: %s\n' "$ARCHIVE_FALLBACK_URL" >&2
  if _curl_safe "$ARCHIVE_FALLBACK_URL" -o "$TMPDIR_INSTALL/$TARBALL_NAME"; then
    # Emit the unsigned-tarball warning to BOTH stdout and stderr so it
    # remains visible when one stream is redirected (e.g. `... 2>/dev/null`).
    # P4-M02 trust-drop is acknowledged here, not silently absorbed.
    printf '[install] WARNING: downloaded archive fallback — SHA-256 verification SKIPPED (archive is unsigned)\n'
    printf '[install] WARNING: downloaded archive fallback — SHA-256 verification SKIPPED (archive is unsigned)\n' >&2
    SKIP_TARBALL_SHA=1
  else
    printf 'error: tarball, fallback, and archive all failed\n' >&2
    exit 1
  fi
fi

if [ "${SKIP_TARBALL_SHA:-0}" -ne 1 ]; then
  _download_with_fallback "$TARBALL_SHA_PRIMARY" "$TARBALL_SHA_FALLBACK" "$TMPDIR_INSTALL/${TARBALL_NAME}.sha256"
  sed "s|[^ ]*${TARBALL_NAME}|$TMPDIR_INSTALL/$TARBALL_NAME|g" "$TMPDIR_INSTALL/${TARBALL_NAME}.sha256" > "$TMPDIR_INSTALL/${TARBALL_NAME}.sha256.local"
  _verify_sha256 "$TMPDIR_INSTALL/$TARBALL_NAME" "$TMPDIR_INSTALL/${TARBALL_NAME}.sha256.local" "$TARBALL_NAME"
fi

# Step 3: Safe-mode review (P4 N-03: default two-step, no pipe-to-sh by default)
# Display the re-fetched install.sh content (NOT $0) — under `curl|bash`, $0 is
# /bin/bash so cat "$0" would dump the bash binary. The verified re-fetched
# copy at $TMPDIR_INSTALL/install.sh is correct in both pipe and file modes.
# Read prompt answer from /dev/tty (NOT stdin) — under `curl|bash`, stdin is
# the pipe and is exhausted by the time we hit `read`, causing a silent
# EOF→empty-answer→abort. /dev/tty bypasses the pipe and reads from the
# user's terminal (homebrew/rustup pattern). When no terminal is available
# (CI, docker exec, etc.), abort with clear guidance to use --auto.
if [ "$SAFE_MODE" -eq 1 ] && [ "$AUTO_MODE" -eq 0 ]; then
  printf '\n[install] ---- install.sh contents (review before executing) ----\n'
  cat "$TMPDIR_INSTALL/install.sh"
  printf '\n[install] ---- end of script ----\n\n'
  if [ ! -c /dev/tty ]; then
    printf '[install] error: --safe mode requires an interactive terminal.\n' >&2
    printf '[install] for non-interactive install, use --auto:\n' >&2
    printf '[install]   curl -fsSL .../release/install.sh | bash -s -- --auto\n' >&2
    exit 1
  fi
  printf 'Proceed with installation of teamagent %s? [y/N] ' "$TEAMAGENT_VERSION"
  read -r answer </dev/tty
  case "$answer" in
    [Yy]|[Yy][Ee][Ss]) ;;
    *) printf '[install] Installation aborted by user.\n'; exit 0 ;;
  esac
fi

# Step 4: Extract and install
INSTALL_DIR="${HOME}/.local/lib/teamagent"
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

tar -xzf "$TMPDIR_INSTALL/$TARBALL_NAME" -C "$INSTALL_DIR" --strip-components=1
chmod +x "$INSTALL_DIR/dist/bin.js" 2>/dev/null || true
ln -sf "$INSTALL_DIR/dist/bin.js" "$BIN_DIR/teamagent"

# Step 5: PATH hint
if ! command -v teamagent >/dev/null 2>&1; then
  printf '\n[install] Add to PATH:\n'
  printf '  export PATH="%s:$PATH"\n' "$BIN_DIR"
  printf 'Or add the above line to your ~/.zshrc / ~/.bashrc.\n'
fi

printf '\n[install] teamagent %s installed successfully.\n' "$TEAMAGENT_VERSION"
printf '[install] Run: teamagent init\n'
