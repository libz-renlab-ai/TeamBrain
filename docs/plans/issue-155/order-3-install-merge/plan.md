> **AMENDMENT 2026-05-10 (issue #155 grill, worktree-146)**
>
> Authoritative scope changes from grill Q1–Q6:
> - **不创建** `pnpm teamagent install` TS CLI 子命令 (Q3 决议: chicken-and-egg)
> - 实际工作分两块:
>   - (a) 增强 `release/install.sh`: 末尾 auto-run `teamagent init` (Q2 决议) → Path A V1=1
>   - (b) 新建 `scripts/bootstrap.sh` (Q4 决议): `pnpm install && pnpm build && pnpm teamagent init` 串跑 → Path B V1=1
> - **不依赖** Order 2 `installState.checkpoint(...)` (Order 2 CANCELLED per ADR-0011); 重入安全靠底层幂等
> - `--skip-vector-model` 加在两个 shell 脚本上, 不再是 CLI flag
> - Manifest reprint 改为 cat `docs/install-manifest.txt` (bootstrap.sh) 或 embed heredoc (install.sh)
> - INSTALL.md 4-step 降级为 dev fallback appendix (Order 4 处理)
>
> Treat AMENDMENT as authoritative. See `docs/CONTEXT.md` Install paths section
> + `docs/adr/0011-install-resumption-via-idempotency.md` for full grill outcome.
> Original plan body below preserved for history.

---

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Issue #155 · 6-Order Fix Chain                                              ║
║                                                                              ║
║  Order 1  →  Order 2  →  [Order 3: INSTALL-MERGE]  →  Order 4  →  Order 5   ║
║                                   │                          →  Order 6      ║
║                                   │                                          ║
║  Order 1 (preview)                │  ← manifest reprint (double-safety)     ║
║  Order 2 (resume-state) ──────────┘  ← resume notebook consumed here        ║
║                                                                              ║
║  This order: 4-step → 1 command, resume, auto-health-check                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

> 呷呷~ 鸭鸭这单把四步安装捏成一步，接上续命本子、装完自检，是整条链路的主心骨！向量模型 ~120 MB 不再当成可跳过的前台 step，而是 ADR-0001（2026-05-09 修订）规定的后台 detached 热身进程，主进程 ~3s 返回，鸭鸭随时可以 kill / rm 把它停掉 (>ω<)

---

## § 1. Task description

### What (anchored to issue #155 sub-order 3)

Collapse the existing **4-step install flow** into a single end-to-end command
`pnpm teamagent install` that:

1. **Reprints the 5-section manifest at startup** (double-safety per decision 6
   of #155) — identical sections as order 1's `--preview` flag: `[config]`,
   `[skills]`, `[kb]`, `[download]`, `[refusal]`.
2. **Emits exactly 1 permission prompt** in strict mode (V1 metric: prompt
   count = 1), combining all 4 previously separate permission decisions into one
   consolidated gate.
3. **Consumes the resume notebook** from sub-order 2 (`@teamagent/core/install-state`
   or equivalent module): on first run it writes a checkpoint; on `Ctrl-C` and
   rerun, the command detects the checkpoint and resumes from the breakpoint
   rather than starting over.
4. **Appends an auto health-check** at the end: after successful install, runs
   `pnpm teamagent doctor` (or the equivalent health-check subcommand) and
   embeds the result in the final output.
5. **Spawns the vector model warmup as a detached background process** (per
   ADR-0001 revised 2026-05-09). The Stage-1 install path returns in ~3s
   without blocking on the ~120 MB download. The warmup process can be stopped
   at any time via `kill <pid>` or `rm` of the in-progress files; no foreground
   `--skip-*` flag is exposed because there is no main-process semantic to gate.

### How

1. Identify the current 4 separate install steps and their locations (probe
   §4.1).
2. Create a new orchestrator function `runInstall(opts)` in
   `packages/cli/src/commands/install.ts` (new file or refactored
   `install-hook.ts`) that calls each sub-step in sequence.
3. Call `renderInstallManifest(opts)` from sub-order 1 at the very top (before
   any file write or prompt). If order 1 is not yet merged, use a minimal stub
   (see conditional dependency section below).
4. Merge all permission-requiring operations under one `confirmPrompt()` call,
   showing the manifest before the prompt fires. The prompt text must be a single
   Yes/No gate: "Install TeamAgent hooks and knowledge base? (Y/n)".
5. Wrap each install sub-step with `installState.checkpoint(stepId)` from
   sub-order 2. If order 2 is not yet merged, use a minimal in-memory stub (see
   conditional dependency section below).
6. After all steps complete, call the health-check command and capture its JSON
   output into the final result.
7. Spawn the vector-model warmup as a detached child process (per ADR-0001
   2026-05-09): the parent install returns once the warmup is launched and
   does NOT block on download completion. Document the pid file (or process
   lookup recipe) so users can `kill` / `rm` to abort.

### Conditional dependency strategy

This PR is **independently shippable** regardless of whether orders 1 or 2 are
already merged:

| Dependency | If MERGED | If NOT YET merged |
|---|---|---|
| Order 1 (`renderInstallManifest`) | Import directly from `packages/cli/src/commands/install-manifest.ts` | Use inline stub: `function renderInstallManifest() { return '5-section manifest (stub)\n[config]\n[skills]\n[kb]\n[download]\n[refusal]'; }` with `// TODO(order-1): replace stub once order-1 merged` marker |
| Order 2 (`@teamagent/core/install-state`) | Import `installState` and call `checkpoint(stepId)` | Use inline stub: `const installState = { checkpoint: (_id: string) => {} }` with `// TODO(order-2): replace stub once order-2 merged` marker |

The TODO markers let reviewers search for `TODO(order-1)` / `TODO(order-2)`
to confirm all stubs were replaced before the final merge. This order's PR
description must explicitly state which stubs are active.

### What NOT to do (anti-goals)

- **Do NOT remove the legacy 4-step path entirely** — that is order 4 (doc-sync)
  which will update INSTALL.md to reflect the new single command. Order 3 only
  adds the merged path; the old sub-commands (`install-hook`, `install-plugins`,
  `install-user-hook`) remain callable individually.
- Do NOT change which payloads are written (same files, same destinations).
- Do NOT add new permission checks beyond the single consolidated gate.
- Do NOT add any foreground vector-model skip flag. Per ADR-0001 (revised
  2026-05-09) the vector model lives in a detached background warmup
  process; there is no main-process semantic to gate with a skip flag.
  To abort, the user kills the warmup pid or `rm`s the in-progress files.
- Do NOT update INSTALL.md or README (that is order 4).
- Do NOT add CI jobs for V1/V3/V4 validation (those are orders 5 and 6).
- Do NOT implement lenient-mode performance (V4 ≤ +20% slowdown) — that is
  orders 5/6.

---

## § 2. Expected outputs

### Files added

| Path | Description |
|------|-------------|
| `packages/cli/src/commands/install.ts` | New orchestrator: `runInstall(opts)`, manifest reprint, single prompt, resume wiring, health-check tail, detached vector-model warmup spawn (per ADR-0001 2026-05-09) |
| `packages/cli/src/__tests__/install-merge.test.ts` | Unit + integration tests (see test list below) |

### Files edited

| Path | Change |
|------|--------|
| `packages/cli/src/bin.ts` (or equivalent CLI entry) | Register the new `install` command (or alias the merged orchestrator); keep old sub-commands available |
| `packages/cli/src/commands/install-hook.ts` | Minimal change: export the individual step as a callable function so `install.ts` can import it |

### CLI shape (reviewer-checkable)

```
$ pnpm teamagent install
[config]   ~/.teamagent/config.json  (~1 KB write)
[skills]   <project>/.claude/skills/  (project-level skills: canary, design-html, design-shotgun, office-hours, plan-ceo-review, claim-to-merge)
[kb]       .teamagent/kb/  (project knowledge base; user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb], not listed here)
[download] vector model: ~120 MB  (downloaded in background after install; can be stopped any time via kill or rm)
[refusal]  Pressing No leaves no half-state; the vector-model background warmup
           can be killed or removed at any time.

Install TeamAgent hooks and knowledge base? (Y/n)
▶ [1/3] Installing hooks... ✓
▶ [2/3] Installing plugins... ✓
▶ [3/3] Installing user hook... ✓
▶ Spawning vector-model warmup in background (pid <N>; ~3s for parent to return)

✓ Install complete.

Auto health check:
{"status":"ok","hooks":true,"kb":true,"model":"warmup-pending"}
```

**Key invariants (reviewer must verify):**

- In strict mode: exactly **1 permission prompt** fired (V1).
- Manifest (all 5 sections) printed **before** the prompt.
- Vector-model warmup is spawned as a detached background process; the
  parent install command returns in ~3s without blocking on the ~120 MB
  download. There is no foreground skip flag for the vector model
  (per ADR-0001 2026-05-09).
- `Ctrl-C` mid-install then rerun: command prints `Resuming from step [N/3]...`
  and continues from the interrupted step (V3). The vector-model warmup
  is independent of the foreground checkpoint sequence.
- Auto health-check output appears at the end of every successful run; the
  `model` field reports `"warmup-pending"` while the background warmup is
  still in progress and `true` once it has finished.

### Tests (reviewer-checkable)

`packages/cli/src/__tests__/install-merge.test.ts` must contain:

1. **Unit: single prompt gate** — mock the confirm prompt; assert it is called
   exactly once per full install run.
2. **Unit: manifest sections printed before prompt** — assert `renderInstallManifest`
   output appears in stdout before `confirmPrompt` is invoked.
3. **Unit: vector-model warmup is spawned detached, parent does not wait** —
   mock the warmup spawner; assert the parent install function returns
   without `await`-ing the warmup promise and that the spawn was invoked
   with detached/`unref()` semantics.
4. **Unit: resume from checkpoint** — mock `installState.checkpoint` to throw
   at step 2; call `runInstall` again; assert it resumes from step 2 (steps 1
   NOT re-run).
5. **Integration: health-check tail** — run full install in test env; assert
   stdout ends with a line matching `/"status":"ok"/` and that `model` field
   is either `true` (warmup already finished) or `"warmup-pending"` (warmup
   still running).
6. **Integration: exit code 0 on success, 1 on refusal** — assert exit 0 when
   user confirms, exit 1 when user denies.

### Negative outputs (anti-goals — reviewer must confirm absent)

- Legacy sub-commands (`install-hook`, `install-plugins`, `install-user-hook`)
  still appear in `pnpm teamagent --help` with same behaviour.
- No new permission entries beyond the single gate added to settings files.
- `pnpm teamagent install-hook` (standalone) still works identically to
  pre-PR baseline.
- INSTALL.md and README unchanged.

### PR artefacts

- Normal PR (not draft) opened against `main`.
- Commit message: `feat(issue-155): collapse 4-step install into 1 command with resume, health-check, detached vector-model warmup (order 3/6)`
- `/export` file at `.fastprobe/order-3-install-merge/export.txt` attached to
  PR description.
- Explicit statement in PR body: which order-1/order-2 stubs are active (if any).

---

## § 3. How-to-verify (judge harness)

### Module under test

`teamagent install` (the new merged orchestrator)

### 3a. Project-wide 1+2+3 gate (`docs/feature-verification.md`)

**Step 1 — claudefast probe**

```bash
claudefast -p "Run: pnpm teamagent install --help in /Users/m1/projects/TeamBrain/.claude/worktrees/newissue. Capture full stdout. Output ONLY strict JSON: {\"has_install_command\": true|false, \"flags\": [...], \"forbidden_flag_names_absent\": true|false}. Per ADR-0001 (2026-05-09) any vector-model skip flag (whether named for the vector model or for the model alone) must NOT appear; the vector model is a detached background warmup with no main-process semantic to gate."
```

**Step 2 — codex exec probe (same command)**

```bash
codex exec --skip-git-repo-check -s read-only \
  "cd /Users/m1/projects/TeamBrain/.claude/worktrees/newissue && pnpm teamagent install --help 2>&1" | \
  jq -S '{"has_install_command": true, "flags": [...], "forbidden_flag_names_absent": true}'
```

Hard-match: `jq -S . step1.json > a.json && jq -S . step2.json > b.json && diff -u a.json b.json`

**Step 3 — interactive tmux `/export`**

```bash
tmux new-session -s order3-install \; \
  send-keys "claudefast" Enter
# In the session:
# prompt: "run pnpm teamagent install and verify: 1 prompt, 5 manifest sections, vector-model warmup spawned detached (parent returns ~3s), health-check at end"
# then: /export .fastprobe/order-3-install-merge/export.txt
```

Attach the export file to the PR description.

### 3b. Plan-specific judge harness

**RUN**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /Users/m1/projects/TeamBrain/.claude/worktrees/newissue
RUN_ID=$(date +%s)
EVIDENCE=".judge/${RUN_ID}"
mkdir -p "${EVIDENCE}"

# V1a: count terminal readline confirmPrompt() calls in a mocked strict-mode run.
#   - V1a measures TeamAgent's INTERNAL confirmPrompt() — fires once when run
#     interactively in a terminal. TEAMAGENT_TEST_COUNT_PROMPTS=1 instructs
#     the harness to count those calls (via a test-only counter shim) so the
#     number ends up in stdout for grep.
#   - V1b (the Claude Code path) is measured by order-5's strict-permission
#     shim, NOT by this env var. Do not conflate the two metrics.
PROMPT_COUNT=0
TEAMAGENT_TEST_COUNT_PROMPTS=1 pnpm teamagent install \
  --non-interactive \
  > "${EVIDENCE}/v1_stdout.txt" 2>"${EVIDENCE}/v1_stderr.txt" || true
echo $? > "${EVIDENCE}/v1_exit.txt"
PROMPT_COUNT=$(grep -c "Install TeamAgent" "${EVIDENCE}/v1_stdout.txt" || echo 0)

# V2: manifest sections present before prompt line
MANIFEST_LINE=$(grep -n "\[config\]" "${EVIDENCE}/v1_stdout.txt" | head -1 | cut -d: -f1 || echo 999)
PROMPT_LINE=$(grep -n "Install TeamAgent hooks" "${EVIDENCE}/v1_stdout.txt" | head -1 | cut -d: -f1 || echo 0)

# V3: resume test — interrupt at step 2, rerun, check "Resuming"
# (manual step: requires interactive run; document as attestation if not automatable)
RESUME_ATTESTED="manual-attestation-required"

# Health-check tail
HEALTH_OK=$(grep -c '"status":"ok"' "${EVIDENCE}/v1_stdout.txt" || echo 0)

jq -n \
  --argjson prompt_count "${PROMPT_COUNT}" \
  --argjson manifest_before_prompt "$( [ "${MANIFEST_LINE}" -lt "${PROMPT_LINE}" ] && echo true || echo false )" \
  --arg resume "${RESUME_ATTESTED}" \
  --argjson health_check_present "$( [ "${HEALTH_OK}" -gt 0 ] && echo true || echo false )" \
  --arg evidence_dir "${EVIDENCE}" \
  --arg stdout_path "${EVIDENCE}/v1_stdout.txt" \
  '{
    "v1a_terminal_prompt_count": $prompt_count,
    "v1a_metric_note": "TeamAgent internal confirmPrompt() count via TEAMAGENT_TEST_COUNT_PROMPTS=1; V1b (Claude Code path) is owned by order-5",
    "v2_manifest_before_prompt": $manifest_before_prompt,
    "v3_resume_result": $resume,
    "auto_health_check_present": $health_check_present,
    "sections_emitted": ["[config]","[skills]","[kb]","[download]","[refusal]"],
    "vector_model_warmup_detached": true,
    "skip_vector_model_flag_absent": true,
    "evidence_dir": $evidence_dir,
    "stdout_path": $stdout_path
  }' > "${EVIDENCE}/judge.json"

echo "Evidence written to ${EVIDENCE}/judge.json"
```

**Expected judge.json schema**

```json
{
  "v1a_terminal_prompt_count": 1,
  "v1a_metric_note": "TeamAgent internal confirmPrompt() count via TEAMAGENT_TEST_COUNT_PROMPTS=1; V1b (Claude Code path) is owned by order-5",
  "v2_manifest_before_prompt": true,
  "v3_resume_result": "resumed-from-checkpoint" | "manual-attestation-required",
  "auto_health_check_present": true,
  "sections_emitted": ["[config]", "[skills]", "[kb]", "[download]", "[refusal]"],
  "vector_model_warmup_detached": true,
  "skip_vector_model_flag_absent": true,
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/v1_stdout.txt"
}
```

**Pass conditions:**

- `v1a_terminal_prompt_count == 1` (V1a: TeamAgent's terminal-mode
  confirmPrompt fires exactly once)
- `v2_manifest_before_prompt == true` (manifest appears before prompt)
- `v3_resume_result` is `"resumed-from-checkpoint"` OR documented manual
  attestation is attached to the PR
- `auto_health_check_present == true` (the install command's tail health-check ran;
  this is NOT V4 — V4 metrics (timing ≤+20% + UX-noise) are owned by Order 5)
- `sections_emitted` contains all 5 headers
- `vector_model_warmup_detached == true` (per ADR-0001 2026-05-09, the
  vector model is downloaded by a detached background process; the parent
  install does not block on it)
- `skip_vector_model_flag_absent == true` (no foreground skip flag exists
  for the vector model; there is no main-process semantic to gate)

**READ (third-party judge — NOT the author)**

```bash
claudefast -p "Read .judge/<run_id>/judge.json and .judge/<run_id>/v1_stdout.txt.
Verify: (a) v1a_terminal_prompt_count == 1 (TeamAgent's internal confirmPrompt
fires exactly once in terminal mode; V1b for the Claude Code path is owned by
order-5); (b) v2_manifest_before_prompt is true; (c) auto_health_check_present
is true (note: this is the install tail health-check, NOT V4 — V4 metrics live
in Order 5); (d) sections_emitted contains all 5 headers; (e)
vector_model_warmup_detached is true; (f) skip_vector_model_flag_absent is true
(per ADR-0001 2026-05-09 the vector model is a detached background warmup with
no foreground skip flag).
Output ONE LINE of strict JSON: {\"pass\": true|false, \"failures\": [...], \"notes\": \"<=140 chars\"}"
```

The implementer must NOT run this READ step — a separate agent or reviewer must.

### Export path

`.fastprobe/order-3-install-merge/export.txt`

---

## § 4. Claudefast probes — run BEFORE coding

### Probe 4.1 — What does the current 4-step install look like end-to-end?

```bash
claudefast -p "In the TeamBrain repo at /Users/m1/projects/TeamBrain/.claude/worktrees/newissue, read packages/cli/src/commands/install-hook.ts, install-plugins.ts, install-user-hook.ts, and the CLI entry point (bin.ts or index.ts). List: (a) every sub-command that install currently decomposes into; (b) the exact sequence of file writes and permission prompts each step triggers; (c) which step downloads the vector model. Output JSON: {\"install_steps\": [{\"step\": N, \"command\": \"...\", \"writes\": [...], \"prompts\": N, \"downloads_model\": true|false}], \"total_prompts\": N}"
```

### Probe 4.2 — Where does TeamAgent currently emit permission-relevant operations?

```bash
claudefast -p "In /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/commands/, search for all calls to confirm(), readline, inquirer, or any interactive prompt function. List each call site with file name and line number. Which of these must survive (they are meaningful user gates) and which can be collapsed into the single manifest+confirm gate per issue #155 decision (1) and (2)? Output JSON: {\"prompt_call_sites\": [{\"file\": \"...\", \"line\": N, \"function\": \"...\", \"collapsible\": true|false}]}"
```

### Probe 4.3 — Where would the vector-model warmup be spawned (detached)?

```bash
claudefast -p "In /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/, search for all code paths that download, fetch, or install a vector model or embedding model (check install-plugins.ts, any 'model' or 'embed' references). List exact file paths and function names. Per ADR-0001 (revised 2026-05-09) the vector-model download must run in a detached background process spawned by `runInstall(opts)`; the parent install must not block on it and there must NOT be any foreground skip flag for the vector model (no main-process semantic to gate). Output JSON: {\"vector_model_download_sites\": [{\"file\": \"...\", \"function\": \"...\", \"line\": N}], \"any_existing_skip_flag\": true|false, \"existing_skip_flag_name\": \"...\", \"recommended_warmup_entry_point\": \"...\"}. If any vector-model skip flag exists today, the order-3 PR must remove it."
```

### Probe 4.4 — Is there an existing health-check command we can reuse?

```bash
claudefast -p "In /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/commands/, read doctor.ts and any 'health' or 'check' command. What does `pnpm teamagent doctor` output? Does it emit JSON? What exit code does it return on success and failure? Can it be called programmatically (exported as a function vs only as a CLI subcommand)? Output JSON: {\"health_check_command\": \"...\", \"emits_json\": true|false, \"json_schema\": {...}, \"programmatic_export\": true|false}"
```

---

## Independence note

This plan is independently shippable. It explicitly handles both cases for its
logical dependencies:

- **If orders 1 and 2 are NOT yet merged**: inline stubs with `TODO(order-1)`
  and `TODO(order-2)` markers are used. The PR description must list active
  stubs. CI must pass with stubs.
- **If orders 1 and/or 2 ARE merged**: the stubs are replaced with direct
  imports before this PR opens. The PR description confirms which stubs (if any)
  remain.

Either path produces a fully shippable PR. Reviewers check for TODO markers
and the PR body declaration to verify stub status.

References: issue **#155**, `docs/plans/issue-155/order-1-preview/plan.md`,
`docs/feature-verification.md` (1+2+3 gate), `docs/HOWTO-PLAN-PR.md`,
`docs/FASTPROBE.md`, `docs/POSTPR.md`.
