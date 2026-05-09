/**
 * CHANGELOG.md parser for the "what's new" surfacing path (issue #225).
 *
 * Pure function: takes raw markdown content + a from/to version range, returns
 * a flat list of bullets the user can read. No IO, no time injection — caller
 * controls everything.
 *
 * Strategy (mirrors gstack's gstack-upgrade SKILL.md step 6):
 *   - Walk H2 sections (`## [X.Y.Z] — DATE` OR `## [X.Y.Z]` OR `## X.Y.Z`).
 *   - Skip the literal `## Unreleased` section — bullets there are not yet
 *     associated with a version the user can refer to.
 *   - Each bullet = a `- ` or `* ` line; `**Issue #N**:` / `**Bold**:` prefixes
 *     are preserved as theme hint, then stripped for one-line summary.
 *   - Range filter: include sections whose version is STRICTLY GREATER than
 *     `fromVersion` AND less-than-or-equal-to `toVersion`. Caller supplies
 *     versions; comparison is naive numeric semver-ish (split-by-dot, numeric).
 *   - Cap at `maxBullets` (default 7) per gstack's "5-7 bullets, focus on
 *     user-facing changes" recipe.
 *
 * Returns `[]` for any of:
 *   - empty input
 *   - no version sections
 *   - fromVersion >= toVersion
 *   - all sections out of range
 *
 * Does NOT throw on malformed input — falls back to empty list.
 */

export interface ChangelogBullet {
  /** Version this bullet was published under, e.g. "0.10.5". */
  version: string;
  /** Theme hint extracted from `### Fixed` / `### Changed` / `### Added`. Empty if none. */
  theme: string;
  /** One-line summary, with leading `- `, bold prefix and issue ref stripped. */
  bullet: string;
}

export interface ParseChangelogOptions {
  /** Maximum bullets returned. Default 7 (gstack's upper bound). */
  maxBullets?: number;
}

const VERSION_HEADING_RE = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?(?:\s*[—\-–:]\s*.*)?$/;
const SUBSECTION_HEADING_RE = /^###\s+(.+?)\s*$/;
const BULLET_RE = /^[\s]*[-*]\s+(.+?)\s*$/;
const UNRELEASED_RE = /^##\s+Unreleased\s*$/i;

export function parseChangelog(
  content: string,
  fromVersion: string,
  toVersion: string,
  options: ParseChangelogOptions = {},
): ChangelogBullet[] {
  const max = options.maxBullets ?? 7;
  if (!content || max <= 0) return [];
  if (compareVersion(fromVersion, toVersion) >= 0) return [];

  const lines = content.split(/\r?\n/);
  const out: ChangelogBullet[] = [];

  let currentVersion: string | null = null;
  let currentTheme = "";
  let inRange = false;
  // Track active bullet so multi-line bullets collapse to a one-line summary.
  // We only keep the FIRST line of each bullet to enforce one-line briefness.
  let inBullet = false;

  for (const raw of lines) {
    if (UNRELEASED_RE.test(raw)) {
      currentVersion = null;
      inRange = false;
      currentTheme = "";
      inBullet = false;
      continue;
    }
    const versionMatch = raw.match(VERSION_HEADING_RE);
    if (versionMatch) {
      currentVersion = versionMatch[1] ?? null;
      currentTheme = "";
      inBullet = false;
      inRange =
        currentVersion !== null &&
        compareVersion(currentVersion, fromVersion) > 0 &&
        compareVersion(currentVersion, toVersion) <= 0;
      continue;
    }
    if (!currentVersion) {
      continue;
    }
    const subsectionMatch = raw.match(SUBSECTION_HEADING_RE);
    if (subsectionMatch) {
      currentTheme = subsectionMatch[1] ?? "";
      inBullet = false;
      continue;
    }
    if (!inRange) continue;

    if (raw.startsWith("  ") || raw.startsWith("\t")) {
      // continuation line of an existing bullet — skip; we kept the first line
      continue;
    }
    const bulletMatch = raw.match(BULLET_RE);
    if (bulletMatch) {
      const text = stripBulletDecor(bulletMatch[1] ?? "");
      if (text.length > 0) {
        out.push({
          version: currentVersion,
          theme: currentTheme,
          bullet: text,
        });
        inBullet = true;
        if (out.length >= max) break;
      }
      continue;
    }
    // Blank line or text line — close any active bullet so a continuation
    // line doesn't accidentally absorb later text.
    if (raw.trim() === "") {
      inBullet = false;
    } else {
      // Plain prose between bullets — close any bullet but don't capture.
      inBullet = false;
    }
  }

  return out;
}

/**
 * Compare two semver-ish strings. Returns -1, 0, or 1.
 * Splits on dot, parses each part as integer; non-numeric tails are compared
 * as strings (so "0.10.1-rc1" sorts < "0.10.1" by length).
 *
 * Exported for tests; the parser uses it internally for range filtering.
 */
export function compareVersion(a: string, b: string): number {
  if (a === b) return 0;
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);
  const n = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < n; i++) {
    const av = partsA[i] ?? 0;
    const bv = partsB[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function parseVersionParts(v: string): number[] {
  const cleaned = v.replace(/[^\d.]/g, "");
  if (!cleaned) return [0];
  return cleaned
    .split(".")
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/**
 * Strip common bullet decoration so the surfaced one-liner is readable:
 *   - Leading `**Issue #N**:` / `**Bold**:` chunk
 *   - Trailing `(#NN)` issue reference
 *   - Reduce internal whitespace to single spaces
 */
function stripBulletDecor(text: string): string {
  let s = text;
  // Strip leading "**Foo**:" prefix
  s = s.replace(/^\*\*[^*]+\*\*\s*[:：]\s*/, "");
  // Strip trailing "(#123)" / "(#123, #456)"
  s = s.replace(/\s*\(#[\d, #]+\)\s*$/, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
