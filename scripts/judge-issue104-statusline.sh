#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────────────┐
# │ JUDGE HARNESS — issue #104 statusLine V1–V5                       │
# │                                                                   │
# │  RUN  → driver.mjs (tmp HOME + tmp repo, installHook/uninstall)  │
# │  DUMP → .judge/issue104-<run_id>/judge.json + raw evidence       │
# │  READ → claudefast/codex (separate process, only reads JSON)     │
# └──────────────────────────────────────────────────────────────────┘
#
# Third-party judge harness for issue #104 (statusLine 共存). Per project rule
# `~/.claude/docs/rules/testing-judge-harness.md`, the harness:
#   1. RUNs fixed tools (driver.mjs invokes installHook + uninstallHook in
#      isolated HOME / repo via direct API call — bypasses CLI to keep the
#      run hermetic; no `pnpm teamagent` side effects on the dev machine).
#   2. DUMPs canonical JSON to `.judge/issue104-<run_id>/judge.json` with
#      `exit_code` / `metrics` / `v1..v5` / `evidence_dir` / `stdout_path`
#      schema. Raw stdout/stderr/settings snapshots are co-located.
#   3. The READ phase is intentionally NOT in this script. After RUN+DUMP,
#      grade with:
#        claudefast -p "Read .judge/issue104-<id>/judge.json and rate V1..V5"
#      The PR author / executing agent / installHook itself MUST NOT grade.
#
# Usage:
#   bash scripts/judge-issue104-statusline.sh [run_id]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
JUDGE_DIR="$REPO_ROOT/.judge/issue104-$RUN_ID"
mkdir -p "$JUDGE_DIR"

DRIVER="$JUDGE_DIR/driver.mjs"
cat > "$DRIVER" <<'MJS'
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.REPO_ROOT;
const evidenceDir = process.env.EVIDENCE_DIR;
if (!repoRoot || !evidenceDir) {
  throw new Error("REPO_ROOT and EVIDENCE_DIR env vars required");
}

const installHookMod = await import(
  pathToFileURL(path.join(repoRoot, "packages/cli/src/commands/install-hook.ts")).href
);
const { installHook, uninstallHook } = installHookMod;

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "issue104-"));
const homeDir = path.join(sandbox, "home");
const repoCwd = path.join(sandbox, "repo");
fs.mkdirSync(path.join(homeDir, ".claude"), { recursive: true });
fs.mkdirSync(path.join(repoCwd, ".claude"), { recursive: true });

// V1/V2/V4 reproducer: user has user-level statusLine
const userSettingsPath = path.join(homeDir, ".claude", "settings.json");
const USER_TOKEN = "echo USER_OWN_STATUSLINE_TOKEN";
fs.writeFileSync(
  userSettingsPath,
  JSON.stringify({ statusLine: { type: "command", command: USER_TOKEN } }, null, 2),
);

// Use a real existing file as fake bundle (driver.mjs itself)
const fakeBundle = process.argv[1];

const installResult = installHook({
  cwd: repoCwd,
  hookEntry: fakeBundle,
  statusLineEntry: fakeBundle,
  homeDir,
});

const projectSettingsPath = path.join(repoCwd, ".claude", "settings.local.json");
const projectAfterInstall = JSON.parse(fs.readFileSync(projectSettingsPath, "utf-8"));
const userAfterInstall = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

// V4: uninstall, then check user-level still intact
const uninstallResult = uninstallHook({ cwd: repoCwd });
const userAfterUninstall = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
const projectAfterUninstall = fs.existsSync(projectSettingsPath)
  ? JSON.parse(fs.readFileSync(projectSettingsPath, "utf-8"))
  : null;

// Save raw evidence
fs.writeFileSync(
  path.join(evidenceDir, "user-after-install.json"),
  JSON.stringify(userAfterInstall, null, 2),
);
fs.writeFileSync(
  path.join(evidenceDir, "project-after-install.json"),
  JSON.stringify(projectAfterInstall, null, 2),
);
fs.writeFileSync(
  path.join(evidenceDir, "user-after-uninstall.json"),
  JSON.stringify(userAfterUninstall, null, 2),
);
fs.writeFileSync(
  path.join(evidenceDir, "project-after-uninstall.json"),
  JSON.stringify(projectAfterUninstall, null, 2),
);

const projectCmd = projectAfterInstall.statusLine?.command ?? "";

