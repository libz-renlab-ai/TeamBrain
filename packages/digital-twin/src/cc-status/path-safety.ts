/**
 * Path-safety primitives shared by `mock-server.ts` (transcript / recording /
 * quota ingest) and `cc-status/store.ts` (cc-status snapshots). Lives in its
 * own no-dep module so both can import it without a circular reference
 * (`mock-server.ts` already imports `cc-status/store.ts`). The standalone
 * `scripts/teamagent-statusline.cjs` keeps its own copy (`ccSafeUserId`) — it
 * can't import a workspace package — with a "keep in sync" comment.
 */

/**
 * Collapse an arbitrary string into a filesystem-safe directory name: keep only
 * `[a-zA-Z0-9._@+-]`, cap at 80 chars, squash runs of `.` (defeats `..`), strip
 * leading/trailing punctuation. Empty / non-string / fully-stripped → `'unknown'`.
 */
export function safeUserId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return 'unknown';
  let cleaned = raw.replace(/[^a-zA-Z0-9._@+-]/g, '_').slice(0, 80);
  cleaned = cleaned.replace(/\.{2,}/g, '_');
  cleaned = cleaned.replace(/^[._-]+/, '').replace(/[._-]+$/, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

/**
 * UTC `YYYY-MM-DD` stamp. Uses `raw` (an ISO-ish string) when it parses, else
 * falls back to `now`.
 */
export function dateStamp(raw: unknown, now: Date): string {
  let d = now;
  if (typeof raw === 'string' && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Windows reserved device basenames — a file named `con` etc. targets a device. */
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** True when `name` is safe to use as a path component: no `..`, not a reserved device name. */
export function isUnreservedComponent(name: string): boolean {
  if (name.includes('..')) return false;
  return !WINDOWS_RESERVED_RE.test(name);
}
