import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockServer, type MockServerHandle } from '../../mock-server.js';
import { appendAudit, writeMember } from '../store.js';
import { writeRoleMetadata } from '../role-hierarchy.js';

describe('BPP e2e via live mock-server', () => {
  let server: MockServerHandle;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-e2e-'));
    server = await startMockServer({ port: 0, outputDir: dir });
  });

  afterAll(async () => {
    await server.close();
  });

  it('POST /v1/bp-push then GET /v1/inbox returns the pushed BP for the receiver', async () => {
    const bp = {
      schema_version: 1,
      id: 'bp-e2e-001',
      type: 'rule',
      title: 'integration test BP — do not mock db',
      body: 'mocking the db hides migration bugs',
      example: 'PR #200 mocked tests passed but prod migration failed',
      pushed_by: 'alice@team.com',
      pushed_by_display: 'Alice',
      topic: 'testing',
      confidence_score: 0.9,
      confidence_tier: 'canonical',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: 3,
        pattern_count: 3,
        reject_count: 0,
        extraction_method: 'v1',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: new Date().toISOString(),
    };
    const pushRes = await fetch(`${server.url}/v1/bp-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bp, receivers: ['bob@team.com', 'charlie@team.com'] }),
    });
    expect(pushRes.status).toBe(200);
    const pushBody = (await pushRes.json()) as { ok: boolean; bp_id: string; delivered_to: string[] };
    expect(pushBody.ok).toBe(true);
    expect(pushBody.bp_id).toBe('bp-e2e-001');
    expect(pushBody.delivered_to).toEqual(['bob@team.com', 'charlie@team.com']);

    const inboxRes = await fetch(`${server.url}/v1/inbox?receiver=bob%40team.com`);
    expect(inboxRes.status).toBe(200);
    const inboxBody = (await inboxRes.json()) as { ok: boolean; items: Array<Record<string, unknown>> };
    expect(inboxBody.ok).toBe(true);
    expect(inboxBody.items).toHaveLength(1);
    expect(inboxBody.items[0]!.bp_id).toBe('bp-e2e-001');
    expect(inboxBody.items[0]!.status).toBe('pending');
    expect(inboxBody.items[0]!.receiver_id).toBe('bob@team.com');
  });

  it('GET /v1/inbox without receiver query param returns 400', async () => {
    const res = await fetch(`${server.url}/v1/inbox`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/receiver/);
  });

  it('POST /v1/bp-push with malformed body returns 400', async () => {
    const res = await fetch(`${server.url}/v1/bp-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receivers: ['bob@team.com'] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/bp/);
  });

  it('unknown POST route still 404s (no regression)', async () => {
    const res = await fetch(`${server.url}/v1/does-not-exist`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/audit returns the audit event log, --since filters it', async () => {
    appendAudit(dir, {
      schema_version: 1,
      id: 'ev-audit-old',
      event_type: 'pushed',
      bp_id: 'bp-e2e-001',
      actor: 'alice@team.com',
      timestamp: '2026-05-13T10:00:00Z',
      metadata: {},
    });
    appendAudit(dir, {
      schema_version: 1,
      id: 'ev-audit-new',
      event_type: 'revoked',
      bp_id: 'bp-e2e-001',
      actor: 'alice@team.com',
      timestamp: '2026-05-15T10:00:00Z',
      metadata: {},
    });
    const allRes = await fetch(`${server.url}/v1/audit`);
    expect(allRes.status).toBe(200);
    const allBody = (await allRes.json()) as {
      ok: boolean;
      events: Array<{ id: string }>;
    };
    expect(allBody.ok).toBe(true);
    expect(allBody.events.map((e) => e.id)).toContain('ev-audit-old');
    expect(allBody.events.map((e) => e.id)).toContain('ev-audit-new');

    const sinceRes = await fetch(
      `${server.url}/v1/audit?since=2026-05-14T00:00:00Z`,
    );
    expect(sinceRes.status).toBe(200);
    const sinceBody = (await sinceRes.json()) as {
      ok: boolean;
      events: Array<{ id: string }>;
    };
    const sinceIds = sinceBody.events.map((e) => e.id);
    // The describe block shares one outputDir, so other tests' events may
    // also be in the log — assert the cutoff boundary, not an exact list.
    expect(sinceIds).toContain('ev-audit-new');
    expect(sinceIds).not.toContain('ev-audit-old');
  });

  it('GET /v1/role returns the effective role tier for a user', async () => {
    writeMember(dir, {
      schema_version: 1,
      user_id: 'lead@team.com',
      display_name: 'Lead',
      role: 'lead',
      joined_at: '2026-05-13T09:00:00Z',
      notification_prefs: {},
    });
    writeMember(dir, {
      schema_version: 1,
      user_id: 'colead@team.com',
      display_name: 'Co Lead',
      role: 'lead',
      joined_at: '2026-05-13T09:00:00Z',
      notification_prefs: {},
    });
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: { 'colead@team.com': 'co_lead' },
    });

    const leadRes = await fetch(
      `${server.url}/v1/role?user=lead%40team.com`,
    );
    expect(leadRes.status).toBe(200);
    const leadBody = (await leadRes.json()) as {
      ok: boolean;
      user_id: string;
      tier: string;
    };
    expect(leadBody).toEqual({
      ok: true,
      user_id: 'lead@team.com',
      tier: 'main_lead',
    });

    const coLeadRes = await fetch(
      `${server.url}/v1/role?user=colead%40team.com`,
    );
    const coLeadBody = (await coLeadRes.json()) as { tier: string };
    expect(coLeadBody.tier).toBe('co_lead');

    const memberRes = await fetch(
      `${server.url}/v1/role?user=nobody%40team.com`,
    );
    const memberBody = (await memberRes.json()) as { tier: string };
    expect(memberBody.tier).toBe('member');
  });

  it('GET /v1/role without user query param returns 400', async () => {
    const res = await fetch(`${server.url}/v1/role`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/user/);
  });

  it('POST /v1/members self-registers a member, GET /v1/role confirms member tier', async () => {
    const joinRes = await fetch(`${server.url}/v1/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: 'xiaowang@team.com',
        display_name: 'Xiao Wang',
      }),
    });
    expect(joinRes.status).toBe(200);
    const joinBody = (await joinRes.json()) as { ok: boolean; user_id: string };
    expect(joinBody).toEqual({ ok: true, user_id: 'xiaowang@team.com' });

    const roleRes = await fetch(
      `${server.url}/v1/role?user=xiaowang%40team.com`,
    );
    const roleBody = (await roleRes.json()) as { tier: string };
    expect(roleBody.tier).toBe('member');
  });

  it('POST /v1/members with a malformed body returns 400', async () => {
    const res = await fetch(`${server.url}/v1/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'No Id' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/user_id/);
  });
});
