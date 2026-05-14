// Server component wrapper for the BPP Inbox route. The client component
// lives in Client.tsx because it uses useState / useMemo hooks. The static
// segment `/inbox` is picked up automatically by `output: 'export'` — no
// `generateStaticParams` is needed (that's only for dynamic `[param]` segments).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.4

import InboxClient from './Client';

export default function InboxPage() {
  return <InboxClient />;
}
