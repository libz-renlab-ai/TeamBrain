export interface PendingBanner {
  from: string;
  to: string;
  at: number;
  shown: boolean;
  /**
   * Post-merge PR-creator force-update feature. When true, the SessionStart
   * banner uses a distinct "🎯 你的 PR 已 merge" template instead of the
   * neutral "✨ 已自动更新" one. Set by `runUpdater` when the local user
   * matches `latest.json::pr_creator_login`. Optional — old state files
   * (pre-feature) and non-creator updates leave it absent.
   */
  pr_creator?: boolean;
  /**
   * PR number that triggered this update (only set when pr_creator===true).
   * Rendered in the banner so the user can recognise their own PR. Optional
   * for the same backwards-compat reason as `pr_creator`.
   */
  pr_number?: number;
}

export interface UpdateState {
  last_check_ts: number;
  interval_hours: number;
  last_installed_sha: string;
  last_installed_version: string;
  installed_at: number;
  consecutive_install_failures: number;
  last_install_error: string | null;
  pending_banner: PendingBanner | null;
  /**
   * B-104: epoch ms when the "auto-update has been failing — please reinstall
   * manually" banner was last shown to the user. 0 = never shown. Used by
   * `maybeShowReinstallBanner` to throttle the banner so it does not spam the
   * user every SessionStart while still surfacing within 24h. Optional in
   * persisted JSON for backwards compat with pre-B-104 state files.
   */
  reinstall_banner_shown_at: number;

  /** ETag returned by GitHub on the last 200 response. Empty string = none. */
  last_branch_etag: string;

  /** SHA returned alongside last_branch_etag. Used to fill cachedSha for 304.
   *  Distinct from last_installed_sha — etag tracks "what's on the remote",
   *  sha tracks "what we have locally installed". They diverge between
   *  detection and install. */
  last_branch_sha: string;

  /** Epoch ms; if non-zero and now < this, skip the next check (backoff active).
   *  0 = no active backoff. */
  next_check_after_ts: number;

  /** Counter for exponential backoff. Reset to 0 on any successful fetch. */
  consecutive_rate_limits: number;

  /**
   * Issue #225 — soft-force upgrade snooze state machine.
   *
   * Epoch ms; the upgrade banner stays silent until now >= snooze_until_ts.
   * 0 = no active snooze. Reset to 0 by `teamagent update --now` (user
   * accepted) or by `teamagent update --enable` (user lifted opt-out).
   */
  snooze_until_ts: number;

  /**
   * Issue #225 — current snooze level. Drives the 24h → 48h → 7d backoff
   * curve in `snooze.ts:nextSnooze`. Reset to 0 on accept/enable.
   */
  snooze_level: number;

  /**
   * Issue #225 — permanent opt-out. Set to true by `teamagent update --never`.
   * Cleared by `teamagent update --enable`. When true the SessionStart hook
   * never surfaces the upgrade banner regardless of pending state. Independent
   * of `auto-update.disabled` marker (which gates whether we POLL the remote)
   * — never_prompt only controls the USER-FACING banner.
   */
  never_prompt: boolean;

  /**
   * Issue #225 / iter-1 fix — the `pending_banner.to` SHA the user has
   * acknowledged via --now / --snooze / --never. Used by the soft-force
   * banner to decide whether to re-fire on subsequent SessionStarts:
   *
   *   re-fire iff prompt_dismissed_for_to !== state.pending_banner.to
   *
   * Empty string = never dismissed. Set whenever the user picks one of the
   * three CLI choices (clears each time a NEW pending_banner.to lands so
   * the next version's prompt fires fresh). Distinct from `pending_banner.shown`
   * which is tied to the legacy "✨ 已自动更新" one-shot celebration.
   */
  prompt_dismissed_for_to: string;
}

