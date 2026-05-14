// BPP role transitions — transferLead / elevateToCoLead / demoteCoLead (Gap 3).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.1 / §5.5.
//
// These three transitions sit on top of the role-hierarchy sidecar
// (`_team/role-metadata.json`) and the existing members.json. Each transition
// is atomic at the per-call level: both the TeamMember.role flip (via
// `writeMember`) and the role-metadata.json update (via `writeRoleMetadata`)
// are performed before returning. Audit events are appended to the standard
// `<rootDir>/_audit/<date>.jsonl` stream so they remain queryable alongside
// push/revoke/force-push events.

import { randomUUID } from 'node:crypto';

import {
  readMembers,
  writeMember,
  appendAudit,
} from './store.js';
import {
  getRoleTier,
  readRoleMetadata,
  writeRoleMetadata,
  assertCanTransferLead,
  assertCanElevate,
} from './role-hierarchy.js';
import type { PushEvent, TeamMember } from './types.js';

/** Spec §5.4 footnote — co-lead headcount cap. */
export const MAX_CO_LEADS = 3;

export interface TransferLeadResult {
  ok: true;
  from_user_id: string;
  to_user_id: string;
}

export interface ElevateResult {
  ok: true;
  actor_id: string;
  target_user_id: string;
  co_lead_count: number;
}

export interface DemoteResult {
  ok: true;
  actor_id: string;
  target_user_id: string;
  co_lead_count: number;
}

function findMemberOrThrow(rootDir: string, user_id: string): TeamMember {
  const m = readMembers(rootDir).find((x) => x.user_id === user_id);
  if (!m) throw new Error(`user not found: ${user_id}`);
  return m;
}

function countCoLeads(rootDir: string): number {
  const meta = readRoleMetadata(rootDir);
  return Object.values(meta.leads).filter((t) => t === 'co_lead').length;
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendRoleAuditEvent(
  rootDir: string,
  event_type: 'lead-transferred' | 'lead-elevated' | 'lead-demoted',
  actor: string,
  metadata: Record<string, unknown>,
): void {
  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    // `PushEventType` (types.ts) does not include role events in Phase 1; we
    // cast through `unknown` to keep types.ts frozen per Gap 3 constraints.
    // The audit reader treats `event_type` as opaque string so this is safe.
    event_type: event_type as unknown as PushEvent['event_type'],
    bp_id: '',
    actor,
    timestamp: nowIso(),
    metadata,
  };
  appendAudit(rootDir, ev);
}

/**
 * Transfer the main_lead role from `from_user_id` to `to_user_id`.
 *
 * Pre-conditions:
 *   - `from_user_id` is currently `main_lead` (asserted via assertCanTransferLead).
 *   - `to_user_id` exists in members.json (any role).
 *
 * Post-conditions:
 *   - `to_user_id` becomes `role='lead'` + tier='main_lead'.
 *   - `from_user_id` is demoted to `role='member'` and removed from the
 *     role-metadata leads map. (Spec §5.1 implies the transfer is a swap;
 *     the previous main lead does not silently retain co-lead status — that
 *     would require a separate elevate-co-lead call.)
 *   - An audit event `lead-transferred` is appended.
 */
export function transferLead(
  rootDir: string,
  from_user_id: string,
  to_user_id: string,
): TransferLeadResult {
  if (from_user_id === to_user_id) {
    throw new Error('transfer-lead: from and to must differ');
  }
  assertCanTransferLead(rootDir, from_user_id);
  const fromMember = findMemberOrThrow(rootDir, from_user_id);
  const toMember = findMemberOrThrow(rootDir, to_user_id);

  // Apply members.json updates.
  writeMember(rootDir, { ...fromMember, role: 'member' });
  writeMember(rootDir, { ...toMember, role: 'lead' });

  // Apply role-metadata.json updates.
  const meta = readRoleMetadata(rootDir);
  delete meta.leads[from_user_id];
  meta.leads[to_user_id] = 'main_lead';
  writeRoleMetadata(rootDir, meta);

  appendRoleAuditEvent(rootDir, 'lead-transferred', from_user_id, {
    from_user_id,
    to_user_id,
  });

  return { ok: true, from_user_id, to_user_id };
}

/**
 * Elevate `target_user_id` (currently a `member`) to co-lead status.
 *
 * Pre-conditions:
 *   - `actor_id` is currently `main_lead`.
 *   - `target_user_id` exists and is currently `role === 'member'`.
 *   - Existing co-lead count is `< MAX_CO_LEADS` (3).
 */
export function elevateToCoLead(
  rootDir: string,
  actor_id: string,
  target_user_id: string,
): ElevateResult {
  if (actor_id === target_user_id) {
    throw new Error('elevate-co-lead: actor and target must differ');
  }
  assertCanElevate(rootDir, actor_id);
  const target = findMemberOrThrow(rootDir, target_user_id);
  if (target.role !== 'member') {
    throw new Error(
      `elevate-co-lead: target ${target_user_id} is not a plain member (current role: ${target.role})`,
    );
  }
  const currentCoLeads = countCoLeads(rootDir);
  if (currentCoLeads >= MAX_CO_LEADS) {
    throw new Error(
      `elevate-co-lead: co-lead cap reached (${currentCoLeads}/${MAX_CO_LEADS})`,
    );
  }

  // Flip role to 'lead' on the member record + tag tier in metadata.
  writeMember(rootDir, { ...target, role: 'lead' });
  const meta = readRoleMetadata(rootDir);
  meta.leads[target_user_id] = 'co_lead';
  writeRoleMetadata(rootDir, meta);

  appendRoleAuditEvent(rootDir, 'lead-elevated', actor_id, {
    actor_id,
    target_user_id,
  });

  return {
    ok: true,
    actor_id,
    target_user_id,
    co_lead_count: currentCoLeads + 1,
  };
}

/**
 * Demote `target_user_id` from co-lead back to plain member.
 *
 * Pre-conditions:
 *   - `actor_id` is currently `main_lead`.
 *   - `target_user_id` is currently tier='co_lead'. Demoting a non-co-lead
 *     throws — main_lead removal is only available via transferLead().
 */
export function demoteCoLead(
  rootDir: string,
  actor_id: string,
  target_user_id: string,
): DemoteResult {
  if (actor_id === target_user_id) {
    throw new Error('demote-co-lead: actor and target must differ');
  }
  assertCanElevate(rootDir, actor_id);
  const target = findMemberOrThrow(rootDir, target_user_id);
  const targetTier = getRoleTier(rootDir, target_user_id);
  if (targetTier !== 'co_lead') {
    throw new Error(
      `demote-co-lead: target ${target_user_id} is not a co-lead (current tier: ${targetTier})`,
    );
  }

  writeMember(rootDir, { ...target, role: 'member' });
  const meta = readRoleMetadata(rootDir);
  delete meta.leads[target_user_id];
  writeRoleMetadata(rootDir, meta);

  appendRoleAuditEvent(rootDir, 'lead-demoted', actor_id, {
    actor_id,
    target_user_id,
  });

  return {
    ok: true,
    actor_id,
    target_user_id,
    co_lead_count: countCoLeads(rootDir),
  };
}
