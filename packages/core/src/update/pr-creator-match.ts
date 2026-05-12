/**
 * Pure match helper for the "post-merge PR-creator auto-update" feature.
 *
 * Given a PR creator's GitHub login (published in `latest.json` by the
 * release-branch.yml workflow) and the local machine's identity signals,
 * decide whether the user running this updater is the same person who
 * authored the just-merged PR.
 *
 * Pure function — no `fs`, `child_process`, `os`. The shell wrapper that
 * collects local identity lives in `packages/cli/src/lib/local-identity.ts`.
 *
 * Signal priority (any one match returns true):
 *   1. `ghLogin` — output of `gh api user --jq .login`. Strongest signal.
 *   2. `env.GITHUB_USER` or `env.GH_USER`.
 *   3. `gitEmail` matches `<login>@users.noreply.github.com` OR
 *      `<id>+<login>@users.noreply.github.com` (GitHub default noreply form).
 *
 * Match is case-insensitive (GitHub logins are unique mod-case anyway).
 *
 * Returns false on blank/missing `prCreatorLogin` — we never force-update
 * for an empty login (defensive: a malformed `latest.json` should not
 * trigger anything).
 */

export interface PrCreatorMatchInput {
  /** GitHub login of the PR creator, as published in latest.json. */
  prCreatorLogin?: string;
  /** Output of `gh api user --jq .login`. Optional. */
  ghLogin?: string;
  /** Process environment subset. Read GITHUB_USER / GH_USER. */
  env?: Record<string, string | undefined>;
  /** `git config user.email`. Optional. */
  gitEmail?: string;
}

export function isLocalUserPrCreator(input: PrCreatorMatchInput): boolean {
  const target = (input.prCreatorLogin ?? "").trim().toLowerCase();
  if (!target) return false;

  // Signal 1: gh login
  const ghLogin = (input.ghLogin ?? "").trim().toLowerCase();
  if (ghLogin && ghLogin === target) return true;

  // Signal 2: env vars
  const env = input.env ?? {};
  const envUser = ((env.GITHUB_USER ?? env.GH_USER) ?? "").trim().toLowerCase();
  if (envUser && envUser === target) return true;

  // Signal 3: noreply email pattern
  const email = (input.gitEmail ?? "").trim().toLowerCase();
  if (email.endsWith("@users.noreply.github.com")) {
    const localPart = email.slice(0, -"@users.noreply.github.com".length);
    // Strip optional "<id>+" numeric prefix (modern GitHub noreply form).
    const stripped = localPart.replace(/^\d+\+/, "");
    if (stripped === target) return true;
  }

  return false;
}
