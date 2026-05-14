// `teamagent team transfer-lead` — Gap 3 / spec §5.1.
//
// Transfers the main_lead role from the currently authenticated user (`from`,
// resolved from git email / config, injected via deps) to `--to=<user_id>`. The
// transfer is performed by `transferLead()` in @teamagent/digital-twin which:
//   - asserts the actor is currently main_lead,
//   - flips members.json roles (from → member, to → lead),
//   - updates _team/role-metadata.json (delete from, set to → main_lead),
//   - appends a `lead-transferred` audit event.
//
// All IO is injected via `deps` so tests can drive the CLI without touching
// real stdout/stderr or argv parsing. This mirrors the `team-init.ts` shape.

import { transferLead } from '@teamagent/digital-twin';

export type WriteChannel = 'stdout' | 'stderr';

export interface TeamTransferLeadDeps {
  /** Emit a line of output. Default channel is stdout. */
  write: (s: string, channel?: WriteChannel) => void;
  /** Root data dir for the BPP store (members.json lives under here). */
  rootDir: string;
  /** Acting user (current main_lead). Typically resolved from git email. */
  from_user_id: string;
  /** Raw argv tail after `teamagent team transfer-lead` (e.g. ['--to=bob@team.com']). */
  argv: string[];
}

export type TeamTransferLeadResult =
  | { ok: true; from_user_id: string; to_user_id: string }
  | { ok: false; exitCode: 1 };

interface ParsedArgs {
  to: string | null;
  error: string | null;
}

export function parseTransferLeadArgs(argv: string[]): ParsedArgs {
  let to: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--to' && argv[i + 1]) {
      to = argv[++i]!;
    } else if (a.startsWith('--to=')) {
      to = a.slice('--to='.length);
    } else {
      return { to: null, error: `unknown argument: ${a}` };
    }
  }
  if (to === null || to.length === 0) {
    return { to: null, error: 'missing required flag: --to=<user_id>' };
  }
  return { to, error: null };
}

export function runTeamTransferLead(
  deps: TeamTransferLeadDeps,
): TeamTransferLeadResult {
  const parsed = parseTransferLeadArgs(deps.argv);
  if (parsed.error !== null || parsed.to === null) {
    deps.write(`Error: ${parsed.error ?? 'invalid args'}\n`, 'stderr');
    deps.write(
      'Usage: teamagent team transfer-lead --to=<user_id>\n',
      'stderr',
    );
    return { ok: false, exitCode: 1 };
  }

  try {
    const result = transferLead(deps.rootDir, deps.from_user_id, parsed.to);
    deps.write(
      `Lead role transferred: ${result.from_user_id} -> ${result.to_user_id}\n`,
    );
    return {
      ok: true,
      from_user_id: result.from_user_id,
      to_user_id: result.to_user_id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.write(`Error: ${msg}\n`, 'stderr');
    return { ok: false, exitCode: 1 };
  }
}
