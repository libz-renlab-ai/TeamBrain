/**
 * Append-only harvest log. Records every Stop / SessionEnd / PreCompact
 * pipeline run into .teamagent/last-harvest.md so the user can read what the
 * background process learned even though it runs silently.
 */
import fs from "node:fs";
import path from "node:path";
import { findTeamagentRoot } from "./find-teamagent-root.js";

export const HARVEST_FILE_RELATIVE = path.join(".teamagent", "last-harvest.md");

export interface HarvestEntrySummary {
  trigger: string;
  correct_pattern: string;
  confidence: number;
}

export interface HarvestRecord {
  sessionId: string;
  mode: "incremental" | "full";
  lastTurnIndex: number;
  correctionsFound: number;
  extracted: number;
  skipped: number;
  failed: number;
  rejected: number;
  deduped: number;
  newEntries: HarvestEntrySummary[];
}

export function getHarvestPath(cwd: string): string {
  const root = findTeamagentRoot(cwd);
  return path.join(root, HARVEST_FILE_RELATIVE);
}

export function appendHarvest(cwd: string, record: HarvestRecord): void {
  const file = getHarvestPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = new Date().toISOString();
  const lines: string[] = [];
  lines.push("");
  lines.push(`## ${ts} — session ${record.sessionId} (${record.mode})`);
  lines.push("");
  lines.push(
    `- stats: lastTurnIndex=${record.lastTurnIndex}, ` +
      `correctionsFound=${record.correctionsFound}, ` +
      `extracted=${record.extracted}, skipped=${record.skipped}, ` +
      `failed=${record.failed}, rejected=${record.rejected}, ` +
      `deduped=${record.deduped}`,
  );
  if (record.newEntries.length === 0) {
    lines.push("- 无新增条目");
  } else {
    lines.push(`- 新增 ${record.newEntries.length} 条:`);
    for (const e of record.newEntries) {
      lines.push(
        `  - [${e.confidence.toFixed(2)}] ${e.trigger} → ${e.correct_pattern}`,
      );
    }
  }
  lines.push("");
  fs.appendFileSync(file, lines.join("\n"), "utf-8");
}
