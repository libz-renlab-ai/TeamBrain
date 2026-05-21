#!/usr/bin/env bash
set -euo pipefail

# TeamBrain / teamagent installer
# Security constraints: URL-pinned, SHA-256 verified, explicit TLS, two-step, redirect-checked, fallback URL

TEAMAGENT_VERSION="${TEAMAGENT_VERSION:-v0.11.1}"
PRIMARY_BASE="https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release"
FALLBACK_BASE="https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TEAMAGENT_VERSION}"
TARBALL_BASE="https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TEAMAGENT_VERSION}"
TARBALL_NAME="teamagent-${TEAMAGENT_VERSION}.tgz"
ARCHIVE_FALLBACK_URL="https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz"

SAFE_MODE=1
DRY_RUN=0
AUTO_MODE=0
PREVIEW_MODE=0
SKIP_VECTOR_MODEL=0
SKIP_INIT=0

# ── Argument parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --safe)        SAFE_MODE=1 ;;
    --auto)        SAFE_MODE=0; AUTO_MODE=1 ;;
    --dry-run)     DRY_RUN=1 ;;
    --verify)      DRY_RUN=1 ;;   # alias
    --no-run)      DRY_RUN=1 ;;   # alias
    --preview)     PREVIEW_MODE=1 ;;   # issue #155 Q6: print 5-section manifest, exit 0
    --skip-vector-model) SKIP_VECTOR_MODEL=1 ;;  # issue #155 Q5/Q6: opt-out of 120MB vector model load
    --skip-init)   SKIP_INIT=1 ;;   # issue #155 Q2 escape hatch: don't auto-run teamagent init
    --help|-h)
      printf 'usage: install.sh [--safe] [--auto] [--dry-run|--verify|--no-run] [--preview] [--skip-vector-model] [--skip-init]\n'
      printf '  --safe              (default) download, show script, prompt y/N before exec\n'
      printf '  --auto              skip review prompt (equivalent to pipe-to-sh mode)\n'
      printf '  --dry-run           echo plan only, do not install\n'
      printf '  --preview           print 5-section install manifest, exit 0 (no install, no network)\n'
      printf '  --skip-vector-model opt-out of the 120MB vector model load (writes ~/.teamagent/.skip-vector-model marker)\n'
      printf '  --skip-init         install binary but do NOT auto-run `teamagent init` (issue #155 Q2 escape hatch)\n'
      exit 0
      ;;
    *) printf 'unknown flag: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

# ── 5-section manifest (issue #155 Q6=B; canonical source = docs/install-manifest.txt) ─
# CI snapshot test (`scripts/check-manifest-sync.sh`) verifies this heredoc is byte-identical
# to docs/install-manifest.txt content (modulo header comments). DO NOT edit one without
# the other.
_print_manifest() {
  cat <<'MANIFEST_EOF'
# 5-section install manifest — canonical source of truth
# ========================================================
# 引用方:
#   - release/install.sh  (远程 curl|bash, 必须 embed 同份内容为 heredoc)
#   - scripts/bootstrap.sh (本地 cloned repo, 运行时 cat 此文件)
#   - INSTALL.md           (人读的 prose 版本, 段名必须出现)
#   - CI snapshot test     (锁 install.sh embed == 此文件 == bootstrap.sh cat 结果)
#
# 修改本文件 = 修改 install 行为契约。同步 install.sh embed + INSTALL.md prose。
# 详见 docs/CONTEXT.md "5-section manifest" 词条 + issue #155 grill Q6 (B 选项).

[config]
  ~/.teamagent/                 # 用户级配置目录 (~10 KB)
  ~/.claude/settings.json       # Claude Code hook 注册项

[skills]
  ~/.claude/skills/teamagent/   # 项目 skill 文件 (66 个文件)

[kb]
  <project>/.teamagent/         # 项目级 knowledge base (per-project)

[download]
  vector model                  # ~120 MB; 可用 --skip-vector-model opt-out
  embedder daemon native        # ~80 MB; ONNX runtime, 与向量模型同捆绑

[refusal]
  按 No 不会留半残。install.sh / bootstrap.sh 在拒绝时干净退出;
  重跑 = 自动续 (底层幂等, 不需要 notebook; 详见 ADR-0011)。
  --skip-vector-model 让你永久跳过 120 MB 向量模型下载。
MANIFEST_EOF
}

# ── Preview gate (issue #155 Q6: --preview prints manifest and exits without network) ───
if [ "$PREVIEW_MODE" -eq 1 ]; then
  _print_manifest
  exit 0
