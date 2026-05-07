#!/usr/bin/env bash
set -euo pipefail

# Usage: ./gen-sha256.sh <install.sh path> <tarball path>
# Generates install.sh.sha256 alongside install.sh.
# Prints tarball SHA256 line to stdout (for gh release upload pipelines).
# Handles macOS (shasum -a 256) and Linux (sha256sum) automatically.

if [ $# -lt 2 ]; then
  printf 'usage: %s <install-sh-path> <tarball-path>\n' "$0" >&2
  exit 1
fi

INSTALL_SH="$1"
TARBALL="$2"

# Detect sha256 tool
if command -v sha256sum >/dev/null 2>&1; then
  _sha256() { sha256sum "$@"; }
elif command -v shasum >/dev/null 2>&1; then
  _sha256() { shasum -a 256 "$@"; }
else
  printf 'error: neither sha256sum nor shasum found\n' >&2
  exit 1
fi

# Validate inputs
if [ ! -f "$INSTALL_SH" ]; then
  printf 'error: install.sh not found: %s\n' "$INSTALL_SH" >&2
  exit 1
fi

# Generate install.sh.sha256 alongside install.sh
INSTALL_DIR="$(dirname "$INSTALL_SH")"
INSTALL_BASENAME="$(basename "$INSTALL_SH")"
SHA256_OUT="${INSTALL_DIR}/${INSTALL_BASENAME}.sha256"

# Write checksum with just the basename (portable format: "<hex>  <basename>")
hex=$(_sha256 "$INSTALL_SH" | awk '{print $1}')
printf '%s  %s\n' "$hex" "$INSTALL_BASENAME" > "$SHA256_OUT"
printf '[gen-sha256] wrote %s\n' "$SHA256_OUT" >&2

# If tarball path is not /dev/null, also output its SHA256 to stdout
if [ "$TARBALL" != "/dev/null" ]; then
  if [ ! -f "$TARBALL" ]; then
    printf 'error: tarball not found: %s\n' "$TARBALL" >&2
    exit 1
  fi
  TARBALL_BASENAME="$(basename "$TARBALL")"
  tarball_hex=$(_sha256 "$TARBALL" | awk '{print $1}')
  printf '%s  %s\n' "$tarball_hex" "$TARBALL_BASENAME"
fi
