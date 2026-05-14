// BPP revoke handler — lead撤回 BestPractice + cascade inbox status → 'revoked'
// + physically delete the compiled SKILL.md of any receiver who had accepted.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.3.
// Plan: Phase 4 (P4.2) — POST /v1/revoke { bp_id, lead_user_id, reason }.
// Cascade: BPP acceptance §2 里程碑一 — "撤回触发级联：未采纳的收件箱条目消失、
//          已采纳的本机技能文件被删除".
//
// Constraints:
//   - MUST NOT modify packages/digital-twin/src/bpp/store.ts. The cascade
//     update of InboxItem.status is implemented inline below by re-reading
//     each per-receiver JSONL file and re-writing it.
//   - The cascade DOES delete files outside <rootDir>/_inbox — specifically
//     the compiled SKILL.md whose absolute path the accept handler persisted
//     onto the InboxItem. isCompiledSkillPath() bounds that to compiler-shaped
//     paths so a tampered inbox JSONL cannot make revoke unlink an arbitrary
//     file. This is the single-machine (server + members share a filesystem)
//     cascade; the distributed deployment routes the same delete through the
//     SSE bp-revoked event a member-side daemon consumes.

import { randomUUID } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  unlinkSync,
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
  /** Absolute paths of compiled SKILL.md files the cascade physically deleted. */
  deleted_skill_files: string[];
}

/**
 * Defense-in-depth: only compiler-produced SKILL.md paths are eligible for
 * cascade deletion. compiled_path is server-written (compileBpToSkill
 * validates the bp_id), but a tampered inbox JSONL must not be able to make
 * revoke unlink an arbitrary file. The compiler shape is
 * `<userHome>/.claude/skills/teamagent/<bp_id>/SKILL.md`.
 */
function isCompiledSkillPath(p: string): boolean {
  return /[/\\]skills[/\\]teamagent[/\\][^/\\]+[/\\]SKILL\.md$/.test(p);
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

interface MarkRevokedResult {
  /** Count of inbox rows flipped to 'revoked' (per-row, not per-file). */
  flipped: number;
  /**
   * compiled_path of every row that was 'accepted' before this revoke flipped
   * it — the SKILL.md files the cascade should physically delete.
   */
  skillFiles: string[];
}

/**
 * Sweep every per-receiver inbox file under `<rootDir>/_inbox/*` /` *` /items.jsonl,
 * flip any InboxItem whose `bp_id === bpId` to `status: 'revoked'`, and rewrite
 * the file in place. Also collects the compiled_path of any row that was
 * 'accepted' (so the caller can delete the orphaned SKILL.md).
 *
 * This is implemented inline (per Phase 4 constraint: don't touch store.ts).
 * The traversal mirrors store.listInbox's path shape exactly.
 */
function markInboxRevoked(rootDir: string, bpId: string): MarkRevokedResult {
  const inboxRoot = resolvePath(rootDir, '_inbox');
  if (!existsSync(inboxRoot)) return { flipped: 0, skillFiles: [] };

  let flipped = 0;
  const skillFiles: string[] = [];
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
          // Capture the compiled SKILL.md of an ACCEPTED row before we flip it
          // — the cascade will physically delete those files.
          if (
            item.status === 'accepted' &&
            typeof item.compiled_path === 'string' &&
            item.compiled_path.length > 0
          ) {
            skillFiles.push(item.compiled_path);
          }
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
  return { flipped, skillFiles };
}

/**
 * Lead 撤回一条 BestPractice。流程：
 *   1. assertIsLead(lead_user_id)              — 否则 throw "not authorized..."
 *   2. read BestPractice → patch revoked_*    → writeBp 回去
 *   3. cascade InboxItem.status → 'revoked'   (per-receiver inline sweep)
 *   4. cascade: physically delete the compiled SKILL.md of every accepted row
 *   5. appendAudit event_type: 'revoked' (metadata records deleted_skill_files)
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

  const { flipped: revoked_inbox_count, skillFiles } = markInboxRevoked(
    rootDir,
    body.bp_id,
  );

  // Cascade: physically delete the compiled SKILL.md of every receiver who had
  // accepted. Best-effort — a revoke must not fail because cleanup did (file
  // already gone, read-only mount, etc.). Only files we actually unlink here
  // are reported in deleted_skill_files.
  const deleted_skill_files: string[] = [];
  for (const skillPath of skillFiles) {
    if (!isCompiledSkillPath(skillPath)) continue;
    try {
      if (existsSync(skillPath)) {
        unlinkSync(skillPath);
        deleted_skill_files.push(skillPath);
      }
    } catch {
      // best-effort cleanup — swallow and continue
    }
  }

  const ev: PushEvent = {
    schema_version: 1,
    id: `ev-${randomUUID().slice(0, 8)}`,
    event_type: 'revoked',
    bp_id: body.bp_id,
    actor: body.lead_user_id,
    timestamp: now,
    metadata: { reason: body.reason, revoked_inbox_count, deleted_skill_files },
  };
  appendAudit(rootDir, ev);

  return { ok: true, bp_id: body.bp_id, revoked_inbox_count, deleted_skill_files };
}
