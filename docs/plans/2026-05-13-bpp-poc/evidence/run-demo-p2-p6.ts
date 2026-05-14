// BPP Phase 2-6 live demo — exercises:
// • Phase 1 push (baseline, already shown in run-demo.ts)
// • Phase 2 wilsonTierGate (in-process import)
// • Phase 4 lead revoke (HTTP)
// • Phase 4 force-push (HTTP)
// • Phase 5 auth-gate, audit-hash-chain (in-process)
// • Phase 6 fixture summary
//
// Run: npx tsx docs/plans/2026-05-13-bpp-poc/evidence/run-demo-p2-p6.ts
// Auto-shutdown after 2s.

import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockServer } from '../../../../packages/digital-twin/src/mock-server.js';
import { writeMember } from '../../../../packages/digital-twin/src/bpp/store.js';
import { wilsonLowerBound, bppTierFromConfidence } from '../../../../packages/digital-twin/src/bpp/mining/wilson-tier-gate.js';
import { linkAuditEvent, verifyAuditChain } from '../../../../packages/digital-twin/src/bpp/audit-hash-chain.js';
import { requireBearerToken } from '../../../../packages/digital-twin/src/bpp/auth-gate.js';
import type { PushEvent } from '../../../../packages/digital-twin/src/bpp/types.js';

const CY = '\x1b[36m';
const GR = '\x1b[32m';
const YL = '\x1b[33m';
const RD = '\x1b[31m';
const R = '\x1b[0m';
const DIM = '\x1b[2m';

function log(label: string, body: unknown): void {
  console.log(`\n${CY}━━━ ${label} ━━━${R}`);
  if (typeof body === 'string') {
    console.log(body);
  } else {
    console.log(JSON.stringify(body, null, 2));
  }
}

