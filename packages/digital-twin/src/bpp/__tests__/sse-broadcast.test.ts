// Gap 2 — SSE broadcaster contract tests.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.1.
// Scope: in-memory pub/sub keyed by receiver_id; each subscriber is a `(line) => void`
// callback that receives a single SSE `data: ...\n\n` frame.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BppSseBroadcaster,
  wireBroadcasterToHandlers,
} from '../sse-broadcast.js';

type Line = string;

function recorder(): { lines: Line[]; sink: (line: Line) => void } {
  const lines: Line[] = [];
  return { lines, sink: (line: Line) => lines.push(line) };
}

describe('BppSseBroadcaster', () => {
  let bus: BppSseBroadcaster;
  beforeEach(() => {
    bus = new BppSseBroadcaster();
  });

  it('delivers a bp-pushed event only to receivers listed in the event', () => {
    const a = recorder();
    const b = recorder();
    const c = recorder();
    bus.subscribe('alice@team.com', a.sink);
    bus.subscribe('bob@team.com', b.sink);
    bus.subscribe('charlie@team.com', c.sink);

    bus.broadcast({
      type: 'bp-pushed',
      bp_id: 'bp-xyz',
      receivers: ['alice@team.com', 'charlie@team.com'],
    });

    expect(a.lines).toHaveLength(1);
    expect(b.lines).toHaveLength(0);
    expect(c.lines).toHaveLength(1);

    // Wire format: each line MUST be a single `data: <json>\n\n` frame.
    expect(a.lines[0]).toMatch(/^data: /);
    expect(a.lines[0]).toMatch(/\n\n$/);
    const payload = JSON.parse(a.lines[0]!.replace(/^data: /, '').replace(/\n\n$/, ''));
    expect(payload).toMatchObject({
      type: 'bp-pushed',
      bp_id: 'bp-xyz',
      receivers: ['alice@team.com', 'charlie@team.com'],
    });
  });

  it('supports multiple subscribers (multi-device) per receiver_id', () => {
    const laptop = recorder();
    const tablet = recorder();
    bus.subscribe('alice@team.com', laptop.sink);
    bus.subscribe('alice@team.com', tablet.sink);

    bus.broadcast({ type: 'bp-pushed', bp_id: 'bp-1', receivers: ['alice@team.com'] });

    expect(laptop.lines).toHaveLength(1);
    expect(tablet.lines).toHaveLength(1);
  });

  it('disconnect removes the specific subscriber, leaving other subs intact', () => {
    const a = recorder();
    const b = recorder();
    bus.subscribe('alice@team.com', a.sink);
    bus.subscribe('alice@team.com', b.sink);

    bus.disconnect('alice@team.com', a.sink);
    bus.broadcast({ type: 'bp-pushed', bp_id: 'bp-1', receivers: ['alice@team.com'] });

    expect(a.lines).toHaveLength(0);
    expect(b.lines).toHaveLength(1);
  });

  it('broadcast to receiver with no subscribers is a no-op (does not throw)', () => {
    expect(() =>
      bus.broadcast({ type: 'bp-pushed', bp_id: 'bp-z', receivers: ['ghost@team.com'] }),
    ).not.toThrow();
  });

  it('bp-revoked events use the bp-revoked type in the payload', () => {
    const r = recorder();
    bus.subscribe('alice@team.com', r.sink);

    bus.broadcast({ type: 'bp-revoked', bp_id: 'bp-x', receivers: ['alice@team.com'] });

    expect(r.lines).toHaveLength(1);
    const payload = JSON.parse(r.lines[0]!.replace(/^data: /, '').replace(/\n\n$/, ''));
    expect(payload.type).toBe('bp-revoked');
  });

  it('a throwing subscriber is auto-dropped and does not break the rest', () => {
    const a = recorder();
    const flaky = (_line: string): void => {
      throw new Error('connection closed');
    };
    bus.subscribe('alice@team.com', flaky);
    bus.subscribe('alice@team.com', a.sink);

    expect(() =>
      bus.broadcast({ type: 'bp-pushed', bp_id: 'bp-1', receivers: ['alice@team.com'] }),
    ).not.toThrow();
    expect(a.lines).toHaveLength(1);

    // Flaky was dropped; a second broadcast should not re-call it (nor throw).
    expect(() =>
      bus.broadcast({ type: 'bp-pushed', bp_id: 'bp-2', receivers: ['alice@team.com'] }),
    ).not.toThrow();
    expect(a.lines).toHaveLength(2);
  });
});

describe('wireBroadcasterToHandlers', () => {
  it('returns a wrapped handleBpPush that broadcasts bp-pushed after the original', () => {
    const bus = new BppSseBroadcaster();
    const r = recorder();
    bus.subscribe('bob@team.com', r.sink);

    let originalCalled = false;
    const fakeOriginalPush = (_rootDir: string, body: { bp: { id: string }; receivers: string[] }) => {
      originalCalled = true;
      return { ok: true as const, bp_id: body.bp.id, delivered_to: body.receivers };
    };
    const fakeOriginalRevoke = (_rootDir: string, body: { bp_id: string }) => {
      return { ok: true as const, bp_id: body.bp_id, revoked_inbox_count: 0 };
    };

    const wrapped = wireBroadcasterToHandlers(bus, fakeOriginalPush, fakeOriginalRevoke);
    const out = wrapped.handleBpPush('/tmp/x', {
      bp: { id: 'bp-1', title: 't' },
      receivers: ['bob@team.com'],
    });
    expect(originalCalled).toBe(true);
    expect(out.ok).toBe(true);
    expect(r.lines).toHaveLength(1);
    const payload = JSON.parse(r.lines[0]!.replace(/^data: /, '').replace(/\n\n$/, ''));
    expect(payload.type).toBe('bp-pushed');
    expect(payload.bp_id).toBe('bp-1');
  });

  it('returns a wrapped handleRevoke that broadcasts bp-revoked after the original', () => {
    const bus = new BppSseBroadcaster();
    const a = recorder();
    const b = recorder();
    bus.subscribe('alice@team.com', a.sink);
    bus.subscribe('bob@team.com', b.sink);

    let revokeCalled = false;
    const fakeOriginalPush = (_rootDir: string, body: { bp: { id: string }; receivers: string[] }) => {
      return { ok: true as const, bp_id: body.bp.id, delivered_to: body.receivers };
    };
    const fakeOriginalRevoke = (_rootDir: string, body: { bp_id: string }) => {
      revokeCalled = true;
      return { ok: true as const, bp_id: body.bp_id, revoked_inbox_count: 2 };
    };

    const wrapped = wireBroadcasterToHandlers(bus, fakeOriginalPush, fakeOriginalRevoke);
    // Revoke broadcasts to ALL currently-subscribed receivers (the cascade hit
    // unknown receivers at write-time; the broadcaster doesn't know who saw it,
    // so it fans out to every active subscription).
    const out = wrapped.handleRevoke('/tmp/x', {
      bp_id: 'bp-z',
      lead_user_id: 'lead@team.com',
      reason: 'oops',
    });
    expect(revokeCalled).toBe(true);
    expect(out.revoked_inbox_count).toBe(2);
    expect(a.lines).toHaveLength(1);
    expect(b.lines).toHaveLength(1);
  });
});
