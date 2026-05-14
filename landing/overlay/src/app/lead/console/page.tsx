// BPP Lead Console — Phase 4 UX scaffold.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §5.2
//   "Lead Console (dashboard 新增视图)" — role=lead 才可见，全员 BestPractice
//   列表，每条可 ✋ 撤回 / 🚨 强制推给某人。
//
// Phase 4 ships only the UI scaffold; the real /v1/revoke and /v1/bp-push/force
// HTTP wiring is mocked (console.log) — server handlers live in
// packages/digital-twin/src/bpp/{revoke,force-push}.ts. A future PR wires
// `landing/overlay` to those handlers via mock-server.ts.

import LeadConsoleClient from './Client';

export const dynamic = process.env.STATIC_EXPORT === '1' ? 'force-static' : 'force-dynamic';

export default function LeadConsolePage() {
  return <LeadConsoleClient />;
}
