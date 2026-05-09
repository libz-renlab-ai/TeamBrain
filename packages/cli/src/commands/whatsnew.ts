/**
 * `teamagent whatsnew` — print the bullets for the currently-installed
 * version (or a user-supplied range), reusing the bundled CHANGELOG.md
 * and the same parser the SessionStart upgrade prompt uses (issue #225).
 *
 * Layout:
 *   teamagent whatsnew [--since <version>] [--limit <N>] [--help]
 *
 * Defaults:
 *   --since: previous version inferred from CHANGELOG (the second-newest H2)
 *   --limit: 7 (per gstack's 5-7 bullet recipe)
 */
import {
  parseChangelog,
  renderWhatsNewTail,
  type ChangelogBullet,
} from "@teamagent/core";
import { loadBundledChangelog } from "../changelog-loader.js";

export interface WhatsNewOptions {
  /** From-version (exclusive). Default: second-newest H2 in CHANGELOG. */
  since?: string;
  /** To-version (inclusive). Default: newest H2 in CHANGELOG. */
  until?: string;
  /** Cap on bullets surfaced. Default 7. */
  limit?: number;
  /** Show help and exit. */
  help?: boolean;
  /** Test injection — defaults to the on-disk loader. */
  loadChangelog?: () => string;
}

export interface WhatsNewResult {
  ok: boolean;
  output: string;
}

export function executeWhatsNew(opts: WhatsNewOptions = {}): WhatsNewResult {
  if (opts.help) {
    return { ok: true, output: renderHelp() };
  }
  const load = opts.loadChangelog ?? loadBundledChangelog;
  const content = (() => {
    try {
      return load();
    } catch {
      return "";
    }
  })();
  if (!content) {
    return {
      ok: true,
      output:
        "本机未找到 CHANGELOG.md (开发安装或 tarball 缺失)。\n" +
        "在线版本: https://github.com/libz-renlab-ai/TeamBrain/blob/main/CHANGELOG.md\n",
    };
  }
  const versions = extractVersions(content);
  if (versions.length === 0) {
    return { ok: true, output: "CHANGELOG 里没有版本段 (## [X.Y.Z]).\n" };
  }
  const until = opts.until ?? versions[0]!;
  const since =
    opts.since ?? (versions[1] ?? "0.0.0");
  const limit = opts.limit ?? 7;
  const bullets = parseChangelog(content, since, until, { maxBullets: limit });
  return {
    ok: true,
    output: renderWhatsNewBlock(since, until, bullets),
  };
}

function renderWhatsNewBlock(
  since: string,
  until: string,
  bullets: ChangelogBullet[],
): string {
  const lines: string[] = [];
  if (bullets.length === 0) {
    return `${since} → ${until} 区间没有用户可见的变更。\n`;
  }
  // Reuse the same renderer the post-init / session-start tails use so the
  // formatting stays consistent across all three surfaces.
  lines.push(renderWhatsNewTail({ installedVersion: until, bullets }));
  lines.push(`(从 ${since} 到 ${until}, 共 ${bullets.length} 条)`);
  lines.push("");
  return lines.join("\n");
}

function extractVersions(content: string): string[] {
  const re = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?/gm;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export function parseWhatsNewArgs(argv: string[]): WhatsNewOptions {
  const opts: WhatsNewOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--since") {
      const value = argv[++i];
      if (!value) throw new Error("--since 需要 <version> 值");
      opts.since = value;
    } else if (a.startsWith("--since=")) {
      opts.since = a.slice("--since=".length);
    } else if (a === "--until") {
      const value = argv[++i];
      if (!value) throw new Error("--until 需要 <version> 值");
      opts.until = value;
    } else if (a.startsWith("--until=")) {
      opts.until = a.slice("--until=".length);
    } else if (a === "--limit") {
      const value = argv[++i];
      if (!value) throw new Error("--limit 需要 <N> 值");
      opts.limit = parsePositiveInt(value, "--limit");
    } else if (a.startsWith("--limit=")) {
      opts.limit = parsePositiveInt(a.slice("--limit=".length), "--limit");
    }
  }
  return opts;
}

/**
 * Issue #225 iter-1 — validate --limit value is a finite positive integer.
 * Without this, `Number.parseInt("foo", 10)` returns NaN, which slips past
 * `parseChangelog`'s `max <= 0` guard (NaN <= 0 is false in JS) and the
 * `out.length >= max` break condition (NaN >= N is also false), so the
 * effective limit becomes "no limit." User sees all bullets instead of an
 * error. Same for negative numbers — the parser would silently honor them.
 */
function parsePositiveInt(raw: string, flag: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} 需要正整数 (got "${raw}")`);
  }
  return n;
}

function renderHelp(): string {
  return (
    "Usage: teamagent whatsnew [--since <version>] [--until <version>] [--limit <N>]\n" +
    "\n" +
    "Print the user-visible changes from CHANGELOG.md between two versions.\n" +
    "\n" +
    "Options:\n" +
    "  --since <version>   From-version (exclusive). Default: previous H2.\n" +
    "  --until <version>   To-version (inclusive). Default: newest H2.\n" +
    "  --limit <N>         Cap on bullets surfaced. Default 7.\n" +
    "\n" +
    "Examples:\n" +
    "  teamagent whatsnew                  # latest version's changes\n" +
    "  teamagent whatsnew --since 0.10.1   # everything since 0.10.1\n" +
    "  teamagent whatsnew --limit 3        # top 3 bullets only\n"
  );
}
