/**
 * Issue #350 — pure helpers for assembling a {@link CcStatusSnapshot}.
 *
 * Everything here is a pure function: no `fs`, no clock except what the caller
 * injects via `nowMs`. The impure shell (the statusline `.cjs` and any hook
 * entry that wires this up) reads the transcript files / quota cache / git
 * branch and feeds the parsed values in. This mirrors the field-computation
 * already shipped in `scripts/teamagent-statusline.cjs` (#337) — that file
 * stays standalone (it can't import a workspace package), so treat this module
 * as the canonical spec the statusline parallels.
 */
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcSessionHealth,
  type CcStatusSnapshot,
} from './types.js';

/** 200K-token context budget — the threshold CC's `exceeds_200k_tokens` flags. */
export const CONTEXT_BUDGET_TOKENS = 200_000;
export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Throttle predicate shared by every push site. Returns true when at least
 * `minIntervalMs` has elapsed since the last push (or there was none). A
 * `minIntervalMs <= 0` means "always push" (the grill's low-frequency hooks);
 * a positive value (e.g. 30_000) gates the high-frequency sites
 * (statusline / PreToolUse / PostToolUse).
 */
export function shouldPush(
  lastPushMs: number | null | undefined,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  if (minIntervalMs <= 0) return true;
  if (typeof lastPushMs !== 'number' || !Number.isFinite(lastPushMs)) return true;
  return nowMs - lastPushMs >= minIntervalMs;
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Sum of input + cache_creation + cache_read tokens for a `message.usage` block. */
function inputTokens(usage: Record<string, unknown> | undefined): number {
  if (!usage) return 0;
  return (
    (numOrUndef(usage.input_tokens) ?? 0) +
    (numOrUndef(usage.cache_creation_input_tokens) ?? 0) +
    (numOrUndef(usage.cache_read_input_tokens) ?? 0)
  );
}

/** Total tokens (input families + output) for a `message.usage` block. */
function turnTokens(usage: Record<string, unknown> | undefined): number {
  return inputTokens(usage) + (numOrUndef(usage?.output_tokens) ?? 0);
}

const EDIT_TOOL_NAMES = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'str_replace_editor',
  'str_replace_based_edit_tool',
]);

function fileFromToolInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const o = input as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'notebook_path', 'filePath']) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export interface TranscriptMetrics {
  /** input+cache tokens of the latest assistant turn (current context size). */
  contextTokens?: number;
  /** model id of the latest assistant turn. */
  model?: string;
  /** number of assistant turns seen. */
  turnCount: number;
  /** number of tool_use blocks across all assistant turns. */
  toolCallsTotal: number;
  /** number of tool_result blocks flagged `is_error: true`. */
  toolCallsFailed: number;
  /** count of distinct file paths touched by Write/Edit-family tools. */
  filesTouched: number;
  /** ISO timestamp of the earliest transcript line that carries one. */
  sessionStartedAt?: string;
  /** rolling token sums; pass `nowMs` to compute. */
  tokens5h?: number;
  tokens7d?: number;
}

/**
 * Parse Claude Code transcript JSONL lines into the aggregates the snapshot
 * needs. Robust to junk: a line that isn't a JSON object, or is missing the
 * fields we look for, is skipped silently. `nowMs` anchors the 5h/7d windows;
 * pass the same set of lines you'd give the statusline (the current session's
 * transcript is enough for context/model/turns/tools/files; pass concatenated
 * recent-file lines if you also want accurate cross-session 5h/7d windows).
 */
export function parseTranscriptLines(
  lines: readonly string[],
  nowMs: number,
): TranscriptMetrics {
  let contextTokens: number | undefined;
  let model: string | undefined;
  let turnCount = 0;
  let toolCallsTotal = 0;
  let toolCallsFailed = 0;
  const files = new Set<string>();
  let earliestTs: number | undefined;
  let earliestIso: string | undefined;
  let tokens5h = 0;
  let tokens7d = 0;
  let sawWindowed = false;
  const cutoff5h = nowMs - FIVE_HOURS_MS;
  const cutoff7d = nowMs - SEVEN_DAYS_MS;

  for (const raw of lines) {
    const line = typeof raw === 'string' ? raw.trim() : '';
    if (line.length === 0 || line[0] !== '{') continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const tsRaw = obj.timestamp;
    const tsMs = typeof tsRaw === 'string' ? Date.parse(tsRaw) : NaN;
    if (Number.isFinite(tsMs)) {
      if (earliestTs === undefined || tsMs < earliestTs) {
        earliestTs = tsMs;
        earliestIso = typeof tsRaw === 'string' ? tsRaw : undefined;
      }
    }

    const message = obj.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    const isAssistant =
      obj.type === 'assistant' || message?.role === 'assistant';

    if (isAssistant) {
      turnCount += 1;
      if (usage) contextTokens = inputTokens(usage);
      const m = message?.model;
      if (typeof m === 'string' && m.trim().length > 0) model = m.trim();
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue;
          const b = block as Record<string, unknown>;
          if (b.type === 'tool_use') {
            toolCallsTotal += 1;
            if (EDIT_TOOL_NAMES.has(String(b.name))) {
              const f = fileFromToolInput(b.input);
              if (f) files.add(f);
            }
          }
        }
      }
    }

    // tool_result blocks live on user turns (role: 'user').
    const userContent = (message?.role === 'user' || obj.type === 'user')
      ? message?.content
      : undefined;
    if (Array.isArray(userContent)) {
      for (const block of userContent) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_result' && b.is_error === true) toolCallsFailed += 1;
      }
    }

    if (usage && Number.isFinite(tsMs)) {
      const t = turnTokens(usage);
      if (tsMs >= cutoff7d) {
        tokens7d += t;
        sawWindowed = true;
      }
      if (tsMs >= cutoff5h) tokens5h += t;
    }
  }

  return {
    contextTokens,
    model,
    turnCount,
    toolCallsTotal,
    toolCallsFailed,
    filesTouched: files.size,
    sessionStartedAt: earliestIso,
    tokens5h: sawWindowed ? tokens5h : undefined,
    tokens7d: sawWindowed ? tokens7d : undefined,
  };
}

