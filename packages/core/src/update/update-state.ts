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
