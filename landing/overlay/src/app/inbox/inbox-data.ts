// BPP (Best-Practice Push) Inbox seed data — Phase 3 UX scaffold.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4
//   "Push & Receive Flow" — 3 views (by-person / by-topic / per-item),
//   per-item accept / reject buttons, side-by-side conflict pairs.
//
// This file is hand-authored demo data, deliberately decoupled from the real
// /v1/inbox API. Phase 3 only ships the UX scaffold; the SSE wiring + persistence
// land in later PRs.
//
// Type definitions below are a HAND-MIRRORED SUBSET of
// `packages/digital-twin/src/bpp/types.ts`. The `landing/overlay` workspace has
// no `@teamagent/*` path alias in its tsconfig and no workspace dep on
// `@teamagent/digital-twin`, so inlining a stripped-down shape is the only way
// to keep this PR additive (no existing-file edits). If the canonical types
// drift, update this mirror manually. Keep field names byte-identical to
// types.ts so a future refactor (workspace alias + real import) is a trivial
// find-and-replace.

export type BpType = 'rule' | 'skill' | 'habit' | 'context-mgmt';
export type BpTier = 'low' | 'stable' | 'canonical' | 'enforced' | 'gold';
export type BpTopic = 'testing' | 'git-flow' | 'ctx-mgmt' | 'code-style' | 'ai-collab';
export type InboxStatus = 'pending' | 'accepted' | 'rejected' | 'revoked';
export type DeliveryChannel = 'statusline' | 'dashboard' | 'slack' | 'email';

export interface BestPracticeLite {
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
  created_at: string;
}

export interface InboxItemLite {
  id: string;
  receiver_id: string;
  bp_id: string;
  status: InboxStatus;
  delivered_at: string;
  acted_at: string | null;
  forced_by_lead: false | string;
  delivery_channels: DeliveryChannel[];
}

export interface SeedPair {
  item: InboxItemLite;
  bp: BestPracticeLite;
}

