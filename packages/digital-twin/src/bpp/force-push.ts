// BPP force-push handler — lead 强制推一条 BestPractice 给某个 receiver。
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.4.
// Plan: Phase 4 (P4.3) — POST /v1/bp-push/force { bp_id, receiver_id, lead_user_id }.

import { randomUUID } from 'node:crypto';
import { appendInbox, readBp, appendAudit } from './store.js';
import { assertIsLead } from './lead-gate.js';
import type { InboxItem, PushEvent } from './types.js';

export interface ForcePushBody {
  bp_id: string;
  receiver_id: string;
  lead_user_id: string;
}

export interface ForcePushResult {
  ok: true;
  inbox_id: string;
  receiver_id: string;
}

function assertValidForcePushBody(body: unknown): asserts body is ForcePushBody {
  if (typeof body !== 'object' || body === null) {
    throw new Error('malformed body: object required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['bp_id'] !== 'string' || (o['bp_id'] as string).length === 0) {
    throw new Error('malformed body: bp_id required');
  }
  if (typeof o['receiver_id'] !== 'string' || (o['receiver_id'] as string).length === 0) {
    throw new Error('malformed body: receiver_id required');
  }
  if (typeof o['lead_user_id'] !== 'string' || (o['lead_user_id'] as string).length === 0) {
    throw new Error('malformed body: lead_user_id required');
  }
}

/**
 * Lead 在 console 强制推送一条 BP 给某 receiver。流程：
 *   1. assertIsLead(lead_user_id)
 *   2. verify BP exists (readBp != null)
 *   3. appendInbox 一条 InboxItem，关键字段：
 *        - status: 'pending'
 *        - forced_by_lead: <lead_user_id>   (per types.ts: `false | string`)
 *        - delivery_channels: ['statusline','dashboard']  (统一 default)
 *   4. appendAudit event_type: 'force-pushed'，metadata 携带 receiver_id
 */
export function handleForcePush(rootDir: string, body: unknown): ForcePushResult {
  assertValidForcePushBody(body);
  assertIsLead(rootDir, body.lead_user_id);

  const bp = readBp(rootDir, body.bp_id);
  if (bp === null) {
    throw new Error(`bp not found: ${body.bp_id}`);
  }

  const now = new Date().toISOString();
  const safeSlug = body.receiver_id.replace(/[^a-z0-9]/gi, '_');
  const inbox_id = `inbox-${safeSlug}-${randomUUID().slice(0, 8)}`;

  const item: InboxItem = {
    schema_version: 1,
    id: inbox_id,
    receiver_id: body.receiver_id,
    bp_id: body.bp_id,
    status: 'pending',
    delivered_at: now,
    acted_at: null,
    forced_by_lead: body.lead_user_id,
    delivery_channels: ['statusline', 'dashboard'],
  };
  appendInbox(rootDir, item);

  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    event_type: 'force-pushed',
    bp_id: body.bp_id,
    actor: body.lead_user_id,
    timestamp: now,
    metadata: { receiver_id: body.receiver_id, inbox_id },
  };
  appendAudit(rootDir, ev);

  return { ok: true, inbox_id, receiver_id: body.receiver_id };
}
