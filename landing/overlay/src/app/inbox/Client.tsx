'use client';

// BPP Inbox — Phase 3 UX scaffold.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.4 — §4.6.
// - Three top tabs: 按人 / 按主题 / 逐条 (decision #5)
// - Per-row accept ✓ / reject ✗ buttons + 详情 expander
// - Conflict pairs rendered side-by-side (decision #8)
// - No real API: accept/reject just console.log + flip local state.
//   Real wiring (POST /v1/inbox/act) lands in a later PR.

import { useMemo, useState } from 'react';
import {
  SEED_INBOX,
  findConflictPairs,
  type SeedPair,
  type BpTier,
  type BpTopic,
  type InboxStatus
} from './inbox-data';

type ViewMode = 'by-person' | 'by-topic' | 'per-item';

const TIER_LABEL: Record<BpTier, string> = {
  low: '低',
  stable: '稳',
  canonical: '权威',
  enforced: '强制',
  gold: '金本'
};

const TIER_TONE: Record<BpTier, string> = {
  low: 'text-ink-quiet',
  stable: 'text-ink-soft',
  canonical: 'text-coral',
  enforced: 'text-coral-deep',
  gold: 'text-amber'
};

const TOPIC_LABEL: Record<BpTopic, string> = {
  testing: '测试',
  'git-flow': 'Git 流程',
  'ctx-mgmt': '上下文管理',
  'code-style': '代码风格',
  'ai-collab': 'AI 协作'
};

const STATUS_LABEL: Record<InboxStatus, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  revoked: '已撤回'
};