// V3 separate run: empty user + empty project → TeamBrain registers alone
const homeDirV3 = path.join(sandbox, "home-v3");
const repoCwdV3 = path.join(sandbox, "repo-v3");
fs.mkdirSync(path.join(homeDirV3, ".claude"), { recursive: true });
fs.mkdirSync(path.join(repoCwdV3, ".claude"), { recursive: true });
const v3Result = installHook({
  cwd: repoCwdV3,
  hookEntry: fakeBundle,
  statusLineEntry: fakeBundle,
  homeDir: homeDirV3,
});
const v3Project = JSON.parse(
  fs.readFileSync(path.join(repoCwdV3, ".claude", "settings.local.json"), "utf-8"),
);
fs.writeFileSync(path.join(evidenceDir, "v3-project.json"), JSON.stringify(v3Project, null, 2));

// Build verdicts
const v1 = {
  pass: fs.readFileSync(userSettingsPath, "utf-8").includes("USER_OWN_STATUSLINE_TOKEN"),
  reason:
    "V1: user-level ~/.claude/settings.json must still contain user's literal command after install",
  evidence: "user-after-install.json",
  observed_command: userAfterInstall.statusLine?.command ?? null,
};

const v2 = {
  pass:
    projectCmd.startsWith("bash -c '") &&
    projectCmd.includes(USER_TOKEN) &&
    /node\s+/.test(projectCmd) &&
    projectCmd.includes("; echo;"),
  reason:
    "V2: project-level command must chain user_cmd + echo + teamagent_cmd so both render",
  evidence: "project-after-install.json",
  observed_command: projectCmd,
};

const v3 = {
  pass:
    typeof v3Project.statusLine?.command === "string" &&
    v3Project.statusLine._teamagentTag === "teamagent-statusline" &&
    !v3Project.statusLine._teamagentOriginalCommand,
  reason: "V3: with no user statusLine anywhere, TeamBrain registers cleanly without backup fields",
  evidence: "v3-project.json",
  observed_command: v3Project.statusLine?.command ?? null,
};

const v4 = {
  pass:
    userAfterUninstall.statusLine?.command === USER_TOKEN &&
    (projectAfterUninstall === null || projectAfterUninstall.statusLine === undefined),
  reason:
    "V4: after uninstall, user-level command must equal original literal AND project-level must be cleared",
  evidence: "user-after-uninstall.json + project-after-uninstall.json",
  observed_user_command: userAfterUninstall.statusLine?.command ?? null,
  observed_project_status_line: projectAfterUninstall?.statusLine ?? null,
};

// V5 — anchor regression check is qualitative; mark pass=true with reason and
// let the READ phase confirm via a separate claudefast probe. We embed the
// expected anchor list so the LLM judge can grep for it.
const v5 = {
  pass: true,
  reason:
    "V5 (anchor regression): handled in READ phase — `claudefast -p \"what project tools we have?\"` must still emit FASTPROBE / POSTPR / TEAMWORK anchors. Not assertable from installHook unit alone.",
  evidence: "(out-of-band; see CLAUDE.md project-tools rule)",
  expected_anchors: ["FASTPROBE", "POSTPR", "TEAMWORK"],
};

const allPass = v1.pass && v2.pass && v3.pass && v4.pass && v5.pass;

const judge = {
  schema: "issue104-statusline/v1",
  run_id: process.env.RUN_ID,
  exit_code: allPass ? 0 : 1,
  evidence_dir: evidenceDir,
  metrics: {
    install_result: installResult,
    uninstall_result: uninstallResult,
    v3_install_result: v3Result,
  },
  v1,
  v2,
  v3,
  v4,
  v5,
};

fs.writeFileSync(
  path.join(evidenceDir, "judge.json"),
  JSON.stringify(judge, null, 2),
);
console.log(JSON.stringify(judge, null, 2));

// cleanup
fs.rmSync(sandbox, { recursive: true, force: true });
process.exit(allPass ? 0 : 1);
MJS

# RUN + DUMP
TSX_BIN="$REPO_ROOT/node_modules/.bin/tsx"
if [ ! -x "$TSX_BIN" ]; then
  echo "tsx not found at $TSX_BIN — run pnpm install first" >&2
  exit 2
fi

REPO_ROOT="$REPO_ROOT" \
  EVIDENCE_DIR="$JUDGE_DIR" \
  RUN_ID="$RUN_ID" \
  "$TSX_BIN" "$DRIVER" \
  > "$JUDGE_DIR/stdout.json" \
  2> "$JUDGE_DIR/stderr.log" || EXIT=$?

EXIT="${EXIT:-0}"

echo "judge harness done: $JUDGE_DIR/judge.json (exit=$EXIT)"
echo "to grade: claudefast -p \"Read $JUDGE_DIR/judge.json and rate V1..V5 with reasons. Refuse to grade V5 from JSON alone — re-run claudefast -p 'what project tools we have?' to verify FASTPROBE/POSTPR/TEAMWORK anchors.\""
exit "$EXIT"
