# install.sh Security Checklist — P4 must_have_in_v1 Mapping

## P4 Must-Have Items → install.sh.draft Sections

| Item ID | Mitigation Description | install.sh Location | Acceptance Probe | §H Link |
|---------|----------------------|---------------------|------------------|---------|
| P4-M01 | URL 必须版本化（含 tag/SHA），禁止 release/latest 浮动标签 | `TEAMAGENT_VERSION` var + `PRIMARY_BASE/TARBALL_BASE` URL construction (lines 9–13) | `grep 'TEAMAGENT_VERSION' install.sh.draft \| grep -v 'latest'` | — |
| P4-M02 | 提供 SHA-256 校验和文件，执行前校验（install.sh + install.sh.sha256 双文件） | `_verify_sha256()` fn + Step 1 (self-verify) + Step 2 (tarball verify) | `INSTALL_DRY_RUN=1 bash install.sh.draft --dry-run` prints "SHA-256 verified: yes"; `bash -n install.sh.draft` | H1 |
| P4-M03 | curl 显式指定 CA bundle / TLS，禁止静默 TLS 降级 | `_curl_safe()` fn: `--tlsv1.2 --proto '=https'` flags (lines 60–63) | `grep -E '\-\-tlsv1\.2\|\-\-proto' install.sh.draft` | — |
| P4-M04 | 默认两步执行（download + execute），禁止默认 pipe \| sh | `SAFE_MODE=1` default + Step 3 review prompt in `_safe_mode` block | `bash install.sh.draft --dry-run` exits without executing; `echo N \| bash install.sh.draft` aborts | — |
| P4-M05 | install.sh 内置 redirect URL 域名检查，防止 redirect 到外部恶意域 | `_curl_safe()` redirect guard: `allowed_hosts` regex + host check (lines 67–78) | `grep 'allowed_hosts' install.sh.draft` confirms domain allowlist | — |
| P4-M06 | 提供至少一个 fallback 下载端点（Release asset 直链或 CDN 镜像） | `_download_with_fallback()` fn: PRIMARY + FALLBACK args for both install.sh.sha256 and tarball | `grep 'FALLBACK_BASE' install.sh.draft \| wc -l` ≥ 4 | H5 |
| P4-M07 | install.sh 支持 --dry-run / --verify / --no-run 模式，用户可先查看 | Argument parsing section: `--dry-run`, `--verify`, `--no-run` aliases → `DRY_RUN=1` gate | `bash install.sh.draft --dry-run` exits 0 with "[dry-run]" prefix output only | — |
| P4-M06b | Archive tarball fallback (legacy URL) for pre-3a versions | `ARCHIVE_FALLBACK_URL` constant + final-degrade block in tarball download | `grep -c 'archive/refs/heads/release' release-prep/install.sh.draft` ≥ 1 | — |

## P8 Route B + G4: URL Routing Table

| URL Role | URL Pattern | Decision Source |
|----------|-------------|-----------------|
| install.sh stub source | `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh` | spec decision 5 + §G4(1) |
| install.sh SHA-256 checksum | `https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh.sha256` | P4-M02 + §H1 (primary option) |
| install.sh SHA fallback | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/install.sh.sha256` | P4-M02 fallback + §G4 |
| teamagent tarball | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/teamagent-{tag}.tgz` | P8 Route B + §G4(2) |
| tarball SHA-256 | `https://github.com/libz-renlab-ai/TeamBrain/releases/download/{tag}/teamagent-{tag}.tgz.sha256` | P4-M02 + P8 Route B |

**§G4 resolution**: install.sh stub lives on `release` branch (raw URL, spec decision 5); tarball it installs lives under GitHub Releases (P8 Route B). These coexist without conflict.

## §H Open Question Status

| ID | Question | Status in install.sh.draft |
|----|----------|---------------------------|
| H1 | SHA256 校验文件放 `release` 分支 vs GitHub Release asset | **RESOLVED — 3a landed**: workflow uploads install.sh.sha256 to both `release` branch (raw URL primary) AND GitHub Release asset (fallback). |
| H5 | install.sh fallback URL: Release asset直链 vs 外置 CDN镜像 | Resolved as **GitHub Release asset** (`FALLBACK_BASE = releases/download/{tag}`). No external CDN needed for v1. |
| H6 | Route B install.sh 的 self-update 机制是否本 PR 落地 | **Punt** — not implemented in draft. `TEAMAGENT_VERSION` env var allows users to pin a version; self-update is a follow-up. |

## Acceptance Probe Suite

```bash
# P4-M07: dry-run exits cleanly
bash release-prep/install.sh.draft --dry-run && echo "dry-run OK"

# P4-M04: 'N' aborts
echo "N" | bash release-prep/install.sh.draft 2>/dev/null; [ $? -eq 0 ] && echo "abort OK"

# Syntax check
bash -n release-prep/install.sh.draft && echo "bash -n OK"

# TLS flags present
grep -cE '\-\-tlsv1\.2' release-prep/install.sh.draft && echo "TLS flag OK"

# Fallback URLs present (≥4 references to FALLBACK_BASE)
grep -c 'FALLBACK_BASE' release-prep/install.sh.draft

# Redirect domain guard present
grep -c 'allowed_hosts' release-prep/install.sh.draft
```
