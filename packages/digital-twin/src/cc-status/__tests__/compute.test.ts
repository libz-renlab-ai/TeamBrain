import { describe, it, expect } from 'vitest';
import {
  shouldPush,
  parseTranscriptLines,
  buildCcStatusSnapshot,
  CONTEXT_BUDGET_TOKENS,
  FIVE_HOURS_MS,
} from '../compute.js';
import { CC_STATUS_SCHEMA_VERSION } from '../types.js';

const NOW = Date.parse('2026-05-12T12:00:00.000Z');

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('shouldPush', () => {
  it('always pushes when minIntervalMs <= 0', () => {
    expect(shouldPush(NOW, NOW, 0)).toBe(true);
    expect(shouldPush(NOW, NOW, -1)).toBe(true);
  });
  it('pushes when no prior push', () => {
    expect(shouldPush(null, NOW, 30_000)).toBe(true);
    expect(shouldPush(undefined, NOW, 30_000)).toBe(true);
    expect(shouldPush(Number.NaN, NOW, 30_000)).toBe(true);
  });
  it('throttles within the interval and releases after', () => {
    expect(shouldPush(NOW - 10_000, NOW, 30_000)).toBe(false);
    expect(shouldPush(NOW - 29_999, NOW, 30_000)).toBe(false);
    expect(shouldPush(NOW - 30_000, NOW, 30_000)).toBe(true);
    expect(shouldPush(NOW - 60_000, NOW, 30_000)).toBe(true);
  });
});

describe('parseTranscriptLines', () => {
  it('extracts model/context/turns/tools/files/started_at from a transcript', () => {
    const lines = [
      'not json',
      line({
        type: 'user',
        timestamp: '2026-05-12T11:00:00.000Z',
        message: { role: 'user', content: 'hi' },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-05-12T11:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-7',
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 30,
            output_tokens: 20,
          },
          content: [
            { type: 'text', text: 'doing it' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
            { type: 'tool_use', name: 'Write', input: { file_path: '/proj/a.ts' } },
          ],
        },
      }),
      line({
        type: 'user',
        timestamp: '2026-05-12T11:00:20.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
            { type: 'tool_result', tool_use_id: 't2', content: 'boom', is_error: true },
          ],
        },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-05-12T11:30:00.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-7',
          usage: {
            input_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 4000,
            output_tokens: 80,
          },
          content: [
            { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/a.ts' } },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/b.ts' } },
          ],
        },
      }),
    ];
    const m = parseTranscriptLines(lines, NOW);
    expect(m.model).toBe('claude-opus-4-7');
    // context = last assistant turn's input families = 200 + 0 + 4000
    expect(m.contextTokens).toBe(4200);
    expect(m.turnCount).toBe(2);
    expect(m.toolCallsTotal).toBe(4);
    expect(m.toolCallsFailed).toBe(1);
    // distinct edit-family files: a.ts, b.ts
    expect(m.filesTouched).toBe(2);
    expect(m.sessionStartedAt).toBe('2026-05-12T11:00:00.000Z');
    // both turns within 5h of NOW: (180+20) + (4280+80) = ... compute:
    // turn1 total = 100+50+30+20 = 200; turn2 total = 200+0+4000+80 = 4280
    expect(m.tokens5h).toBe(200 + 4280);
    expect(m.tokens7d).toBe(200 + 4280);
  });

  it('excludes old turns from the 5h window but keeps them in 7d', () => {
    const oldTs = new Date(NOW - FIVE_HOURS_MS - 60_000).toISOString();
    const recentTs = new Date(NOW - 60_000).toISOString();
    const lines = [
      line({
        type: 'assistant',
        timestamp: oldTs,
        message: { role: 'assistant', usage: { input_tokens: 1000, output_tokens: 0 } },
      }),
      line({
        type: 'assistant',
        timestamp: recentTs,
        message: { role: 'assistant', usage: { input_tokens: 7, output_tokens: 3 } },
      }),
    ];
    const m = parseTranscriptLines(lines, NOW);
    expect(m.tokens5h).toBe(10);
    expect(m.tokens7d).toBe(1010);
  });

  it('returns undefined windows when no timestamped usage seen', () => {
    const m = parseTranscriptLines(['{}', 'garbage', line({ type: 'system' })], NOW);
    expect(m.tokens5h).toBeUndefined();
    expect(m.tokens7d).toBeUndefined();
    expect(m.turnCount).toBe(0);
    expect(m.filesTouched).toBe(0);
  });
});

