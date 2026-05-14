'use client';

// BPP Lead Console — interactive client.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.
// Phase 4 (P4.1 — Dashboard route + UI). Server handlers in
// `packages/digital-twin/src/bpp/revoke.ts` + `force-push.ts`; this file is
// the UI half — mock fetches (console.log) until mock-server wires the routes.

import { useMemo, useState } from 'react';
import { SEED_INBOX, type BestPracticeLite } from '../../inbox/inbox-data';

// Hardcoded current-user — mirrors the SPEC `/lead/console` access model
// (role=lead 才可见). Real auth lands later.
const CURRENT_LEAD_USER_ID = 'user-lead-bob';
const CURRENT_LEAD_DISPLAY = 'alice@team.com';

// Hardcoded receiver pool for the force-push picker. Mirror of Phase 3 SEED
// authors so the conflict / topic stories stay coherent across pages.
const RECEIVER_POOL: Array<{ user_id: string; display: string }> = [
  { user_id: 'user-alice', display: 'Alice' },
  { user_id: 'user-bob', display: 'Bob' },
  { user_id: 'user-carol', display: 'Carol' },
  { user_id: 'user-dave', display: 'Dave' },
  { user_id: 'user-erin', display: 'Erin' },
  { user_id: 'user-frank', display: 'Frank' },
  { user_id: 'user-greg', display: 'Greg' },
  { user_id: 'user-hank', display: 'Hank' },
];

