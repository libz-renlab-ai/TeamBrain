---
name: visual-proof-pr
preamble-tier: 2
version: 1.0.0
description: |
  Visual-proof guided PR workflow: design-shotgun variants → design-html finalization →
  Chrome pop-open human verify → implement → /review → squash-merge PR.
  Use when: "implement visual-proof PR", "visual proof workflow", "design → PR"
  Triggers: visual proof PR, design to PR, implement with visual proof
---

# Visual-Proof Guided PR Workflow

```
design-shotgun → design-html → Chrome verify → implement → /review → squash-merge
```

## Step 0: Detect Context

```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$_ROOT"

# Check for existing design assets
_APPROVED=$(ls -t ~/.gstack/projects/*/designs/*/approved.json 2>/dev/null | head -1)
_VARIANTS=$(ls -t ~/.gstack/projects/*/designs/*/variant-*.png 2>/dev/null | head -1)
_FINALIZED=$(ls -t ~/.gstack/projects/*/designs/*/finalized.html 2>/dev/null | head -1)

[ -n "$_APPROVED" ] && echo "APPROVED: $_APPROVED" || echo "NO_APPROVED"
[ -n "$_VARIANTS" ] && echo "VARIANTS: $_VARIANTS" || echo "NO_VARIANTS"
[ -n "$_FINALIZED" ] && echo "FINALIZED: $_FINALIZED" || echo "NO_FINALIZED"
```

## Step 1: Generate Design Variants (if not exists)

If `NO_VARIANTS`:
1. Ask user for design brief
2. Run `/design-shotgun` to generate 3 style variants
3. Human picks approved variant → `approved.json` saved

## Step 2: Finalize HTML (if not exists)

If `NO_FINALIZED` but `APPROVED` exists:
1. Run `/design-html` to generate Pretext-native HTML
2. HTML auto-saves to `~/.gstack/projects/$SLUG/designs/<screen>/finalized.html`

## Step 3: Visual Proof Verification (POP-OPEN-HTML rules)

**Three iron rules:**
1. **Write to `/tmp`** — artifact NOT in repo
2. **Open in Chrome** — `open -a "Google Chrome" <path>`
3. **Pop open immediately** — no `--open` opt-in

```bash
# Copy finalized.html to /tmp for verification
_tmp_dir="/tmp/teamagent/visual-proof-$$"
mkdir -p "$_tmp_dir"
cp ~/.gstack/projects/*/designs/*/finalized.html "$_tmp_dir/finalized.html" 2>/dev/null || true

# Pop open in Chrome immediately
if [ -f "$_tmp_dir/finalized.html" ]; then
  open -a "Google Chrome" "$_tmp_dir/finalized.html"
  echo "VERIFIED_ARTIFACT: $_tmp_dir/finalized.html"
else
  echo "ERROR: no finalized.html found"
fi
```

## Step 4: Human Visual Verify

Verification checklist:
- [ ] Text reflows on resize (375px / 768px / 1024px / 1440px)
- [ ] Contenteditable text works (click to edit, layout recomputes)
- [ ] No text overflow or layout collapse
- [ ] Dark mode / light mode if applicable
- [ ] Mobile viewport (375px) looks correct

Ask user: "Visual proof verified? (yes/no)"

If no → loop to Step 2 (design-html refinement)

If yes → proceed to Step 5

## Step 5: Implementation

1. Create issue if not exists: `gh issue create`
2. Claim issue: comment + `grill-working` label
3. Implement based on finalized design
4. Run tests: `pnpm test`
5. Typecheck: `pnpm typecheck`

## Step 6: PR Review

```bash
# Create PR (normal, not draft)
gh pr create --title "feat: <description>" --body "## Visual Proof
<!-- link to finalized.html -->

## Test plan
- [ ] Visual proof verified in Chrome
- [ ] Tests pass: pnpm test
- [ ] Typecheck passes: pnpm typecheck"

# Run /review skill
/review
```

## Step 7: Squash Merge (after /review PASS)

```bash
gh pr merge <N> --squash --delete-branch
```

## POP-OPEN-HTML Compliance

| Rule | Implementation |
|------|---------------|
| Write to `/tmp` | `~/.gstack/projects/$SLUG/designs/*/finalized.html` → copy to `/tmp/teamagent/visual-proof-$$/` |
| Chrome open | `open -a "Google Chrome" <path>` |
| Pop immediately | Generation = pop open, no `--open` flag |

## Verification Evidence

Save to PR body:
1. Link to `finalized.html` (or screenshot path)
2. Viewport verification results
3. Test output (`pnpm test`, `pnpm typecheck`)
4. `/review` findings summary