async function main(): Promise<void> {
  const outputDir = mkdtempSync(join(tmpdir(), 'bpp-p2-p6-demo-'));
  const server = await startMockServer({ port: 0, outputDir });
  log('Step 0 · server up', { url: server.url, outputDir });

  // Seed a lead and a member
  writeMember(outputDir, {
    schema_version: 1,
    user_id: 'alice@team.com',
    display_name: 'Alice',
    role: 'lead',
    joined_at: new Date().toISOString(),
    notification_prefs: {},
  });
  writeMember(outputDir, {
    schema_version: 1,
    user_id: 'bob@team.com',
    display_name: 'Bob',
    role: 'member',
    joined_at: new Date().toISOString(),
    notification_prefs: {},
  });
  log('Step 1 · team init (Phase 5 team-init CLI semantics)', '_team/members.json: alice (lead) + bob (member)');

  // Phase 2 inline mining demo
  const conf = wilsonLowerBound(9, 1); // 9 successes, 1 failure
  const tier = bppTierFromConfidence(conf);
  log('Step 2 · Phase 2 Wilson + tier gate', {
    successes: 9, failures: 1, confidence: conf.toFixed(4), tier,
    note: 'tier ∈ {canonical, enforced, gold} → would enter push queue',
  });

  // Push a BP via /v1/bp-push (Phase 1 path)
  const bp = {
    schema_version: 1 as const,
    id: 'bp-p2p6-mock-db',
    type: 'rule' as const,
    title: '测试时不要 mock 数据库',
    body: 'mocking hides migration bugs',
    example: 'PR #200 incident',
    pushed_by: 'alice@team.com',
    pushed_by_display: 'Alice',
    topic: 'testing' as const,
    confidence_score: conf,
    confidence_tier: tier,
    conflict_with: [],
    mining_evidence: { sessions_observed: 10, pattern_count: 9, reject_count: 0, extraction_method: 'behavior-mining-v1' },
    revoked_at: null, revoked_by: null, revoke_reason: null,
    created_at: new Date().toISOString(),
  };
  const pushRes = await fetch(`${server.url}/v1/bp-push`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp, receivers: ['bob@team.com', 'charlie@team.com'] }),
  });
  log(`Step 3 · POST /v1/bp-push (HTTP ${pushRes.status})`, await pushRes.json());

  // Bob查 inbox
  const inboxRes = await fetch(`${server.url}/v1/inbox?receiver=bob%40team.com`);
  log(`Step 4 · Bob inbox before revoke (HTTP ${inboxRes.status})`, await inboxRes.json());

  // Phase 4 — lead force-push
  const forceRes = await fetch(`${server.url}/v1/bp-push/force`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp_id: 'bp-p2p6-mock-db', receiver_id: 'dave@team.com', lead_user_id: 'alice@team.com' }),
  });
  log(`Step 5 · Phase 4 lead force-push (HTTP ${forceRes.status})`, await forceRes.json());

  // Phase 4 — non-lead force-push (must 403)
  const notAuthRes = await fetch(`${server.url}/v1/bp-push/force`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp_id: 'bp-p2p6-mock-db', receiver_id: 'eve@team.com', lead_user_id: 'bob@team.com' }),
  });
  log(`Step 6 · Phase 4 non-lead force-push → ${notAuthRes.status === 403 ? GR + 'HTTP 403 (correctly refused)' + R : RD + 'UNEXPECTED ' + notAuthRes.status + R}`, await notAuthRes.json());

  // Phase 4 — revoke
  const revokeRes = await fetch(`${server.url}/v1/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp_id: 'bp-p2p6-mock-db', lead_user_id: 'alice@team.com', reason: 'pulled — misleading example' }),
  });
  log(`Step 7 · Phase 4 lead revoke (HTTP ${revokeRes.status})`, await revokeRes.json());

  // Phase 4 — non-lead revoke (must 403)
  const revokeBadRes = await fetch(`${server.url}/v1/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp_id: 'bp-p2p6-mock-db', lead_user_id: 'bob@team.com', reason: 'hijack attempt' }),
  });
  log(`Step 8 · Phase 4 non-lead revoke → ${revokeBadRes.status === 403 ? GR + 'HTTP 403 (correctly refused)' + R : RD + 'UNEXPECTED ' + revokeBadRes.status + R}`, await revokeBadRes.json());

  // Phase 5 — audit chain demo
  const ev1 = linkAuditEvent(null, {
    schema_version: 1, id: 'ev-1', event_type: 'mined', bp_id: 'bp-p2p6-mock-db',
    actor: 'system', timestamp: '2026-05-13T10:00:00Z', metadata: {},
  });
  const ev2 = linkAuditEvent(ev1, {
    schema_version: 1, id: 'ev-2', event_type: 'pushed', bp_id: 'bp-p2p6-mock-db',
    actor: 'system', timestamp: '2026-05-13T10:00:01Z', metadata: { receivers: ['bob@team.com'] },
  });
  const ev3 = linkAuditEvent(ev2, {
    schema_version: 1, id: 'ev-3', event_type: 'revoked', bp_id: 'bp-p2p6-mock-db',
    actor: 'alice@team.com', timestamp: '2026-05-13T10:30:00Z', metadata: { reason: 'demo' },
  });
  const chain: PushEvent[] = [ev1, ev2, ev3];
  const verify = verifyAuditChain(chain);
  log('Step 9 · Phase 5 audit hash chain (3 events)', {
    chain_ok: verify.ok,
    ev1_this_hash: (ev1.metadata as Record<string, unknown>).this_hash,
    ev2_prev_hash: (ev2.metadata as Record<string, unknown>).prev_hash,
    ev2_this_hash: (ev2.metadata as Record<string, unknown>).this_hash,
    ev3_prev_hash: (ev3.metadata as Record<string, unknown>).prev_hash,
  });

  // Phase 5 — auth-gate demo
  const okAuth = requireBearerToken({ authorization: 'Bearer secret-token-abc' }, 'secret-token-abc');
  const badAuth = requireBearerToken({ authorization: 'Bearer wrong-token' }, 'secret-token-abc');
  log('Step 10 · Phase 5 auth-gate', { ok_token: okAuth, bad_token: badAuth });

  // Phase 6 — fixture summary
  const fixtureDir = join(outputDir, '..', '..', '..', '..', 'tests', 'fixtures', 'scenarios', 'bpp-brainstorm-habit');
  const fixtureRelPath = 'tests/fixtures/scenarios/bpp-brainstorm-habit/';
  const candPath = `${fixtureRelPath}expected-candidate-bp.json`;
  const finalPath = `${fixtureRelPath}expected-final-bp.json`;
  log('Step 11 · Phase 6 tier (a) byte-diff fixture', {
    fixture: fixtureRelPath,
    candidate_pattern_count: existsSync(candPath) ? (JSON.parse(readFileSync(candPath, 'utf8')) as { mining_evidence: { pattern_count: number } }).mining_evidence.pattern_count : 'NOT FOUND',
    final_tier: existsSync(finalPath) ? (JSON.parse(readFileSync(finalPath, 'utf8')) as { confidence_tier: string }).confidence_tier : 'NOT FOUND',
    note: 'fixture-replay.test.ts asserts toEqual on both; ablation script in scripts/bpp-ablation.ts',
  });

  console.log(`\n${GR}━━━ ALL PHASE 2-6 DEMOS COMPLETE ━━━${R}`);
  console.log(`${DIM}Server: ${server.url}${R}`);
  await new Promise((r) => setTimeout(r, 1500));
  await server.close();
}

main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});
