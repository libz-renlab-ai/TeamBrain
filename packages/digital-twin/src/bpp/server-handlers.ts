// BPP HTTP handlers — push + inbox (read).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task 1.3.

import { randomUUID } from 'node:crypto';
import {
  writeBp,
  appendInbox,
  listInbox,
  appendAudit,
  writeMember,
} from './store.js';
import type { BestPractice, InboxItem, PushEvent } from './types.js';

export interface BpPushBody {
  bp: BestPractice;
  receivers: string[];
}

export interface BpPushResult {
  ok: true;
  bp_id: string;
  delivered_to: string[];
}

export interface InboxResult {
  ok: true;
  items: InboxItem[];
}

function assertValidBpPushBody(body: unknown): asserts body is BpPushBody {
  if (typeof body !== 'object' || body === null) {
    throw new Error('malformed body: object required');
  }
  const o = body as Record<string, unknown>;
  const bp = o['bp'] as Partial<BestPractice> | undefined;
  if (!bp || typeof bp !== 'object' || typeof bp.id !== 'string' || typeof bp.title !== 'string') {
    throw new Error('malformed body: bp.id + bp.title required');
  }
  if (!Array.isArray(o['receivers'])) {
    throw new Error('malformed body: receivers must be array');
  }
  for (const r of o['receivers']) {
    if (typeof r !== 'string' || r.length === 0) {
      throw new Error('malformed body: each receiver must be non-empty string');
    }
  }
}

export function handleBpPush(rootDir: string, body: unknown): BpPushResult {
  assertValidBpPushBody(body);
  writeBp(rootDir, body.bp);
  const now = new Date().toISOString();
  for (const rcvr of body.receivers) {
    const safeSlug = rcvr.replace(/[^a-z0-9]/gi, '_');
    const item: InboxItem = {
      schema_version: 1,
      id: `inbox-${safeSlug}-${randomUUID().slice(0, 8)}`,
      receiver_id: rcvr,
      bp_id: body.bp.id,
      status: 'pending',
      delivered_at: now,
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard'],
    };
    appendInbox(rootDir, item);
  }
  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    event_type: 'pushed',
    bp_id: body.bp.id,
    actor: 'system',
    timestamp: now,
    metadata: { receivers: body.receivers },
  };
  appendAudit(rootDir, ev);
  return { ok: true, bp_id: body.bp.id, delivered_to: body.receivers };
}

export function handleInbox(rootDir: string, receiverId: string): InboxResult {
  return { ok: true, items: listInbox(rootDir, receiverId) };
}

export interface MemberJoinBody {
  user_id: string;
  display_name: string;
}

export interface MemberJoinResult {
  ok: true;
  user_id: string;
}

function assertValidMemberJoinBody(
  body: unknown,
): asserts body is MemberJoinBody {
  if (typeof body !== 'object' || body === null) {
    throw new Error('malformed body: object required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['user_id'] !== 'string' || (o['user_id'] as string).length === 0) {
    throw new Error('malformed body: user_id required');
  }
  if (
    typeof o['display_name'] !== 'string' ||
    (o['display_name'] as string).length === 0
  ) {
    throw new Error('malformed body: display_name required');
  }
}

/**
 * Member self-registration — the `bpp join` member client posts here on a
 * clean dev machine to auto-join the central service (acceptance §5 item 2).
 * Writes a `TeamMember` with `role: 'member'`; `writeMember` upserts by
 * `user_id` so a re-join is idempotent. Unauthenticated by design (members
 * self-register) — same LAN-readability caveat as the other /v1/* routes.
 */
export function handleMemberJoin(
  rootDir: string,
  body: unknown,
): MemberJoinResult {
  assertValidMemberJoinBody(body);
  writeMember(rootDir, {
    schema_version: 1,
    user_id: body.user_id,
    display_name: body.display_name,
    role: 'member',
    joined_at: new Date().toISOString(),
    notification_prefs: {},
  });
  return { ok: true, user_id: body.user_id };
}
