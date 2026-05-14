#!/usr/bin/env node
/**
 * BPP transcript purge cron entry — Phase 5 P5.2.
 *
 * Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.1
 * (30-day transcript retention) + §6.2 (auto-cleanup of session jsonl after
 * member leaves team).
 *
 * Standalone bin invoked by `tsx` (dev) or compiled `node` (prod) from a daily
 * cron / systemd timer / Windows Task Scheduler. See
 * docs/bpp/cron-deploy.md for OS-specific schedule wiring.
 *
 * Env vars:
 *   BPP_OUTPUT_DIR   absolute path to the BPP collector root (required)
 *   BPP_RETAIN_DAYS  integer days to retain (default 30)
 *
 * Side effects:
 *   - Calls purgeStaleTranscripts() to delete stale *.jsonl + *.cc-status.jsonl
 *     files. _bp / _inbox / _team / _audit namespaces are NEVER touched.
 *   - Prints `{purged_files, purged_users}` as a single JSON line to stdout
 *     (so it can be captured by `journalctl` / Task Scheduler logs).
 *   - Appends a single audit log line to <root>/_audit/<YYYY-MM-DD>.jsonl IF
 *     that directory already exists (we do NOT create it — the purge job is
 *     a passive consumer; the audit log is owned by the receiver process).
 */
import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { purgeStaleTranscripts, type PurgeResult } from './bpp/transcript-purge.js';

const DEFAULT_RETAIN_DAYS = 30;

export interface RunPurgeCronDeps {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface RunPurgeCronResult extends PurgeResult {
  /** Resolved root dir (after env / default expansion). */
  rootDir: string;
  /** Retention days actually applied (after env / default expansion). */
  retainDays: number;
  /** Whether an audit-log line was written. */
  auditWritten: boolean;
}

function parseRetainDays(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_RETAIN_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `[bpp-purge-cron] invalid BPP_RETAIN_DAYS='${raw}' — must be a non-negative integer`,
    );
  }
  return n;
}

/**
 * Pure, testable entry. Returns the purge result plus a few resolved-config
 * fields so unit tests can assert env handling without re-deriving them.
 */
export function runPurgeCron(deps: RunPurgeCronDeps = {}): RunPurgeCronResult {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const stdout = deps.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = deps.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const rootRaw = env.BPP_OUTPUT_DIR;
  if (!rootRaw) {
    throw new Error(
      '[bpp-purge-cron] BPP_OUTPUT_DIR is required (path to BPP collector root)',
    );
  }
  const rootDir = resolvePath(rootRaw);
  const retainDays = parseRetainDays(env.BPP_RETAIN_DAYS);

  const result = purgeStaleTranscripts(rootDir, now, retainDays);
  const summary = {
    purged_files: result.purged_files,
    purged_users: result.purged_users,
  };
  stdout(JSON.stringify(summary));

  // Audit log: only write if _audit/ already exists. We do NOT mkdir it —
  // the audit dir is owned by the receiver process (see bpp/store.ts:appendAudit).
  // Writing into a non-existent _audit would mean we're creating audit state
  // for a directory that has never seen a real bp-push, which is wrong.
  let auditWritten = false;
  const auditDir = resolvePath(rootDir, '_audit');
  if (existsSync(auditDir)) {
    try {
      const st = statSync(auditDir);
      if (st.isDirectory()) {
        const iso = now.toISOString();
        const date = iso.slice(0, 10);
        const auditFile = resolvePath(auditDir, `${date}.jsonl`);
        // Match the existing audit JSONL shape loosely: timestamp + type + payload.
        // Not a hash-chained event — purge is a job-level marker, not a PushEvent.
        const line =
          JSON.stringify({
            timestamp: iso,
            type: 'purge_cron',
            purged_files: result.purged_files,
            purged_users: result.purged_users,
            retain_days: retainDays,
          }) + '\n';
        // Best-effort dir guard (race with concurrent rmdir → bail out).
        if (!existsSync(auditDir)) {
          // Was removed between existsSync check and write — skip the audit.
        } else {
          // Defensive: ensure dir is present (idempotent if already exists).
          mkdirSync(auditDir, { recursive: true });
          appendFileSync(auditFile, line, 'utf8');
          auditWritten = true;
        }
      }
    } catch (err) {
      stderr(
        `[bpp-purge-cron] audit-log write failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {
    ...result,
    rootDir,
    retainDays,
    auditWritten,
  };
}

// Auto-run guard — mirrors bin-prod-server.ts:51. Only fire when invoked as a
// script (not when imported by tests).
const argv1 = process.argv[1] ?? '';
if (argv1.includes('bin-purge-cron')) {
  try {
    runPurgeCron();
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[bpp-purge-cron] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
