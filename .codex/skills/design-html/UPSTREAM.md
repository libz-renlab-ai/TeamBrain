# Upstream Provenance

This skill is vendored verbatim from [garrytan/gstack](https://github.com/garrytan/gstack).

| Field | Value |
|---|---|
| Upstream repo | https://github.com/garrytan/gstack |
| Upstream path | `design-html/` |
| Pinned commit | `675717e3200d8f54b7e179a3425a21bdae33414b` (v1.17.0.0, 2026-04-28) |
| Vendored on | 2026-04-29 |
| Upstream license | MIT — see `LICENSE.upstream` |

## Files

| File | Source | Notes |
|---|---|---|
| `SKILL.md` | `design-html/SKILL.md` | **Patched** — see "Divergences from upstream" |
| `SKILL.md.tmpl` | `design-html/SKILL.md.tmpl` (gstack-internal authoring template) | verbatim |
| `vendor/pretext.js` | `design-html/vendor/pretext.js` (Pretext renderer, ~30 KB) | verbatim |
| `LICENSE.upstream` | `LICENSE` (gstack repo root) | verbatim |

## Divergences from upstream (vs. SHA `675717e`)

Local patches applied to `SKILL.md` after the Codex bot review of PR #14:

| # | Line | Upstream | Patched | Reason |
|---|---|---|---|---|
| 1 | many gstack binary calls, including 335-336 | `~/.claude/skills/gstack/bin/...` | `.claude/skills/gstack/bin/...` | Tilde expansion is brittle in quoted strings and does not happen after variable expansion. Project-relative paths resolve against the repo copy and keep the vendored skill self-contained. |
| 2 | 1023-1024 | `.claude/skills/gstack/design-html/vendor/pretext.js` (extra `gstack/` segment) and a user-home fallback | `.claude/skills/design-html/vendor/pretext.js` (matches our project vendored layout) | Upstream layout puts design-html under `gstack/design-html/`; we vendor it directly at `.claude/skills/design-html/`. The fallback is also project-relative so the repo copy stays self-contained. Without this fix the offline-asset probe always missed and the skill always took the CDN fallback. |
| 3 | 258-260 | delete `.claude/skills/gstack/` before running `gstack-team-init` | run `gstack-team-init` before deleting the vendored directory | Project-relative runtime paths disappear after `git rm -r .claude/skills/gstack/`; team migration must initialize before removing the binary. |
| 4 | 99 | `VERSION` or `.git` sentinel only | also accept executable `.claude/skills/gstack/bin/gstack-team-init` | This repo vendors gstack with `bin/`, `LICENSE.upstream`, and `UPSTREAM.md`, but no `VERSION` or `.git`; the runtime warning must detect the actual committed vendored copy. |
| 5 | 262 | `cd .claude/skills/gstack && ./setup --team` | `cd ~/.claude/skills/gstack && ./setup --team` | After migration, `.claude/skills/gstack/` is removed from the repo; team-mode setup must point developers at their global gstack installation. |

These patches are tracked here so the next upstream sync can re-apply them (or detect that upstream has fixed them and we should drop the local divergence).

## Runtime dependency

`SKILL.md` calls binaries from the project-relative `.claude/skills/gstack/bin/...`.
The required gstack binaries are vendored under `.claude/skills/gstack/bin/` — see
`.claude/skills/gstack/UPSTREAM.md` for details.

`gstack-verify-desktop`, `gstack-verify-mobile`, and `gstack-verify-tablet` are NOT
present in upstream `bin/` — they are runtime aliases created by gstack's installer.
Without them, the "verify rendered HTML" step in `design-html` will silently no-op
(`2>/dev/null || true`); the skill still produces HTML correctly but skips browser
verification.

## Update procedure

```bash
SHA=<new-upstream-sha>
curl -fsSL https://raw.githubusercontent.com/garrytan/gstack/$SHA/design-html/SKILL.md \
  -o .codex/skills/design-html/SKILL.md
curl -fsSL https://raw.githubusercontent.com/garrytan/gstack/$SHA/design-html/SKILL.md.tmpl \
  -o .codex/skills/design-html/SKILL.md.tmpl
curl -fsSL https://raw.githubusercontent.com/garrytan/gstack/$SHA/design-html/vendor/pretext.js \
  -o .codex/skills/design-html/vendor/pretext.js
# then mirror to .codex/skills/design-html/ and update the SHA above
```
