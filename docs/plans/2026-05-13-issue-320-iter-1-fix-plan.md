# Iter-1 fix-plan for issue #320 (FIXEDFLOW driver §4 review-loop)

## Task

Drop the `#四层证明矩阵-4-layer-evidence-matrix` markdown anchor fragment from
`CLAUDE.md` (2 occurrences). The auto-generated GitHub anchor for heading
`## 四层证明矩阵 / 4-layer evidence matrix` is
`#四层证明矩阵--4-layer-evidence-matrix` (double dash, because the literal `/` is
stripped while the two surrounding spaces each become `-`). My initial link used a
single dash, which silently breaks on github.com. Dropping the fragment makes the
link robust to GitHub's anchor algorithm variations AND matches the existing
`CLAUDE.md` convention (the legacy
`**三大业务特性 / show me the business feature of this repo**` entry references
`docs/BUSINESS-FEATURES.md` with no fragment).

## Expected outputs

1. `CLAUDE.md` — 2 occurrences of
   `docs/BUSINESS-FEATURES.md#四层证明矩阵-4-layer-evidence-matrix` replaced with
   bare `docs/BUSINESS-FEATURES.md`:
   - one in the rule's path field (after `**...**：`)
   - one in the closing markdown link `[…](…)`
2. Re-run anchor / link validity check → 0 occurrences of the broken fragment.
3. No other files affected; commit count goes from 4 to 5 on `feat/issue-320`.

## Judge harness

```bash
W=/d/0jingtong/TeamBrain/.claude/worktrees/issue-320
# Probe 1: broken fragment count must be 0
N=$(grep -c '#四层证明矩阵-4-layer-evidence-matrix' "$W/CLAUDE.md")
[ "$N" = "0" ] && echo "PASS probe 1 (no broken fragments)" || echo "FAIL probe 1 ($N broken fragments)"

# Probe 2: anchor sentence still present in CLAUDE.md (rule integrity)
N=$(grep -c "TeamBrain has three business features, each measured by a four-layer evidence matrix" "$W/CLAUDE.md")
[ "$N" = "1" ] && echo "PASS probe 2 (anchor sentence intact)" || echo "FAIL probe 2 ($N copies of anchor sentence)"

# Probe 3: all 6 new grep anchors still present in CLAUDE.md
PASS=true
for a in "four-layer evidence matrix" "CEO narrative" "Coder file paths" "Machine-readable JSON+SQL" "LLM-readable raw artifacts" "turnkey UX is a vision, not PRESHIP"; do
  N=$(grep -c "$a" "$W/CLAUDE.md")
  [ "$N" -gt 0 ] || PASS=false
done
$PASS && echo "PASS probe 3 (all 6 new anchors present)" || echo "FAIL probe 3 (anchor missing)"
```

All 3 probes must PASS before /review is declared clean and PR can be opened.

## Verification subagent note

This fix is mechanical (2 string replacements) and verifiable by 3 grep probes
above. Per `docs/AGENTIC-CODING-POLICY.md` §3, a Verification subagent is not
necessary for this iter — the judge harness is deterministic byte-level grep
and not LLM-fakeable.
