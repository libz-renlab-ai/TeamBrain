// BPP audit-log hash chain — Phase 5 P5.4.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.3 +
// §6 (audit log must be tamper-evident).
//
// Design note (deviates from a literal reading of the task brief):
// The chain links via the previous event's `this_hash`, not its `id`. Linking
// by id would only catch insertion/deletion, not in-place field tampering —
// which defeats the purpose of an audit chain. The literal "prev_event.id ||
// '__GENESIS__'" reads as 'use the prior hash, or the genesis sentinel when
// there is no prior event'; we use the string '__GENESIS__' as the seed value
// for the first link.

import { createHash } from 'node:crypto';
import type { PushEvent } from './types.js';

const GENESIS = '__GENESIS__';

/**
 * Stable canonical serialization for hashing. Strips `prev_hash` / `this_hash`
 * out of metadata so verify can reproduce the exact bytes that were hashed
 * during the original link. JSON.stringify on plain objects with the same key
 * order is deterministic for our PushEvent shape (no Maps, no Sets, no
 * undefineds).
 */
function canonicalize(ev: PushEvent): string {
  const { prev_hash: _p, this_hash: _t, ...metadataRest } = ev.metadata as Record<
    string,
    unknown
  >;
  void _p;
  void _t;
  const stripped: PushEvent = {
    ...ev,
    metadata: metadataRest,
  };
  return JSON.stringify(stripped);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function linkAuditEvent(
  prev_event: PushEvent | null,
  new_event: PushEvent,
): PushEvent {
  const prev_hash =
    prev_event === null
      ? GENESIS
      : ((prev_event.metadata?.this_hash as string | undefined) ?? GENESIS);
  const canonical = canonicalize(new_event);
  const this_hash = sha256Hex(prev_hash + canonical);
  return {
    ...new_event,
    metadata: {
      ...new_event.metadata,
      prev_hash,
      this_hash,
    },
  };
}

export interface VerifyOk {
  ok: true;
}

export interface VerifyBroken {
  ok: false;
  broken_at: number;
}

export type VerifyResult = VerifyOk | VerifyBroken;

export function verifyAuditChain(events: PushEvent[]): VerifyResult {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const expectedPrev =
      i === 0
        ? GENESIS
        : ((events[i - 1]!.metadata?.this_hash as string | undefined) ?? GENESIS);
    const claimedPrev = ev.metadata?.prev_hash as string | undefined;
    if (claimedPrev !== expectedPrev) {
      return { ok: false, broken_at: i };
    }
    const claimedThis = ev.metadata?.this_hash as string | undefined;
    const recomputed = sha256Hex(expectedPrev + canonicalize(ev));
    if (claimedThis !== recomputed) {
      return { ok: false, broken_at: i };
    }
  }
  return { ok: true };
}
