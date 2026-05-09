import fs from "node:fs";
import path from "node:path";
import { findTeamagentRoot } from "../find-teamagent-root.js";

export interface TeamAgentConfig {
  stop_mode: "sync" | "async";
  /** Run scan-errors as part of Stop pipeline (writes to ~/.teamagent/candidates.db). */
  stop_scan_errors: boolean;
  /** Timeout budget (ms) for the scan-errors step inside Stop. */
  stop_scan_errors_timeout_ms: number;
}

const DEFAULTS: TeamAgentConfig = {
  stop_mode: "async",
  stop_scan_errors: true,
  stop_scan_errors_timeout_ms: 90_000,
};

export function readTeamAgentConfig(cwd: string): TeamAgentConfig {
  const root = findTeamagentRoot(cwd);
  const file = path.join(root, ".teamagent", "config.json");
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) } as TeamAgentConfig;
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeTeamAgentConfig(cwd: string, patch: Partial<TeamAgentConfig>): void {
  const dir = path.join(cwd, ".teamagent");
  const file = path.join(dir, "config.json");
  fs.mkdirSync(dir, { recursive: true });
  const existing = readTeamAgentConfig(cwd);
  const merged = { ...existing, ...patch };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export interface ConfigOptions {
  subcommand: "stop-mode" | "show";
  value?: string;
  cwd?: string;
}

export function executeConfig(opts: ConfigOptions): string {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.subcommand === "stop-mode") {
    const val = opts.value;
    if (val !== "sync" && val !== "async") {
      throw new Error(`Invalid stop-mode value: "${val}". Use "sync" or "async".`);
    }
    writeTeamAgentConfig(cwd, { stop_mode: val });
    return `stop_mode set to "${val}"`;
  }

  if (opts.subcommand === "show") {
    const cfg = readTeamAgentConfig(cwd);
    return JSON.stringify(cfg, null, 2);
  }

  throw new Error(`Unknown config subcommand: "${opts.subcommand}"`);
}
