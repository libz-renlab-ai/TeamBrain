// BPP mining — transcript→MiningInput extractor + un-mined cursor.
//
// Spec: docs/plans/2026-05-13-bpp-full-system-acceptance.md §里程碑三 line 135
// ("从中心对话仓库里拉取还没挖过的对话记录").
// Plan: docs/plans/2026-05-14-bpp-m3-acceptance-verify/judge.md §V1.A.2.
//
// The M2 conversation repo lays cc-session transcripts out as
// `<repoDir>/<user>/<date>/<session_id>.jsonl` (see mock-server.ts). This
// module is the bridge from that on-disk tree to the in-memory `MiningInput`
// the three miners consume:
//
//   listConversationSessions(repoDir)  — walk the tree, one SessionRef per file
//   readMinedCursor / writeMinedCursor — the un-mined cursor (a.k.a. mining
//                                        ledger): which sessions a prior run
//                                        already mined
//   filterUnmined(sessions, cursor)    — keep only sessions NOT already mined
//   extractMiningInput(sessions)       — parse each transcript and build the
//                                        correction_moments / session_summaries
//                                        bundle; git_log is [] (no GitActivity
//                                        producer exists yet — the M3 plan PR
//                                        documents `git_log: []` as valid input)
//
// Determinism: every walk + emit is explicitly sorted so two runs over the
// same repo produce byte-identical output (D1 of the M3 acceptance harness).

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseSessionFile, ruleBasedCorrectionDetector } from '@teamagent/core';
import type { BpTopic } from '../types.js';

/** The parsed-transcript shape `@teamagent/core` produces — derived from the
 *  parser's return type so digital-twin needs no direct `@teamagent/types` dep. */
type ParsedSession = ReturnType<typeof parseSessionFile>;
import type {
  CorrectionMoment,
  SessionSummary,
  MiningInput,
} from './mining-types.js';

/** One cc-session transcript located in the conversation repo tree. */
export interface SessionRef {
  /** Canonical id — the transcript filename minus `.jsonl`. */
  session_id: string;
  /** The repo's first-level directory name (the M2 server's `safeUserId`). */
  user_id: string;
  /** No display name lands on disk; the user_id doubles as the display name. */
  user_display: string;
  /** The `<date>` directory (`YYYY-MM-DD`). */
  date: string;
  /** Absolute path to the `.jsonl` transcript. */
  file_path: string;
}

/**
 * The un-mined cursor — the set of session ids a prior mining run already
 * consumed. Persisted as `<stateDir>/mined-cursor.json` so the next run only
 * mines sessions it has not seen ("还没挖过的对话记录").
 */
export interface MinedCursor {
  mined_session_ids: string[];
}

export const MINED_CURSOR_FILE = 'mined-cursor.json';

/**
 * Walk `<repoDir>/<user>/<date>/*.jsonl` and return one SessionRef per
 * transcript. Reserved `_`-prefixed dirs (`_inbox`, `_bp`, `_audit`, `_team`)
 * and non-`.jsonl` sidecars (`<id>.meta.json`, `quota.json`) are skipped.
 * Output is sorted by (user_id, date, session_id) — never `readdirSync` order.
 */
export function listConversationSessions(repoDir: string): SessionRef[] {
  const refs: SessionRef[] = [];
  if (!existsSync(repoDir)) return refs;
  for (const userName of readdirSync(repoDir).sort()) {
    if (userName.startsWith('_')) continue;
    const userDir = join(repoDir, userName);
    if (!isDir(userDir)) continue;
    for (const dateName of readdirSync(userDir).sort()) {
      const dateDir = join(userDir, dateName);
      if (!isDir(dateDir)) continue;
      for (const fileName of readdirSync(dateDir).sort()) {
        if (!fileName.endsWith('.jsonl')) continue;
        refs.push({
          session_id: fileName.slice(0, -'.jsonl'.length),
          user_id: userName,
          user_display: userName,
          date: dateName,
          file_path: join(dateDir, fileName),
        });
      }
    }
  }
  return refs;
}

/** Read the un-mined cursor; a missing or corrupt ledger reads as empty. */
export function readMinedCursor(stateDir: string): MinedCursor {
  const file = join(stateDir, MINED_CURSOR_FILE);
  if (!existsSync(file)) return { mined_session_ids: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<MinedCursor>;
    const ids = Array.isArray(parsed.mined_session_ids)
      ? parsed.mined_session_ids.filter((x): x is string => typeof x === 'string')
      : [];
    return { mined_session_ids: dedupeSorted(ids) };
  } catch {
    return { mined_session_ids: [] };
  }
}

