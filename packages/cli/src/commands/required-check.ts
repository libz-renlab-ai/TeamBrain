import * as fs from "node:fs";
import * as path from "node:path";

export const REQUIRED_JSON_SCHEMA = "teamagent.required.v1" as const;
export const REQUIRED_JSON_MODE = "required" as const;

export interface RequiredCheckOptions {
  projectRoot?: string;
  json?: boolean;
}

export type RequiredCheckStatus =
  | "ok"
  | "config-missing"
  | "config-malformed"
  | "schema-unsupported";

export interface RequiredCheckResult {
  status: RequiredCheckStatus;
  exitCode: number;
  configPath: string;
  schema?: string;
  mode?: string;
  reason?: string;
}

export function executeRequiredCheck(
  opts: RequiredCheckOptions = {},
): RequiredCheckResult {
  const projectRoot =
    opts.projectRoot ??
    process.env["CLAUDE_PROJECT_DIR"] ??
    process.cwd();
  const configPath = path.join(projectRoot, ".teamagent", "required.json");

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return {
      status: "config-missing",
      exitCode: 2,
      configPath,
      reason: `.teamagent/required.json missing — run \`teamagent init .\` in this repo`,
    };
  }

  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    return {
      status: "config-malformed",
      exitCode: 2,
      configPath,
      reason: `.teamagent/required.json is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (!isPlainObject(cfg)) {
    return {
      status: "config-malformed",
      exitCode: 2,
      configPath,
      reason: ".teamagent/required.json must be a JSON object",
    };
  }

  const schema = typeof cfg["schema"] === "string" ? (cfg["schema"] as string) : undefined;
  const mode = typeof cfg["mode"] === "string" ? (cfg["mode"] as string) : undefined;

  if (schema !== REQUIRED_JSON_SCHEMA) {
    return {
      status: "schema-unsupported",
      exitCode: 3,
      configPath,
      ...(schema !== undefined ? { schema } : {}),
      ...(mode !== undefined ? { mode } : {}),
      reason: `unsupported schema: ${schema ?? "(missing)"} (expected ${REQUIRED_JSON_SCHEMA})`,
    };
  }

  if (mode !== REQUIRED_JSON_MODE) {
    return {
      status: "schema-unsupported",
      exitCode: 3,
      configPath,
      schema,
      ...(mode !== undefined ? { mode } : {}),
      reason: `unsupported mode: ${mode ?? "(missing)"} (expected ${REQUIRED_JSON_MODE})`,
    };
  }

  return {
    status: "ok",
    exitCode: 0,
    configPath,
    schema,
    mode,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseRequiredCheckArgs(
  args: readonly string[],
): RequiredCheckOptions {
  const opts: RequiredCheckOptions = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--project") {
      const v = args[++i];
      if (v !== undefined) opts.projectRoot = v;
      continue;
    }
    if (a.startsWith("--project=")) {
      opts.projectRoot = a.slice("--project=".length);
      continue;
    }
  }
  return opts;
}

export function renderRequiredCheckResult(
  r: RequiredCheckResult,
  json: boolean,
): string {
  if (json) {
    return JSON.stringify(r);
  }
  if (r.status === "ok") {
    return `[required-check] ok · schema=${r.schema} · mode=${r.mode}`;
  }
  return `[required-check] ${r.status}: ${r.reason ?? "(no reason)"}`;
}

/**
 * Content of `.teamagent/required.json` written by `teamagent init`.
 * Exported so both the writer and the test fixture share one source of truth.
 */
export const REQUIRED_JSON_CONTENT: Record<string, unknown> = {
  schema: REQUIRED_JSON_SCHEMA,
  mode: REQUIRED_JSON_MODE,
  scope: "claude-assisted-work",
  binary: "teamagent",
  check: {
    installed: "command -v teamagent",
    required:
      'teamagent required-check --project "$CLAUDE_PROJECT_DIR"',
  },
  remediation: {
    installOrUpdate:
      "npm install -g github:libz-renlab-ai/TeamBrain#release",
    restart:
      "Restart Claude after installing or updating TeamAgent.",
  },
};

/**
 * Content of `.claude/hooks/check-teamagent.sh` written by `teamagent init`.
 * Exported so init can write it (idempotent) and the test fixture can
 * assert exact bytes.
 */
export const CHECK_TEAMAGENT_SH_CONTENT = `#!/usr/bin/env bash
set -euo pipefail

INSTALL_OR_UPDATE_CMD='npm install -g github:libz-renlab-ai/TeamBrain#release'
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-$(pwd)}"

deny() {
  local reason="$1"

  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TeamAgent is required for Claude-assisted work in this repository. \${reason} Install or update TeamAgent, then restart Claude. Command: \${INSTALL_OR_UPDATE_CMD}"
  }
}
JSON

  exit 0
}

if ! command -v teamagent >/dev/null 2>&1; then
  deny "TeamAgent is not installed."
fi

if ! teamagent required-check --project "$PROJECT_DIR" >/dev/null 2>&1; then
  deny "TeamAgent is missing, stale, unhealthy, or not current for this repository."
fi

exit 0
`;