export function defaultUpdateState(): UpdateState {
  return {
    last_check_ts: 0,
    interval_hours: 1,
    last_installed_sha: "",
    last_installed_version: "",
    installed_at: 0,
    consecutive_install_failures: 0,
    last_install_error: null,
    pending_banner: null,
    reinstall_banner_shown_at: 0,
    last_branch_etag: "",
    last_branch_sha: "",
    next_check_after_ts: 0,
    consecutive_rate_limits: 0,
    snooze_until_ts: 0,
    snooze_level: 0,
    never_prompt: false,
    prompt_dismissed_for_to: "",
  };
}

export function parseUpdateState(raw: string): UpdateState {
  const def = defaultUpdateState();
  if (!raw || !raw.trim()) return def;
  try {
    const obj = JSON.parse(raw) as Partial<UpdateState>;
    return {
      last_check_ts: typeof obj.last_check_ts === "number" ? obj.last_check_ts : def.last_check_ts,
      interval_hours: typeof obj.interval_hours === "number" ? obj.interval_hours : def.interval_hours,
      last_installed_sha: typeof obj.last_installed_sha === "string" ? obj.last_installed_sha : def.last_installed_sha,
      last_installed_version: typeof obj.last_installed_version === "string" ? obj.last_installed_version : def.last_installed_version,
      installed_at: typeof obj.installed_at === "number" ? obj.installed_at : def.installed_at,
      consecutive_install_failures: typeof obj.consecutive_install_failures === "number" ? obj.consecutive_install_failures : def.consecutive_install_failures,
      last_install_error: typeof obj.last_install_error === "string" ? obj.last_install_error : null,
      pending_banner: isPendingBanner(obj.pending_banner)
        ? normalizePendingBanner(obj.pending_banner)
        : null,
      reinstall_banner_shown_at:
        typeof obj.reinstall_banner_shown_at === "number" ? obj.reinstall_banner_shown_at : def.reinstall_banner_shown_at,
      last_branch_etag: typeof obj.last_branch_etag === "string" ? obj.last_branch_etag : def.last_branch_etag,
      last_branch_sha: typeof obj.last_branch_sha === "string" ? obj.last_branch_sha : def.last_branch_sha,
      next_check_after_ts:
        typeof obj.next_check_after_ts === "number" ? obj.next_check_after_ts : def.next_check_after_ts,
      consecutive_rate_limits:
        typeof obj.consecutive_rate_limits === "number" ? obj.consecutive_rate_limits : def.consecutive_rate_limits,
      snooze_until_ts:
        typeof obj.snooze_until_ts === "number" ? obj.snooze_until_ts : def.snooze_until_ts,
      snooze_level:
        typeof obj.snooze_level === "number" ? obj.snooze_level : def.snooze_level,
      never_prompt:
        typeof obj.never_prompt === "boolean" ? obj.never_prompt : def.never_prompt,
      prompt_dismissed_for_to:
        typeof obj.prompt_dismissed_for_to === "string"
          ? obj.prompt_dismissed_for_to
          : def.prompt_dismissed_for_to,
    };
  } catch {
    return def;
  }
}

export function serializeUpdateState(s: UpdateState): string {
  return JSON.stringify(s, null, 2);
}

function isPendingBanner(v: unknown): v is PendingBanner {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.from === "string"
    && typeof o.to === "string"
    && typeof o.at === "number"
    && typeof o.shown === "boolean";
}

/**
 * Build a PendingBanner from a parsed JSON object, copying the required four
 * fields and additively copying optional `pr_creator` / `pr_number` only when
 * their types are correct. Wrong-type values are dropped silently (parser
 * defaults are forgiving — see existing wrong-type handling in parseUpdateState).
 */
function normalizePendingBanner(raw: PendingBanner): PendingBanner {
  const out: PendingBanner = {
    from: raw.from,
    to: raw.to,
    at: raw.at,
    shown: raw.shown,
  };
  const o = raw as unknown as Record<string, unknown>;
  if (typeof o.pr_creator === "boolean") out.pr_creator = o.pr_creator;
  if (typeof o.pr_number === "number") out.pr_number = o.pr_number;
  return out;
}
