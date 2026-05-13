/**
 * Issue #350 — CC runtime status snapshot.
 *
 * A single point-in-time picture of one Claude Code instance: model, context
 * usage, cost, rolling token windows, session health, quota utilization, and a
 * few output-volume aggregates. Pushed to `POST /v1/cc-status` and served back
 * (latest / history) over `GET /api/cc-status*` so downstream projects can pull
 * "what is this teammate's CC doing right now" without screen-scraping a
 * statusline. This is the F2-D deliverable of epic #335 — it consumes the
 * field-computation work shipped in #337 (`scripts/teamagent-statusline.cjs`)
 * and turns it into a server-queryable data model.
 *
 * Wire shape (`POST /v1/cc-status` body):
 *
 *   { ...CcStatusSnapshot }   // a flat JSON object, NOT gzipped, NOT enveloped
 *
 * The transport is deliberately lighter than `/v1/cc-sessions` (which keeps
 * uploading gzipped transcript JSONL — the learning loop + Feature #3 video
 * depend on it). A dropped cc-status snapshot is fine; the next hook re-pushes.
 */

/** Bump when the snapshot shape changes in a non-additive way. */
export const CC_STATUS_SCHEMA_VERSION = 1 as const;

export type CcSessionHealth = 'OK' | 'OVER_200K';

/**
 * One status snapshot. Only `schema_version`, `session_id`, `user_id`, `ts`
 * and `event` are required; every other field is best-effort and omitted when
 * the source data isn't available (e.g. quota probe never ran, transcript not
 * yet flushed, `cost`/`model` missing from the CC stdin payload). Consumers
 * must treat missing fields as "unknown", not "zero".
 */
export interface CcStatusSnapshot {
  schema_version: typeof CC_STATUS_SCHEMA_VERSION;
  /** Claude Code session id — the per-session join key. */
  session_id: string;
  /** digital-twin identity user_id — the per-user join key (matches transcripts/quota). */
  user_id: string;
  /** ISO-8601 timestamp this snapshot was produced (client clock). */
  ts: string;
  /** Which CC hook produced this snapshot ("Status" for the statusline, "Stop", "PreToolUse", ...). */
  event: string;

  // ---- identity / location ----
  /** Optional human-friendly name; clients fall back to user_id when unset. */
  display_name?: string;
  /** Disambiguates one person on two machines. */
  machine_id?: string;
  /** Working directory of the CC session. */
  cwd?: string;
  /** Current git branch of `cwd`, if it's a repo. */
  git_branch?: string;

  // ---- model + context (from CC stdin / transcript) ----
  model?: string;
  /** input + cache_creation + cache_read tokens of the latest assistant turn. */
  context_tokens?: number;
  /** context_tokens / 200000 (can exceed 1). */
  context_pct?: number;
  session_health?: CcSessionHealth;
  /** total cost in USD reported by CC for this session. */
  cost_usd?: number;
  /** sum of assistant turn tokens in the last 5 hours (rolling). */
  tokens_5h?: number;
  /** sum of assistant turn tokens in the last 7 days (rolling). */
  tokens_7d?: number;

  // ---- quota (from ~/.teamagent/digital-twin/quota-cache.json, issue #283) ----
  subscription_tier?: string;
  five_hour_utilization?: number;
  seven_day_utilization?: number;
  five_hour_reset_at?: number;
  seven_day_reset_at?: number;
  /** true when the quota figures came from a stale cache (probe failed). */
  quota_stale?: boolean;

  // ---- output volume (one transcript scan) ----
  turn_count?: number;
  tool_calls_total?: number;
  tool_calls_failed?: number;
  files_touched?: number;
  /** ISO timestamp of the first transcript line for this session. */
  session_started_at?: string;

  // ---- raw prompt evidence (issue #308, grill §3) ----
  /**
   * Raw user prompt text captured at UserPromptSubmit. Privacy-sensitive:
   * client side ONLY threads this when `TEAMAGENT_REALTIME_RAW_PROMPT=1` is
   * set; default behavior leaves it `undefined` so a leaked / misconfigured
   * receiver URL never exfiltrates prompt content. The receiver may
   * persist this to a `raw_events` table for evidence / replay; downstream
   * pipelines generate normalized_event summaries from it. Other event
   * kinds (session_start / stop / session_end / status) leave this unset.
   */
  raw_prompt?: string;
}

/**
 * What `GET /api/cc-status*` returns: the stored snapshot plus a freshness
 * marker computed at query time (`now - ts`, floored at 0). Snapshots older
 * than the client's push cadence will have a large `stale_seconds`.
 */
export interface CcStatusQueryRow extends CcStatusSnapshot {
  stale_seconds: number;
}
