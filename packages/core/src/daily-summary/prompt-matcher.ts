/**
 * Three-layer matcher decides whether a UserPromptSubmit prompt should trigger
 * the daily-summary path (issue #371 grill §2):
 *
 *   Layer 1 — strict whitelist (default phrases + `/daily` slash + optional env)
 *   Layer 2 — keyword "日报"/"daily summary" + optional LLM intent-check seam
 *             (no LLM call ships in MVP; the seam stays a stub that defaults to
 *              false unless an `intentChecker` callback is injected.)
 *   Layer 3 — passthrough (no daily-summary intervention)
 *
 * The matcher is pure / synchronous when no intentChecker is provided; the
 * async overload is used only when callers want LLM fallback.
 */

const DEFAULT_TRIGGERS: readonly string[] = [
  "总结一下今天的日报",
  "总结今天的日报",
  "今日日报",
  "生成日报",
  "daily summary today",
  "today's daily summary",
];

const KEYWORDS: readonly string[] = ["日报", "daily summary"];

export type MatcherReason =
  | "whitelist"
  | "slash"
  | "intent-check"
  | "passthrough"
  | "disabled";

export interface MatcherResult {
  readonly fire: boolean;
  readonly reason: MatcherReason;
  /** The phrase that matched (for whitelist/slash); empty otherwise. */
  readonly matchedPhrase: string;
}

export interface MatcherOptions {
  /** Extra trigger phrases (e.g. parsed from `TEAMAGENT_DAILY_TRIGGERS`). */
  readonly extraTriggers?: readonly string[];
  /** Disable the matcher entirely. Equivalent to layer-3 passthrough always. */
  readonly disabled?: boolean;
  /**
   * Optional callback for layer-2 intent disambiguation when the prompt
   * contains a daily keyword but doesn't hit the whitelist. Default behavior
   * is "no LLM available → pass through" per grill §4.
   */
  readonly intentChecker?: (prompt: string) => Promise<boolean>;
}

function normalize(prompt: string): string {
  return prompt.trim();
}

function matchesSlash(prompt: string): boolean {
  const t = normalize(prompt);
  if (t === "/daily") return true;
  if (t.startsWith("/daily ")) return true;
  if (t.startsWith("/daily\n")) return true;
  return false;
}

function matchesWhitelist(
  prompt: string,
  extra: readonly string[],
): { hit: boolean; phrase: string } {
  const t = normalize(prompt);
  const all = [...DEFAULT_TRIGGERS, ...extra];
  for (const phrase of all) {
    if (!phrase) continue;
    if (t.includes(phrase)) return { hit: true, phrase };
  }
  return { hit: false, phrase: "" };
}

function containsDailyKeyword(prompt: string): boolean {
  const t = prompt.toLowerCase();
  for (const kw of KEYWORDS) {
    if (t.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/**
 * Synchronous match — uses layers 1 + 3 only (skips LLM intent check).
 * This is the fast path the hook calls; for explicit LLM intent decisions
 * use `matchPromptWithIntentCheck`.
 */
export function matchPrompt(prompt: string, opts?: MatcherOptions): MatcherResult {
  if (opts?.disabled) {
    return { fire: false, reason: "disabled", matchedPhrase: "" };
  }
  if (matchesSlash(prompt)) {
    return { fire: true, reason: "slash", matchedPhrase: "/daily" };
  }
  const wl = matchesWhitelist(prompt, opts?.extraTriggers ?? []);
  if (wl.hit) {
    return { fire: true, reason: "whitelist", matchedPhrase: wl.phrase };
  }
  return { fire: false, reason: "passthrough", matchedPhrase: "" };
}

/**
 * Async match — adds layer-2 LLM intent check when keyword present but
 * whitelist missed. If `intentChecker` is not provided (default), this
 * gracefully degrades to layer-1 + layer-3 (grill §4 "降级为只匹配白名单 +
 * slash"). The async branch only matters when callers explicitly want LLM
 * fallback.
 */
export async function matchPromptWithIntentCheck(
  prompt: string,
  opts?: MatcherOptions,
): Promise<MatcherResult> {
  const sync = matchPrompt(prompt, opts);
  if (sync.fire || sync.reason === "disabled") return sync;
  if (!containsDailyKeyword(prompt)) return sync;
  const checker = opts?.intentChecker;
  if (!checker) return sync;
  let ok = false;
  try {
    ok = await checker(prompt);
  } catch {
    ok = false;
  }
  return ok
    ? { fire: true, reason: "intent-check", matchedPhrase: "" }
    : { fire: false, reason: "passthrough", matchedPhrase: "" };
}

/**
 * Parse a comma-separated env var into the matcher's extraTriggers list.
 * Empty strings are dropped; whitespace is trimmed per entry.
 */
export function parseExtraTriggersEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
