import { describe, it, expect } from 'vitest';
import type { BestPractice, InboxItem, PushEvent, TeamMember } from '../types.js';

describe('BPP types', () => {
  it('BestPractice has required fields with correct types', () => {
    const bp: BestPractice = {
      schema_version: 1,
      id: 'bp-2026-05-13-test',
      type: 'rule',
      title: 'do not mock db',
      body: 'detail',
      example: 'example',
      pushed_by: 'alice@team.com',
      pushed_by_display: 'Alice',
      topic: 'testing',
      confidence_score: 0.81,
      confidence_tier: 'canonical',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: 5,
        pattern_count: 4,
        reject_count: 0,
        extraction_method: 'behavior-mining-v1',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: '2026-05-13T10:00:00Z',
    };
    expect(bp.schema_version).toBe(1);
    expect(bp.type).toBe('rule');
    expect(bp.conflict_with).toEqual([]);
    expect(bp.mining_evidence.pattern_count).toBe(4);
  });

  it('InboxItem links to BestPractice via bp_id', () => {
    const item: InboxItem = {
      schema_version: 1,
      id: 'inbox-bob-001',
      receiver_id: 'bob@team.com',
      bp_id: 'bp-2026-05-13-test',
      status: 'pending',
      delivered_at: '2026-05-13T10:00:01Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard'],
    };
    expect(item.bp_id).toBe('bp-2026-05-13-test');
    expect(item.status).toBe('pending');
    expect(item.forced_by_lead).toBe(false);
  });

  it('InboxItem.forced_by_lead can hold a user_id when lead force-pushed', () => {
    const item: InboxItem = {
      schema_version: 1,
      id: 'inbox-bob-002',
      receiver_id: 'bob@team.com',
      bp_id: 'bp-test',
      status: 'pending',
      delivered_at: '2026-05-13T10:00:00Z',
      acted_at: null,
      forced_by_lead: 'alice@team.com',
      delivery_channels: ['dashboard'],
    };
    expect(item.forced_by_lead).toBe('alice@team.com');
  });

  it('PushEvent is append-only with required fields', () => {
    const ev: PushEvent = {
      schema_version: 1,
      id: 'ev-001',
      event_type: 'mined',
      bp_id: 'bp-2026-05-13-test',
      actor: 'system',
      timestamp: '2026-05-13T10:00:00Z',
      metadata: {},
    };
    expect(ev.event_type).toBe('mined');
    expect(ev.actor).toBe('system');
  });

  it('TeamMember has role and optional notification_prefs', () => {
    const m: TeamMember = {
      schema_version: 1,
      user_id: 'alice@team.com',
      display_name: 'Alice',
      role: 'lead',
      joined_at: '2026-05-13T09:00:00Z',
      notification_prefs: { quiet_hours: '22:00-08:00' },
    };
    expect(m.role).toBe('lead');
    expect(m.notification_prefs.quiet_hours).toBe('22:00-08:00');
  });
});
