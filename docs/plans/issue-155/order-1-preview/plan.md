> **AMENDMENT 2026-05-10 (issue #155 grill, worktree-146)**
>
> Authoritative scope changes from grill Q1–Q6:
> - **不创建** `pnpm teamagent install --preview` TS CLI flag (Q3 cancelled the new CLI)
> - `--preview` 改为 **shell flag**: `bash release/install.sh --preview` 与 `bash scripts/bootstrap.sh --preview`
> - Manifest 源 = `docs/install-manifest.txt` (NEW, single source of truth per Q6=B)
> - `renderInstallManifest()` TS function NOT needed (no caller after Q3)
> - 6-order chain → 5-order chain (Order 2 CANCELLED per ADR-0011)
>
> Treat AMENDMENT as authoritative. See `docs/CONTEXT.md` Install paths section
> + `docs/adr/0011-install-resumption-via-idempotency.md` for full grill outcome.
> Original plan body below preserved for history.

---

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Issue #155 · 6-Order Fix Chain                                              ║
║                                                                              ║
║  [Order 1: PREVIEW] → Order 2 → Order 3 → Order 4 → Order 5 → Order 6       ║
║       │                                                                      ║
║       └─ New CLI flag: install --preview                                     ║
║          Prints 5-section manifest.  Zero writes.  Zero prompts.             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

> 呷呷~ 鸭鸭这单只做"看一眼"的能力，不碰安装本身，是 6 张订单里最小最干净的第一炮 (>ω<)

---

## § 1. Task description

### What (anchored to issue #155 sub-order 1)

Add a **`--preview` flag** to the existing `pnpm teamagent install` command.
When the flag is present the command:
1. Collects the same metadata the real install would use (config write paths,
   skill file list, project-KB size, vector-model warmup size, refusal-path
   note).
2. Renders those as a **5-section manifest** to stdout:
   - `[config]`  — directories / files that would be written for user config
   - `[skills]`  — `<project>/.claude/skills/<id>/SKILL.md` (project-level
                    skill set: `canary`, `design-html`, `design-shotgun`,
                    `office-hours`, `plan-ceo-review`, `claim-to-merge`).
                    User-level `~/.claude/skills/teamagent/<id>/SKILL.md`
                    is the `compile` output downstream of `[kb]` and is
                    NOT listed here (per `docs/CONTEXT.md` canonical defn).
   - `[kb]`      — project knowledge-base files that would be written
   - `[download]` — vector model (~120 MB) downloaded in background after
                    install; can be stopped any time via kill or rm
                    (per ADR-0001 revised 2026-05-09: detached warmup
                    process; Stage 1 install returns in ~3s)
   - `[refusal]` — "Pressing No leaves no half-state; the vector-model
                    background warmup can be killed or removed at any time"
3. Exits 0.
4. **Writes no files.  Triggers no permission prompts.**

The `--preview` flag is intentionally NOT advertised in user-facing README
(per grill round 2 decision M2 + M3). It ships as a real CLI flag for
internal/AI/power-user use; README only shows two install paths
(`bash <(curl ...)` quickstart at top + `pnpm teamagent install` in the AI
guidance section).

The `--preview` flag name is preferred over a dedicated `install-preview`
subcommand or `--dry-run` because:
- It stays co-located with the install command whose manifest it describes.
- It mirrors the UX pattern already used by `compile --dry-run` in this
  project (users already know "run the same command with a flag to preview").
- A standalone subcommand would require its own help entry and is harder to
  discover; a dedicated `--dry-run` alias is acceptable but less expressive
  than `--preview`.

### How

1. In `packages/cli/src/commands/install-hook.ts` (or wherever the install
   command is registered — see probe §4.1 below) add a boolean `--preview`
   option.
2. Gate all file-write and permission-prompt code behind `if (!preview)`.
3. Extract the manifest-rendering logic into a pure function
   `renderInstallManifest(opts): string` in a new file
   `packages/cli/src/commands/install-manifest.ts`.  Pure = no side effects,
   injectable options, testable without a filesystem.
4. `renderInstallManifest` must return an object matching the judge schema
   defined in § 3 (the CLI stringifies it; tests assert on the object).

### What NOT to do (anti-goals)

- **Do NOT touch the install execution path** when `--preview` is absent.
  Install behaviour (prompts, writes, health-check) must be byte-identical to
  pre-PR behaviour for all existing invocations.
- Do NOT write any files during `--preview` (not even temp files).
- Do NOT wire `--preview` to any permission prompt.
- Do NOT add `--preview` to subcommands other than `install`.
- Do NOT implement the consolidated 1-prompt flow (that is sub-order 3).
- Do NOT implement resume-after-interrupt (that is sub-order 2).
- Do NOT update INSTALL.md or README to reference the new flag (that is
  sub-order 4 — doc-sync).
- Do NOT add CI jobs for V1/V3/V4 validation (those are sub-orders 5 and 6).

---

## § 2. Expected outputs

### Files added

| Path | Description |
|------|-------------|
| `packages/cli/src/commands/install-manifest.ts` | Pure `renderInstallManifest(opts)` function + `InstallManifest` type |
| `packages/cli/src/__tests__/install-preview.test.ts` | Unit tests for `renderInstallManifest` + integration test for `--preview` flag exit-0 |

### Files edited

| Path | Change |
|------|--------|
| `packages/cli/src/commands/install-hook.ts` | Add `--preview` boolean flag; gate all writes/prompts behind `if (!preview)` |

### CLI shape (reviewer-checkable)

```
$ pnpm teamagent install --preview
[config]   ~/.teamagent/config.json  (~1 KB write)
[skills]   <project>/.claude/skills/  (N project-level skill files: canary, design-html, design-shotgun, office-hours, plan-ceo-review, claim-to-merge)
[kb]       .teamagent/kb/  (project knowledge base; user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb], not listed here)
[download] vector model: ~120 MB  (downloaded in background after install; can be stopped any time via kill or rm)
[refusal]  Pressing No leaves no half-state; the vector-model background warmup can be killed or removed at any time.

Exit code: 0
```

- stdout contains all 5 section headers: `[config]`, `[skills]`, `[kb]`,
  `[download]`, `[refusal]`
- No files written
- No permission dialogs wired

### Tests (reviewer-checkable)

`packages/cli/src/__tests__/install-preview.test.ts` must contain:

1. **Unit: `renderInstallManifest` returns all 5 sections** — asserts the
   returned object has keys `config`, `skills`, `kb`, `download`, `refusal`.
2. **Unit: pure function — no filesystem calls** — mock `fs` to throw; the
   function must not throw.
3. **Integration: `install --preview` exits 0 and emits 5 section headers** —
   spawn the CLI in a test with `--preview` and assert stdout matches
   `/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s`.
4. **Integration: `install --preview` writes nothing** — assert no file in a
   temp dir was created.

### Negative outputs (anti-goals — reviewer must confirm absent)

- `install-hook.ts` execution path for non-`--preview` is diff-minimal:
  the only change is adding the `--preview` flag declaration and the guard
  `if (!preview)` wrapping existing write/prompt code.
- No new subcommands appear in `pnpm teamagent --help`.
- `pnpm teamagent install` (without `--preview`) behaves identically to
  the pre-PR baseline.
- No new permission entries in `.claude/settings.json` or
  `.claude/settings.local.json`.

### PR artefacts

- Normal PR (not draft) opened against `main`.
- Commit message: `feat(issue-155): add install --preview manifest command (order 1/6)`
- `/export` file at `.fastprobe/order-1-preview/export.txt` attached to PR
  description.

---

## § 3. How-to-verify (judge harness)

### Module under test

`teamagent install --preview`

### 3a. Project-wide 1+2+3 gate (`docs/feature-verification.md`)

**Step 1 — claudefast probe**

```bash
claudefast -p "Run: pnpm teamagent install --preview --help. Capture full stdout. Output ONLY strict JSON: {\"sections_present\": [list of section headers found], \"exit_code\": 0, \"has_preview_flag\": true|false}"
```

**Step 2 — codex exec probe (same command)**

```bash
codex exec --skip-git-repo-check -s read-only \
  "cd /Users/m1/projects/TeamBrain && pnpm teamagent install --preview --help && echo DONE" 2>&1 | \
  jq -S '{"sections_present": [...], "exit_code": 0, "has_preview_flag": true}'
```

Hard-match step 1 and step 2 JSON via `jq -S . file1.json > a.json && jq -S . file2.json > b.json && diff -u a.json b.json`.

**Step 3 — interactive tmux `/export`**

```bash
tmux new-session -s order1-preview \; \
  send-keys "claudefast" Enter
# In the session:
# prompt: "run pnpm teamagent install --preview and show me the 5 sections"
# then: /export .fastprobe/order-1-preview/export.txt
```

Attach the export file to the PR description.

### 3b. Plan-specific judge harness

**RUN**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /Users/m1/projects/TeamBrain
RUN_ID=$(date +%s)
EVIDENCE=".judge/${RUN_ID}"
mkdir -p "${EVIDENCE}"

pnpm teamagent install --preview > "${EVIDENCE}/stdout.txt" 2>"${EVIDENCE}/stderr.txt"
echo $? > "${EVIDENCE}/exit_code.txt"

# Check no files were written in a temp scope
TMP_HOME=$(mktemp -d)
HOME="${TMP_HOME}" pnpm teamagent install --preview \
  > "${EVIDENCE}/tmpcheck_stdout.txt" 2>"${EVIDENCE}/tmpcheck_stderr.txt"
WROTE=$(find "${TMP_HOME}" -type f | wc -l | tr -d ' ')

jq -n \
  --arg ec "$(cat ${EVIDENCE}/exit_code.txt)" \
  --argjson sections "$(grep -oP '\[(config|skills|kb|download|refusal)\]' ${EVIDENCE}/stdout.txt | jq -Rsc 'split("\n") | map(select(length>0))')" \
  --arg wrote_files "${WROTE}" \
  '{
    "exit_code": ($ec | tonumber),
    "sections_emitted": $sections,
    "wrote_files": ($wrote_files != "0"),
    "prompted": false,
    "evidence_dir": "'"${EVIDENCE}"'",
    "stdout_path": "'"${EVIDENCE}/stdout.txt"'"
  }' > "${EVIDENCE}/judge.json"

