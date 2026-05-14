// BPP accept / reject handler — `POST /v1/inbox/act` server logic.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.5 + §4.6.
// Constraints:
//   - MUST NOT modify packages/digital-twin/src/bpp/store.ts. We inline a
//     per-receiver file sweep that mirrors `revoke.ts::markInboxRevoked` to
//     find an item by id and rewrite its status.
//   - On `accept` we compile a SKILL.md under `<userHome>/.claude/skills/...`.
//   - On `reject` we just flip status + audit; spec §3.5 will use `reject_count`
//     later (out of scope here).

import { randomUUID } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { readBp, appendAudit } from './store.js';
import { compileBpToSkill } from './compile-to-skill.js';
import type { InboxItem, InboxStatus, PushEvent } from './types.js';

export interface InboxActBody {
  inbox_id: string;
  receiver_id: string;
  action: 'accept' | 'reject';
}

export interface InboxActResult {
  ok: true;
  status: InboxStatus;
  compiled_path?: string;
}

function assertValidActBody(body: unknown): asserts body is InboxActBody {
  if (typeof body !== 'object' || body === null) {
    throw new Error('malformed body: object required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['inbox_id'] !== 'string' || (o['inbox_id'] as string).length === 0) {
    throw new Error('malformed body: inbox_id required');
  }
  if (typeof o['receiver_id'] !== 'string' || (o['receiver_id'] as string).length === 0) {
    throw new Error('malformed body: receiver_id required');
  }
  if (o['action'] !== 'accept' && o['action'] !== 'reject') {
    throw new Error('malformed body: action must be "accept" or "reject"');
  }
}

interface InboxLocator {
  filePath: string;
  lineIdx: number;
  item: InboxItem;
}

/**
 * Walk `<rootDir>/_inbox/*` / `*` /`items.jsonl` and find the item whose
 * `id === inboxId`. Returns the file path + line index + parsed item for
 * in-place mutation. Returns null if not found.
 */
function findInboxItem(rootDir: string, inboxId: string): InboxLocator | null {
  const inboxRoot = resolvePath(rootDir, '_inbox');
  if (!existsSync(inboxRoot)) return null;

  for (const receiverDir of readdirSync(inboxRoot)) {
    const recvPath = resolvePath(inboxRoot, receiverDir);
    if (!statSync(recvPath).isDirectory()) continue;

    for (const dateDir of readdirSync(recvPath)) {
      const datePath = resolvePath(recvPath, dateDir);
      if (!statSync(datePath).isDirectory()) continue;

      const file = resolvePath(datePath, 'items.jsonl');
      if (!existsSync(file)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const ln = lines[i]!;
        if (ln.length === 0) continue;
        const item = JSON.parse(ln) as InboxItem;
        if (item.id === inboxId) {
          return { filePath: file, lineIdx: i, item };
        }
      }
    }
  }
  return null;
}

/** Rewrite a single InboxItem line in place, preserving the rest of the file. */
function rewriteInboxItem(filePath: string, lineIdx: number, replacement: InboxItem): void {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  lines[lineIdx] = JSON.stringify(replacement);
  writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/**
 * Accept or reject one inbox item. On accept, also compiles the underlying
 * BestPractice into a SKILL.md under `<userHome>/.claude/skills/teamagent/`.
 *
 * Errors:
 *   - inbox_id not found              → throw "inbox not found: <id>"
 *   - item already non-pending        → throw "inbox <id> not pending (status=...)"
 *   - accept but bp file missing      → throw "bp not found: <bp_id>"
 */
export function handleInboxAct(
  rootDir: string,
  userHome: string,
  body: unknown,
): InboxActResult {
  assertValidActBody(body);

  const locator = findInboxItem(rootDir, body.inbox_id);
  if (locator === null) {
    throw new Error(`inbox not found: ${body.inbox_id}`);
  }

  const { filePath, lineIdx, item } = locator;
  if (item.status !== 'pending') {
    throw new Error(`inbox ${item.id} not pending (status=${item.status})`);
  }

  const now = new Date().toISOString();
  const nextStatus: InboxStatus = body.action === 'accept' ? 'accepted' : 'rejected';
  const updated: InboxItem = { ...item, status: nextStatus, acted_at: now };

  let compiledPath: string | undefined;
  if (body.action === 'accept') {
    // Resolve BP BEFORE we mutate inbox state — if compile would fail we don't
    // want a half-flipped inbox row sitting on disk.
    const bp = readBp(rootDir, item.bp_id);
    if (bp === null) {
      throw new Error(`bp not found: ${item.bp_id}`);
    }
    const compiled = compileBpToSkill(bp, userHome);
    compiledPath = compiled.path;
    // Persist the compiled path on the inbox row so the revoke cascade can
    // physically delete the SKILL.md later (BPP acceptance §2 里程碑一 step 8).
    updated.compiled_path = compiledPath;
  }

  rewriteInboxItem(filePath, lineIdx, updated);

  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    event_type: body.action === 'accept' ? 'accepted' : 'rejected',
    bp_id: item.bp_id,
    actor: body.receiver_id,
    timestamp: now,
    metadata: { inbox_id: item.id },
  };
  appendAudit(rootDir, ev);

  const result: InboxActResult = { ok: true, status: nextStatus };
  if (compiledPath !== undefined) {
    result.compiled_path = compiledPath;
  }
  return result;
}
