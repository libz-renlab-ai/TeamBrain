// BPP role hierarchy — main_lead / co_lead / member tiers (Gap 3).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.5.
//
// Background
// ----------
// `TeamMember.role` (in types.ts) is a frozen Phase-1 surface: `'member' | 'lead'`.
// The spec however introduces副 lead (co-lead) limits in §5.5: 副 lead can revoke
// + force-push but cannot transfer-lead / elevate-co-lead / delete-audit. We
// implement that without touching types.ts by maintaining a sidecar file
//
//     <rootDir>/_team/role-metadata.json
//
// shaped as `{ schema_version: 1, leads: { <user_id>: 'main_lead' | 'co_lead' } }`.
// Only users whose stored `role === 'lead'` appear in this map. A `lead` without
// an entry defaults to 'main_lead' (back-compat with Phase-1 single-lead teams).
//
// `lead-gate.ts` continues to gate authorization at the role-level (any lead may
// revoke / force-push). The new tier-aware asserts in this file gate higher-tier
// actions (transfer-lead / elevate / demote).

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { readMembers } from './store.js';
import type { TeamMember } from './types.js';

export type RoleTier = 'main_lead' | 'co_lead' | 'member';

export interface RoleMetadataFile {
  schema_version: 1;
  /** Map of user_id → tier. Only present for users currently `role === 'lead'`. */
  leads: Record<string, 'main_lead' | 'co_lead'>;
}

const EMPTY_METADATA: RoleMetadataFile = { schema_version: 1, leads: {} };

function metadataPath(rootDir: string): string {
  return resolvePath(rootDir, '_team', 'role-metadata.json');
}

/**
 * Read the sidecar role-metadata file. Returns an empty (but valid) shape when
 * the file does not exist — this is the back-compat default for legacy
 * single-lead teams created before Gap 3 shipped.
 */
export function readRoleMetadata(rootDir: string): RoleMetadataFile {
  const file = metadataPath(rootDir);
  if (!existsSync(file)) return { schema_version: 1, leads: {} };
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RoleMetadataFile>;
  return {
    schema_version: 1,
    leads: parsed.leads ?? {},
  };
}

/**
 * Write the sidecar role-metadata file atomically (replace whole file). Creates
 * `<rootDir>/_team/` if missing.
 */
export function writeRoleMetadata(rootDir: string, meta: RoleMetadataFile): void {
  const dir = resolvePath(rootDir, '_team');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(metadataPath(rootDir), JSON.stringify(meta, null, 2), 'utf8');
}

function findMember(rootDir: string, user_id: string): TeamMember | undefined {
  const members = readMembers(rootDir);
  return members.find((m) => m.user_id === user_id);
}

/**
 * Resolve the effective {@link RoleTier} for `user_id`.
 *
 * - Unknown user / `role === 'member'`           → `'member'`
 * - `role === 'lead'` with no metadata entry      → `'main_lead'` (back-compat)
 * - `role === 'lead'` with metadata entry         → that tier
 *
 * The function is pure-readonly: it never writes to disk.
 */
export function getRoleTier(rootDir: string, user_id: string): RoleTier {
  if (typeof user_id !== 'string' || user_id.length === 0) return 'member';
  const m = findMember(rootDir, user_id);
  if (!m) return 'member';
  if (m.role !== 'lead') return 'member';
  const meta = readRoleMetadata(rootDir);
  return meta.leads[user_id] ?? 'main_lead';
}

// ---------------------------------------------------------------------------
// Tier-aware asserts (used by mutation handlers in role-transitions.ts and by
// any future console handler that needs hierarchy enforcement).
// ---------------------------------------------------------------------------

function assertTier(
  rootDir: string,
  actor_id: string,
  allowed: ReadonlyArray<RoleTier>,
  action: string,
): void {
  const tier = getRoleTier(rootDir, actor_id);
  if (!allowed.includes(tier)) {
    throw new Error(
      `not authorized: ${action} requires ${allowed.join(' or ')} (actor is ${tier})`,
    );
  }
}

/** Only `main_lead` may transfer the lead role to another user. */
export function assertCanTransferLead(rootDir: string, actor_id: string): void {
  assertTier(rootDir, actor_id, ['main_lead'], 'transfer-lead');
}

/** Only `main_lead` may elevate / demote a co-lead. */
export function assertCanElevate(rootDir: string, actor_id: string): void {
  assertTier(rootDir, actor_id, ['main_lead'], 'elevate-co-lead');
}

/** Both `main_lead` and `co_lead` may revoke a BestPractice. */
export function assertCanRevoke(rootDir: string, actor_id: string): void {
  assertTier(rootDir, actor_id, ['main_lead', 'co_lead'], 'revoke');
}

/** Both `main_lead` and `co_lead` may force-push a BestPractice. */
export function assertCanForcePush(rootDir: string, actor_id: string): void {
  assertTier(rootDir, actor_id, ['main_lead', 'co_lead'], 'force-push');
}

/**
 * Audit logs are immutable per §5.5 ("不可删除审计日志"). This always throws —
 * there is no actor (not even a main_lead) authorized to delete audit entries.
 */
export function assertCanDeleteAudit(_rootDir: string, _actor_id: string): void {
  throw new Error('not authorized: audit logs are immutable');
}
