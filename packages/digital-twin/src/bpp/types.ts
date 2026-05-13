// BPP (Best-Practice Push) data types.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §2.
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task 1.1.

export type BpType = 'rule' | 'skill' | 'habit' | 'context-mgmt';
export type BpTier = 'low' | 'stable' | 'canonical' | 'enforced' | 'gold';
export type BpTopic = 'testing' | 'git-flow' | 'ctx-mgmt' | 'code-style' | 'ai-collab';
export type InboxStatus = 'pending' | 'accepted' | 'rejected' | 'revoked';
export type DeliveryChannel = 'statusline' | 'dashboard' | 'slack' | 'email';
export type PushEventType =
  | 'mined'
  | 'pushed'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'force-pushed'
  | 'secret_blocked';

export interface MiningEvidence {
  sessions_observed: number;
  pattern_count: number;
  reject_count: number;
  extraction_method: string;
}

export interface BestPractice {
  schema_version: 1;
  id: string;
  type: BpType;
  title: string;
  body: string;
  example: string;
  pushed_by: string;
  pushed_by_display: string;
  topic: BpTopic;
  confidence_score: number;
  confidence_tier: BpTier;
  conflict_with: string[];
  mining_evidence: MiningEvidence;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
}

export interface InboxItem {
  schema_version: 1;
  id: string;
  receiver_id: string;
  bp_id: string;
  status: InboxStatus;
  delivered_at: string;
  acted_at: string | null;
  forced_by_lead: false | string;
  delivery_channels: DeliveryChannel[];
}

export interface TeamMember {
  schema_version: 1;
  user_id: string;
  display_name: string;
  role: 'member' | 'lead';
  joined_at: string;
  notification_prefs: {
    slack_url?: string;
    email?: string;
    quiet_hours?: string;
  };
}

export interface PushEvent {
  schema_version: 1;
  id: string;
  event_type: PushEventType;
  bp_id: string;
  actor: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
