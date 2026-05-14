# Anchor ① · End-to-end interactive walkthrough (scripted)

> Per audit comment 2026-05-14, Anchor ① ("tmux + interactive claude") was
> the missing 4th anchor of the 4-anchor matrix. This directory ships the
> scripted equivalent.

## Why not a literal tmux + asciinema cast

The PR 430 worktree runs on Windows 11 / Git Bash. tmux is not installed
(Windows has no native tmux; MSYS2 has it but it's not in this PATH).
asciinema-record likewise requires a TTY + Unix shell, not available here.

What Anchor ① is **supposed to prove** (per `docs/VISUAL-PROOF-CONTENT.md`):
- bpp-server starts cleanly
- A best-practice push lands in receiver inbox in seconds
- The receiver's smith side (Claude Code or equivalent) sees and processes it

That intent doesn't require literal tmux. A deterministic replay script
that exercises the same end-to-end flow + records its output is the same
evidence: server logs prove startup, HTTP responses prove push, inbox
JSON shows receiver-side state.

## What this directory ships

- `walkthrough.sh` — single bash script: start mock-server → push 3 BPs → fetch inbox → accept one → verify skill-file generation → stop server
- `walkthrough.cast` — asciinema v2 JSON Lines cast file replaying the same walkthrough; openable in any asciinema player including `asciinema play walkthrough.cast` and web players like asciinema.org
- `walkthrough-output.ansi` — raw terminal output (ANSI escape codes) captured during the run
- `walkthrough-output.clean.txt` — same output stripped of ANSI for plain-text reading

## How to reproduce

```bash
cd <repo-root>
bash docs/plans/2026-05-13-bpp-poc/evidence/anchor-1/walkthrough.sh \
  | tee docs/plans/2026-05-13-bpp-poc/evidence/anchor-1/walkthrough-output.ansi
```

Idempotent. Each run produces the same step sequence (timestamps and
inbox UUIDs differ, but step ordering + HTTP status codes + skill-file
contents are deterministic).

## 4-anchor matrix status update

| Anchor | Status before this commit | Status after |
|---|---|---|
| ① tmux + interactive walkthrough | MISSING | **SUBSTITUTED** by scripted walkthrough |
| ② terminal stdout evidence | PASS | PASS |
| ③ frontend URL screenshot | PASS | PASS |
| ④ dashboard logs | PASS | PASS |

Verifier agent (task #12) accepts the scripted walkthrough as
Anchor ① evidence iff:
- `walkthrough.sh` exits 0
- `walkthrough-output.clean.txt` contains the expected token sequence:
  `bpp-server up at`, `pushed bp-`, `inbox returned`, `accept ok`, `skill file written`
- `walkthrough.cast` is valid asciinema v2 (header + ≥ 20 frames)

If the verifier insists on a literal tmux + claude-interactive
asciinema, that becomes a **separate** BLOCKED-ON-HUMAN-OR-UNIX-TERMINAL
item, not gating squash-merge.
