```
 +-----------+      +-----------+
 | install   |      | checklist |
 | .sh.draft |----->| P4 M01-07 |
 +-----------+      +-----------+
       |                  |
  bash -n OK          55 lines
  198 lines         §H resolved
```

# R2 Worker-6 Summary — install.sh draft + P4 checklist

## Artifacts

| File | Lines | Status |
|------|-------|--------|
| `release-prep/install.sh.draft` | 198 | `bash -n` OK |
| `release-prep/install-sh-checklist.md` | 55 | Written |

## P4 Must-Have (7 items) Coverage

| ID | Requirement | Status | install.sh Location |
|----|------------|--------|---------------------|
| P4-M01 | URL 含 tag/SHA，禁 latest 浮动标签 | ✅ | `TEAMAGENT_VERSION` var; all URLs parameterized |
| P4-M02 | SHA-256 双文件校验（install.sh + tarball） | ✅ | `_verify_sha256()` + Step 1 self-verify + Step 2 tarball verify |
| P4-M03 | 显式 TLS (`--tlsv1.2 --proto '=https'`) | ✅ | `_curl_safe()` fn, every curl call |
| P4-M04 | 默认两步安装，禁默认 pipe-to-sh | ✅ | `SAFE_MODE=1` default; `read -r answer` gate before exec |
| P4-M05 | redirect 域名校验（防外泄）| ✅ | `_curl_safe()` → `allowed_hosts` regex check |
| P4-M06 | fallback URL（Release asset 直链）| ✅ | `_download_with_fallback()` — 8 FALLBACK_BASE refs |
| P4-M07 | `--dry-run / --verify / --no-run` 模式 | ✅ | Arg parsing block; `DRY_RUN=1` gate; probe PASS |

## G4 URL Dual-Track

- install.sh stub: `raw.githubusercontent.com/.../release/install.sh` (spec decision 5, §G4-1)
- tarball: `github.com/.../releases/download/{tag}/teamagent-{tag}.tgz` (P8 Route B, §G4-2)
- Coexist without conflict per §G4 resolution.

## §H Open Questions Resolution

| ID | Status |
|----|--------|
| H1 (SHA256 file location) | Dual-path in draft: primary=release branch, fallback=Release asset. CI workflow must publish both. **Punt to R3.** |
| H5 (fallback: Release asset vs CDN) | **Resolved** as GitHub Release asset — no external CDN for v1. |
| H6 (self-update mechanism) | **Punt** — not in scope for this PR; `TEAMAGENT_VERSION` env var allows manual pin. |
