// BPP lead-role gate — assert/check that a user_id is a team lead.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.1 / §5.5.
// Plan: Phase 4 (P4.1) — lead-role守门 used by handleRevoke + handleForcePush.

import { readMembers } from './store.js';
import type { TeamMember } from './types.js';

/**
 * Return true iff `user_id` is registered in `<rootDir>/_team/members.json`
 * with role === 'lead'. Unknown users return false.
 *
 * Note: per spec §5.5 副 lead 共享 revoke + force-push 权限。Here we treat any
 * member whose stored `role` is the string `'lead'` as a lead — the spec does
 * not introduce a separate `'co-lead'` role string in P1 types, so all leads
 * (primary or secondary) share this gate. Higher-tier actions (transfer-lead /
 * remove-co-lead / purge-audit) are out of scope for Phase 4.
 */
export function isLead(rootDir: string, user_id: string): boolean {
  if (typeof user_id !== 'string' || user_id.length === 0) return false;
  const members = readMembers(rootDir);
  const m: TeamMember | undefined = members.find((x) => x.user_id === user_id);
  return Boolean(m && m.role === 'lead');
}

/**
 * Throw if `user_id` is not a lead in this team. Used by mutating handlers
 * (revoke / force-push) as the single source of authorization. Error message
 * is stable so callers can match on it.
 */
export function assertIsLead(rootDir: string, user_id: string): void {
  if (!isLead(rootDir, user_id)) {
    throw new Error('not authorized: lead role required');
  }
}
