// M2 (对话上传通道) — member self-view stats.
//
// §里程碑二 功能验收: "成员可以查看自己的『已上传对话总量、最近一次上传时间、
// 敏感字段被模糊化次数』". This computes those three numbers on demand by
// walking the existing `<outputDir>/<user>/<date>/` tree — there is no
// running counter to drift or race.
//
// `uploaded_total`   — count of `<id>.jsonl` transcripts across all dates.
// `last_upload_at`   — ISO timestamp of the most recently modified transcript.
// `redaction_count`  — sum of L1 (uploader) + L2 (server) redaction counts,
//                      read from the per-session `<id>.meta.json` sidecars
//                      written by the cc-session POST handler.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { safeUserId } from './cc-status/path-safety.js';

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface MemberStats {
  user_id: string;
  /** Count of uploaded conversation transcripts (`<id>.jsonl`). */
  uploaded_total: number;
  /** ISO timestamp of the most recent transcript, or null if none uploaded. */
  last_upload_at: string | null;
  /** Total sensitive fields scrubbed (L1 uploader pass + L2 server pass). */
  redaction_count: number;
}

/**
 * Compute a member's upload stats by reading `<outputDir>/<userId>/<date>/`.
 * Unknown / never-uploaded users return zeroed stats (not an error) — a member
 * who has not worked yet still has a valid, all-zero view.
 */
export function computeMemberStats(outputDir: string, userId: string): MemberStats {
  const safe = safeUserId(userId);
  const userDir = join(outputDir, safe);

  let uploaded_total = 0;
  let redaction_count = 0;
  let latestMtimeMs = 0;

  if (existsSync(userDir)) {
    let dateNames: string[];
    try {
      dateNames = readdirSync(userDir);
    } catch {
      dateNames = [];
    }
    for (const dateName of dateNames) {
      if (!DATE_DIR_RE.test(dateName)) continue;
      const dateDir = join(userDir, dateName);
      let files: string[];
      try {
        files = readdirSync(dateDir);
      } catch {
        continue;
      }
      for (const fname of files) {
        if (!fname.endsWith('.jsonl')) continue;
        uploaded_total++;

        const jsonlPath = join(dateDir, fname);
        try {
          const mt = statSync(jsonlPath).mtimeMs;
          if (mt > latestMtimeMs) latestMtimeMs = mt;
        } catch {
          // unreadable transcript still counts toward the total
        }

        // Per-session redaction-count sidecar (`<id>.meta.json`). Absent when
        // the transcript carried no sensitive fields — treated as 0.
        const metaPath = join(
          dateDir,
          `${fname.slice(0, -'.jsonl'.length)}.meta.json`,
        );
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<
              string,
              unknown
            >;
            const l1 =
              typeof meta.l1_redaction_count === 'number'
                ? meta.l1_redaction_count
                : 0;
            const l2 =
              typeof meta.l2_redaction_count === 'number'
                ? meta.l2_redaction_count
                : 0;
            redaction_count += l1 + l2;
          } catch {
            // a malformed sidecar must not break the whole stats read
          }
        }
      }
    }
  }

  return {
    user_id: safe,
    uploaded_total,
    last_upload_at:
      latestMtimeMs > 0 ? new Date(latestMtimeMs).toISOString() : null,
    redaction_count,
  };
}
