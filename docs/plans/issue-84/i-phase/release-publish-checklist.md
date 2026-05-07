# Release Publish Checklist — P2 Issue #84

```
branch ops ──► SHA256 gen ──► publish ──► verify
    │               │              │          │
git worktree    gen-sha256.sh   git push   curl+sha
 add -b           install.sh     release   compare
 release          tarball       + gh rel
```

> WARNING: This checklist is documentation only.
> Actual push/release steps MUST be confirmed by the user before execution.

---

## Pre-publish: Validate install.sh.draft

```bash
# 1. Syntax check
bash -n release-prep/install.sh.draft && echo "bash -n OK"

# 2. Dry-run gate
INSTALL_DRY_RUN=1 bash release-prep/install.sh.draft --dry-run
# Expected: prints [dry-run] lines, exits 0, writes no files

# 3. Security checks (P4 acceptance probes)
grep -cE '\-\-tlsv1\.2' release-prep/install.sh.draft && echo "TLS flag OK"
grep -c 'allowed_hosts' release-prep/install.sh.draft && echo "redirect guard OK"
grep -c 'FALLBACK_BASE' release-prep/install.sh.draft  # expect ≥4
```

---

## Branch ops

```bash
# Create release branch worktree (inside .codex/worktrees/ per project convention)
git worktree add -b release .codex/worktrees/release-publish origin/main

cd .codex/worktrees/release-publish

# Copy install.sh.draft to release branch root
cp ../../release-prep/install.sh.draft install.sh
chmod +x install.sh

# Generate SHA256 for install.sh
../../release-prep/gen-sha256.sh install.sh /dev/null > install.sh.sha256
cat install.sh.sha256   # verify format: <hex>  install.sh
```

---

## Commit + Push release branch

```bash
# Still inside .codex/worktrees/release-publish
git add install.sh install.sh.sha256
git commit -m "chore(release): publish install.sh + sha256 (#84)"

# USER CONFIRMATION REQUIRED before this step:
# git push origin release
```

---

## Generate tarball + SHA256

```bash
# Back in repo root
TAG="v0.9.4"
pnpm pack --pack-destination /tmp/release-assets/
# Rename to match expected format
mv /tmp/release-assets/*.tgz /tmp/release-assets/teamagent-${TAG}.tgz

# Generate SHA256 for tarball
release-prep/gen-sha256.sh \
  .codex/worktrees/release-publish/install.sh \
  /tmp/release-assets/teamagent-${TAG}.tgz \
  > /tmp/release-assets/teamagent-${TAG}.tgz.sha256
```

---

## GitHub Release tag + asset upload

```bash
TAG="v0.9.4"

# USER CONFIRMATION REQUIRED before this step:
env -u GITHUB_TOKEN gh release create "${TAG}" \
  --repo libz-renlab-ai/TeamBrain \
  --title "TeamBrain ${TAG}" \
  --notes "Install: curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh" \
  /tmp/release-assets/teamagent-${TAG}.tgz \
  /tmp/release-assets/teamagent-${TAG}.tgz.sha256 \
  .codex/worktrees/release-publish/install.sh.sha256
```

---

## Verify

```bash
TAG="v0.9.4"

# 1. Verify raw URL install.sh syntax
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh \
  | bash -n && echo "remote install.sh bash -n OK"

# 2. Verify tarball SHA256 matches Release asset
curl -fsSL "https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TAG}/teamagent-${TAG}.tgz" \
  -o /tmp/verify-tarball.tgz
curl -fsSL "https://github.com/libz-renlab-ai/TeamBrain/releases/download/${TAG}/teamagent-${TAG}.tgz.sha256" \
  -o /tmp/verify-tarball.sha256
sed "s|[^ ]*teamagent|/tmp/verify-tarball|g" /tmp/verify-tarball.sha256 > /tmp/verify-tarball.sha256.local
shasum -a 256 --check /tmp/verify-tarball.sha256.local && echo "tarball SHA256 OK"

# 3. Dry-run via raw URL
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh \
  | bash -s -- --dry-run && echo "remote dry-run OK"
```

---

## Rollback

```bash
# DESTRUCTIVE — requires explicit user confirmation
# git push --delete origin release
# env -u GITHUB_TOKEN gh release delete "${TAG}" --repo libz-renlab-ai/TeamBrain --yes
# git worktree remove .codex/worktrees/release-publish
```

---

## URL Routing Summary (§G4)

| URL Role | URL |
|----------|-----|
| install.sh (stub) | `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh` |
| install.sh SHA256 (primary) | `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh.sha256` |
| install.sh SHA256 (fallback) | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/install.sh.sha256` |
| tarball | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/teamagent-{tag}.tgz` |
| tarball SHA256 | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/teamagent-{tag}.tgz.sha256` |

H6 (self-update) is punted — not implemented in this PR.