fi

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
  # issue #155 decision 5: print manifest BEFORE the user-facing prompt so user
  # knows what they are about to authorize. Manifest content is embedded in
  # _print_manifest() above; CI snapshot test ensures it matches docs/install-manifest.txt.
  printf '\n[install] ---- install manifest (what will be written / downloaded) ----\n'
  _print_manifest
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
BACKUP_DIR="${HOME}/.teamagent/backups"
SETUP_LOG="${HOME}/.teamagent/postinstall.log"
BACKUP_KEEP=3

# ── Issue #158 safety net: snapshot existing install before destructive steps ─
# Defense-in-depth so a future failure between `mkdir -p` and the final `ln`
# (or any non-atomic step in `tar -xzf …`) cannot leave the user without a
# working teamagent. The install.sh-installed surface lives at INSTALL_DIR;
# the original #158 reproducer (`npm i -g github:…`) bypasses install.sh
# entirely and is fixed by removing tree-sitter deps from package.json. The
# spec / tests for this policy live in
# packages/cli/src/lib/install-backup.ts (tested cross-platform via vitest).
#
# Contract mirrored from the TS module:
#   - backup file: $BACKUP_DIR/<ISO-with-colons-replaced-by-dashes>.tgz
#   - retention: keep newest 3 by mtime, FIFO eviction
#   - rollback log line: `[<ts>] stage=install status=rolled-back source=<path>`
#   - no-op when INSTALL_DIR is absent or empty
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$SETUP_LOG")"

_iso_now() { date -u +"%Y-%m-%dT%H-%M-%SZ"; }
_iso_now_log() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

_log_setup() {
  printf '[%s] %s\n' "$(_iso_now_log)" "$1" >> "$SETUP_LOG" 2>/dev/null || true
}