// Build a deduped BP list from the Phase 3 SEED (8 inbox rows → 8 unique BPs).
function uniqueBps(): BestPracticeLite[] {
  const byId = new Map<string, BestPracticeLite>();
  for (const pair of SEED_INBOX) {
    if (!byId.has(pair.bp.id)) byId.set(pair.bp.id, pair.bp);
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

const TIER_COLOR: Record<string, string> = {
  low: 'text-ink-quiet',
  stable: 'text-ink-muted',
  canonical: 'text-sky',
  enforced: 'text-coral',
  gold: 'text-amber',
};

export default function LeadConsoleClient() {
  const bps = useMemo(uniqueBps, []);
  // Track which BPs we've locally "revoked" so the row dims out — purely a
  // mock-state, no server round-trip yet.
  const [revoked, setRevoked] = useState<Set<string>>(new Set());

  // Modal state for the two actions (revoke vs force-push).
  const [revokeFor, setRevokeFor] = useState<BestPracticeLite | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>('');
  const [forceFor, setForceFor] = useState<BestPracticeLite | null>(null);
  const [forceReceiver, setForceReceiver] = useState<string>('');

  function submitRevoke(): void {
    if (revokeFor === null) return;
    const body = {
      bp_id: revokeFor.id,
      lead_user_id: CURRENT_LEAD_USER_ID,
      reason: revokeReason,
    };
    // eslint-disable-next-line no-console
    console.log('[mock fetch] POST /v1/revoke', body);
    setRevoked((prev) => new Set(prev).add(revokeFor.id));
    setRevokeFor(null);
    setRevokeReason('');
  }

  function submitForce(): void {
    if (forceFor === null || forceReceiver.length === 0) return;
    const body = {
      bp_id: forceFor.id,
      receiver_id: forceReceiver,
      lead_user_id: CURRENT_LEAD_USER_ID,
    };
    // eslint-disable-next-line no-console
    console.log('[mock fetch] POST /v1/bp-push/force', body);
    setForceFor(null);
    setForceReceiver('');
  }

  return (
    <div className="px-12 py-10 max-w-[1100px] mx-auto">
      <header className="flex items-end justify-between mb-10">
        <div className="max-w-2xl">
          <div className="eyebrow mb-2">Lead Console / Phase 4</div>
          <h1 className="display-title">Lead Console — {CURRENT_LEAD_DISPLAY}</h1>
          <p className="prose-warm text-body text-ink-muted mt-3">
            全员 BestPractice 列表。lead 可对每条 ✋ 撤回（cascade inbox →
            revoked）或 🚨 强制推送给某成员（forced_by_lead 字段 = 你的 user_id，
            接收方无法 reject）。
          </p>
        </div>
        <div className="flex items-center gap-6 text-right">
          <Stat label="BP 数量" value={bps.length} />
          <Stat label="已撤回" value={revoked.size} accent />
        </div>
      </header>

      <section className="card-surface p-5">
        <ul className="divide-y divide-ink-ghost/20">
          {bps.map((bp) => {
            const isRevoked = revoked.has(bp.id);
            return (
              <li
                key={bp.id}
                className={
                  'py-4 flex items-start justify-between gap-6 ' +
                  (isRevoked ? 'opacity-50 line-through' : '')
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-[18px] leading-tight text-ink">
                    {bp.title}
                  </div>
                  <div className="text-[13px] text-ink-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>pushed_by: {bp.pushed_by_display}</span>
                    <span className="text-ink-quiet">·</span>
                    <span className={TIER_COLOR[bp.confidence_tier] ?? ''}>
                      {bp.confidence_tier} ({bp.confidence_score.toFixed(2)})
                    </span>
                    <span className="text-ink-quiet">·</span>
                    <span className="font-mono text-[12px] text-ink-quiet">
                      {bp.id}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isRevoked}
                    onClick={() => setRevokeFor(bp)}
                    className="px-3 py-1.5 text-[13px] rounded-md border border-ink-ghost/40 hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ✋ Revoke
                  </button>
                  <button
                    type="button"
                    disabled={isRevoked}
                    onClick={() => setForceFor(bp)}
                    className="px-3 py-1.5 text-[13px] rounded-md border border-coral/60 text-coral hover:bg-coral/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    🚨 Force push to…
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Revoke modal — textarea for `reason`. */}
      {revokeFor !== null && (
        <Modal onClose={() => setRevokeFor(null)} title={`Revoke: ${revokeFor.title}`}>
          <p className="text-[13px] text-ink-muted mb-3">
            cascade: 所有该 BP 的 InboxItem 会被改为 <code>revoked</code>，
            audit log 写一条 <code>event_type: revoked</code>。
          </p>
          <label className="text-[12px] eyebrow block mb-1">Reason</label>
          <textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            rows={3}
            placeholder="e.g. replaced by ADR-0042 / wrong topic / contains stale config"
            className="w-full px-3 py-2 text-[13px] rounded-md border border-ink-ghost/40 bg-transparent focus:outline-none focus:border-coral"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setRevokeFor(null)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-ink-ghost/40 hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={revokeReason.trim().length === 0}
              onClick={submitRevoke}
              className="px-3 py-1.5 text-[13px] rounded-md border border-coral/60 bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✋ Confirm revoke
            </button>
          </div>
        </Modal>
      )}

      {/* Force-push modal — receiver picker. */}
      {forceFor !== null && (
        <Modal
          onClose={() => setForceFor(null)}
          title={`Force push: ${forceFor.title}`}
        >
          <p className="text-[13px] text-ink-muted mb-3">
            new InboxItem 携带 <code>forced_by_lead: {CURRENT_LEAD_USER_ID}</code>
            ，接收方端 ✗ 拒绝按钮 disabled，必须 ✓ 接受或留 pending。
          </p>
          <label className="text-[12px] eyebrow block mb-1">Receiver</label>
          <select
            value={forceReceiver}
            onChange={(e) => setForceReceiver(e.target.value)}
            className="w-full px-3 py-2 text-[13px] rounded-md border border-ink-ghost/40 bg-transparent focus:outline-none focus:border-coral"
          >
            <option value="">— pick a teammate —</option>
            {RECEIVER_POOL.map((r) => (
              <option key={r.user_id} value={r.user_id}>
                {r.display} ({r.user_id})
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setForceFor(null)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-ink-ghost/40 hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={forceReceiver.length === 0}
              onClick={submitForce}
              className="px-3 py-1.5 text-[13px] rounded-md border border-coral/60 bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🚨 Confirm force push
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className={
          'font-serif text-[28px] leading-none ' +
          (accent ? 'text-coral' : 'text-ink')
        }
      >
        {value}
      </div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-surface max-w-md w-[90%] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-4">
          <h2 className="font-serif text-[20px] leading-tight text-ink pr-4">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-ink-quiet hover:text-ink"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