// Demo data. Covers all 4 `type` values (rule / skill / habit / context-mgmt),
// includes ≥1 conflict pair (bp-2026-05-13-rebase-vs-merge ↔
// bp-2026-05-13-merge-only-flow), and a mix of `status` so the by-status
// statusline counter can be exercised.
export const SEED_INBOX: SeedPair[] = [
  {
    item: {
      id: 'inbox-001',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-paired-ttest',
      status: 'pending',
      delivered_at: '2026-05-13T09:14:22Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard']
    },
    bp: {
      id: 'bp-2026-05-13-paired-ttest',
      type: 'rule',
      title: 'A/B 验证用 paired t-test，别用 unpaired',
      body: '同一组 prompt 在 rule-ON / rule-OFF 两条件下跑，是 paired 设计；用 `scipy.stats.ttest_rel` 而不是 `ttest_ind`，p-value 会差一个数量级。',
      example: '我在 #343 用 ttest_ind 跑 ablation，Δ=0.12 / p=0.18 → 改成 ttest_rel 后 p=0.003，结论翻面。',
      pushed_by: 'user-alice',
      pushed_by_display: 'Alice',
      topic: 'testing',
      confidence_score: 0.87,
      confidence_tier: 'canonical',
      conflict_with: [],
      created_at: '2026-05-13T09:14:00Z'
    }
  },
  {
    item: {
      id: 'inbox-002',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-grill-with-docs',
      status: 'pending',
      delivered_at: '2026-05-13T08:52:10Z',
      acted_at: null,
      forced_by_lead: 'user-lead-bob',
      delivery_channels: ['statusline', 'dashboard', 'slack']
    },
    bp: {
      id: 'bp-2026-05-13-grill-with-docs',
      type: 'skill',
      title: '把 grill 评论存到 ADR-0014，不是只在 issue 里',
      body: '`/grill-with-docs` 把 grill 评论的 decisions 落到 `docs/adr/0014-save-grilled-comments-to-adr.md`。grill 评论本身是 ephemeral（issue 一关 / 一拆就丢），ADR 才是 durable record。',
      example: 'issue #343 grill 完，落 ADR 之前先跑 `/grill-with-docs`，否则 split 后原 grill 评论作废。',
      pushed_by: 'user-bob',
      pushed_by_display: 'Bob (Lead)',
      topic: 'ai-collab',
      confidence_score: 0.92,
      confidence_tier: 'enforced',
      conflict_with: [],
      created_at: '2026-05-13T08:52:00Z'
    }
  },
  {
    item: {
      id: 'inbox-003',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-rebase-vs-merge',
      status: 'pending',
      delivered_at: '2026-05-13T07:30:00Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['dashboard']
    },
    bp: {
      id: 'bp-2026-05-13-rebase-vs-merge',
      type: 'habit',
      title: 'feature branch 总用 rebase，保留 linear history',
      body: 'PR 合并前先 `git fetch origin && git rebase origin/main`，再 `git push --force-with-lease`。main 上保持 linear, 方便 bisect。',
      example: '我上周 PR #369 用 merge commit 合，bisect 时多绕了 3 步；rebase 后立刻定位到一行。',
      pushed_by: 'user-carol',
      pushed_by_display: 'Carol',
      topic: 'git-flow',
      confidence_score: 0.71,
      confidence_tier: 'stable',
      conflict_with: ['bp-2026-05-13-merge-only-flow'],
      created_at: '2026-05-13T07:30:00Z'
    }
  },
  {
    item: {
      id: 'inbox-004',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-merge-only-flow',
      status: 'pending',
      delivered_at: '2026-05-13T07:35:00Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['dashboard']
    },
    bp: {
      id: 'bp-2026-05-13-merge-only-flow',
      type: 'habit',
      title: 'feature branch 总用 merge，保留 PR 上下文',
      body: '禁 rebase；用 `--no-ff` merge 把 PR 当 atomic unit。history 不是 linear 但能一眼看出哪些 commit 属于同一 PR、谁 review 过。',
      example: 'rebase 把 commit hash 重写了，PR 评论里链到 hash 全失效；merge commit 保留指针。',
      pushed_by: 'user-dave',
      pushed_by_display: 'Dave',
      topic: 'git-flow',
      confidence_score: 0.68,
      confidence_tier: 'stable',
      conflict_with: ['bp-2026-05-13-rebase-vs-merge'],
      created_at: '2026-05-13T07:35:00Z'
    }
  },
  {
    item: {
      id: 'inbox-005',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-compact-at-80pct',
      status: 'pending',
      delivered_at: '2026-05-13T06:10:00Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard']
    },
    bp: {
      id: 'bp-2026-05-13-compact-at-80pct',
      type: 'context-mgmt',
      title: '上下文到 80% 主动 `/compact`，不要等 200K',
      body: 'CC context 超过 80%（约 160K token）后 attention 衰减明显，回答开始飘。主动 `/compact` 让 AI 把 working state 落到一个 summary, 比硬撑到 200K 干净得多。',
      example: '我在 #367 切片 7 那天 context 烧到 195K，CC 把 PR 描述写偏了；那次之后改在 160K 主动 compact，质量回升。',
      pushed_by: 'user-erin',
      pushed_by_display: 'Erin',
      topic: 'ctx-mgmt',
      confidence_score: 0.79,
      confidence_tier: 'canonical',
      conflict_with: [],
      created_at: '2026-05-13T06:10:00Z'
    }
  },
  {
    item: {
      id: 'inbox-006',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-12-test-naming',
      status: 'accepted',
      delivered_at: '2026-05-12T15:00:00Z',
      acted_at: '2026-05-12T15:08:00Z',
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard']
    },
    bp: {
      id: 'bp-2026-05-12-test-naming',
      type: 'rule',
      title: '测试文件名用 `*.test.ts`，不要 `*.spec.ts`',
      body: 'vitest config `include` glob 是 `**/__tests__/**/*.test.ts`，`.spec.ts` 不被收。统一用 `.test.ts` 避免「跑了但测试没跑」的 silent skip。',
      example: '我有个 `*.spec.ts` 文件跑了三天才发现没被收，commit message 写「测试通过」其实零覆盖。',
      pushed_by: 'user-frank',
      pushed_by_display: 'Frank',
      topic: 'testing',
      confidence_score: 0.94,
      confidence_tier: 'enforced',
      conflict_with: [],
      created_at: '2026-05-12T14:58:00Z'
    }
  },
  {
    item: {
      id: 'inbox-007',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-12-atomic-commits',
      status: 'rejected',
      delivered_at: '2026-05-12T11:00:00Z',
      acted_at: '2026-05-12T11:30:00Z',
      forced_by_lead: false,
      delivery_channels: ['dashboard']
    },
    bp: {
      id: 'bp-2026-05-12-atomic-commits',
      type: 'habit',
      title: '每个 Edit/Write 后立刻 atomic commit',
      body: 'CLAUDE.md §开发节奏「小 commit」要求：每个文件 edit 后立即按单一关注点 commit，避免一个 commit 横跨 10 个无关 file。',
      example: '我在 #369 一口气改了 8 个文件才 commit，review 时无法拆 hunk 看，最后整 PR 推倒重来。',
      pushed_by: 'user-greg',
      pushed_by_display: 'Greg',
      topic: 'code-style',
      confidence_score: 0.55,
      confidence_tier: 'low',
      conflict_with: [],
      created_at: '2026-05-12T10:55:00Z'
    }
  },
  {
    item: {
      id: 'inbox-008',
      receiver_id: 'user-current',
      bp_id: 'bp-2026-05-13-pre-implement-claim',
      status: 'pending',
      delivered_at: '2026-05-13T05:00:00Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline', 'dashboard']
    },
    bp: {
      id: 'bp-2026-05-13-pre-implement-claim',
      type: 'skill',
      title: '认领 grill-ready issue 前先打 `grill-working` label',
      body: '`docs/PRE-IMPLEMENT-CLAIM.md` 的 anchor sentence：在 worktree / branch / 代码改动之前，先评论 claim + 加 tag `grill-working`，构成跨主机互斥。',
      example: '上周两个 driver 撞 issue #350，第二个没看 label 抢了 worktree 锁，结果两边各干一半都没 merge。',
      pushed_by: 'user-hank',
      pushed_by_display: 'Hank',
      topic: 'ai-collab',
      confidence_score: 0.81,
      confidence_tier: 'canonical',
      conflict_with: [],
      created_at: '2026-05-13T05:00:00Z'
    }
  }
];

// Helper for tests + statusline: count items by status.
export function countByStatus(items: InboxItemLite[], status: InboxStatus): number {
  return items.filter((it) => it.status === status).length;
}

// Find conflict pairs (returns BP id pairs where both BPs are present and
// reference each other in `conflict_with`).
export function findConflictPairs(seed: SeedPair[]): Array<[string, string]> {
  const byId = new Map<string, BestPracticeLite>();
  for (const s of seed) byId.set(s.bp.id, s.bp);
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const s of seed) {
    for (const otherId of s.bp.conflict_with) {
      const other = byId.get(otherId);
      if (!other) continue;
      if (!other.conflict_with.includes(s.bp.id)) continue;
      const key = [s.bp.id, otherId].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([s.bp.id, otherId]);
    }
  }
  return pairs;
}