/** The subset of {@link import('../quota/state.js')} cache fields the snapshot carries. */
export interface QuotaSnapshotInput {
  subscription_tier?: unknown;
  five_hour_utilization?: unknown;
  seven_day_utilization?: unknown;
  five_hour_reset_at?: unknown;
  seven_day_reset_at?: unknown;
  /** quota cache marks failed-probe reads with `stale: true`. */
  stale?: unknown;
}

export interface BuildCcStatusInput {
  sessionId: string;
  userId: string;
  event: string;
  /** client clock in ms — also stamped as `ts`. */
  nowMs: number;
  displayName?: string;
  machineId?: string;
  cwd?: string;
  gitBranch?: string;
  /** from the CC statusline stdin payload. */
  model?: string;
  costUsd?: number;
  /** CC's `exceeds_200k_tokens` boolean; drives `session_health` when present. */
  exceeds200k?: boolean;
  /** parsed transcript aggregates (see {@link parseTranscriptLines}). */
  transcript?: TranscriptMetrics;
  /** parsed quota cache block (issue #283). */
  quota?: QuotaSnapshotInput | null;
}

/**
 * Assemble the wire snapshot. Required fields are always present; optional
 * fields are only included when a usable value was supplied (so the server
 * persists "unknown" as *absent*, never as a misleading 0 / empty string).
 * `session_health` is derived from `exceeds200k` first, falling back to
 * `context_tokens > 200_000` when CC didn't pass the flag.
 */
export function buildCcStatusSnapshot(input: BuildCcStatusInput): CcStatusSnapshot {
  const t = input.transcript ?? ({} as TranscriptMetrics);
  const contextTokens = numOrUndef(t.contextTokens);

  let health: CcSessionHealth | undefined;
  if (input.exceeds200k === true) health = 'OVER_200K';
  else if (input.exceeds200k === false) health = 'OK';
  else if (typeof contextTokens === 'number') {
    health = contextTokens > CONTEXT_BUDGET_TOKENS ? 'OVER_200K' : 'OK';
  }

  const snap: CcStatusSnapshot = {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: input.sessionId,
    user_id: input.userId,
    ts: new Date(input.nowMs).toISOString(),
    event: input.event,
  };

  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (displayName) snap.display_name = displayName;
  if (typeof input.machineId === 'string' && input.machineId) snap.machine_id = input.machineId;
  if (typeof input.cwd === 'string' && input.cwd) snap.cwd = input.cwd;
  if (typeof input.gitBranch === 'string' && input.gitBranch) snap.git_branch = input.gitBranch;

  const model = typeof input.model === 'string' ? input.model.trim() : (t.model ?? '');
  if (model) snap.model = model;
  if (typeof contextTokens === 'number') {
    snap.context_tokens = contextTokens;
    snap.context_pct = Math.round((contextTokens / CONTEXT_BUDGET_TOKENS) * 1000) / 1000;
  }
  if (health) snap.session_health = health;
  const cost = numOrUndef(input.costUsd);
  if (typeof cost === 'number' && cost >= 0) snap.cost_usd = cost;
  const tokens5h = numOrUndef(t.tokens5h);
  if (typeof tokens5h === 'number') snap.tokens_5h = tokens5h;
  const tokens7d = numOrUndef(t.tokens7d);
  if (typeof tokens7d === 'number') snap.tokens_7d = tokens7d;

  const q = input.quota;
  if (q && typeof q === 'object') {
    if (typeof q.subscription_tier === 'string' && q.subscription_tier) {
      snap.subscription_tier = q.subscription_tier;
    }
    const f5u = numOrUndef(q.five_hour_utilization);
    if (typeof f5u === 'number') snap.five_hour_utilization = f5u;
    const s7u = numOrUndef(q.seven_day_utilization);
    if (typeof s7u === 'number') snap.seven_day_utilization = s7u;
    const f5r = numOrUndef(q.five_hour_reset_at);
    if (typeof f5r === 'number') snap.five_hour_reset_at = f5r;
    const s7r = numOrUndef(q.seven_day_reset_at);
    if (typeof s7r === 'number') snap.seven_day_reset_at = s7r;
    if (typeof q.stale === 'boolean') snap.quota_stale = q.stale;
  }

  const turnCount = numOrUndef(t.turnCount);
  if (typeof turnCount === 'number') snap.turn_count = turnCount;
  const toolTotal = numOrUndef(t.toolCallsTotal);
  if (typeof toolTotal === 'number') snap.tool_calls_total = toolTotal;
  const toolFailed = numOrUndef(t.toolCallsFailed);
  if (typeof toolFailed === 'number') snap.tool_calls_failed = toolFailed;
  const filesTouched = numOrUndef(t.filesTouched);
  if (typeof filesTouched === 'number') snap.files_touched = filesTouched;
  if (typeof t.sessionStartedAt === 'string' && t.sessionStartedAt) {
    snap.session_started_at = t.sessionStartedAt;
  }

  return snap;
}
