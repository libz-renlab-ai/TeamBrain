// Tests for scripts/teamagent-statusline-bpp.cjs.
//
// Verifies the statusline segment formula:
//   📬 N pending best practices
// where N = count of inbox items with `status === "pending"`.
//
// Run directly with:
//   pnpm vitest run scripts/__tests__/teamagent-statusline-bpp.test.ts
// (root vitest.config.ts `include` only covers packages/*/src/**, so this file
//  is not picked up by `pnpm test`. Track in a follow-up PR if/when scripts/
//  gains its own test surface.)

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '..', 'teamagent-statusline-bpp.cjs');

function runStatusline(stdin: string): string {
  // Use execFileSync with `input` to write to stdin; we want exact stdout
  // bytes so no shell quoting / pipes in the way.
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: stdin,
    encoding: 'utf-8',
    // Statusline scripts should never throw; we want raw bytes.
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return out;
}

describe('teamagent-statusline-bpp.cjs', () => {
  it('empty inbox (array) → "📬 0"', () => {
    const out = runStatusline(JSON.stringify([]));
    expect(out).toContain('📬 0');
  });

  it('empty stdin → "📬 0" (no crash)', () => {
    const out = runStatusline('');
    expect(out).toContain('📬 0');
  });

  it('malformed JSON → "📬 0" (graceful fallback)', () => {
    const out = runStatusline('{ not json');
    expect(out).toContain('📬 0');
  });

  it('3 pending items → "📬 3"', () => {
    const items = [
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'pending' },
      { id: 'c', status: 'pending' }
    ];
    const out = runStatusline(JSON.stringify(items));
    expect(out).toContain('📬 3');
    // sanity: shouldn't be "📬 2" or "📬 4"
    expect(out).not.toContain('📬 2');
    expect(out).not.toContain('📬 4');
  });

  it('1 accepted + 2 pending → "📬 2"', () => {
    const items = [
      { id: 'a', status: 'accepted' },
      { id: 'b', status: 'pending' },
      { id: 'c', status: 'pending' }
    ];
    const out = runStatusline(JSON.stringify(items));
    expect(out).toContain('📬 2');
    expect(out).not.toContain('📬 3');
  });

  it('wrapper object shape { items: [...] } also works', () => {
    const payload = {
      items: [
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'rejected' }
      ]
    };
    const out = runStatusline(JSON.stringify(payload));
    expect(out).toContain('📬 1');
  });

  it('mixed statuses count only pending', () => {
    const items = [
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'accepted' },
      { id: 'c', status: 'rejected' },
      { id: 'd', status: 'revoked' },
      { id: 'e', status: 'pending' }
    ];
    const out = runStatusline(JSON.stringify(items));
    expect(out).toContain('📬 2');
  });

  it('output is a single line (no trailing newline-corruption)', () => {
    const out = runStatusline(JSON.stringify([]));
    // exactly one logical line; the script writes via process.stdout.write
    // without a trailing "\n", so out should NOT end with \n
    expect(out.endsWith('\n')).toBe(false);
    // ...and contain no embedded newlines (statusline must be single-line)
    expect(out.includes('\n')).toBe(false);
  });
});
