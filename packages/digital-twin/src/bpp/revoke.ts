// BPP revoke handler — lead撤回 BestPractice + cascade inbox status → 'revoked'.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.3.
// Plan: Phase 4 (P4.2) — POST /v1/revoke { bp_id, lead_user_id, reason }.
//
// Constraints (per Phase 4 task brief):
//   - MUST NOT modify packages/digital-twin/src/bpp/store.ts. The cascade
//     update of InboxItem.status is implemented inline below by re-reading
//     each per-receiver JSONL file and re-writing it; this is bounded to the
//     <rootDir>/_inbox tree and never touches files outside.

import { randomUUID } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { writeBp, readBp, appendAudit } from './store.js';
import { assertIsLead } from './lead-gate.js';
import type { InboxItem, PushEvent } from './types.js';

export interface RevokeBody {
  bp_id: string;
  lead_user_id: string;
  reason: string;
}

export interface RevokeResult {
  ok: true;
  bp_id: string;
  revoked_inbox_count: number;
}

function assertValidRevokeBody(body: unknown): asserts body is RevokeBody {
  if (typeof body !== 'object' || body === null) {
    throw new Error('malformed body: object required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['bp_id'] !== 'string' || (o['bp_id'] as string).length === 0) {
    throw new Error('malformed body: bp_id required');
  }
  if (typeof o['lead_user_id'] !== 'string' || (o['lead_user_id'] as string).length === 0) {
    throw new Error('malformed body: lead_user_id required');
  }
  if (typeof o['reason'] !== 'string') {
    throw new Error('malformed body: reason required (string)');
  }
}

/**
 * Sweep every per-receiver inbox file under `<rootDir>/_inbox/*` /` *` /items.jsonl,
 * flip any InboxItem whose `bp_id === bpId` to `status: 'revoked'`, and rewrite
 * the file in place. Returns the count of items flipped (per-row, not per-file).
 *
 * This is implemented inline (per Phase 4 constraint: don't touch store.ts).
 * The traversal mirrors store.listInbox's path shape exactly.
 */
function markInboxRevoked(rootDir: string, bpId: string): number {
  const inboxRoot = resolvePath(rootDir, '_inbox');
  if (!existsSync(inboxRoot)) return 0;

  let flipped = 0;
  for (const receiverDir of readdirSync(inboxRoot)) {
    const recvPath = resolvePath(inboxRoot, receiverDir);
    if (!statSync(recvPath).isDirectory()) continue;

    for (const dateDir of readdirSync(recvPath)) {
      const datePath = resolvePath(recvPath, dateDir);
      if (!statSync(datePath).isDirectory()) continue;

      const file = resolvePath(datePath, 'items.jsonl');
      if (!existsSync(file)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      let fileChanged = false;
      const out: string[] = [];
      for (const ln of lines) {
        if (ln.length === 0) {
          out.push(ln);
          continue;
        }
        const item = JSON.parse(ln) as InboxItem;
        if (item.bp_id === bpId && item.status !== 'revoked') {
          item.status = 'revoked';
          flipped += 1;
          fileChanged = true;
          out.push(JSON.stringify(item));
        } else {
          out.push(ln);
        }
      }
      if (fileChanged) {
        writeFileSync(file, out.join('\n'), 'utf8');
      }
    }
  }
  return flipped;
}

/**
 * Lead 撤回一条 BestPractice。流程：
 *   1. assertIsLead(lead_user_id)              — 否则 throw "not authorized..."
 *   2. read BestPractice → patch revoked_*    → writeBp 回去
 *   3. cascade InboxItem.status → 'revoked'   (per-receiver inline sweep)
 *   4. appendAudit event_type: 'revoked'
 */
export function handleRevoke(rootDir: string, body: unknown): RevokeResult {
  assertValidRevokeBody(body);
  assertIsLead(rootDir, body.lead_user_id);

  const bp = readBp(rootDir, body.bp_id);
  if (bp === null) {
    throw new Error(`bp not found: ${body.bp_id}`);
  }

  const now = new Date().toISOString();
  bp.revoked_at = now;
  bp.revoked_by = body.lead_user_id;
  bp.revoke_reason = body.reason;
  writeBp(rootDir, bp);

  const revoked_inbox_count = markInboxRevoked(rootDir, body.bp_id);

  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    event_type: 'revoked',
    bp_id: body.bp_id,
    actor: body.lead_user_id,
    timestamp: now,
    metadata: { reason: body.reason, revoked_inbox_count },
  };
  appendAudit(rootDir, ev);

  return { ok: true, bp_id: body.bp_id, revoked_inbox_count };
}
