// BPP transcript purge — Phase 5 P5.2.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.2
// + §6.3. After N days, scrub session transcripts but retain the distilled
// BestPractice gold copy. This is intended to run on a daily cron; this
// module only exposes the pure side-effecting routine. The wrapper that
// reads env vars / wires a setInterval lives elsewhere.
//
// Scan model: <rootDir>/<user>/<YYYY-MM-DD>/*.jsonl
//   - Top-level entries starting with `_` (e.g. _bp / _inbox / _team /
//     _audit) are skipped entirely — they are BPP-managed namespaces, NOT
//     transcripts.
//   - Date dirs whose name does not match YYYY-MM-DD or whose parsed date
//     is invalid are skipped (we never delete from dirs we cannot date).
//   - Inside a stale date dir, we only delete files ending in `.jsonl` or
//     `.cc-status.jsonl`. We do not recurse and we leave any other files
//     alone (e.g. a sentinel, a README, etc.).

import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export interface PurgeResult {
  purged_files: number;
  purged_users: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isTranscriptFile(name: string): boolean {
  return name.endsWith('.cc-status.jsonl') || name.endsWith('.jsonl');
}

function parseDate(name: string): Date | null {
  if (!DATE_RE.test(name)) return null;
  const d = new Date(`${name}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function purgeStaleTranscripts(
  rootDir: string,
  now: Date,
  retain_days: number,
): PurgeResult {
  if (!existsSync(rootDir)) {
    return { purged_files: 0, purged_users: [] };
  }
  const cutoffMs = now.getTime() - retain_days * 24 * 60 * 60 * 1000;
  const purgedUsers = new Set<string>();
  let purgedFiles = 0;

  let userDirs: string[] = [];
  try {
    userDirs = readdirSync(rootDir);
  } catch {
    return { purged_files: 0, purged_users: [] };
  }

  for (const userEntry of userDirs) {
    if (userEntry.startsWith('_')) continue; // _bp / _inbox / _team / _audit
    const userPath = resolvePath(rootDir, userEntry);
    let stat;
    try {
      stat = statSync(userPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let dateDirs: string[] = [];
    try {
      dateDirs = readdirSync(userPath);
    } catch {
      continue;
    }

    for (const dateEntry of dateDirs) {
      const parsed = parseDate(dateEntry);
      if (parsed === null) continue;
      if (parsed.getTime() >= cutoffMs) continue; // recent → keep

      const datePath = resolvePath(userPath, dateEntry);
      let files: string[] = [];
      try {
        files = readdirSync(datePath);
      } catch {
        continue;
      }
      for (const fname of files) {
        if (!isTranscriptFile(fname)) continue;
        const filePath = resolvePath(datePath, fname);
        // Defence in depth: ensure resolved path stays inside the date dir.
        if (!filePath.startsWith(datePath)) continue;
        try {
          rmSync(filePath, { force: true });
          purgedFiles += 1;
          purgedUsers.add(userEntry);
        } catch {
          // best-effort; skip the file
        }
      }
    }
  }

  return {
    purged_files: purgedFiles,
    purged_users: [...purgedUsers].sort(),
  };
}
