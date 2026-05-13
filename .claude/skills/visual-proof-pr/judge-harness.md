# Visual-Proof PR Judge Harness

Verifies that the visual-proof guided PR workflow was followed correctly.

## Evidence Collection

```bash
#!/usr/bin/env bash
set -euo pipefail

_JUDGE_DIR="/tmp/visual-proof-judge-$$"
mkdir -p "$_JUDGE_DIR"

# Probe 1: Design artifacts exist
_APPROVED=$(ls -t ~/.gstack/projects/*/designs/*/approved.json 2>/dev/null | head -1)
_VARIANTS=$(ls -t ~/.gstack/projects/*/designs/*/variant-*.png 2>/dev/null | head -1)
_FINALIZED=$(ls -t ~/.gstack/projects/*/designs/*/finalized.html 2>/dev/null | head -1)

echo "APPROVED: ${_APPROVED:-none}" > "$_JUDGE_DIR/probe1_artifacts.txt"
echo "VARIANTS: ${_VARIANTS:-none}" >> "$_JUDGE_DIR/probe1_artifacts.txt"
echo "FINALIZED: ${_FINALIZED:-none}" >> "$_JUDGE_DIR/probe1_artifacts.txt"

# Probe 2: Artifact in /tmp (POP-OPEN-HTML compliance)
_TMP_ARTIFACT=$(ls -t /tmp/teamagent/visual-proof-*/finalized.html 2>/dev/null | head -1 || echo "none")
echo "TMP_ARTIFACT: ${_TMP_ARTIFACT:-none}" > "$_JUDGE_DIR/probe2_tmp_compliance.txt"

# Probe 3: Chrome was used (check for open -a Google Chrome in process list)
if pgrep -fl "Google Chrome" > /dev/null 2>&1; then
  echo "CHROME: running" > "$_JUDGE_DIR/probe3_chrome.txt"
else
  echo "CHROME: not running (may have closed)" > "$_JUDGE_DIR/probe3_chrome.txt"
fi

# Probe 4: PR exists with visual-proof link
_PR_BODY=$(gh pr view --json body --jq '.body' 2>/dev/null || echo "")
if echo "$_PR_BODY" | grep -q "Visual Proof\|finalized.html\|variant"; then
  echo "PR_VISUAL_PROOF: found" > "$_JUDGE_DIR/probe4_pr_visual.txt"
else
  echo "PR_VISUAL_PROOF: missing" > "$_JUDGE_DIR/probe4_pr_visual.txt"
fi

# Output summary
echo "=== JUDGE EVIDENCE ===" > "$_JUDGE_DIR/summary.json"
echo "{" >> "$_JUDGE_DIR/summary.json"
echo '  "artifacts": "'"${_FINALIZED:-none}"'",' >> "$_JUDGE_DIR/summary.json"
echo '  "tmp_artifact": "'"${_TMP_ARTIFACT:-none}"'",' >> "$_JUDGE_DIR/summary.json"
echo '  "chrome_running": "'"$(cat "$_JUDGE_DIR/probe3_chrome.txt")"'",' >> "$_JUDGE_DIR/summary.json"
echo '  "pr_has_visual": "'"$(cat "$_JUDGE_DIR/probe4_pr_visual.txt")'"' >> "$_JUDGE_DIR/summary.json"
echo "}" >> "$_JUDGE_DIR/summary.json"

cat "$_JUDGE_DIR/summary.json"
```

## Verdict Logic

| Probe | Pass Condition |
|-------|---------------|
| Probe 1 (artifacts) | `FINALIZED` != "none" |
| Probe 2 (tmp compliance) | `TMP_ARTIFACT` contains `/tmp/teamagent/visual-proof-*/finalized.html` |
| Probe 3 (Chrome) | Informational only (Chrome may close) |
| Probe 4 (PR body) | `PR_VISUAL_PROOF` == "found" |

## Exit Codes

- `0` — All mandatory probes pass
- `1` — Any mandatory probe fails