/** Persist the un-mined cursor (deduped + sorted for byte-stable output). */
export function writeMinedCursor(stateDir: string, cursor: MinedCursor): void {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, MINED_CURSOR_FILE);
  const payload: MinedCursor = {
    mined_session_ids: dedupeSorted(cursor.mined_session_ids),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

/** Keep only sessions whose id is NOT already recorded in the cursor. */
export function filterUnmined(
  sessions: SessionRef[],
  cursor: MinedCursor,
): SessionRef[] {
  const mined = new Set(cursor.mined_session_ids);
  return sessions.filter((s) => !mined.has(s.session_id));
}

/**
 * Normalize a correction's free text into a stable grouping signal. The
 * correction-adapter groups moments by `(user_id, signal)`, so two sessions
 * carrying the *same* correction must normalize to the *same* string. Lower-
 * cases, strips punctuation (Unicode-aware — CJK letters and digits survive),
 * and collapses whitespace.
 */
export function normalizeSignal(correctionText: string): string {
  return correctionText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse every SessionRef's transcript and build the `MiningInput` bundle:
 *   - correction_moments — `ruleBasedCorrectionDetector` output, mapped from
 *     core's CorrectionMoment shape to the mining shape; moments whose
 *     normalized signal is empty (e.g. a silent multi-failure turn) are
 *     dropped — they are not actionable best-practices.
 *   - session_summaries — one per session, `actions` derived from tool calls.
 *   - git_log — always `[]`; no GitActivity producer exists yet.
 *
 * Output arrays are sorted so the bundle is byte-stable across runs.
 */
export function extractMiningInput(sessions: SessionRef[]): MiningInput {
  const correction_moments: CorrectionMoment[] = [];
  const session_summaries: SessionSummary[] = [];

  for (const ref of sessions) {
    const parsed = parseSessionFile(readFileSync(ref.file_path, 'utf8'));

    for (const cm of ruleBasedCorrectionDetector.detect(parsed)) {
      const signal = normalizeSignal(cm.correctionText);
      if (signal.length === 0) continue;
      correction_moments.push({
        session_id: ref.session_id,
        user_id: ref.user_id,
        user_display: ref.user_display,
        signal,
        text: cm.correctionText,
        topic: inferTopic(cm.correctionText),
        timestamp: cm.timestamp || `${ref.date}T00:00:00Z`,
      });
    }

    session_summaries.push({
      session_id: ref.session_id,
      user_id: ref.user_id,
      user_display: ref.user_display,
      actions: deriveActions(parsed),
      started_at: parsed.startTime || `${ref.date}T00:00:00Z`,
      ended_at: parsed.endTime || `${ref.date}T00:00:00Z`,
    });
  }

  correction_moments.sort((a, b) =>
    keyOf(a.user_id, a.session_id, a.signal, a.timestamp).localeCompare(
      keyOf(b.user_id, b.session_id, b.signal, b.timestamp),
    ),
  );
  session_summaries.sort((a, b) =>
    keyOf(a.user_id, a.session_id).localeCompare(keyOf(b.user_id, b.session_id)),
  );

  return { correction_moments, session_summaries, git_log: [] };
}

// ── internals ─────────────────────────────────────────────────────────────

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function dedupeSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function keyOf(...parts: string[]): string {
  return parts.join(' ');
}

/** Topic inference from correction / pattern text — deterministic keyword scan. */
function inferTopic(text: string): BpTopic {
  const t = text.toLowerCase();
  if (/test|测试|vitest|jest|spec\b/.test(t)) return 'testing';
  if (/commit|git|branch|分支|merge|rebase|\bpush\b|\bpr\b/.test(t)) return 'git-flow';
  if (/context|compact|checkpoint|上下文|备份|backup/.test(t)) return 'ctx-mgmt';
  if (/style|lint|format|naming|命名|格式|风格/.test(t)) return 'code-style';
  return 'ai-collab';
}

/** Tool name → high-level action label the miners recognise. */
const TOOL_TO_ACTION: Record<string, string> = {
  Read: 'read_file',
  Edit: 'edit_file',
  Write: 'write_file',
  Glob: 'search',
  Grep: 'search',
};

/** A Bash tool call's action depends on the command it ran. */
function bashAction(input: Record<string, unknown>): string {
  const cmd = typeof input.command === 'string' ? input.command.toLowerCase() : '';
  if (/\bgit\s+commit\b/.test(cmd)) return 'commit';
  if (/\b(vitest|jest|pnpm\s+test|npm\s+test|pnpm\s+vitest|go\s+test)\b/.test(cmd)) {
    return 'run_test';
  }
  if (/\bgh\s+pr\s+create\b/.test(cmd)) return 'open_pr';
  return 'run_command';
}

/** True when a user turn is a context checkpoint (`/compact`, `<checkpoint>`). */
function isCheckpointTurn(userMessage: string): boolean {
  const m = userMessage.trim();
  return /^\/compact\b/.test(m) || /<checkpoint>/i.test(m);
}

/**
 * Ordered action labels observed across a session — checkpoint markers plus
 * one label per tool call, in turn order. Feeds behavior-miner (before-X-
 * always-Y) and context-pattern-miner (checkpoint cadence).
 */
function deriveActions(parsed: ParsedSession): string[] {
  const actions: string[] = [];
  for (const turn of parsed.turns) {
    if (isCheckpointTurn(turn.userMessage)) actions.push('checkpoint');
    for (const tc of turn.toolCalls) {
      if (tc.name === 'Bash') {
        actions.push(bashAction(tc.input));
      } else {
        actions.push(TOOL_TO_ACTION[tc.name] ?? 'run_command');
      }
    }
  }
  return actions;
}