describe('buildCcStatusSnapshot', () => {
  const base = {
    sessionId: 'sess-abc',
    userId: 'alice',
    event: 'Status',
    nowMs: NOW,
  };

  it('always has the five core fields', () => {
    const s = buildCcStatusSnapshot(base);
    expect(s.schema_version).toBe(CC_STATUS_SCHEMA_VERSION);
    expect(s.session_id).toBe('sess-abc');
    expect(s.user_id).toBe('alice');
    expect(s.event).toBe('Status');
    expect(s.ts).toBe('2026-05-12T12:00:00.000Z');
  });

  it('derives session_health + context_pct from exceeds200k / context tokens', () => {
    expect(buildCcStatusSnapshot({ ...base, exceeds200k: true }).session_health).toBe('OVER_200K');
    expect(buildCcStatusSnapshot({ ...base, exceeds200k: false }).session_health).toBe('OK');
    const big = buildCcStatusSnapshot({
      ...base,
      transcript: { turnCount: 1, toolCallsTotal: 0, toolCallsFailed: 0, filesTouched: 0, contextTokens: CONTEXT_BUDGET_TOKENS + 1 },
    });
    expect(big.session_health).toBe('OVER_200K');
    expect(big.context_tokens).toBe(CONTEXT_BUDGET_TOKENS + 1);
    expect(big.context_pct).toBeCloseTo(1.0, 2);
    const small = buildCcStatusSnapshot({
      ...base,
      transcript: { turnCount: 1, toolCallsTotal: 0, toolCallsFailed: 0, filesTouched: 0, contextTokens: 100_000 },
    });
    expect(small.session_health).toBe('OK');
    expect(small.context_pct).toBe(0.5);
  });

  it('omits unknown optional fields rather than emitting zeros/empties', () => {
    const s = buildCcStatusSnapshot({ ...base, model: '   ', costUsd: Number.NaN });
    expect(s).not.toHaveProperty('model');
    expect(s).not.toHaveProperty('cost_usd');
    expect(s).not.toHaveProperty('display_name');
    expect(s).not.toHaveProperty('subscription_tier');
  });

  it('carries quota fields when a quota block is supplied', () => {
    const s = buildCcStatusSnapshot({
      ...base,
      quota: {
        subscription_tier: 'max',
        five_hour_utilization: 0.87,
        seven_day_utilization: 0.41,
        five_hour_reset_at: 1747040000,
        seven_day_reset_at: 1747500000,
        stale: false,
      },
    });
    expect(s.subscription_tier).toBe('max');
    expect(s.five_hour_utilization).toBe(0.87);
    expect(s.seven_day_utilization).toBe(0.41);
    expect(s.five_hour_reset_at).toBe(1747040000);
    expect(s.quota_stale).toBe(false);
  });

  it('includes git_branch / cwd / display_name / machine_id when present', () => {
    const s = buildCcStatusSnapshot({
      ...base,
      cwd: 'D:/proj',
      gitBranch: 'feat/x',
      displayName: 'Alice',
      machineId: 'm-1',
      costUsd: 1.23,
      model: 'claude-opus-4-7',
      transcript: {
        turnCount: 14,
        toolCallsTotal: 53,
        toolCallsFailed: 2,
        filesTouched: 7,
        sessionStartedAt: '2026-05-12T07:50:00.000Z',
        contextTokens: 152_000,
        tokens5h: 12_400_000,
        tokens7d: 88_000_000,
      },
    });
    expect(s.cwd).toBe('D:/proj');
    expect(s.git_branch).toBe('feat/x');
    expect(s.display_name).toBe('Alice');
    expect(s.machine_id).toBe('m-1');
    expect(s.cost_usd).toBe(1.23);
    expect(s.turn_count).toBe(14);
    expect(s.tool_calls_total).toBe(53);
    expect(s.tool_calls_failed).toBe(2);
    expect(s.files_touched).toBe(7);
    expect(s.session_started_at).toBe('2026-05-12T07:50:00.000Z');
    expect(s.tokens_5h).toBe(12_400_000);
    expect(s.tokens_7d).toBe(88_000_000);
  });
});