_backup_existing_install() {
  if [ ! -d "$INSTALL_DIR" ]; then
    BACKUP_PATH=""
    _log_setup "stage=backup status=skipped reason=no-existing-install"
    return 0
  fi
  # Skip if the install dir is empty (nothing worth saving)
  if [ -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    BACKUP_PATH=""
    _log_setup "stage=backup status=skipped reason=empty-install"
    return 0
  fi
  # /review iter-1 hardening: only back up directories that look like a
  # real teamagent install. ls -A on a freshly-mkdired dir is empty so the
  # original guard already handles "first install" (skip), but on hostile
  # filesystems (network FS with eventual consistency, chroot leaving
  # spurious .nfs* / .smbXXXX files) it returns non-empty. Use dist/bin.js
  # as the canary — that's the file the symlink points at and it must
  # exist for any teamagent to be functional.
  if [ ! -f "$INSTALL_DIR/dist/bin.js" ]; then
    BACKUP_PATH=""
    _log_setup "stage=backup status=skipped reason=no-dist-bin"
    printf '[install] no functional teamagent at %s (missing dist/bin.js) — skip backup\n' "$INSTALL_DIR"
    return 0
  fi
  local ts
  ts=$(_iso_now)
  BACKUP_PATH="${BACKUP_DIR}/${ts}.tgz"
  if (cd "$(dirname "$INSTALL_DIR")" && tar -czf "$BACKUP_PATH" "$(basename "$INSTALL_DIR")") 2>/dev/null; then
    _log_setup "stage=backup status=ok target=$BACKUP_PATH"
    printf '[install] backed up existing install → %s\n' "$BACKUP_PATH"
  else
    rm -f "$BACKUP_PATH" 2>/dev/null || true
    BACKUP_PATH=""
    _log_setup "stage=backup status=failed reason=tar-create-failed"
    printf '[install] WARNING: backup of existing install failed; continuing without rollback safety\n' >&2
  fi
}

_prune_old_backups() {
  # Keep newest BACKUP_KEEP *.tgz; delete the rest. Cross-platform sort by
  # mtime: ls -1t lists newest first.
  if [ ! -d "$BACKUP_DIR" ]; then return 0; fi
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/*.tgz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
    [ -n "$old" ] && rm -f "$old"
  done
}

_rollback_from_backup() {
  # Triggered by ERR trap; called with no args. Restores INSTALL_DIR from
  # $BACKUP_PATH (set by _backup_existing_install). Best-effort — never
  # itself errors out (we are already in a failure path).
  set +e
  if [ -z "${BACKUP_PATH:-}" ] || [ ! -f "$BACKUP_PATH" ]; then
    _log_setup "stage=install status=rollback-skipped reason=no-backup-available"
    printf '\n[install] install failed and no backup was available to restore.\n' >&2
    return 0
  fi
  # /review iter-1 hardening: validate the tarball BEFORE rm -rf $INSTALL_DIR.
  # If the backup is corrupt (truncated by SIGINT during _backup_existing_install,
  # bit-flip, exhausted disk during gzip flush) and we rm -rf first, the user
  # is left with an empty $INSTALL_DIR — exactly the partial-install corruption
  # #158 set out to prevent. `tar -tzf` lists contents without extraction; any
  # corrupt-header / truncation / gzip-checksum failure returns non-zero and
  # we leave the install untouched.
  if ! tar -tzf "$BACKUP_PATH" >/dev/null 2>&1; then
    _log_setup "stage=install status=rollback-skipped reason=backup-unreadable"
    printf '\n[install] backup unreadable; leaving existing install untouched: %s\n' "$BACKUP_PATH" >&2
    return 0
  fi
  rm -rf "$INSTALL_DIR" 2>/dev/null
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if (cd "$(dirname "$INSTALL_DIR")" && tar -xzf "$BACKUP_PATH") 2>/dev/null; then
    _log_setup "stage=install status=rolled-back source=$BACKUP_PATH"
    # Use ts shorthand from the filename for the user message.
    local ts
    ts=$(basename "$BACKUP_PATH" .tgz)
    printf '\n⚠️  teamagent install failed; restored backup from %s\n' "$ts" >&2
  else
    _log_setup "stage=install status=rollback-failed reason=tar-extract-failed"
    printf '\n[install] WARNING: backup restore failed; backup preserved at: %s\n' "$BACKUP_PATH" >&2
  fi
}

# Snapshot BEFORE any mutation of INSTALL_DIR.
BACKUP_PATH=""
_backup_existing_install
_prune_old_backups

# Arm rollback only for the destructive window. ERR trap fires on any
# non-zero exit under `set -e`; we install it just before the mkdir / tar /
# ln sequence so prior `read -r answer` (safe-mode prompt) cannot trip it.
trap '_rollback_from_backup' ERR

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

tar -xzf "$TMPDIR_INSTALL/$TARBALL_NAME" -C "$INSTALL_DIR" --strip-components=1
chmod +x "$INSTALL_DIR/dist/bin.js" 2>/dev/null || true
ln -sf "$INSTALL_DIR/dist/bin.js" "$BIN_DIR/teamagent"

# Disarm rollback trap — install completed successfully past the destructive window.
trap - ERR

# Step 5: PATH hint
if ! command -v teamagent >/dev/null 2>&1; then
  printf '\n[install] Add to PATH:\n'
  printf '  export PATH="%s:$PATH"\n' "$BIN_DIR"
  printf 'Or add the above line to your ~/.zshrc / ~/.bashrc.\n'
fi

printf '\n[install] teamagent %s installed successfully.\n' "$TEAMAGENT_VERSION"

# issue #155 Q5/Q6: write skip-vector-model marker if requested
if [ "$SKIP_VECTOR_MODEL" -eq 1 ]; then
  mkdir -p "$HOME/.teamagent"
  printf 'created by install.sh --skip-vector-model on %s\n' "$(_iso_now_log)" > "$HOME/.teamagent/.skip-vector-model"
  printf '[install] skip-vector-model marker written to %s/.teamagent/.skip-vector-model\n' "$HOME"
  printf '[install] (intent recorded for future use; current daemon does not yet read this marker — see issue #155 follow-up)\n'
fi

# issue #155 Q2: auto-run `teamagent init` to achieve V1=1 (single-prompt install).
# Skipped on --skip-init (escape hatch for advanced users / CI scenarios where init runs separately).
if [ "$SKIP_INIT" -eq 1 ]; then
  printf '[install] --skip-init given; skipping `teamagent init`. Run it manually: teamagent init\n'
else
  printf '\n[install] Running teamagent init (issue #155 V1=1 single-prompt flow)...\n'
  if [ "$SKIP_VECTOR_MODEL" -eq 1 ]; then
    TEAMAGENT_SKIP_VECTOR_MODEL=1 "$BIN_DIR/teamagent" init || {
      printf '[install] WARNING: `teamagent init` failed; binary is installed but hooks/skills may not be registered.\n' >&2
      printf '[install] Re-run manually with: teamagent init\n' >&2
      exit 1
    }
  else
    "$BIN_DIR/teamagent" init || {
      printf '[install] WARNING: `teamagent init` failed; binary is installed but hooks/skills may not be registered.\n' >&2
      printf '[install] Re-run manually with: teamagent init\n' >&2
      exit 1
    }
  fi
  printf '[install] teamagent init completed successfully.\n'
fi
