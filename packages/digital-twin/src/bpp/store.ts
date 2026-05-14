// BPP storage helpers — JSONL append + read with path-safety.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §2.6.
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task 1.2.

import {
  writeFileSync,
  readFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { BestPractice, InboxItem, PushEvent, TeamMember } from './types.js';

const ID_RE = /^[a-zA-Z0-9._-]+$/;

function assertSafeId(id: string): void {
  if (!ID_RE.test(id) || id.includes('..')) {
    throw new Error(`invalid id: ${id}`);
  }
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function safeReceiver(receiverId: string): string {
  return receiverId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function writeBp(rootDir: string, bp: BestPractice): void {
  assertSafeId(bp.id);
  const dir = resolvePath(rootDir, '_bp');
  ensureDir(dir);
  const target = resolvePath(dir, `${bp.id}.json`);
  if (!target.startsWith(dir)) throw new Error('path traversal');
  writeFileSync(target, JSON.stringify(bp, null, 2), 'utf8');
}

export function readBp(rootDir: string, id: string): BestPractice | null {
  assertSafeId(id);
  const target = resolvePath(rootDir, '_bp', `${id}.json`);
  if (!existsSync(target)) return null;
  return JSON.parse(readFileSync(target, 'utf8')) as BestPractice;
}

export function listBpIds(rootDir: string): string[] {
  const dir = resolvePath(rootDir, '_bp');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}

export function appendInbox(rootDir: string, item: InboxItem): void {
  const date = item.delivered_at.slice(0, 10);
  const dir = resolvePath(rootDir, '_inbox', safeReceiver(item.receiver_id), date);
  ensureDir(dir);
  const file = resolvePath(dir, 'items.jsonl');
  appendFileSync(file, JSON.stringify(item) + '\n', 'utf8');
}

export function listInbox(rootDir: string, receiverId: string): InboxItem[] {
  const dir = resolvePath(rootDir, '_inbox', safeReceiver(receiverId));
  if (!existsSync(dir)) return [];
  const out: InboxItem[] = [];
  for (const dateDir of readdirSync(dir).sort()) {
    const file = resolvePath(dir, dateDir, 'items.jsonl');
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const ln of lines) out.push(JSON.parse(ln) as InboxItem);
  }
  return out.sort((a, b) => a.delivered_at.localeCompare(b.delivered_at));
}

export function appendAudit(rootDir: string, ev: PushEvent): void {
  const date = ev.timestamp.slice(0, 10);
  const dir = resolvePath(rootDir, '_audit');
  ensureDir(dir);
  const file = resolvePath(dir, `${date}.jsonl`);
  appendFileSync(file, JSON.stringify(ev) + '\n', 'utf8');
}

/**
 * Read every audit event across all `_audit/<date>.jsonl` files. Files are
 * date-stamped (`ev.timestamp.slice(0, 10)`) so sorting filenames yields
 * chronological order; intra-file order is append order. When `sinceIso` is
 * given, only events with `timestamp >= sinceIso` are returned.
 */
export function listAuditEvents(
  rootDir: string,
  sinceIso?: string,
): PushEvent[] {
  const dir = resolvePath(rootDir, '_audit');
  if (!existsSync(dir)) return [];
  const out: PushEvent[] = [];
  for (const fname of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    const file = resolvePath(dir, fname);
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const ln of lines) out.push(JSON.parse(ln) as PushEvent);
  }
  if (sinceIso !== undefined) {
    return out.filter((ev) => ev.timestamp >= sinceIso);
  }
  return out;
}

export function writeMember(rootDir: string, m: TeamMember): void {
  const dir = resolvePath(rootDir, '_team');
  ensureDir(dir);
  const file = resolvePath(dir, 'members.json');
  const existing: TeamMember[] = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as TeamMember[])
    : [];
  const next = [...existing.filter((x) => x.user_id !== m.user_id), m];
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
}

export function readMembers(rootDir: string): TeamMember[] {
  const file = resolvePath(rootDir, '_team', 'members.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')) as TeamMember[];
}
