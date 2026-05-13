/**
 * Scan `~/.claude/projects/` for sessions whose mtime falls inside "today"
 * (local-time midnight to now), parse each jsonl, and group by canonical
 * project key (worktree-merged).
 *
 * This is a thin imperative shell: filesystem + clock dependencies are
 * injectable so unit tests can hand-craft fixtures and synthesize "today"
 * without touching real wallclock.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { parseSessionFile } from "../session-parser/index.js";
import type { ParsedSession } from "@teamagent/types";
import { decodeProjectDirToCwd } from "./cwd-decode.js";
import { toProjectKey, type ProjectKey } from "./project-key.js";

export interface SessionRecord {
  /** Decoded cwd of the recording session (worktree path, pre-canonicalization). */
  readonly rawCwd: string;
  /** Path to the .jsonl file on disk. */
  readonly jsonlPath: string;
  /** Session id (basename of jsonl minus extension). */
  readonly sessionId: string;
  /** Last modification time in millis since epoch. */
  readonly mtimeMs: number;
  /** Parsed contents (may be empty if jsonl was corrupt). */
  readonly session: ParsedSession;
}

export interface ProjectGroup {
  readonly project: ProjectKey;
  readonly sessions: readonly SessionRecord[];
}

export interface ScanOptions {
  readonly projectsRoot: string;
  /** Clock for "today" calculation (override in tests). */
  readonly now?: () => Date;
  /** fs port for tests. */
  readonly fs?: Pick<typeof nodeFs, "existsSync" | "readdirSync" | "statSync" | "readFileSync">;
  /** path port for tests. */
  readonly path?: Pick<typeof nodePath, "join">;
}

export interface ScanResult {
  /** ISO date (YYYY-MM-DD) used for the "today" window. */
  readonly date: string;
  /** Local-midnight epoch millis bound (start). */
  readonly windowStartMs: number;
  /** Now in epoch millis (window end). */
  readonly windowEndMs: number;
  /** Project groups sorted by canonical cwd asc. */
  readonly groups: readonly ProjectGroup[];
  /** How many session jsonl files were skipped because parse failed. */
  readonly skippedCount: number;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function scanTodayActivity(opts: ScanOptions): ScanResult {
  const fs = opts.fs ?? nodeFs;
  const path = opts.path ?? nodePath;
  const nowDate = (opts.now ?? (() => new Date()))();
  const windowStartMs = startOfLocalDay(nowDate).getTime();
  const windowEndMs = nowDate.getTime();
  const isoDate = toIsoDate(nowDate);

  if (!fs.existsSync(opts.projectsRoot)) {
    return {
      date: isoDate,
      windowStartMs,
      windowEndMs,
      groups: [],
      skippedCount: 0,
    };
  }

  const projectDirs = fs.readdirSync(opts.projectsRoot);
  const groupMap = new Map<string, { project: ProjectKey; records: SessionRecord[] }>();
  let skipped = 0;

  for (const dir of projectDirs) {
    const projDirPath = path.join(opts.projectsRoot, dir);
    let projStat: nodeFs.Stats;
    try {
      projStat = fs.statSync(projDirPath);
    } catch {
      continue;
    }
    if (!projStat.isDirectory()) continue;

    const rawCwd = decodeProjectDirToCwd(dir);
    const projectKey = toProjectKey(rawCwd);

    let entries: string[];
    try {
      entries = fs.readdirSync(projDirPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const full = path.join(projDirPath, entry);
      let stat: nodeFs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < windowStartMs) continue;
      // No upper bound: the operator's current Claude session is actively
      // being appended to; its mtime can land a few ms past the cached
      // `nowDate` sample. Grill §2 explicitly requires "当前会话也算今天",
      // so accept any mtime >= today's local-midnight.

      let raw: string;
      try {
        raw = fs.readFileSync(full, "utf-8");
      } catch {
        skipped += 1;
        continue;
      }
      let parsed: ParsedSession;
      try {
        parsed = parseSessionFile(raw);
      } catch {
        skipped += 1;
        continue;
      }
      const sessionId = entry.replace(/\.jsonl$/, "");
      const record: SessionRecord = {
        rawCwd,
        jsonlPath: full,
        sessionId,
        mtimeMs: stat.mtimeMs,
        session: parsed,
      };

      const slot = groupMap.get(projectKey.canonicalCwd);
      if (slot) {
        slot.records.push(record);
      } else {
        groupMap.set(projectKey.canonicalCwd, {
          project: projectKey,
          records: [record],
        });
      }
    }
  }

  const groups: ProjectGroup[] = Array.from(groupMap.values())
    .map(({ project, records }) => ({
      project,
      sessions: records
        .slice()
        .sort((a, b) => a.mtimeMs - b.mtimeMs),
    }))
    .sort((a, b) => a.project.canonicalCwd.localeCompare(b.project.canonicalCwd));

  return {
    date: isoDate,
    windowStartMs,
    windowEndMs,
    groups,
    skippedCount: skipped,
  };
}
