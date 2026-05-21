import {
  loadBundledChangelog
} from "./chunk-MCAKDVT7.js";
import {
  parseChangelog,
  renderWhatsNewTail
} from "./chunk-4Y7LCJVR.js";
import "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/whatsnew.ts
init_esm_shims();
function executeWhatsNew(opts = {}) {
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
      output: "\u672C\u673A\u672A\u627E\u5230 CHANGELOG.md (\u5F00\u53D1\u5B89\u88C5\u6216 tarball \u7F3A\u5931)\u3002\n\u5728\u7EBF\u7248\u672C: https://github.com/libz-renlab-ai/TeamBrain/blob/main/CHANGELOG.md\n"
    };
  }
  const versions = extractVersions(content);
  if (versions.length === 0) {
    return { ok: true, output: "CHANGELOG \u91CC\u6CA1\u6709\u7248\u672C\u6BB5 (## [X.Y.Z]).\n" };
  }
  const until = opts.until ?? versions[0];
  const since = opts.since ?? (versions[1] ?? "0.0.0");
  const limit = opts.limit ?? 7;
  const bullets = parseChangelog(content, since, until, { maxBullets: limit });
  return {
    ok: true,
    output: renderWhatsNewBlock(since, until, bullets)
  };
}
function renderWhatsNewBlock(since, until, bullets) {
  const lines = [];
  if (bullets.length === 0) {
    return `${since} \u2192 ${until} \u533A\u95F4\u6CA1\u6709\u7528\u6237\u53EF\u89C1\u7684\u53D8\u66F4\u3002
`;
  }
  lines.push(renderWhatsNewTail({ installedVersion: until, bullets }));
  lines.push(`(\u4ECE ${since} \u5230 ${until}, \u5171 ${bullets.length} \u6761)`);
  lines.push("");
  return lines.join("\n");
}
function extractVersions(content) {
  const re = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?/gm;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}
function parseWhatsNewArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--since") {
      const value = argv[++i];
      if (!value) throw new Error("--since \u9700\u8981 <version> \u503C");
      opts.since = value;
    } else if (a.startsWith("--since=")) {
      opts.since = a.slice("--since=".length);
    } else if (a === "--until") {
      const value = argv[++i];
      if (!value) throw new Error("--until \u9700\u8981 <version> \u503C");
      opts.until = value;
    } else if (a.startsWith("--until=")) {
      opts.until = a.slice("--until=".length);
    } else if (a === "--limit") {
      const value = argv[++i];
      if (!value) throw new Error("--limit \u9700\u8981 <N> \u503C");
      opts.limit = parsePositiveInt(value, "--limit");
    } else if (a.startsWith("--limit=")) {
      opts.limit = parsePositiveInt(a.slice("--limit=".length), "--limit");
    }
  }
  return opts;
}
function parsePositiveInt(raw, flag) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} \u9700\u8981\u6B63\u6574\u6570 (got "${raw}")`);
  }
  return n;
}
function renderHelp() {
  return "Usage: teamagent whatsnew [--since <version>] [--until <version>] [--limit <N>]\n\nPrint the user-visible changes from CHANGELOG.md between two versions.\n\nOptions:\n  --since <version>   From-version (exclusive). Default: previous H2.\n  --until <version>   To-version (inclusive). Default: newest H2.\n  --limit <N>         Cap on bullets surfaced. Default 7.\n\nExamples:\n  teamagent whatsnew                  # latest version's changes\n  teamagent whatsnew --since 0.10.1   # everything since 0.10.1\n  teamagent whatsnew --limit 3        # top 3 bullets only\n";
}
export {
  executeWhatsNew,
  parseWhatsNewArgs
};
