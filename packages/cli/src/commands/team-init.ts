// `teamagent team init` — BPP Phase 5 P5.1.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.2.
// Shows the team join protocol, demands the user type "I AGREE" verbatim
// (case-sensitive, surrounding whitespace tolerated), and on agreement
// persists the user as the team `lead`. On disagreement we exit 1 and emit
// a clear stderr line. All IO is injected via `deps` so tests can drive the
// flow without touching real stdin/stdout or the real outputDir.

import { writeMember } from '@teamagent/digital-twin';

export type WriteChannel = 'stdout' | 'stderr';

export interface TeamInitDeps {
  /** Read one line of agreement input from the user. */
  readline: () => Promise<string>;
  /** Emit a line of output. Default channel is stdout. */
  write: (s: string, channel?: WriteChannel) => void;
  /** Current ISO timestamp (injected for test determinism). */
  now: () => string;
  /** Root data dir for the BPP store (members.json lives under here). */
  rootDir: string;
  /** Git email / stable user id. */
  user_id: string;
  /** UI display name. */
  display_name: string;
}

export type TeamInitResult =
  | { ok: true; user_id: string }
  | { ok: false; exitCode: 1 };

const AGREEMENT = 'I AGREE';

const PROTOCOL_TEXT = `\
TeamBrain — joining this team grants the following:

  - Your Claude Code session transcripts are uploaded in real time to the team
    server. Secrets and PII are scrubbed locally first, but the raw conversation
    text still leaves your laptop.
  - The server runs AI mining over your sessions to distill "best practices"
    and pushes them to other team members. You yourself cannot see what was
    distilled from your sessions or who received it.
  - All actions (mining, push, accept, reject, revoke) are recorded in an
    audit log visible to the team lead.
  - Session transcripts on the server are automatically purged 30 days after
    you leave the team (the team lead can purge sooner on request).

Type "I AGREE" (exact case) to continue, or anything else to abort:`;

export async function runTeamInit(deps: TeamInitDeps): Promise<TeamInitResult> {
  deps.write(`${PROTOCOL_TEXT}\n`);
  const raw = await deps.readline();
  const reply = raw.trim();
  if (reply !== AGREEMENT) {
    deps.write('Aborted: did not agree.\n', 'stderr');
    return { ok: false, exitCode: 1 };
  }
  writeMember(deps.rootDir, {
    schema_version: 1,
    user_id: deps.user_id,
    display_name: deps.display_name,
    role: 'lead',
    joined_at: deps.now(),
    notification_prefs: {},
  });
  deps.write(`Welcome, ${deps.display_name}. You are now the team lead.\n`);
  return { ok: true, user_id: deps.user_id };
}
