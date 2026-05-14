// PR-M3A — transcript→MiningInput extractor + un-mined cursor.
//
// Verifies the layer that turns the M2 conversation repo
// (`<repo>/<user>/<date>/*.jsonl`) into the `MiningInput` the three miners
// consume, plus the cursor that tracks which sessions a prior run already
// mined. Determinism is asserted explicitly — the extractor feeds D1 of the
// M3 acceptance harness (two identical runs → identical pools).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listConversationSessions,
  extractMiningInput,
  normalizeSignal,
  readMinedCursor,
  writeMinedCursor,
  filterUnmined,
  type SessionRef,
} from '../transcript-extractor.js';

/** One jsonl line of a Claude Code transcript (the shape parseSessionFile reads). */
function userLine(ts: string, content: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: ts,
    message: { role: 'user', content },
  });
}
function assistantLine(
  ts: string,
  text: string,
  tools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [],
): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text },
        ...tools.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input })),
      ],
    },
  });
}

/** A 2-turn transcript: turn 0 (with one Edit tool) then a `不对` correction turn. */
function correctionTranscript(date: string, correction: string): string {
  return [
    userLine(`${date}T09:00:00Z`, '帮我改一下数据库 schema'),
    assistantLine(`${date}T09:00:05Z`, '好的，我直接改', [
      { id: 't1', name: 'Edit', input: { file_path: 'db.sql' } },
    ]),
    userLine(`${date}T09:01:00Z`, correction),
    assistantLine(`${date}T09:01:05Z`, '明白了'),
  ].join('\n');
}

function seedRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'm3a-repo-'));
  const alice = 'alice@example.com';
  // two sessions, same correction phrasing → must share one normalized signal
  const aliceDir = join(repo, alice, '2026-05-10');
  mkdirSync(aliceDir, { recursive: true });
  writeFileSync(
    join(aliceDir, 'sess-a1.jsonl'),
    correctionTranscript('2026-05-10', '不对，数据库改动前先备份'),
  );
  writeFileSync(
    join(aliceDir, 'sess-a2.jsonl'),
    correctionTranscript('2026-05-10', '不对，数据库改动前先备份'),
  );
  // sidecars + a reserved `_`-prefixed dir that the walk must skip
  writeFileSync(join(aliceDir, 'sess-a1.meta.json'), '{"l1_redaction_count":2}');
  writeFileSync(join(aliceDir, 'quota.json'), '{}');
  mkdirSync(join(repo, '_inbox', 'bob', '2026-05-10'), { recursive: true });
  writeFileSync(join(repo, '_inbox', 'bob', '2026-05-10', 'items.jsonl'), '{}\n');
  return repo;
}

describe('transcript-extractor — listConversationSessions', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('walks <repo>/<user>/<date>/*.jsonl, skipping sidecars and _-dirs', () => {
    const repo = seedRepo();
    dirs.push(repo);
    const sessions = listConversationSessions(repo);
    expect(sessions.map((s) => s.session_id)).toEqual(['sess-a1', 'sess-a2']);
    expect(sessions.every((s) => s.user_id === 'alice@example.com')).toBe(true);
    expect(sessions.every((s) => s.date === '2026-05-10')).toBe(true);
    // .meta.json / quota.json / _inbox are never returned
    expect(sessions.some((s) => s.session_id.includes('meta'))).toBe(false);
    expect(sessions.some((s) => s.session_id.includes('quota'))).toBe(false);
  });

  it('returns a stable sorted order regardless of filesystem enumeration', () => {
    const repo = seedRepo();
    dirs.push(repo);
    const a = listConversationSessions(repo);
    const b = listConversationSessions(repo);
    expect(a).toEqual(b);
  });
});

describe('transcript-extractor — extractMiningInput', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('builds correction_moments, session_summaries and an empty git_log', () => {
    const repo = seedRepo();
    dirs.push(repo);
    const sessions = listConversationSessions(repo);
    const input = extractMiningInput(sessions);

    // one correction moment per session, both sharing one normalized signal
    expect(input.correction_moments).toHaveLength(2);
    const signals = new Set(input.correction_moments.map((m) => m.signal));
    expect(signals.size).toBe(1);
    expect(input.correction_moments[0]!.text).toBe('不对，数据库改动前先备份');
    expect(input.correction_moments[0]!.user_id).toBe('alice@example.com');

    // one session summary per session, actions derived from tool calls
    expect(input.session_summaries).toHaveLength(2);
    expect(input.session_summaries[0]!.actions).toContain('edit_file');

    // git_log is empty by design — no GitActivity producer exists yet
    // (M3 plan PR documents this as a valid input shape).
    expect(input.git_log).toEqual([]);
  });

  it('is deterministic — same sessions in, byte-identical input out', () => {
    const repo = seedRepo();
    dirs.push(repo);
    const sessions = listConversationSessions(repo);
    const a = extractMiningInput(sessions);
    const b = extractMiningInput([...sessions].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('transcript-extractor — normalizeSignal', () => {
  it('collapses whitespace and strips punctuation deterministically', () => {
    expect(normalizeSignal('不对，先备份')).toBe(normalizeSignal('不对  ，  先备份 '));
    expect(normalizeSignal('Use Pino, NOT winston!')).toBe('use pino not winston');
  });

  it('keeps CJK letters and digits', () => {
    expect(normalizeSignal('先跑 test 再 commit（123）')).toBe('先跑 test 再 commit 123');
  });
});

describe('transcript-extractor — un-mined cursor', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('reads an empty cursor when no ledger file exists', () => {
    const state = mkdtempSync(join(tmpdir(), 'm3a-state-'));
    dirs.push(state);
    expect(readMinedCursor(state)).toEqual({ mined_session_ids: [] });
  });

  it('round-trips through disk, deduped and sorted', () => {
    const state = mkdtempSync(join(tmpdir(), 'm3a-state-'));
    dirs.push(state);
    writeMinedCursor(state, { mined_session_ids: ['sess-b', 'sess-a', 'sess-b'] });
    expect(readMinedCursor(state)).toEqual({ mined_session_ids: ['sess-a', 'sess-b'] });
  });

  it('filterUnmined drops sessions already in the cursor', () => {
    const refs: SessionRef[] = [
      { session_id: 'sess-a1', user_id: 'u', user_display: 'u', date: '2026-05-10', file_path: '/x' },
      { session_id: 'sess-a2', user_id: 'u', user_display: 'u', date: '2026-05-10', file_path: '/y' },
    ];
    const left = filterUnmined(refs, { mined_session_ids: ['sess-a1'] });
    expect(left.map((r) => r.session_id)).toEqual(['sess-a2']);
  });
});
