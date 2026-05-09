```
  TTHW Ledger — issue #122 per-step breakdown
  ============================================

  Step 1 [___s] Open landing URL
  Step 2 [___s] Copy install one-liner
  Step 3 [___s] Paste in terminal          Fill in actual
  Step 4 [___s] curl | sh runs             seconds below
  Step 5 [___s] teamagent demo             and paste as
  Step 6 [___s] First PreToolUse intercept a comment on
  ─────────────────────────────            issue #122
  TOTAL  [___s] (budget: 300 s)
  Verdict: [ ] PASS  [ ] FAIL  [ ] PARTIAL
```

# V1 Dogfood — per-step timing ledger

> Paste this **filled-in** comment on issue #122 after your dogfood run.
> Use the worked example at the bottom (`<!-- example -->` block) as a
> reference for what "good" looks like. Delete the example before posting.

---

## Run metadata

| Field | Value |
|-------|-------|
| User handle | `__________` |
| Date (YYYY-MM-DD) | `__________` |
| Recording link / attached file | `__________` |
| Recording format | `[ ] .cast` `[ ] .gif` `[ ] .mov / .mp4` |
| Recorder | `__________` |

---

## Per-step timing

| Step | Description | Budget | Actual (s) | Pass/Fail |
|------|-------------|--------|-----------|-----------|
| 1 | Open landing URL (`libz-renlab-ai.github.io/TeamBrain`) | 8 s | __ | `[ ] P` `[ ] F` |
| 2 | Copy install one-liner from hero | 5 s | __ | `[ ] P` `[ ] F` |
| 3 | Paste in terminal (new window) | 5 s | __ | `[ ] P` `[ ] F` |
| 4 | `curl … \| sh` installs teamagent | 120 s | __ | `[ ] P` `[ ] F` |
| 5 | `teamagent demo` runs | 30 s | __ | `[ ] P` `[ ] F` |
| 6 | First PreToolUse intercept visible | 20 s | __ | `[ ] P` `[ ] F` |
| **TOTAL** | — | **300 s** | __ | — |

---

## Friction notes per step

> Capture any hesitation, confusion, error message, or extra click —
> even if the step "passed". These become follow-up issues.

### Step 1 — Open landing URL

```
1.
2.
3.
4.
5.
```

### Step 2 — Copy install one-liner

```
1.
2.
3.
4.
5.
```

### Step 3 — Paste in terminal

```
1.
2.
3.
4.
5.
```

### Step 4 — curl | sh

```
1.
2.
3.
4.
5.
```

### Step 5 — teamagent demo

```
1.
2.
3.
4.
5.
```

### Step 6 — First PreToolUse intercept

```
1.
2.
3.
4.
5.
```

---

## Net verdict

```
[ ] PASS   — total ≤ 300 s, no abort triggered, recording attached
[ ] FAIL   — abort triggered (single step > 90 s, or install > 180 s,
              or same step failed twice in a row, or total > 280 s)
[ ] PARTIAL — run completed but total > 300 s (useful signal, not R6 pass)
```

---

## Follow-up issues filed

> One line per friction point that warrants a fix. Format:
> `#<issue-number> — <one-line description>`

```
__________
__________
__________
__________
__________
```

---

<!-- example, replace with real data -->
## Worked example (reference only — delete before posting)

**Run metadata**

| Field | Value |
|-------|-------|
| User handle | `stranger-alice` |
| Date | `2026-05-12` |
| Recording link | `docs/plans/issue-84/v1-dogfood/stranger-alice.cast` |
| Recording format | `[x] .cast` |
| Recorder | `@libz` |

**Per-step timing**

| Step | Description | Budget | Actual (s) | Pass/Fail |
|------|-------------|--------|-----------|-----------|
| 1 | Open landing URL | 8 s | 4 | `[x] P` |
| 2 | Copy install one-liner | 5 s | 6 | `[x] P` |
| 3 | Paste in terminal | 5 s | 3 | `[x] P` |
| 4 | `curl … \| sh` | 120 s | 88 | `[x] P` |
| 5 | `teamagent demo` | 30 s | 12 | `[x] P` |
| 6 | First PreToolUse intercept | 20 s | 8 | `[x] P` |
| **TOTAL** | — | 300 s | **121** | — |

**Friction notes**

Step 2: User tried to triple-click the command line but it selected the
surrounding `<pre>` block text including the `$` prefix; had to retry.
Step 4: Node v18 was already installed; no friction there. Install
script printed an extra "checking for updates" line that confused user
briefly (3 s pause).

**Net verdict**

```
[x] PASS   — total ≤ 300 s, recording at stranger-alice.cast
```

**Follow-up issues filed**

```
#123 — ux: install one-liner copy button strips $ prefix inconsistently
#124 — ux: "checking for updates" line during install is confusing
```
<!-- end example -->
