export interface PendingBanner {
  from: string;
  to: string;
  at: number;
  shown: boolean;
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
      pending_banner: isPendingBanner(obj.pending_banner) ? obj.pending_banner : null,
      reinstall_banner_shown_at:
        typeof obj.reinstall_banner_shown_at === "number" ? obj.reinstall_banner_shown_at : def.reinstall_banner_shown_at,
      last_branch_etag: typeof obj.last_branch_etag === "string" ? obj.last_branch_etag : def.last_branch_etag,
      last_branch_sha: typeof obj.last_branch_sha === "string" ? obj.last_branch_sha : def.last_branch_sha,
      next_check_after_ts:
        typeof obj.next_check_after_ts === "number" ? obj.next_check_after_ts : def.next_check_after_ts,
      consecutive_rate_limits:
        typeof obj.consecutive_rate_limits === "number" ? obj.consecutive_rate_limits : def.consecutive_rate_limits,
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