echo "Evidence written to ${EVIDENCE}/judge.json"
```

**Expected judge.json schema**

```json
{
  "exit_code": 0,
  "sections_emitted": ["[config]", "[skills]", "[kb]", "[download]", "[refusal]"],
  "wrote_files": false,
  "prompted": false,
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/stdout.txt"
}
```

Pass condition: `exit_code == 0`, `sections_emitted` contains all 5 headers,
`wrote_files == false`, `prompted == false`.

**READ (third-party judge — NOT the author)**

```bash
claudefast -p "Read .judge/<run_id>/judge.json and .judge/<run_id>/stdout.txt.
Verify: (a) exit_code is 0; (b) sections_emitted contains config, skills, kb,
download, refusal; (c) wrote_files is false; (d) prompted is false.
Output ONE LINE of strict JSON: {\"pass\": true|false, \"failures\": [...]}"
```

The implementer must NOT run this READ step — it must be run by a separate
agent (or teammate) who did not write the code.

### Export path

`.fastprobe/order-1-preview/export.txt`

---

## § 4. Claudefast probes — run BEFORE coding

Run these probes before writing any implementation code.  They answer the
questions that would otherwise force a mid-implementation pivot.

### Probe 4.1 — Does `install --preview` (or a dry-run flag) already exist?

```bash
claudefast -p "In the TeamBrain repo at /Users/m1/projects/TeamBrain/.claude/worktrees/newissue, search packages/cli/src/commands/ for any file that registers an 'install' command or 'install-preview' subcommand.  List all relevant file paths and the exact option/flag names they declare.  Does any flag named --preview, --dry-run, or --preview-only already exist on the install command?  Output JSON: {\"install_files\": [...], \"existing_preview_flag\": true|false, \"existing_dryrun_flag\": true|false, \"notes\": \"...\"}"
```

### Probe 4.2 — What does `pnpm teamagent install --help` print today?

```bash
claudefast -p "In /Users/m1/projects/TeamBrain/.claude/worktrees/newissue, run 'pnpm teamagent install --help' (or read its source if binary not built) and list every flag the install command currently accepts. Also list the exact steps install performs (file writes, prompts, health check) so we know what to gate behind if (!preview).  Output JSON: {\"flags\": [...], \"install_steps\": [...]}"
```

### Probe 4.3 — What does `compile --dry-run` look like (reference implementation)?

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/commands/compile.ts. How is the --dry-run / preview flag implemented?  Specifically: (a) how is the flag declared; (b) how are side effects gated; (c) is there a separate pure manifest-builder function?  Summarise in 5 bullets so we can mirror the same pattern for install --preview."
```

### Probe 4.4 — Is there an existing test harness for install commands?

```bash
claudefast -p "List all test files in /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/__tests__/ that test install or hook-install behaviour. Show file names and the describe() blocks they contain.  Output JSON: {\"test_files\": [{\"path\": \"...\", \"describe_blocks\": [...]}]}"
```

---

## Independence note

This plan is independently shippable.  It does not require sub-orders 2–6 to
be landed first.  Sub-orders 2–6 all depend on the manifest rendering logic
introduced here (they call `renderInstallManifest` or extend it), so order 1
should merge before the others begin review — but order 1 itself has zero
upstream dependencies.

References: issue **#155**, `docs/feature-verification.md` (1+2+3 gate),
`docs/HOWTO-PLAN-PR.md`, `docs/FASTPROBE.md`, `docs/POSTPR.md`.