export default function InboxClient() {
  const [view, setView] = useState<ViewMode>('per-item');
  // local override of inbox status; falls back to seed item.status if absent
  const [statusOverride, setStatusOverride] = useState<Record<string, InboxStatus>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = useMemo(() => {
    return SEED_INBOX.map((s) => ({
      ...s,
      item: { ...s.item, status: statusOverride[s.item.id] ?? s.item.status }
    }));
  }, [statusOverride]);

  const pendingCount = items.filter((s) => s.item.status === 'pending').length;
  const conflictPairs = useMemo(() => findConflictPairs(items), [items]);
  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    for (const [a, b] of conflictPairs) {
      s.add(a);
      s.add(b);
    }
    return s;
  }, [conflictPairs]);

  function act(itemId: string, bpId: string, action: 'accept' | 'reject') {
    // Phase 3: no real API. Mirror the eventual POST /v1/inbox/act body shape
    // in the log line so a future grep can wire it up.

    console.log(`[bpp-inbox] act bp_id=${bpId} item_id=${itemId} action=${action}`);
    setStatusOverride((prev) => ({
      ...prev,
      [itemId]: action === 'accept' ? 'accepted' : 'rejected'
    }));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="px-12 py-10 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <div className="eyebrow mb-1.5">Best-Practice Push · Inbox</div>
        <h1 className="display-title">📬 推送箱</h1>
        <p className="text-body text-ink-muted mt-2">
          团队成员的最佳实践，AI 实时蒸馏后推到这里。{pendingCount} 条待处理，
          {conflictPairs.length} 对矛盾对需要你二选一。
        </p>
      </header>

      {/* Tabs: 按人 / 按主题 / 逐条 — decision #5 */}
      <div className="flex items-center gap-1 border-b border-rule mb-5">
        <TabButton active={view === 'by-person'} onClick={() => setView('by-person')}>
          按人
        </TabButton>
        <TabButton active={view === 'by-topic'} onClick={() => setView('by-topic')}>
          按主题
        </TabButton>
        <TabButton active={view === 'per-item'} onClick={() => setView('per-item')}>
          逐条
        </TabButton>
      </div>

      {view === 'by-person' && (
        <ByPersonView
          items={items}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onAct={act}
        />
      )}
      {view === 'by-topic' && (
        <ByTopicView
          items={items}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onAct={act}
        />
      )}
      {view === 'per-item' && (
        <PerItemView
          items={items}
          expanded={expanded}
          conflictPairs={conflictPairs}
          conflictIds={conflictIds}
          onToggleExpand={toggleExpand}
          onAct={act}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-caption transition-colors border-b-2 -mb-px ${
        active
          ? 'border-coral text-coral font-medium'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// ─── per-item view ────────────────────────────────────────────────────────
// Sorted by delivered_at desc. Conflict pairs are rendered side-by-side in a
// 2-column grid at the top, separately from the main vertical list, so the
// receiver sees them as a paired choice instead of two adjacent rows.

function PerItemView({
  items,
  expanded,
  conflictPairs,
  conflictIds,
  onToggleExpand,
  onAct
}: {
  items: SeedPair[];
  expanded: Set<string>;
  conflictPairs: Array<[string, string]>;
  conflictIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAct: (itemId: string, bpId: string, action: 'accept' | 'reject') => void;
}) {
  const byBpId = new Map(items.map((s) => [s.bp.id, s]));
  // non-conflict items, descending by delivered_at
  const regular = items
    .filter((s) => !conflictIds.has(s.bp.id))
    .sort((a, b) => (a.item.delivered_at < b.item.delivered_at ? 1 : -1));

  return (
    <div className="space-y-6">
      {conflictPairs.length > 0 && (
        <section>
          <div className="eyebrow mb-3 text-amber">⚖️ 矛盾对 · 二选一</div>
          <div className="space-y-4">
            {conflictPairs.map(([aId, bId]) => {
              const a = byBpId.get(aId);
              const b = byBpId.get(bId);
              if (!a || !b) return null;
              return (
                <div key={`${aId}::${bId}`} className="grid grid-cols-2 gap-3">
                  <ItemRow
                    pair={a}
                    expanded={expanded.has(a.item.id)}
                    onToggleExpand={() => onToggleExpand(a.item.id)}
                    onAct={onAct}
                    conflictHint="A"
                  />
                  <ItemRow
                    pair={b}
                    expanded={expanded.has(b.item.id)}
                    onToggleExpand={() => onToggleExpand(b.item.id)}
                    onAct={onAct}
                    conflictHint="B"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        {conflictPairs.length > 0 && (
          <div className="eyebrow mb-3">📥 其他推送</div>
        )}
        <ul className="space-y-3">
          {regular.map((s) => (
            <li key={s.item.id}>
              <ItemRow
                pair={s}
                expanded={expanded.has(s.item.id)}
                onToggleExpand={() => onToggleExpand(s.item.id)}
                onAct={onAct}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── by-person view ───────────────────────────────────────────────────────

function ByPersonView({
  items,
  expanded,
  onToggleExpand,
  onAct
}: {
  items: SeedPair[];
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onAct: (itemId: string, bpId: string, action: 'accept' | 'reject') => void;
}) {
  const groups = new Map<string, SeedPair[]>();
  for (const s of items) {
    const key = s.bp.pushed_by_display;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-5">
      {ordered.map(([person, list]) => (
        <section key={person} className="card-surface p-5">
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-[16px] text-ink">{person}</h2>
            <span className="text-caption text-ink-quiet">{list.length} 条</span>
          </header>
          <ul className="space-y-2.5">
            {list.map((s) => (
              <li key={s.item.id}>
                <ItemRow
                  pair={s}
                  expanded={expanded.has(s.item.id)}
                  onToggleExpand={() => onToggleExpand(s.item.id)}
                  onAct={onAct}
                  compact
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─── by-topic view ────────────────────────────────────────────────────────

function ByTopicView({
  items,
  expanded,
  onToggleExpand,
  onAct
}: {
  items: SeedPair[];
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onAct: (itemId: string, bpId: string, action: 'accept' | 'reject') => void;
}) {
  const groups = new Map<BpTopic, SeedPair[]>();
  for (const s of items) {
    const key = s.bp.topic;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-5">
      {ordered.map(([topic, list]) => (
        <section key={topic} className="card-surface p-5">
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-[16px] text-ink">{TOPIC_LABEL[topic]}</h2>
            <span className="text-caption text-ink-quiet">{list.length} 条</span>
          </header>
          <ul className="space-y-2.5">
            {list.map((s) => (
              <li key={s.item.id}>
                <ItemRow
                  pair={s}
                  expanded={expanded.has(s.item.id)}
                  onToggleExpand={() => onToggleExpand(s.item.id)}
                  onAct={onAct}
                  compact
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─── shared row component ─────────────────────────────────────────────────

function ItemRow({
  pair,
  expanded,
  onToggleExpand,
  onAct,
  compact,
  conflictHint
}: {
  pair: SeedPair;
  expanded: boolean;
  onToggleExpand: () => void;
  onAct: (itemId: string, bpId: string, action: 'accept' | 'reject') => void;
  compact?: boolean;
  conflictHint?: 'A' | 'B';
}) {
  const { item, bp } = pair;
  const isDone = item.status === 'accepted' || item.status === 'rejected' || item.status === 'revoked';
  const isForced = typeof item.forced_by_lead === 'string';

  return (
    <div
      className={`rounded-xl border ${
        isDone ? 'border-rule-soft bg-paper-subtle/40' : 'border-rule bg-paper-card'
      } p-4 transition-colors`}
    >
      <div className="flex items-start gap-3">
        {conflictHint && (
          <span className="shrink-0 w-6 h-6 rounded-full bg-amber/15 text-amber text-caption font-mono flex items-center justify-center">
            {conflictHint}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10.5px] font-mono ${TIER_TONE[bp.confidence_tier]}`}>
              {TIER_LABEL[bp.confidence_tier]}
            </span>
            <span className="text-[10.5px] font-mono text-ink-quiet">
              · {TOPIC_LABEL[bp.topic]}
            </span>
            <span className="text-[10.5px] font-mono text-ink-quiet">· {bp.type}</span>
            {isForced && (
              <span className="text-[10.5px] font-mono text-rust">🚨 lead 强推</span>
            )}
            <span className="ml-auto text-[10.5px] font-mono text-ink-quiet">
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <div className={`font-serif ${compact ? 'text-[14px]' : 'text-[15.5px]'} text-ink leading-snug`}>
            {bp.title}
          </div>
          <div className="text-[12px] text-ink-quiet mt-1">
            来自 <span className="text-ink-soft">{bp.pushed_by_display}</span>
            · {new Date(bp.created_at).toLocaleString('zh-CN', { hour12: false })}
            · confidence {(bp.confidence_score * 100).toFixed(0)}%
          </div>
          {expanded && (
            <div className="mt-3 pt-3 border-t border-rule-soft space-y-2">
              <div>
                <div className="eyebrow mb-1">详情</div>
                <p className="text-[13px] text-ink-soft leading-relaxed">{bp.body}</p>
              </div>
              <div>
                <div className="eyebrow mb-1">案例</div>
                <p className="text-[12.5px] text-ink-muted leading-relaxed quote-soft italic">
                  {bp.example}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onAct(item.id, bp.id, 'accept')}
          disabled={item.status === 'accepted'}
          className={`text-caption px-3 py-1.5 rounded-md border transition-colors ${
            item.status === 'accepted'
              ? 'bg-forest/15 border-forest/30 text-forest cursor-default'
              : 'border-forest/50 text-forest hover:bg-forest/10'
          }`}
        >
          ✓ {item.status === 'accepted' ? '已接受' : '接受'}
        </button>
        <button
          onClick={() => onAct(item.id, bp.id, 'reject')}
          disabled={item.status === 'rejected' || isForced}
          title={isForced ? 'lead 强推不可拒绝' : undefined}
          className={`text-caption px-3 py-1.5 rounded-md border transition-colors ${
            item.status === 'rejected'
              ? 'bg-rust/15 border-rust/30 text-rust cursor-default'
              : isForced
                ? 'border-rule text-ink-quiet/50 cursor-not-allowed'
                : 'border-rust/50 text-rust hover:bg-rust/10'
          }`}
        >
          ✗ {item.status === 'rejected' ? '已拒绝' : '拒绝'}
        </button>
        <button
          onClick={onToggleExpand}
          className="text-caption px-3 py-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-paper-subtle ml-auto"
        >
          👁 {expanded ? '收起' : '详情'}
        </button>
      </div>
    </div>
  );
}
